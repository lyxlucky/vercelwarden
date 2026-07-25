import { asc, isNotNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminInvites } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { generateAdminInviteSecret, serializeAdminInvite } from "@/lib/server/admin/invites";
import { writeAuditEvent } from "@/lib/server/audit/service";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const createSchema = z.object({
  email: z.email().transform((value) => value.normalize("NFKC").trim().toLowerCase()),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
  maxUses: z.number().int().min(1).max(100).default(1),
}).strict();

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const rows = await db.select().from(adminInvites).orderBy(asc(adminInvites.expiresAt)).limit(500);
    return Response.json({ data: rows.map((invite) => serializeAdminInvite(invite)), object: "list" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const body = await parseJsonBody(request, createSchema, 16 * 1024);
    const secret = await generateAdminInviteSecret();
    const now = new Date();
    const invite = {
      uuid: newUuid(),
      email: body.email,
      codeHash: secret.codeHash,
      createdBy: authorization.auth.user.uuid,
      createdAt: now,
      expiresAt: new Date(now.getTime() + body.expiresInHours * 3_600_000),
      maxUses: body.maxUses,
      useCount: 0,
      usedAt: null,
      lastUsedAt: null,
      revokedAt: null,
    };
    await db.insert(adminInvites).values(invite);
    const registrationUrl = new URL("/register", process.env.DOMAIN ?? new URL(request.url).origin);
    registrationUrl.searchParams.set("invite", secret.code);
    registrationUrl.searchParams.set("email", invite.email);
    await writeAuditEvent({
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      action: "admin.invite.create",
      category: "user",
      targetType: "adminInvite",
      targetId: invite.uuid,
      outcome: "succeeded",
      metadata: { maxUses: invite.maxUses, expiresInHours: body.expiresInHours },
      allowedMetadata: ["maxUses", "expiresInHours"],
    });
    return Response.json({
      ...serializeAdminInvite(invite, now),
      registrationUrl: registrationUrl.toString(),
    }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const now = new Date();
    const removed = await db.delete(adminInvites).where(or(
      lt(adminInvites.expiresAt, now),
      isNotNull(adminInvites.revokedAt)
    )).returning({ id: adminInvites.uuid });
    await writeAuditEvent({
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      action: "admin.invite.cleanup",
      category: "user",
      targetType: "adminInvite",
      outcome: "succeeded",
      metadata: { count: removed.length },
      allowedMetadata: ["count"],
    });
    return Response.json({ removed: removed.length, object: "adminInviteCleanup" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

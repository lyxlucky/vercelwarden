import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditRetentionSettings } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { applyAuditRetention, writeAuditEvent } from "@/lib/server/audit/service";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({
  retentionDays: z.number().int().min(1).max(3650).nullable(),
  maxEntries: z.number().int().min(100).max(1_000_000).nullable(),
}).strict().refine((value) => value.retentionDays !== null || value.maxEntries !== null, {
  message: "At least one retention limit is required.",
});

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const [settings] = await db.select().from(auditRetentionSettings)
      .where(eq(auditRetentionSettings.id, "default")).limit(1);
    return Response.json({
      retentionDays: settings?.retentionDays ?? 90,
      maxEntries: settings?.maxEntries ?? 100_000,
      revisionDate: settings?.updatedAt.toISOString() ?? null,
      object: "auditRetentionSettings",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const body = await parseJsonBody(request, schema, 16 * 1024);
    const now = new Date();
    await db.insert(auditRetentionSettings).values({
      id: "default",
      retentionDays: body.retentionDays,
      maxEntries: body.maxEntries,
      updatedBy: authorization.auth.user.uuid,
      updatedAt: now,
    }).onConflictDoUpdate({ target: auditRetentionSettings.id, set: {
      retentionDays: body.retentionDays,
      maxEntries: body.maxEntries,
      updatedBy: authorization.auth.user.uuid,
      updatedAt: now,
    } });
    const removed = await applyAuditRetention(body);
    await writeAuditEvent({
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      action: "admin.audit.retention.update",
      category: "system",
      level: "warning",
      targetType: "auditRetentionSettings",
      targetId: "default",
      outcome: "succeeded",
      metadata: { retentionDays: body.retentionDays, maxEntries: body.maxEntries, removed },
      allowedMetadata: ["retentionDays", "maxEntries", "removed"],
    });
    return Response.json({ ...body, removed, revisionDate: now.toISOString(), object: "auditRetentionSettings" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

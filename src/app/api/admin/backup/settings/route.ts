import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { backupDestinations } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/server/audit/events";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { encryptDestinationConfig } from "@/lib/server/backup/destinations";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({
  id: z.string().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(100),
  provider: z.enum(["local", "vercel-blob", "webdav"]),
  enabled: z.boolean().default(true),
  schedule: z.string().trim().min(1).max(120).nullable().default(null),
  retentionCount: z.number().int().min(1).max(365).default(10),
  includeAttachments: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
}).strict();

function serializeDestination(destination: typeof backupDestinations.$inferSelect) {
  return {
    id: destination.uuid,
    name: destination.name,
    provider: destination.provider,
    enabled: destination.enabled,
    schedule: destination.schedule,
    retentionCount: destination.retentionCount,
    includeAttachments: destination.includeAttachments,
    creationDate: destination.createdAt.toISOString(),
    revisionDate: destination.updatedAt.toISOString(),
    object: "backupDestination",
  };
}

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const destinations = await db.select().from(backupDestinations);
    return Response.json({ data: destinations.map(serializeDestination), object: "list" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { purpose: "backup.destination.manage", allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const body = await parseJsonBody(request, schema, 64 * 1024);
    if (body.provider === "webdav" && typeof body.config.baseUrl !== "string") {
      throw new ApiError(400, "validation_error", "WebDAV destinations require a baseUrl.");
    }
    const now = new Date();
    const id = body.id ?? newUuid();
    const values = {
      uuid: id,
      name: body.name,
      provider: body.provider,
      enabled: body.enabled,
      schedule: body.schedule,
      retentionCount: body.retentionCount,
      includeAttachments: body.includeAttachments,
      encryptedConfig: encryptDestinationConfig(body.config),
      createdAt: now,
      updatedAt: now,
    };
    if (body.id) {
      const updated = await db.update(backupDestinations).set({ ...values, createdAt: undefined })
        .where(eq(backupDestinations.uuid, id)).returning();
      if (updated.length !== 1) throw new ApiError(404, "not_found", "The backup destination was not found.");
    } else {
      await db.insert(backupDestinations).values(values);
    }
    const [destination] = await db.select().from(backupDestinations).where(eq(backupDestinations.uuid, id)).limit(1);
    if (!destination) throw new ApiError(500, "backup_destination_missing", "The backup destination could not be saved.");
    await recordAuditEvent({
      action: body.id ? "backup.destination.update" : "backup.destination.create",
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      targetId: id,
      outcome: "succeeded",
      request,
      metadata: { provider: body.provider, enabled: body.enabled },
    });
    return Response.json(serializeDestination(destination), {
      status: body.id ? 200 : 201,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

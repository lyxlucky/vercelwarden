import { and, desc, eq, gte, like, lte, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { writeAuditEvent } from "@/lib/server/audit/service";
import { encodeAuditCursor, parseAuditQuery } from "@/lib/server/audit/query";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const url = new URL(request.url);
    const query = parseAuditQuery(url.searchParams);
    const conditions: SQL[] = [];
    if (query.category) conditions.push(eq(auditEvents.category, query.category));
    if (query.level) conditions.push(eq(auditEvents.level, query.level));
    if (query.outcome) conditions.push(eq(auditEvents.outcome, query.outcome));
    if (query.action) conditions.push(like(auditEvents.action, `%${query.action}%`));
    if (query.actor) conditions.push(like(auditEvents.actorEmailSnapshot, `%${query.actor}%`));
    if (query.target) conditions.push(or(like(auditEvents.targetId, `%${query.target}%`), like(auditEvents.targetType, `%${query.target}%`))!);
    if (query.from) conditions.push(gte(auditEvents.createdAt, query.from));
    if (query.to) conditions.push(lte(auditEvents.createdAt, query.to));
    if (query.cursor) {
      const createdAt = new Date(query.cursor.createdAt);
      conditions.push(or(lt(auditEvents.createdAt, createdAt), and(eq(auditEvents.createdAt, createdAt), lt(auditEvents.uuid, query.cursor.id)))!);
    }
    const page = await db.select().from(auditEvents)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.uuid))
      .limit(query.limit + 1);
    const visible = page.slice(0, query.limit);
    const last = visible.at(-1);
    return Response.json({
      data: visible.map((event) => ({
        id: event.uuid,
        actorUserId: event.actorUserUuid,
        actorEmail: event.actorEmailSnapshot,
        action: event.action,
        category: event.category,
        level: event.level,
        targetType: event.targetType,
        targetId: event.targetId,
        outcome: event.outcome,
        requestId: event.requestId,
        ipPrefix: event.ipPrefix,
        metadata: JSON.parse(event.metadata),
        creationDate: event.createdAt.toISOString(),
        object: "auditEvent",
      })),
      continuationToken: page.length > query.limit && last ? encodeAuditCursor({ createdAt: last.createdAt.toISOString(), id: last.uuid }) : null,
      object: "list",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { purpose: "admin.audit.clear", allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const removed = await db.delete(auditEvents).returning({ id: auditEvents.uuid });
    await writeAuditEvent({
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      action: "admin.audit.clear",
      category: "system",
      level: "critical",
      targetType: "auditEvent",
      outcome: "succeeded",
      metadata: { count: removed.length },
      allowedMetadata: ["count"],
    });
    return Response.json({ removed: removed.length, object: "auditClear" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

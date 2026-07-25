import { z } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/events";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { restoreBackupArtifact } from "@/lib/server/backup/jobs";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";
import { beginIdempotentRequest, completeIdempotentRequest, fingerprintBody } from "@/lib/server/idempotency/service";

const schema = z.object({
  artifactId: z.string().min(1).max(200),
  mode: z.enum(["merge", "replace"]),
}).strict();

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { purpose: "backup.restore", allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const body = await parseJsonBody(request, schema, 16 * 1024);
    const key = request.headers.get("idempotency-key") ?? "";
    const scope = `backup-restore:${authorization.auth.user.uuid}`;
    const state = await beginIdempotentRequest({
      scope,
      key,
      requestHash: await fingerprintBody(body),
      userUuid: authorization.auth.user.uuid,
    });
    if (state.decision === "replay") {
      return Response.json(JSON.parse(state.record.responseBody ?? "{}"), {
        status: state.record.responseStatus ?? 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }
    if (state.decision === "pending") throw new ApiError(409, "backup_restore_pending", "An identical restore is already pending.");
    const result = await restoreBackupArtifact({ artifactId: body.artifactId, mode: body.mode });
    const responseBody = { artifactId: body.artifactId, mode: body.mode, ...result, object: "backupRestore" };
    await completeIdempotentRequest(scope, key, { status: result.status === "failed" ? 500 : 200, body: responseBody });
    await recordAuditEvent({
      action: "backup.restore",
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      targetId: body.artifactId,
      outcome: result.status === "succeeded" ? "succeeded" : result.status === "failed" ? "failed" : "partial",
      request,
      metadata: { mode: body.mode, status: result.status, restored: result.restored, failed: result.failed },
    });
    return Response.json(responseBody, {
      status: result.status === "failed" ? 500 : 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

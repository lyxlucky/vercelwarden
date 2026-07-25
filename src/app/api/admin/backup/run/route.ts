import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { backupDestinations } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { executeBackupRun, serializeBackupRun } from "@/lib/server/backup/jobs";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";
import { beginIdempotentRequest, completeIdempotentRequest, fingerprintBody } from "@/lib/server/idempotency/service";

const schema = z.object({
  destinationId: z.string().min(1).max(200),
  mode: z.enum(["full", "database"]).default("full"),
}).strict();

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const body = await parseJsonBody(request, schema, 16 * 1024);
    const key = request.headers.get("idempotency-key") ?? "";
    const scope = `backup-run:${authorization.auth.user.uuid}`;
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
    if (state.decision === "pending") throw new ApiError(409, "backup_run_pending", "An identical backup run is already pending.");
    const [destination] = await db.select().from(backupDestinations)
      .where(eq(backupDestinations.uuid, body.destinationId)).limit(1);
    if (!destination?.enabled) throw new ApiError(404, "not_found", "The enabled backup destination was not found.");
    const run = await executeBackupRun({
      destination,
      requestedBy: { uuid: authorization.auth.user.uuid, email: authorization.auth.user.email },
      trigger: "manual",
      mode: body.mode,
      request,
    });
    const responseBody = serializeBackupRun(run);
    await completeIdempotentRequest(scope, key, { status: 201, body: responseBody });
    return Response.json(responseBody, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

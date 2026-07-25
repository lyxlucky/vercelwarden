import { z } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/events";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { deleteBackupArtifact } from "@/lib/server/backup/jobs";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({ artifactId: z.string().min(1).max(200) }).strict();

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { purpose: "backup.delete", allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const body = await parseJsonBody(request, schema, 16 * 1024);
    await deleteBackupArtifact(body.artifactId);
    await recordAuditEvent({
      action: "backup.artifact.delete",
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      targetId: body.artifactId,
      outcome: "succeeded",
      request,
    });
    return Response.json({ id: body.artifactId, removed: true, object: "backupArtifactRemoval" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

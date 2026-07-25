import { z } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/events";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { readBackupArtifact } from "@/lib/server/backup/jobs";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({ artifactId: z.string().min(1).max(200) }).strict();

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request, { purpose: "backup.download", allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const body = await parseJsonBody(request, schema, 16 * 1024);
    const { artifact, bytes } = await readBackupArtifact(body.artifactId);
    await recordAuditEvent({
      action: "backup.artifact.download",
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      targetId: artifact.uuid,
      outcome: "succeeded",
      request,
      metadata: { size: bytes.byteLength },
    });
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="vercelwarden-backup-${artifact.createdAt.toISOString().slice(0, 10)}.vwb"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

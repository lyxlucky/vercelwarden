import { z } from "zod";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { verifyBackupArtifact } from "@/lib/server/backup/jobs";
import { apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({ artifactId: z.string().min(1).max(200) }).strict();

export async function POST(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const body = await parseJsonBody(request, schema, 16 * 1024);
    return Response.json({ artifactId: body.artifactId, ...await verifyBackupArtifact(body.artifactId), object: "backupIntegrity" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

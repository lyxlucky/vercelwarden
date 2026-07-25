import { desc } from "drizzle-orm";
import { db } from "@/db";
import { backupArtifacts } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { apiErrorResponse } from "@/lib/server/http/errors";

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const artifacts = await db.select().from(backupArtifacts).orderBy(desc(backupArtifacts.createdAt)).limit(500);
    return Response.json({
      data: artifacts.map((artifact) => ({
        id: artifact.uuid,
        runId: artifact.runUuid,
        formatVersion: artifact.formatVersion,
        size: artifact.size,
        sha256: artifact.sha256,
        summary: JSON.parse(artifact.manifestSummary),
        creationDate: artifact.createdAt.toISOString(),
        expirationDate: artifact.expiresAt?.toISOString() ?? null,
        object: "backupArtifact",
      })),
      object: "list",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import { desc } from "drizzle-orm";
import { db } from "@/db";
import { backupArtifacts, backupDestinations, backupRuns } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { apiErrorResponse } from "@/lib/server/http/errors";
import { serializeBackupRun } from "@/lib/server/backup/jobs";

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const [destinations, runs, artifacts] = await Promise.all([
      db.select().from(backupDestinations),
      db.select().from(backupRuns).orderBy(desc(backupRuns.createdAt)).limit(10),
      db.select().from(backupArtifacts).orderBy(desc(backupArtifacts.createdAt)).limit(10),
    ]);
    return Response.json({
      destinations: destinations.length,
      recentRuns: runs.map(serializeBackupRun),
      artifacts: artifacts.map((artifact) => ({
        id: artifact.uuid,
        runId: artifact.runUuid,
        size: artifact.size,
        sha256: artifact.sha256,
        creationDate: artifact.createdAt.toISOString(),
      })),
      object: "backupOverview",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

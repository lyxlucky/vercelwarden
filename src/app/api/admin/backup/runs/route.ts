import { desc } from "drizzle-orm";
import { db } from "@/db";
import { backupRuns } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { serializeBackupRun } from "@/lib/server/backup/jobs";
import { apiErrorResponse } from "@/lib/server/http/errors";

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
    const runs = await db.select().from(backupRuns).orderBy(desc(backupRuns.createdAt)).limit(limit);
    return Response.json({ data: runs.map(serializeBackupRun), continuationToken: null, object: "list" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

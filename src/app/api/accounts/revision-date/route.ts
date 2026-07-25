import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userRevisions } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { unauthorized } from "@/lib/responses";
import { revisionTimestamp } from "@/lib/server/mutations/revision";

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const [revision] = await db
    .select({ revisionDate: userRevisions.revisionDate })
    .from(userRevisions)
    .where(eq(userRevisions.userUuid, auth.user.uuid))
    .limit(1);

  return Response.json(revisionTimestamp(revision?.revisionDate, auth.user.updatedAt), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

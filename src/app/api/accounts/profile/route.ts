import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, buildProfile } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/accounts/profile
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  return jsonResponse(buildProfile(auth.user));
}

// PUT /api/accounts/profile — update name / hint / culture / avatarColor.
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.masterPasswordHint === "string" || body.masterPasswordHint === null) {
    patch.passwordHint = body.masterPasswordHint;
  }
  if (typeof body.avatarColor === "string" || body.avatarColor === null) {
    patch.avatarColor = body.avatarColor;
  }

  await db.update(users).set(patch).where(eq(users.uuid, auth.user.uuid));
  const [updated] = await db.select().from(users).where(eq(users.uuid, auth.user.uuid)).limit(1);
  return jsonResponse(buildProfile(updated!));
}

// POST /api/accounts/profile — Bitwarden client sends POST with same body
export async function POST(request: NextRequest) {
  return PUT(request);
}

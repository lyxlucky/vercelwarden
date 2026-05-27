import { NextRequest } from "next/server";
import { verifyAuth, buildProfile } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/accounts/profile
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  return jsonResponse(buildProfile(auth.user));
}

// PUT /api/accounts/profile
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  // TODO: implement profile update (name, avatar color, etc.)
  return jsonResponse(buildProfile(auth.user));
}

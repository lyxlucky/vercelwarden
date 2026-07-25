import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { unauthorized } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  return Response.json(auth.user.updatedAt.getTime());
}

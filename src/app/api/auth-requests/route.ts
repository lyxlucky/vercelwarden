import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/auth-requests — legacy alias for /auth-requests/pending used by
// older clients (Vaultwarden accounts.rs:1667). Returns empty list.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  return jsonResponse({
    data: [] as unknown[],
    continuationToken: null,
    object: "list",
  });
}

import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/auth-requests/pending — passwordless login requests from other
// devices. We don't implement the auth_requests table; return an empty list
// so clients stop polling-404'ing. Matches Vaultwarden accounts.rs:1672.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  return jsonResponse({
    data: [] as unknown[],
    continuationToken: null,
    object: "list",
  });
}

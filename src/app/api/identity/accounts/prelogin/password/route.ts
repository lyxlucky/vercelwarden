import { NextRequest } from "next/server";
import { handlePrelogin } from "@/lib/prelogin";
import { errorResponse } from "@/lib/responses";

// POST /identity/accounts/prelogin/password
// Newer Bitwarden client (browser ext 2026.4+) calls this variant during the
// first-login flow. Vaultwarden 1.36.0 introduced it as a duplicate of the
// classic /accounts/prelogin handler — same request/response.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");
  return handlePrelogin(body);
}

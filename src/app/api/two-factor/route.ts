import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/two-factor — list configured 2FA providers for the current user.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const data: Array<Record<string, unknown>> = [];
  if (auth.user.totpSecret) {
    data.push({ enabled: true, type: 0, object: "twoFactorProvider" });
  }

  return jsonResponse({ data, object: "list", continuationToken: null });
}

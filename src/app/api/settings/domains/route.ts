import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/settings/domains — returns equivalent domains config
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  return jsonResponse({
    EquivalentDomains: JSON.parse(auth.user.equivalentDomains),
    GlobalEquivalentDomains: [],
    Object: "domains",
  });
}

import { NextRequest } from "next/server";
import { handlePrelogin } from "@/lib/prelogin";
import { errorResponse } from "@/lib/responses";

// POST /identity/accounts/prelogin
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");
  return handlePrelogin(body);
}

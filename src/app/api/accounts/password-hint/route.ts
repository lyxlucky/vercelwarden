import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/responses";

// POST /api/accounts/password-hint — Vaultwarden returns an empty 200 to avoid
// leaking whether the email is registered (accounts.rs:1183). Delivery would
// happen via email; we don't have SMTP wired up, so we just acknowledge.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.toLowerCase().trim();
  if (!email) return errorResponse("Email is required");

  return new Response(null, { status: 200 });
}

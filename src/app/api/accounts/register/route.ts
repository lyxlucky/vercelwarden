import { NextRequest } from "next/server";
import { buildProfile } from "@/lib/auth";
import { createUser } from "@/lib/register";
import { jsonResponse, errorResponse } from "@/lib/responses";

// POST /api/accounts/register — legacy registration (CLI / older clients).
// Newer clients use /identity/accounts/register/finish.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");

  const result = await createUser(body);
  if (!result.ok) {
    switch (result.error.kind) {
      case "missing_fields":
        return errorResponse("Missing required fields");
      case "invite_required":
        return errorResponse("Invitation code is required", 400, {
          token: ["Invitation code is required"],
        });
      case "invite_invalid":
        return errorResponse("Invalid or expired invitation code", 400, {
          token: ["Invalid or expired invitation code"],
        });
      case "email_taken":
        return errorResponse("Email is already registered", 400, {
          email: ["Email is already registered"],
        });
    }
  }

  return jsonResponse(buildProfile(result.user), 200);
}

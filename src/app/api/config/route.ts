import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/responses";

// GET /api/config — server capability declaration consumed by new clients on boot.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  return jsonResponse({
    version: "2025.5.0",
    gitHash: null,
    server: {
      name: "Vercelwarden",
      url: "https://github.com/",
    },
    environment: {
      vault: `${origin}/`,
      api: `${origin}/api`,
      identity: `${origin}/identity`,
      notifications: `${origin}/notifications`,
      sso: "",
    },
    featureStates: {},
    settings: {
      disableUserRegistration:
        process.env.REQUIRE_INVITE_CODE !== "true" &&
        process.env.DISABLE_REGISTRATION === "true",
    },
    object: "config",
  });
}

import { NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";
import {
  issuePasskeyChallenge,
  passkeyChallengeCookie,
} from "@/lib/server/auth/passkey-challenge";

export async function GET(request: NextRequest) {
  try {
    if (!buildCapabilityDocument().capabilities["auth.accountPasskey"]) {
      throw new ApiError(404, "not_found", "The requested capability is unavailable.");
    }
    const origin = new URL(process.env.DOMAIN ?? request.nextUrl.origin).origin;
    if (request.nextUrl.origin !== origin || (request.headers.get("host") ?? request.nextUrl.host) !== new URL(origin).host) {
      throw new ApiError(403, "csrf_origin_mismatch", "The request origin is not trusted.");
    }
    const options = await generateAuthenticationOptions({
      rpID: new URL(origin).hostname,
      timeout: 120_000,
      userVerification: "required",
      allowCredentials: [],
    });
    const challenge = await issuePasskeyChallenge(options.challenge);
    const response = Response.json(options, { headers: { "Cache-Control": "no-store, max-age=0" } });
    response.headers.append(
      "Set-Cookie",
      passkeyChallengeCookie(
        challenge.token,
        process.env.NODE_ENV === "production" || origin.startsWith("https://")
      )
    );
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}


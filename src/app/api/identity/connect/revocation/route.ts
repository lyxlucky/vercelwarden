import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { verifyRefreshToken } from "@/lib/auth";
import { parseFormData } from "@/lib/server/http/errors";
import {
  assertTrustedOrigin,
  clearFirstPartyRefreshCookie,
  isFirstPartyClient,
} from "@/lib/server/auth/first-party-session";

export async function POST(request: NextRequest) {
  const formData = await parseFormData(request, 16 * 1024);
  const firstParty = isFirstPartyClient(formData.get("client_id"));
  const origin = new URL(process.env.DOMAIN ?? request.nextUrl.origin).origin;
  if (firstParty) assertTrustedOrigin(request, origin);
  const bodyToken = formData.get("token");
  const token = firstParty
    ? request.cookies.get("vw_refresh")?.value
    : typeof bodyToken === "string" ? bodyToken : undefined;
  if (token) {
    const claims = await verifyRefreshToken(token);
    if (claims) {
      await db
        .update(devices)
        .set({ refreshToken: "", refreshTokenHash: null, revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(devices.uuid, claims.device));
    }
  }
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (firstParty) {
    response.headers.append(
      "Set-Cookie",
      clearFirstPartyRefreshCookie(process.env.NODE_ENV === "production" || origin.startsWith("https://"))
    );
  }
  return response;
}


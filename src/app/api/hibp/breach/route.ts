import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";

// GET /api/hibp/breach?username=...
// Proxies haveibeenpwned.com to keep the user's API key off the client.
// Set HIBP_API_KEY in env; without it returns an empty list (still 200).
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const username = request.nextUrl.searchParams.get("username");
  if (!username) return errorResponse("username is required");

  const apiKey = process.env.HIBP_API_KEY;
  if (!apiKey) return jsonResponse([]);

  const res = await fetch(
    `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(username)}?truncateResponse=false`,
    {
      headers: {
        "hibp-api-key": apiKey,
        "User-Agent": "Vercelwarden",
      },
    }
  );

  if (res.status === 404) return jsonResponse([]);
  if (!res.ok) return errorResponse("HIBP request failed", 502);

  const breaches = (await res.json()) as unknown[];
  return jsonResponse(breaches);
}

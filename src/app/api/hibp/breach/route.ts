import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const prefix = request.nextUrl.searchParams.get("prefix")?.toUpperCase();
  if (prefix) {
    if (!/^[A-F0-9]{5}$/.test(prefix)) return errorResponse("prefix must be five hexadecimal characters");
    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true", "User-Agent": "Vercelwarden" },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`HIBP responded ${response.status}`);
      const suffixes: Record<string, number> = {};
      for (const line of (await response.text()).split(/\r?\n/)) {
        const [suffix, count] = line.trim().split(":");
        if (suffix && /^[A-F0-9]{35}$/.test(suffix) && count) suffixes[suffix] = Number(count) || 0;
      }
      return NextResponse.json({ status: "available", suffixes }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    } catch {
      return NextResponse.json({ status: "unavailable", suffixes: {}, message: "HIBP password range service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": "30" } });
    }
  }

  const username = request.nextUrl.searchParams.get("username");
  if (!username) return errorResponse("prefix or username is required");
  const apiKey = process.env.HIBP_API_KEY;
  if (!apiKey) return NextResponse.json({ status: "unavailable", breaches: [] }, { status: 503 });
  try {
    const response = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(username)}?truncateResponse=false`, {
      headers: { "hibp-api-key": apiKey, "User-Agent": "Vercelwarden" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) return jsonResponse([]);
    if (!response.ok) throw new Error("HIBP request failed");
    return jsonResponse(await response.json());
  } catch {
    return errorResponse("HIBP request failed", 502);
  }
}

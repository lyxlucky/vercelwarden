import { NextRequest, NextResponse } from "next/server";

// GET /api/icons/[domain]/icon.png
// Proxies favicon from external service (matches Vaultwarden behavior)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;

  // Use DuckDuckGo's favicon service (privacy-friendly, no tracking)
  const iconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

  try {
    const response = await fetch(iconUrl, {
      headers: { "User-Agent": "Vercelwarden/1.0" },
      next: { revalidate: 86400 }, // cache 24h
    });

    if (!response.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const iconBuffer = await response.arrayBuffer();
    return new NextResponse(iconBuffer, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "image/x-icon",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

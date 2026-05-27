import { NextRequest, NextResponse } from "next/server";

// GET /api/icons/{domain}/icon.png — Bitwarden clients hit this path with a
// trailing `/icon.png` segment. Some callers also send just `/icons/{domain}`,
// so we accept both via the [...slug] catch-all and pick the first segment.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const domain = slug?.[0];
  if (!domain) return new NextResponse(null, { status: 404 });

  // Reject anything that doesn't look like a hostname before forwarding.
  if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
    return new NextResponse(null, { status: 400 });
  }

  const iconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

  try {
    const response = await fetch(iconUrl, {
      headers: { "User-Agent": "Vercelwarden/1.0" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return new NextResponse(null, { status: 404 });

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

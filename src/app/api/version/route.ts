import { NextResponse } from "next/server";

// GET /api/version — plain text version string
export async function GET() {
  return new NextResponse("2025.5.0", {
    headers: { "Content-Type": "text/plain" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { isKnownDevice } from "@/lib/devices";

// GET /api/devices/knowndevice — used during login to detect new devices.
// Newer Bitwarden clients pass identifier+email via headers; legacy clients
// embed them in the path (handled by /api/devices/knowndevice/[email]/[id]).
export async function GET(request: NextRequest) {
  const identifier = request.headers.get("device-identifier");
  const email = request.headers.get("x-request-email")?.toLowerCase().trim();
  if (!identifier || !email) {
    return new NextResponse("false", { headers: { "Content-Type": "text/plain" } });
  }
  return isKnownDevice(email, identifier);
}

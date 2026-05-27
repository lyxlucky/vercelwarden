import { NextRequest } from "next/server";
import { isKnownDevice } from "@/lib/devices";

// GET /api/devices/knowndevice/{email}/{identifier} — legacy path-style call.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ email: string; identifier: string }> }
) {
  const { email, identifier } = await params;
  return isKnownDevice(decodeURIComponent(email).toLowerCase().trim(), identifier);
}

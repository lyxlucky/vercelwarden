import { jsonResponse } from "@/lib/responses";

// GET /alive — health check; returns current server time (Bitwarden client uses
// this for clock-drift detection).
export async function GET() {
  return jsonResponse(new Date().toISOString());
}

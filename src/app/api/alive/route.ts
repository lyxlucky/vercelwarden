import { jsonResponse } from "@/lib/responses";

// GET /api/alive — server time, identical to /alive
export async function GET() {
  return jsonResponse(new Date().toISOString());
}

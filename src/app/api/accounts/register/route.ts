import { NextRequest } from "next/server";
import { z } from "zod";
import { buildProfile } from "@/lib/auth";
import { createUser } from "@/lib/register";
import { jsonResponse, errorResponse } from "@/lib/responses";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";
import {
  beginIdempotentRequest,
  completeIdempotentRequest,
  fingerprintBody,
} from "@/lib/server/idempotency/service";

const firstPartyRegistration = z.object({
  clientId: z.literal("vercelwarden-web"),
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(100),
  masterPasswordHash: z.string().min(16).max(1024),
  masterPasswordHint: z.string().max(200).nullable().optional(),
  key: z.string().min(8).max(16_384),
  privateKey: z.string().max(32_768).nullable().optional(),
  publicKey: z.string().max(32_768).nullable().optional(),
  kdf: z.number().int().min(0).max(1).optional(),
  kdfIterations: z.number().int().positive().max(2_000_000).optional(),
  kdfMemory: z.number().int().positive().max(1024).optional(),
  kdfParallelism: z.number().int().positive().max(16).optional(),
  invitationCode: z.string().min(8).max(256).optional(),
}).strict();

export async function POST(request: NextRequest) {
  if (request.headers.get("content-type")?.startsWith("application/json")) {
    const raw = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
    if (raw?.clientId === "vercelwarden-web") return registerFirstParty(request);
  }

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");
  const result = await createUser(body);
  if (!result.ok) {
    switch (result.error.kind) {
      case "missing_fields":
        return errorResponse("Missing required fields");
      case "registration_disabled":
        return errorResponse("Registration is disabled", 403);
      case "email_taken":
        return errorResponse("Email is already registered", 400, { email: ["Email is already registered"] });
    }
  }
  return jsonResponse(buildProfile(result.user), 200);
}

async function registerFirstParty(request: NextRequest) {
  try {
    const body = await parseJsonBody(request, firstPartyRegistration, 64 * 1024);
    const key = request.headers.get("idempotency-key")?.trim();
    if (!key) throw new ApiError(400, "invalid_idempotency_key", "Idempotency-Key is required.");
    const scope = "first-party-registration";
    const started = await beginIdempotentRequest({ scope, key, requestHash: await fingerprintBody(body) });
    if (started.decision === "replay" && started.record.responseBody) {
      return jsonResponse(JSON.parse(started.record.responseBody), started.record.responseStatus ?? 201);
    }
    if (started.decision === "pending") {
      throw new ApiError(409, "request_in_progress", "The registration request is already in progress.");
    }

    const result = await createUser(body);
    if (!result.ok) {
      throw new ApiError(400, "registration_unavailable", "The account could not be created with these details.");
    }
    const responseBody = { object: "register", id: result.user.uuid };
    await completeIdempotentRequest(scope, key, { status: 201, body: responseBody });
    const response = jsonResponse(responseBody, 201);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}


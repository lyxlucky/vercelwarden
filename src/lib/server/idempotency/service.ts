import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyRecords } from "@/db/schema";
import { ApiError } from "@/lib/server/http/errors";

export type IdempotencyDecision = "execute" | "replay" | "pending" | "conflict";

interface ComparableRecord {
  requestHash: string;
  status: "pending" | "completed";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export async function fingerprintBody(body: unknown): Promise<string> {
  return createHash("sha256").update(JSON.stringify(canonicalize(body))).digest("hex");
}

export function decideIdempotency(record: ComparableRecord | null, requestHash: string): IdempotencyDecision {
  if (!record) return "execute";
  if (record.requestHash !== requestHash) return "conflict";
  return record.status === "completed" ? "replay" : "pending";
}

export interface BeginIdempotencyInput {
  scope: string;
  key: string;
  requestHash: string;
  userUuid?: string | null;
  ttlMs?: number;
}

export async function beginIdempotentRequest(input: BeginIdempotencyInput) {
  const key = input.key.trim();
  if (!key || key.length > 200 || input.scope.length > 120) {
    throw new ApiError(400, "invalid_idempotency_key", "A valid Idempotency-Key is required.");
  }
  const now = new Date();
  const [inserted] = await db
    .insert(idempotencyRecords)
    .values({
      uuid: randomUUID(),
      userUuid: input.userUuid ?? null,
      scope: input.scope,
      key,
      requestHash: input.requestHash,
      status: "pending",
      createdAt: now,
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? 24 * 60 * 60 * 1000)),
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { decision: "execute", record: inserted } as const;

  const [record] = await db
    .select()
    .from(idempotencyRecords)
    .where(and(eq(idempotencyRecords.scope, input.scope), eq(idempotencyRecords.key, key)))
    .limit(1);
  if (!record) throw new ApiError(500, "idempotency_unavailable", "Idempotency state could not be created.");
  const decision = decideIdempotency(record, input.requestHash);
  if (decision === "conflict") {
    throw new ApiError(409, "idempotency_conflict", "The idempotency key was already used with another request.");
  }
  return { decision, record } as const;
}

export async function completeIdempotentRequest(scope: string, key: string, response: { status: number; body: unknown }) {
  await db
    .update(idempotencyRecords)
    .set({
      status: "completed",
      responseStatus: response.status,
      responseBody: JSON.stringify(response.body),
    })
    .where(and(eq(idempotencyRecords.scope, scope), eq(idempotencyRecords.key, key)));
}

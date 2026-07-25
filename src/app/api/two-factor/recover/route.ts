import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices, recoveryCodeHashes, twoFactorCredentials, users } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";
import { verifyRecoveryCode } from "@/lib/server/auth/recovery-codes";

const recoverySchema = z.object({
  email: z.string().email().max(254),
  masterPasswordHash: z.string().min(16).max(1024),
  recoveryCode: z.string().min(8).max(256),
}).strict();

function verifyLegacyCode(presented: string, stored: string): boolean {
  const actual = createHash("sha256").update(presented.replace(/[\s-]+/g, "").toUpperCase()).digest();
  const expected = createHash("sha256").update(stored.replace(/[\s-]+/g, "").toUpperCase()).digest();
  return timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(request, recoverySchema, 16 * 1024);
    const email = body.email.normalize("NFKC").trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !verifyPassword(
      body.masterPasswordHash,
      user.passwordHash as Uint8Array,
      user.salt as Uint8Array,
      user.passwordIterations
    )) {
      throw new ApiError(400, "invalid_recovery", "The recovery details are invalid.");
    }

    const activeCodes = await db
      .select()
      .from(recoveryCodeHashes)
      .where(and(eq(recoveryCodeHashes.userUuid, user.uuid), isNull(recoveryCodeHashes.consumedAt)));
    let matchedCode: typeof recoveryCodeHashes.$inferSelect | undefined;
    for (const candidate of activeCodes) {
      if (await verifyRecoveryCode(body.recoveryCode, candidate.codeHash)) {
        matchedCode = candidate;
        break;
      }
    }
    const legacyMatch = Boolean(user.totpRecover && verifyLegacyCode(body.recoveryCode, user.totpRecover));
    if (!matchedCode && !legacyMatch) {
      throw new ApiError(400, "invalid_recovery", "The recovery details are invalid.");
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      if (matchedCode) {
        const [stillActive] = await tx
          .select()
          .from(recoveryCodeHashes)
          .where(and(eq(recoveryCodeHashes.uuid, matchedCode.uuid), isNull(recoveryCodeHashes.consumedAt)))
          .limit(1);
        if (!stillActive) throw new ApiError(400, "invalid_recovery", "The recovery details are invalid.");
        await tx.update(recoveryCodeHashes).set({ consumedAt: now }).where(eq(recoveryCodeHashes.uuid, matchedCode.uuid));
      }
      await tx
        .update(twoFactorCredentials)
        .set({ status: "disabled" })
        .where(eq(twoFactorCredentials.userUuid, user.uuid));
      await tx
        .update(devices)
        .set({ refreshToken: "", refreshTokenHash: null, revokedAt: now, updatedAt: now })
        .where(eq(devices.userUuid, user.uuid));
      await tx
        .update(users)
        .set({ totpSecret: null, totpRecover: null, securityStamp: newUuid(), updatedAt: now })
        .where(eq(users.uuid, user.uuid));
    });

    return Response.json(
      { object: "twoFactorRecovery", twoFactorEnabled: false, sessionsRevoked: true, recoveryCodeConsumed: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}


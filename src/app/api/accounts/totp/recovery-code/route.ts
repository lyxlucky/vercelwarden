import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { recoveryCodeHashes, users } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { hashRecoveryCode } from "@/lib/server/auth/recovery-codes";
import { apiErrorResponse } from "@/lib/server/http/errors";

function recoveryCode(): string {
  return randomBytes(8).toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-");
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "account.recovery-code.rotate");
    const codes = Array.from({ length: 8 }, recoveryCode);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.delete(recoveryCodeHashes).where(eq(recoveryCodeHashes.userUuid, auth.user.uuid));
      await tx.insert(recoveryCodeHashes).values(await Promise.all(codes.map(async (code) => ({
        uuid: newUuid(),
        userUuid: auth.user.uuid,
        codeHash: await hashRecoveryCode(code),
        createdAt: now,
      }))));
      await tx.update(users).set({ totpRecover: null, updatedAt: now }).where(eq(users.uuid, auth.user.uuid));
    });
    return Response.json({ object: "recoveryCodes", codes }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

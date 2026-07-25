import { z } from "zod";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";
import { issueReauthProof } from "@/lib/server/auth/reauth";
import type { ReauthPurpose } from "@/lib/contracts/account-security";
import { verifyPassword } from "@/lib/password";

const purposes = [
  "account.password.change",
  "account.kdf.change",
  "account.hint.change",
  "account.api-key.rotate",
  "account.security-stamp.rotate",
  "account.two-factor.manage",
  "account.passkey.manage",
  "account.recovery-code.rotate",
  "device.trust",
  "device.remove",
  "export.plaintext",
  "admin.user.status",
  "admin.user.delete",
  "admin.audit.clear",
  "backup.restore",
] as const satisfies readonly ReauthPurpose[];

const schema = z.object({
  purpose: z.enum(purposes),
  masterPasswordHash: z.string().min(16).max(1024),
}).strict();

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const body = await parseJsonBody(request, schema, 16 * 1024);
    if (!verifyPassword(
      body.masterPasswordHash,
      auth.user.passwordHash as Uint8Array,
      auth.user.salt as Uint8Array,
      auth.user.passwordIterations
    )) {
      throw new ApiError(400, "reauthentication_failed", "The account credentials are invalid.");
    }
    const issued = await issueReauthProof(auth, body.purpose);
    return Response.json({
      object: "reauthenticationProof",
      proof: issued.proof,
      purpose: body.purpose,
      expiresAt: new Date(issued.expiresAt * 1000).toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

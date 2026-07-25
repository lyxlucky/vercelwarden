import "server-only";

import { randomBytes } from "node:crypto";
import { hashSecret } from "@/lib/server/auth/secret-hash";

export type AdminInviteStatus = "active" | "used" | "expired" | "revoked";

export function adminInviteStatus(invite: {
  expiresAt: Date;
  maxUses: number;
  useCount: number;
  revokedAt: Date | null;
}, now = new Date()): AdminInviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.useCount >= invite.maxUses) return "used";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

export async function generateAdminInviteSecret() {
  const code = randomBytes(24).toString("base64url");
  return { code, codeHash: await hashSecret(code, "admin-invite") };
}

export function serializeAdminInvite(invite: {
  uuid: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  maxUses: number;
  useCount: number;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}, now = new Date()) {
  return {
    id: invite.uuid,
    email: invite.email,
    status: adminInviteStatus(invite, now),
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    creationDate: invite.createdAt.toISOString(),
    expirationDate: invite.expiresAt.toISOString(),
    lastUsedDate: invite.lastUsedAt?.toISOString() ?? null,
    revokedDate: invite.revokedAt?.toISOString() ?? null,
    object: "adminInvite" as const,
  };
}

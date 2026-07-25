import "server-only";

import type { ciphers } from "@/db/schema";

export interface ExtendedCipherOpaqueProjection {
  version: 1;
  originalType: number;
  encryptedData: string;
  encryptedFields: string | null;
  encryptedPasswordHistory: string | null;
}

export function projectCipherForLegacyClient(
  serialized: Record<string, unknown>,
  cipher: typeof ciphers.$inferSelect
): Record<string, unknown> {
  if (cipher.type < 6 || cipher.type > 8) return serialized;
  const opaque: ExtendedCipherOpaqueProjection = {
    version: 1,
    originalType: cipher.type,
    encryptedData: cipher.data,
    encryptedFields: cipher.fields,
    encryptedPasswordHistory: cipher.passwordHistory,
  };
  const data = {
    ...(serialized.data && typeof serialized.data === "object" ? serialized.data as Record<string, unknown> : {}),
    vercelwardenOpaque: opaque,
  };
  return {
    ...serialized,
    type: 2,
    data,
    secureNote: { type: 0 },
    bankAccount: null,
    drivingLicence: null,
    passport: null,
    viewPassword: false,
    edit: false,
    permissions: { delete: false, restore: false },
  };
}

export function hasMatchingOpaqueProjection(body: Record<string, unknown>, cipher: typeof ciphers.$inferSelect): boolean {
  const data = body.data ?? body.Data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const opaque = (data as Record<string, unknown>).vercelwardenOpaque;
  if (!opaque || typeof opaque !== "object" || Array.isArray(opaque)) return false;
  const value = opaque as Partial<ExtendedCipherOpaqueProjection>;
  return value.version === 1
    && value.originalType === cipher.type
    && value.encryptedData === cipher.data
    && value.encryptedFields === cipher.fields
    && value.encryptedPasswordHistory === cipher.passwordHistory;
}

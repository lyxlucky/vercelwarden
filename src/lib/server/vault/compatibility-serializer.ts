import "server-only";

import type { ciphers } from "@/db/schema";

export interface ExtendedCipherOpaqueProjection {
  version: 1;
  originalType: number;
  encryptedData: string;
  encryptedFields: string | null;
  encryptedPasswordHistory: string | null;
}

function dataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
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
    ...dataObject(serialized.data),
    vercelwardenOpaque: opaque,
  };
  return {
    ...serialized,
    type: 2,
    data: JSON.stringify(data),
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
  const data = dataObject(body.data ?? body.Data);
  const opaque = data.vercelwardenOpaque;
  if (!opaque || typeof opaque !== "object" || Array.isArray(opaque)) return false;
  const value = opaque as Partial<ExtendedCipherOpaqueProjection>;
  return value.version === 1
    && value.originalType === cipher.type
    && value.encryptedData === cipher.data
    && value.encryptedFields === cipher.fields
    && value.encryptedPasswordHistory === cipher.passwordHistory;
}

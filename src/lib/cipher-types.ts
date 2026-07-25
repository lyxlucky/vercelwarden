export const CIPHER_TYPE_KEYS = {
  1: "login",
  2: "secureNote",
  3: "card",
  4: "identity",
  5: "sshKey",
  6: "bankAccount",
  7: "drivingLicence",
  8: "passport",
} as const;

export type SupportedCipherType = keyof typeof CIPHER_TYPE_KEYS;
export type CipherTypeKey = (typeof CIPHER_TYPE_KEYS)[SupportedCipherType];

const PASCAL_TYPE_KEYS: Record<CipherTypeKey, string> = {
  login: "Login",
  secureNote: "SecureNote",
  card: "Card",
  identity: "Identity",
  sshKey: "SshKey",
  bankAccount: "BankAccount",
  drivingLicence: "DrivingLicence",
  passport: "Passport",
};

const LEGACY_ALIASES: Partial<Record<CipherTypeKey, readonly string[]>> = {
  drivingLicence: ["drivingLicense", "DrivingLicense"],
  bankAccount: ["bank", "Bank"],
};

export function cipherTypeKey(type: number): CipherTypeKey | null {
  return CIPHER_TYPE_KEYS[type as SupportedCipherType] ?? null;
}

export function cipherTypeAliases(type: number): readonly string[] {
  const key = cipherTypeKey(type);
  if (!key) return [];
  return [key, PASCAL_TYPE_KEYS[key], ...(LEGACY_ALIASES[key] ?? [])];
}

export function extractTypedCipherPayload(body: Record<string, unknown>): Record<string, unknown> {
  for (const type of Object.keys(CIPHER_TYPE_KEYS).map(Number)) {
    for (const key of cipherTypeAliases(type)) {
      const value = body[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
  }
  const data = body.data ?? body.Data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

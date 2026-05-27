import type { ciphers } from "@/db/schema";

export function safeJsonParse<T = unknown>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function extractCipherData(body: Record<string, unknown>) {
  for (const key of ["Login", "SecureNote", "Card", "Identity", "SshKey"]) {
    if (body[key]) return body[key];
  }
  return {};
}

interface SerializeOpts {
  folderId?: string | null;
  attachments?: Array<{
    Id: string;
    FileName: string;
    Size: number;
    SizeName: string | null;
    Url: string;
    Key: string | null;
    Object: "attachment";
  }> | null;
}

export function serializeCipher(
  cipher: typeof ciphers.$inferSelect,
  opts: SerializeOpts = {}
) {
  const data = safeJsonParse<Record<string, unknown>>(cipher.data) ?? {};
  return {
    Id: cipher.uuid,
    Type: cipher.type,
    Name: cipher.name,
    Notes: cipher.notes,
    Fields: safeJsonParse(cipher.fields),
    Login: cipher.type === 1 ? data : null,
    SecureNote: cipher.type === 2 ? data : null,
    Card: cipher.type === 3 ? data : null,
    Identity: cipher.type === 4 ? data : null,
    SshKey: cipher.type === 5 ? data : null,
    OrganizationId: cipher.organizationUuid,
    FolderId: opts.folderId ?? null,
    Favorite: cipher.favorite,
    Edit: cipher.edit,
    ViewPassword: true,
    Reprompt: cipher.reprompt,
    Key: cipher.key,
    PasswordHistory: safeJsonParse(cipher.passwordHistory),
    Attachments: opts.attachments ?? null,
    OrganizationUseTotp: false,
    CollectionIds: [],
    CreationDate: cipher.createdAt.toISOString(),
    RevisionDate: cipher.updatedAt.toISOString(),
    DeletedDate: cipher.deletedAt?.toISOString() ?? null,
    Object: "cipherDetails",
  };
}

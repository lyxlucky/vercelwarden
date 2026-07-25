import type { ciphers, attachments as attachmentsTbl } from "@/db/schema";
import { serializeAttachment } from "@/lib/attachment";
import { cipherTypeKey, extractTypedCipherPayload } from "@/lib/cipher-types";

export function safeJsonParse<T = unknown>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeEmptyEncryptedValues(value: unknown): unknown {
  if (value === "") return null;
  if (Array.isArray(value)) return value.map(normalizeEmptyEncryptedValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeEmptyEncryptedValues(entry),
      ])
    );
  }
  return value;
}

export function extractCipherData(body: Record<string, unknown>) {
  return extractTypedCipherPayload(body);
}

interface SerializeOpts {
  folderId?: string | null;
  favorite?: boolean;
  attachments?: Array<typeof attachmentsTbl.$inferSelect> | null;
  origin?: string;
}

// Cipher response — matches Vaultwarden 1.36.0 Cipher::to_json (cipher.rs:336+).
// Wire format is fully camelCase. The `data` field carries the type-specific
// payload plus name/notes/fields/passwordHistory mirror keys, and the matching
// one of {login|secureNote|card|identity|sshKey} is populated with type_data.
export function serializeCipher(
  cipher: typeof ciphers.$inferSelect,
  opts: SerializeOpts = {}
) {
  // Optional encrypted fields must be null when absent. An empty string is not
  // a valid EncString; Bitwarden Core interprets it as legacy type 0 with one
  // part and aborts the entire cipher list with InvalidTypeSymm.
  const typeData = normalizeEmptyEncryptedValues(
    safeJsonParse<Record<string, unknown>>(cipher.data) ?? {}
  ) as Record<string, unknown>;
  const fields = normalizeEmptyEncryptedValues(safeJsonParse(cipher.fields) ?? []);
  const passwordHistory = normalizeEmptyEncryptedValues(
    safeJsonParse(cipher.passwordHistory) ?? []
  );

  // Backwards-compat shim for login items: clients expect a top-level `uri`
  // even when only `uris` is set.
  if (cipher.type === 1 && (typeData as { uri?: unknown }).uri === undefined) {
    (typeData as Record<string, unknown>).uri = null;
  }

  const data = {
    ...typeData,
    fields,
    name: cipher.name,
    notes: cipher.notes,
    passwordHistory,
  };

  const out: Record<string, unknown> = {
    object: "cipherDetails",
    id: cipher.uuid,
    type: cipher.type,
    creationDate: cipher.createdAt.toISOString(),
    revisionDate: cipher.updatedAt.toISOString(),
    deletedDate: cipher.deletedAt?.toISOString() ?? null,
    reprompt: cipher.reprompt,
    organizationId: cipher.organizationUuid,
    key: cipher.key,
    attachments:
      opts.attachments && opts.origin
        ? opts.attachments.map((a) => serializeAttachment(a, cipher.uuid, opts.origin!))
        : opts.attachments && opts.attachments.length === 0
        ? []
        : null,
    organizationUseTotp: true,
    collectionIds: [] as string[],

    name: cipher.name,
    notes: cipher.notes,
    fields,
    data,
    passwordHistory,

    login: null,
    secureNote: null,
    card: null,
    identity: null,
    sshKey: null,
    bankAccount: null,
    drivingLicence: null,
    passport: null,

    folderId: opts.folderId ?? null,
    favorite: opts.favorite ?? cipher.favorite,
    archivedDate: cipher.archivedAt?.toISOString() ?? null,
    edit: cipher.edit,
    viewPassword: true,
    permissions: {
      delete: cipher.edit,
      restore: cipher.edit,
    },
  };

  const typeKey = cipherTypeKey(cipher.type);
  if (typeKey) out[typeKey] = typeData;

  return out;
}

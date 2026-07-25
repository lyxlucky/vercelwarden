import { cipherTypeAliases, cipherTypeKey, type SupportedCipherType } from "@/lib/cipher-types";

export interface VaultUriDraft {
  uri: string;
  match: number | null;
  extensions?: Record<string, unknown>;
}

export interface VaultCustomFieldDraft {
  name: string;
  value: string;
  type: number;
  linkedId: number | null;
  extensions?: Record<string, unknown>;
}

export interface VaultPasswordHistoryDraft {
  password: string;
  lastUsedDate: string | null;
  extensions?: Record<string, unknown>;
}

export interface VaultItemDraft {
  id?: string;
  type: SupportedCipherType;
  name: string;
  notes: string;
  favorite: boolean;
  folderId: string | null;
  reprompt: number;
  fields: VaultCustomFieldDraft[];
  passwordHistory: VaultPasswordHistoryDraft[];
  payload: Record<string, unknown>;
  extensions: Record<string, unknown>;
}

type StringTransform = (value: string, path: readonly (string | number)[]) => string | Promise<string>;

const COMMON_KEYS = new Set([
  "object", "id", "type", "name", "Name", "notes", "Notes", "favorite", "Favorite",
  "folderId", "FolderId", "reprompt", "Reprompt", "fields", "Fields", "passwordHistory",
  "PasswordHistory", "data", "Data", "creationDate", "revisionDate", "deletedDate",
  "archivedDate", "organizationId", "key", "attachments", "collectionIds", "edit",
  "viewPassword", "permissions", "organizationUseTotp",
]);

for (let type = 1; type <= 8; type += 1) {
  for (const alias of cipherTypeAliases(type)) COMMON_KEYS.add(alias);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pick(source: Record<string, unknown>, camel: string, pascal: string): unknown {
  return source[camel] ?? source[pascal];
}

function unknownKeys(source: Record<string, unknown>, known: ReadonlySet<string>) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key)));
}

function decodeFields(value: unknown): VaultCustomFieldDraft[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(["name", "Name", "value", "Value", "type", "Type", "linkedId", "LinkedId"]);
  return value.map((entry) => {
    const source = record(entry);
    const extensions = unknownKeys(source, known);
    return {
      name: text(pick(source, "name", "Name")),
      value: text(pick(source, "value", "Value")),
      type: number(pick(source, "type", "Type")),
      linkedId: typeof pick(source, "linkedId", "LinkedId") === "number"
        ? pick(source, "linkedId", "LinkedId") as number
        : null,
      ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
    };
  });
}

function decodePasswordHistory(value: unknown): VaultPasswordHistoryDraft[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(["password", "Password", "lastUsedDate", "LastUsedDate"]);
  return value.map((entry) => {
    const source = record(entry);
    const extensions = unknownKeys(source, known);
    return {
      password: text(pick(source, "password", "Password")),
      lastUsedDate: nullableText(pick(source, "lastUsedDate", "LastUsedDate")),
      ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
    };
  });
}

function typedPayload(source: Record<string, unknown>, type: SupportedCipherType) {
  for (const alias of cipherTypeAliases(type)) {
    const value = source[alias];
    if (value && typeof value === "object" && !Array.isArray(value)) return { ...record(value) };
  }
  return { ...record(source.data ?? source.Data) };
}

export function decodeVaultItem(source: Record<string, unknown>): VaultItemDraft {
  const rawType = number(source.type, 1);
  const type = cipherTypeKey(rawType) ? rawType as SupportedCipherType : 2;
  return {
    id: nullableText(source.id) ?? undefined,
    type,
    name: text(pick(source, "name", "Name")),
    notes: text(pick(source, "notes", "Notes")),
    favorite: Boolean(pick(source, "favorite", "Favorite")),
    folderId: nullableText(pick(source, "folderId", "FolderId")),
    reprompt: number(pick(source, "reprompt", "Reprompt")),
    fields: decodeFields(pick(source, "fields", "Fields")),
    passwordHistory: decodePasswordHistory(pick(source, "passwordHistory", "PasswordHistory")),
    payload: typedPayload(source, type),
    extensions: unknownKeys(source, COMMON_KEYS),
  };
}

function encodeFields(fields: readonly VaultCustomFieldDraft[]) {
  return fields.map((field) => ({
    ...(field.extensions ?? {}),
    name: field.name,
    value: field.value,
    type: field.type,
    linkedId: field.linkedId,
  }));
}

function encodePasswordHistory(history: readonly VaultPasswordHistoryDraft[]) {
  return history.map((entry) => ({
    ...(entry.extensions ?? {}),
    password: entry.password,
    lastUsedDate: entry.lastUsedDate,
  }));
}

export function encodeVaultItem(draft: VaultItemDraft): Record<string, unknown> {
  const typeKey = cipherTypeKey(draft.type);
  if (!typeKey) throw new Error(`Unsupported vault item type: ${draft.type}`);
  const fields = encodeFields(draft.fields);
  const passwordHistory = encodePasswordHistory(draft.passwordHistory);
  return {
    ...draft.extensions,
    ...(draft.id ? { id: draft.id } : {}),
    type: draft.type,
    name: draft.name,
    notes: draft.notes || null,
    favorite: draft.favorite,
    folderId: draft.folderId,
    reprompt: draft.reprompt,
    fields,
    passwordHistory,
    [typeKey]: { ...draft.payload },
  };
}

async function transformUnknown(
  value: unknown,
  transform: StringTransform,
  path: readonly (string | number)[]
): Promise<unknown> {
  if (typeof value === "string") return transform(value, path);
  if (Array.isArray(value)) return Promise.all(value.map((entry, index) => transformUnknown(entry, transform, [...path, index])));
  if (value && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([key, entry]) => [
      key,
      await transformUnknown(entry, transform, [...path, key]),
    ] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

export async function transformVaultItemStrings(
  draft: VaultItemDraft,
  transform: StringTransform
): Promise<VaultItemDraft> {
  return {
    ...draft,
    name: await transform(draft.name, ["name"]),
    notes: await transform(draft.notes, ["notes"]),
    fields: await Promise.all(draft.fields.map(async (field, index) => ({
      ...field,
      name: await transform(field.name, ["fields", index, "name"]),
      value: await transform(field.value, ["fields", index, "value"]),
    }))),
    passwordHistory: await Promise.all(draft.passwordHistory.map(async (entry, index) => ({
      ...entry,
      password: await transform(entry.password, ["passwordHistory", index, "password"]),
    }))),
    payload: await transformUnknown(draft.payload, transform, [cipherTypeKey(draft.type) ?? "data"]) as Record<string, unknown>,
  };
}

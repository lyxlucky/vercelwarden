import type { ImportDocument } from "@/features/import-export/import-registry";
import type { VaultItemDraft } from "@/features/vault/item-codecs";

export type CsvRow = Record<string, string>;

export function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (quoted) {
      if (character === '"' && raw[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

export function parseCsv(raw: string): CsvRow[] {
  const [header = [], ...rows] = parseCsvRows(raw);
  const keys = header.map((key) => key.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(keys.map((key, index) => [key, values[index]?.trim() ?? ""])));
}

function value(row: CsvRow, ...keys: string[]) {
  for (const key of keys) if (row[key.toLowerCase()]) return row[key.toLowerCase()]!;
  return "";
}

export function loginDraft(input: {
  name?: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  folderId?: string | null;
  totp?: string;
  favorite?: boolean;
}): VaultItemDraft {
  const uri = input.url?.trim();
  return {
    type: 1,
    name: input.name?.trim() || (() => {
      try { return uri ? new URL(/^\w+:\/\//.test(uri) ? uri : `https://${uri}`).hostname : "导入的登录"; }
      catch { return "导入的登录"; }
    })(),
    notes: input.notes ?? "",
    favorite: Boolean(input.favorite),
    folderId: input.folderId ?? null,
    reprompt: 0,
    fields: [],
    passwordHistory: [],
    payload: {
      username: input.username ?? "",
      password: input.password ?? "",
      totp: input.totp || null,
      uris: uri ? [{ uri, match: null }] : [],
    },
    extensions: {},
  };
}

function empty(): Omit<ImportDocument, "source" | "rawBytes"> {
  return { folders: [], items: [], warnings: [] };
}

export function parseBrowserCsv(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  const result = empty();
  result.items = parseCsv(raw).map((row) => loginDraft({
    name: value(row, "name", "title", "hostname"),
    url: value(row, "url", "origin", "website"),
    username: value(row, "username", "login_username", "user"),
    password: value(row, "password", "login_password"),
    notes: value(row, "note", "notes"),
  }));
  return result;
}

export function parseBrowserJson(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  const parsed = JSON.parse(raw) as unknown;
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { passwords?: unknown[] })?.passwords)
      ? (parsed as { passwords: unknown[] }).passwords
      : [];
  return {
    folders: [],
    warnings: [],
    items: entries.map((entry) => {
      const item = entry as Record<string, unknown>;
      return loginDraft({
        name: String(item.name ?? item.title ?? ""),
        url: String(item.url ?? item.origin ?? item.website ?? ""),
        username: String(item.username ?? item.user ?? ""),
        password: String(item.password ?? ""),
        notes: String(item.notes ?? ""),
      });
    }),
  };
}

export function parseBitwardenJson(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  const parsed = JSON.parse(raw) as { encrypted?: boolean; folders?: Array<{ id?: string; name?: string }>; items?: Array<Record<string, unknown>> };
  if (parsed.encrypted) throw new Error("请先在 Bitwarden 中导出未加密 JSON，或使用本客户端的受保护导出解锁流程。");
  const folders = (parsed.folders ?? []).map((folder, index) => ({ id: folder.id ?? `folder-${index}`, name: folder.name ?? "导入文件夹" }));
  const folderIds = new Set(folders.map((folder) => folder.id));
  const items = (parsed.items ?? []).map((item) => {
    const type = Number(item.type ?? 1);
    const typedKey = ["", "login", "secureNote", "card", "identity", "sshKey", "bankAccount", "drivingLicence", "passport"][type] ?? "secureNote";
    const payload = item[typedKey] && typeof item[typedKey] === "object" ? item[typedKey] as Record<string, unknown> : {};
    const folderId = typeof item.folderId === "string" && folderIds.has(item.folderId) ? item.folderId : null;
    return {
      id: typeof item.id === "string" ? item.id : undefined,
      type: type >= 1 && type <= 8 ? type as VaultItemDraft["type"] : 2,
      name: String(item.name ?? "导入项目"),
      notes: String(item.notes ?? ""),
      favorite: Boolean(item.favorite),
      folderId,
      reprompt: Number(item.reprompt ?? 0),
      fields: Array.isArray(item.fields) ? item.fields.map((field) => {
        const value = field as Record<string, unknown>;
        return { name: String(value.name ?? ""), value: String(value.value ?? ""), type: Number(value.type ?? 0), linkedId: typeof value.linkedId === "number" ? value.linkedId : null };
      }) : [],
      passwordHistory: Array.isArray(item.passwordHistory) ? item.passwordHistory.map((history) => {
        const value = history as Record<string, unknown>;
        return { password: String(value.password ?? ""), lastUsedDate: typeof value.lastUsedDate === "string" ? value.lastUsedDate : null };
      }) : [],
      payload,
      extensions: {},
    } satisfies VaultItemDraft;
  });
  return { folders, items, warnings: [] };
}

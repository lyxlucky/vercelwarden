import type { ImportDocument, ImportFolder } from "@/features/import-export/import-registry";
import { loginDraft, parseCsv, type CsvRow } from "@/features/import-export/importers/browser-csv";

function cell(row: CsvRow, ...keys: string[]) {
  for (const key of keys) if (row[key.toLowerCase()]) return row[key.toLowerCase()]!;
  return "";
}

function withFolders(rows: CsvRow[], folderKeys: string[], mapper: (row: CsvRow, folderId: string | null) => ReturnType<typeof loginDraft>): Omit<ImportDocument, "source" | "rawBytes"> {
  const folders: ImportFolder[] = [];
  const ids = new Map<string, string>();
  const items = rows.map((row) => {
    const name = cell(row, ...folderKeys).trim();
    let folderId: string | null = null;
    if (name) {
      folderId = ids.get(name) ?? `folder-${ids.size + 1}`;
      if (!ids.has(name)) { ids.set(name, folderId); folders.push({ id: folderId, name }); }
    }
    return mapper(row, folderId);
  });
  return { folders, items, warnings: [] };
}

export function parseOnePassword(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
    const parsed = JSON.parse(raw) as { accounts?: Array<{ vaults?: Array<{ name?: string; items?: Array<Record<string, unknown>> }> }> };
    const folders: ImportFolder[] = [];
    const items: ReturnType<typeof loginDraft>[] = [];
    for (const account of parsed.accounts ?? []) for (const vault of account.vaults ?? []) {
      const folderId = `folder-${folders.length + 1}`;
      folders.push({ id: folderId, name: vault.name ?? "1Password" });
      for (const entry of vault.items ?? []) {
        const overview = (entry.overview ?? {}) as Record<string, unknown>;
        const details = (entry.details ?? {}) as Record<string, unknown>;
        items.push(loginDraft({
          name: String(overview.title ?? entry.title ?? "1Password 项目"),
          url: String(overview.url ?? details.url ?? ""),
          username: String(details.username ?? ""),
          password: String(details.password ?? ""),
          notes: String(details.notesPlain ?? ""),
          folderId,
        }));
      }
    }
    return { folders, items, warnings: [] };
  }
  return withFolders(parseCsv(raw), ["vault", "folder", "category"], (row, folderId) => loginDraft({
    name: cell(row, "title", "name"), url: cell(row, "url", "website"), username: cell(row, "username", "login"),
    password: cell(row, "password"), notes: cell(row, "notes", "extra"), folderId,
  }));
}

function xmlValue(entry: string, key: string) {
  const strings = Array.from(entry.matchAll(/<String>\s*<Key>([\s\S]*?)<\/Key>\s*<Value[^>]*>([\s\S]*?)<\/Value>\s*<\/String>/gi));
  const found = strings.find((match) => match[1]?.trim().toLowerCase() === key.toLowerCase());
  return found?.[2]?.replace(/<[^>]+>/g, "").trim() ?? "";
}

export function parseKeePass(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  if (raw.trim().startsWith("<")) {
    const entries = Array.from(raw.matchAll(/<Entry>([\s\S]*?)<\/Entry>/gi));
    return { folders: [], warnings: [], items: entries.map((match) => loginDraft({
      name: xmlValue(match[1] ?? "", "Title"), username: xmlValue(match[1] ?? "", "UserName"),
      password: xmlValue(match[1] ?? "", "Password"), url: xmlValue(match[1] ?? "", "URL"), notes: xmlValue(match[1] ?? "", "Notes"),
    })) };
  }
  return withFolders(parseCsv(raw), ["group", "folder"], (row, folderId) => loginDraft({
    name: cell(row, "account", "title", "name"), username: cell(row, "login name", "username"),
    password: cell(row, "password"), url: cell(row, "web site", "url"), notes: cell(row, "comments", "notes"), folderId,
  }));
}

export function parseLastPass(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  return withFolders(parseCsv(raw), ["grouping"], (row, folderId) => loginDraft({
    name: cell(row, "name"), url: cell(row, "url"), username: cell(row, "username"), password: cell(row, "password"),
    notes: cell(row, "extra"), folderId, favorite: cell(row, "fav") === "1",
  }));
}

export function parseDashlane(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { items?: unknown[] })?.items) ? (parsed as { items: unknown[] }).items : [];
    return { folders: [], warnings: [], items: entries.map((entry) => {
      const row = entry as Record<string, unknown>;
      return loginDraft({ name: String(row.title ?? row.name ?? ""), url: String(row.url ?? row.website ?? ""), username: String(row.username ?? row.login ?? ""), password: String(row.password ?? ""), notes: String(row.note ?? row.notes ?? ""), totp: String(row.otpSecret ?? "") });
    }) };
  }
  return withFolders(parseCsv(raw), ["category", "folder"], (row, folderId) => loginDraft({
    name: cell(row, "title", "name"), url: cell(row, "url", "website"), username: cell(row, "username", "login"),
    password: cell(row, "password"), notes: cell(row, "note", "notes"), totp: cell(row, "otpsecret", "otp"), folderId,
  }));
}

export function parseProtonPass(raw: string): Omit<ImportDocument, "source" | "rawBytes"> {
  const parsed = JSON.parse(raw) as { vaults?: Record<string, { name?: string; items?: Array<Record<string, unknown>> }> };
  const folders: ImportFolder[] = [];
  const items: ReturnType<typeof loginDraft>[] = [];
  for (const [vaultKey, vault] of Object.entries(parsed.vaults ?? {})) {
    const folderId = `folder-${folders.length + 1}`;
    folders.push({ id: folderId, name: vault.name ?? vaultKey });
    for (const item of vault.items ?? []) {
      const content = (item.content ?? item.data ?? {}) as Record<string, unknown>;
      const urls = Array.isArray(content.urls) ? content.urls : [];
      items.push(loginDraft({
        name: String(item.name ?? content.name ?? "Proton Pass 项目"),
        username: String(content.itemUsername ?? content.username ?? ""),
        password: String(content.password ?? ""),
        url: String(urls[0] ?? content.url ?? ""),
        notes: String(content.note ?? content.notes ?? ""),
        totp: String(content.totpUri ?? content.totp ?? ""),
        folderId,
      }));
    }
  }
  return { folders, items, warnings: [] };
}

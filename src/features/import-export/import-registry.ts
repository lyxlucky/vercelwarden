import type { VaultItemDraft } from "@/features/vault/item-codecs";
import {
  parseBitwardenJson,
  parseBrowserCsv,
  parseBrowserJson,
} from "@/features/import-export/importers/browser-csv";
import {
  parseDashlane,
  parseKeePass,
  parseLastPass,
  parseOnePassword,
  parseProtonPass,
} from "@/features/import-export/importers/password-managers";

export type ImportSource =
  | "browser-csv"
  | "browser-json"
  | "bitwarden-json"
  | "1password"
  | "keepass"
  | "lastpass"
  | "dashlane"
  | "proton-pass";

export interface ImportFolder {
  id: string;
  name: string;
}

export interface ImportDocument {
  source: ImportSource;
  folders: ImportFolder[];
  items: VaultItemDraft[];
  warnings: string[];
  rawBytes: number;
}

type Parser = (raw: string) => Omit<ImportDocument, "source" | "rawBytes">;

const parsers: Record<ImportSource, Parser> = {
  "browser-csv": parseBrowserCsv,
  "browser-json": parseBrowserJson,
  "bitwarden-json": parseBitwardenJson,
  "1password": parseOnePassword,
  keepass: parseKeePass,
  lastpass: parseLastPass,
  dashlane: parseDashlane,
  "proton-pass": parseProtonPass,
};

export const IMPORT_SOURCES: ReadonlyArray<{ id: ImportSource; label: string; accept: string }> = [
  { id: "browser-csv", label: "浏览器 CSV（Chrome / Firefox / Safari）", accept: ".csv,text/csv" },
  { id: "browser-json", label: "浏览器 JSON", accept: ".json,application/json" },
  { id: "bitwarden-json", label: "Bitwarden JSON", accept: ".json,application/json" },
  { id: "1password", label: "1Password CSV / 1PUX JSON", accept: ".csv,.json,.1pux" },
  { id: "keepass", label: "KeePass CSV / XML", accept: ".csv,.xml,text/xml" },
  { id: "lastpass", label: "LastPass CSV", accept: ".csv,text/csv" },
  { id: "dashlane", label: "Dashlane CSV / JSON", accept: ".csv,.json" },
  { id: "proton-pass", label: "Proton Pass JSON", accept: ".json,application/json" },
];

export function parseImportPayload(source: ImportSource, raw: string): ImportDocument {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("导入文件为空。");
  const parsed = parsers[source](raw.replace(/^\uFEFF/, ""));
  if (parsed.items.length === 0) throw new Error("没有发现可导入的项目。");
  return { ...parsed, source, rawBytes: new TextEncoder().encode(raw).byteLength };
}

export function detectImportSource(fileName: string, raw: string): ImportSource {
  const name = fileName.toLowerCase();
  const sample = raw.slice(0, 20_000).toLowerCase();
  if (sample.includes('"encrypted"') && sample.includes('"items"')) return "bitwarden-json";
  if (sample.includes('"vaults"') && (sample.includes("proton") || sample.includes('"itemusername"'))) return "proton-pass";
  if (name.endsWith(".xml") || sample.includes("<keepassfile")) return "keepass";
  if (name.endsWith(".1pux") || sample.includes('"overview"') && sample.includes('"details"')) return "1password";
  if (sample.startsWith("[") || sample.startsWith("{")) return "browser-json";
  const header = sample.split(/\r?\n/, 1)[0] ?? "";
  if (header.includes("grouping") && header.includes("fav")) return "lastpass";
  if (header.includes("username2") || header.includes("otpsecret")) return "dashlane";
  if (header.includes("login name") || header.includes("web site")) return "keepass";
  if (header.includes("title") && header.includes("type")) return "1password";
  return "browser-csv";
}

export function preflightImport(document: ImportDocument, limits: { maxItems: number; maxBytes: number }) {
  if (document.rawBytes > limits.maxBytes) return { ok: false as const, code: "byte_limit" as const, message: "导入文件超过容量限制。" };
  if (document.items.length > limits.maxItems) return { ok: false as const, code: "item_limit" as const, message: "导入项目数量超过限制。" };
  return { ok: true as const, itemCount: document.items.length, folderCount: document.folders.length, warningCount: document.warnings.length };
}

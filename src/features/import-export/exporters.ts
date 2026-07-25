import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { decryptWithUserKey, encryptWithUserKey, wipeBytes } from "@/lib/client/crypto/auth";
import type { VaultItemDraft } from "@/features/vault/item-codecs";
import type { VaultSnapshot } from "@/features/vault/store";

export interface BitwardenExportDocument {
  encrypted: false;
  folders: Array<{ id: string; name: string }>;
  items: Array<Record<string, unknown>>;
}

export type ProtectedExport =
  | { encrypted: true; mode: "account"; data: string }
  | { encrypted: true; mode: "password"; kdf: "pbkdf2-sha256"; iterations: number; salt: string; iv: string; data: string };

function draftFor(item: VaultSnapshot["items"][number]): VaultItemDraft {
  if (item.draft) return item.draft;
  return {
    id: item.id,
    type: item.type >= 1 && item.type <= 8 ? item.type as VaultItemDraft["type"] : 2,
    name: item.name,
    notes: item.notes ?? "",
    favorite: item.favorite,
    folderId: item.folderId,
    reprompt: item.reprompt ?? 0,
    fields: item.customFields.map((field) => ({ ...field, type: 0, linkedId: null })),
    passwordHistory: item.passwordHistory.map((history) => ({ ...history })),
    payload: item.type === 1
      ? { username: item.username, password: item.password, uris: item.uris.map((uri) => ({ uri, match: null })) }
      : Object.fromEntries(item.details.map((detail) => [detail.name, detail.value])),
    extensions: {},
  };
}

export function buildBitwardenJson(snapshot: VaultSnapshot): BitwardenExportDocument {
  const typedKeys = ["", "login", "secureNote", "card", "identity", "sshKey", "bankAccount", "drivingLicence", "passport"];
  return {
    encrypted: false,
    folders: snapshot.folders.map((folder) => ({ id: folder.id, name: folder.name })),
    items: snapshot.items.filter((item) => !item.deletedAt).map((item) => {
      const draft = draftFor(item);
      return {
        id: item.id,
        type: draft.type,
        name: draft.name,
        notes: draft.notes || null,
        favorite: draft.favorite,
        folderId: draft.folderId,
        reprompt: draft.reprompt,
        fields: draft.fields.map((field) => ({ name: field.name, value: field.value, type: field.type, linkedId: field.linkedId })),
        passwordHistory: draft.passwordHistory,
        [typedKeys[draft.type]!]: draft.payload,
      };
    }),
  };
}

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildBitwardenCsv(snapshot: VaultSnapshot) {
  const header = ["folder", "favorite", "type", "name", "notes", "fields", "reprompt", "login_uri", "login_username", "login_password", "login_totp"];
  const folderNames = new Map(snapshot.folders.map((folder) => [folder.id, folder.name]));
  const rows = snapshot.items.filter((item) => !item.deletedAt).map((item) => {
    const draft = draftFor(item);
    const login = draft.type === 1 ? draft.payload : {};
    return [
      item.folderId ? folderNames.get(item.folderId) ?? "" : "",
      item.favorite ? "1" : "0",
      draft.type === 1 ? "login" : draft.type === 2 ? "note" : "other",
      draft.name,
      draft.notes,
      draft.fields.map((field) => `${field.name}: ${field.value}`).join("\n"),
      draft.reprompt,
      Array.isArray(login.uris) ? String((login.uris[0] as { uri?: unknown } | undefined)?.uri ?? "") : "",
      String(login.username ?? ""),
      String(login.password ?? ""),
      String(login.totp ?? ""),
    ].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\r\n");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function passwordKey(password: string, salt: Uint8Array, iterations: number) {
  const source = await crypto.subtle.importKey("raw", strToU8(password), "PBKDF2", false, ["deriveKey"]);
  const ownedSalt = new Uint8Array(salt.byteLength);
  ownedSalt.set(salt);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: ownedSalt, iterations }, source, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function protectExport(document: unknown, options: { mode: "account"; accountKey: Uint8Array } | { mode: "password"; password: string }): Promise<ProtectedExport> {
  const plaintext = strToU8(JSON.stringify(document));
  try {
    if (options.mode === "account") {
      return { encrypted: true, mode: "account", data: await encryptWithUserKey(plaintext, options.accountKey) };
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 600_000;
    const key = await passwordKey(options.password, salt, iterations);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
    return { encrypted: true, mode: "password", kdf: "pbkdf2-sha256", iterations, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(encrypted) };
  } finally {
    wipeBytes(plaintext);
  }
}

export async function openProtectedExport(document: ProtectedExport, options: { accountKey?: Uint8Array; password?: string }) {
  let plaintext: Uint8Array;
  if (document.mode === "account") {
    if (!options.accountKey) throw new Error("Account key is required.");
    plaintext = await decryptWithUserKey(document.data, options.accountKey);
  } else {
    if (!options.password) throw new Error("Export password is required.");
    const salt = fromBase64(document.salt);
    const iv = fromBase64(document.iv);
    const key = await passwordKey(options.password, salt, document.iterations);
    plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, fromBase64(document.data)));
  }
  try { return JSON.parse(strFromU8(plaintext)) as unknown; }
  finally { wipeBytes(plaintext); }
}

export interface AttachmentArchiveEntry {
  cipherId: string;
  attachmentId: string;
  fileName: string;
  bytes: Uint8Array;
}

function safeName(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 180);
  return cleaned || "attachment.bin";
}

export function buildAttachmentArchive(document: BitwardenExportDocument, attachments: AttachmentArchiveEntry[]) {
  const files: Record<string, Uint8Array> = { "data.json": strToU8(JSON.stringify(document, null, 2)) };
  const manifest = attachments.map((attachment) => {
    const path = `attachments/${encodeURIComponent(attachment.cipherId)}/${encodeURIComponent(attachment.attachmentId)}-${safeName(attachment.fileName)}`;
    files[path] = attachment.bytes;
    return { cipherId: attachment.cipherId, attachmentId: attachment.attachmentId, fileName: attachment.fileName, path, size: attachment.bytes.byteLength };
  });
  files["manifest.json"] = strToU8(JSON.stringify({ version: 1, attachments: manifest }, null, 2));
  return zipSync(files, { level: 6 });
}

export function readAttachmentArchive(bytes: Uint8Array, limits = { compressedBytes: 512 * 1024 * 1024, decompressedBytes: 1024 * 1024 * 1024 }) {
  if (bytes.byteLength > limits.compressedBytes) throw new Error("Archive exceeds the compressed size limit.");
  const files = unzipSync(bytes);
  let total = 0;
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith("/") || path.includes("..") || /^[A-Za-z]:/.test(path)) throw new Error("Archive contains an unsafe path.");
    total += content.byteLength;
    if (total > limits.decompressedBytes) throw new Error("Archive exceeds the decompressed size limit.");
  }
  if (!files["data.json"] || !files["manifest.json"]) throw new Error("Archive manifest is incomplete.");
  const document = JSON.parse(strFromU8(files["data.json"])) as BitwardenExportDocument;
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as { attachments?: Array<{ cipherId: string; attachmentId: string; fileName: string; path: string; size: number }> };
  const attachments = (manifest.attachments ?? []).map((entry) => {
    if (entry.path.startsWith("/") || entry.path.includes("..") || !entry.path.startsWith("attachments/")) throw new Error("Archive contains an unsafe attachment path.");
    const content = files[entry.path];
    if (!content || content.byteLength !== entry.size) throw new Error("Archive attachment is missing or truncated.");
    return { cipherId: entry.cipherId, attachmentId: entry.attachmentId, fileName: entry.fileName, bytes: content };
  });
  return { document, attachments };
}

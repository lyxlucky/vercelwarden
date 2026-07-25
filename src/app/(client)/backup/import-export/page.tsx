"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, FileUp, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { verifyMasterPassword } from "@/features/auth/api";
import { authSecretStore } from "@/features/auth/secret-store";
import { importVaultDocument, type FolderStrategy, type ImportResult } from "@/features/import-export/api";
import {
  detectImportSource,
  IMPORT_SOURCES,
  parseImportPayload,
  preflightImport,
  type ImportDocument,
  type ImportSource,
} from "@/features/import-export/import-registry";
import {
  buildAttachmentArchive,
  buildBitwardenCsv,
  buildBitwardenJson,
  openProtectedExport,
  protectExport,
  readAttachmentArchive,
  type AttachmentArchiveEntry,
  type ProtectedExport,
} from "@/features/import-export/exporters";
import { fetchDecryptedAttachmentBytes, uploadEncryptedAttachment } from "@/features/vault/attachments";
import { useVaultSnapshot } from "@/features/vault/store";
import { wipeBytes } from "@/lib/client/crypto/auth";

type ExportFormat = "json" | "csv" | "account" | "password" | "attachments";

function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function ImportExportPage() {
  const snapshot = useVaultSnapshot();
  const [source, setSource] = useState<ImportSource>("bitwarden-json");
  const [folderStrategy, setFolderStrategy] = useState<FolderStrategy>("preserve");
  const [document, setDocument] = useState<ImportDocument | null>(null);
  const [archiveAttachments, setArchiveAttachments] = useState<AttachmentArchiveEntry[]>([]);
  const [importPassword, setImportPassword] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [exportPassword, setExportPassword] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => document ? preflightImport(document, { maxItems: 10_000, maxBytes: 500 * 1024 * 1024 }) : null, [document]);

  const readImportFile = async (file: File) => {
    setError(null);
    setImportResult(null);
    setArchiveAttachments([]);
    try {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const archive = readAttachmentArchive(new Uint8Array(await file.arrayBuffer()));
        setDocument(parseImportPayload("bitwarden-json", JSON.stringify(archive.document)));
        setArchiveAttachments(archive.attachments);
        setSource("bitwarden-json");
        return;
      }
      const raw = await file.text();
      let content = raw;
      if (raw.trim().startsWith("{")) {
        const possible = JSON.parse(raw) as Record<string, unknown>;
        if (possible.encrypted === true && (possible.mode === "account" || possible.mode === "password")) {
          const key = possible.mode === "account" ? authSecretStore.getVaultKey() : null;
          try {
            const opened = await openProtectedExport(possible as unknown as ProtectedExport, {
              accountKey: key ?? undefined,
              password: importPassword || undefined,
            });
            content = JSON.stringify(opened);
          } finally { wipeBytes(key ?? undefined); }
        }
      }
      const detected = detectImportSource(file.name, content);
      const selected = source === "browser-csv" && detected !== "browser-csv" ? detected : source;
      setSource(selected);
      setDocument(parseImportPayload(selected, content));
    } catch (nextError) {
      setDocument(null);
      setError(nextError instanceof Error ? nextError.message : "无法解析导入文件。");
    }
  };

  const runImport = async () => {
    if (!document || !preview?.ok) return;
    setBusy(true);
    setError(null);
    setProgress("正在加密并写入密码库…");
    try {
      const result = await importVaultDocument(document, folderStrategy);
      for (let index = 0; index < archiveAttachments.length; index += 1) {
        const attachment = archiveAttachments[index]!;
        const cipherId = result.itemMap[attachment.cipherId];
        if (!cipherId) continue;
        setProgress(`正在恢复附件 ${index + 1} / ${archiveAttachments.length}…`);
        const attachmentCopy = new Uint8Array(attachment.bytes.byteLength);
        attachmentCopy.set(attachment.bytes);
        await uploadEncryptedAttachment(cipherId, new File([attachmentCopy.buffer], attachment.fileName));
        wipeBytes(attachmentCopy);
      }
      setImportResult(result);
      setProgress("导入完成");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "导入失败。");
    } finally { setBusy(false); }
  };

  const runExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = buildBitwardenJson(snapshot);
      if (exportFormat === "json" || exportFormat === "csv" || exportFormat === "attachments") {
        if (!reauthPassword) throw new Error("明文导出需要重新验证主密码。");
        await verifyMasterPassword(reauthPassword);
      }
      if (exportFormat === "json") download(JSON.stringify(json, null, 2), "application/json", "vercelwarden-vault.json");
      if (exportFormat === "csv") download(buildBitwardenCsv(snapshot), "text/csv;charset=utf-8", "vercelwarden-vault.csv");
      if (exportFormat === "account") {
        const key = authSecretStore.getVaultKey();
        if (!key) throw new Error("Vault key unavailable.");
        try { download(JSON.stringify(await protectExport(json, { mode: "account", accountKey: key }), null, 2), "application/json", "vercelwarden-account-encrypted.json"); }
        finally { wipeBytes(key); }
      }
      if (exportFormat === "password") {
        if (exportPassword.length < 8) throw new Error("导出密码至少需要 8 个字符。");
        download(JSON.stringify(await protectExport(json, { mode: "password", password: exportPassword }), null, 2), "application/json", "vercelwarden-password-protected.json");
      }
      if (exportFormat === "attachments") {
        const attachments: AttachmentArchiveEntry[] = [];
        const all = snapshot.items.flatMap((item) => item.attachments.map((attachment) => ({ item, attachment })));
        for (let index = 0; index < all.length; index += 1) {
          const { item, attachment } = all[index]!;
          setProgress(`正在收集附件 ${index + 1} / ${all.length}…`);
          const bytes = await fetchDecryptedAttachmentBytes(item.id, attachment);
          attachments.push({ cipherId: item.id, attachmentId: attachment.id, fileName: attachment.fileName, bytes });
        }
        try { download(buildAttachmentArchive(json, attachments), "application/zip", "vercelwarden-vault-attachments.zip"); }
        finally { for (const attachment of attachments) wipeBytes(attachment.bytes); }
      }
      setProgress("导出完成");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "导出失败。");
    } finally { setBusy(false); }
  };

  return <RouteGuard><main className="tool-page"><header className="tool-page__header"><div><Link href="/vault">← 返回密码库</Link><h1>导入与导出</h1><p>迁移数据时，解析、加密和导出保护均在浏览器内完成。</p></div></header>
    {error && <p className="tool-error" role="alert">{error}</p>}{progress && <p aria-live="polite">{progress}</p>}
    <div className="tool-grid"><section className="tool-card"><h2><FileUp size={20} /> 导入</h2>
      <Field label="来源"><select className="vw-input" value={source} onChange={(event) => { setSource(event.target.value as ImportSource); setDocument(null); }}>{IMPORT_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      <Field label="受保护导出密码（如适用）"><Input type="password" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} /></Field>
      <Field label="选择文件"><Input type="file" accept={`${IMPORT_SOURCES.find((item) => item.id === source)?.accept ?? ""},.zip`} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImportFile(file); }} /></Field>
      <Field label="文件夹策略"><select className="vw-input" value={folderStrategy} onChange={(event) => setFolderStrategy(event.target.value as FolderStrategy)}><option value="preserve">保留并新建</option><option value="merge">同名合并</option><option value="flatten">全部放到根目录</option></select></Field>
      {document && <div className="import-preview"><strong>预览</strong><p>{document.items.length} 个项目，{document.folders.length} 个文件夹，{archiveAttachments.length} 个附件。</p>{document.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      <Button variant="primary" icon={FileUp} disabled={busy || !document || !preview?.ok} onClick={runImport}>开始导入</Button>
      {importResult && <p>已导入 {importResult.imported} 项，创建 {importResult.foldersCreated} 个文件夹。</p>}
    </section>
    <section className="tool-card"><h2><Download size={20} /> 导出</h2>
      <Field label="格式"><select className="vw-input" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}><option value="json">Bitwarden JSON（明文）</option><option value="csv">Bitwarden CSV（明文）</option><option value="account">账号密钥加密 JSON</option><option value="password">密码保护 JSON</option><option value="attachments">JSON + 附件 ZIP（明文归档）</option></select></Field>
      {exportFormat === "password" && <Field label="导出密码"><Input type="password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} /></Field>}
      {(exportFormat === "json" || exportFormat === "csv" || exportFormat === "attachments") && <Field label="主密码再认证"><Input type="password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} /></Field>}
      <p><ShieldCheck size={16} /> 明文格式会要求重新验证；CSV 单元格会防止公式执行。</p>
      <Button variant="primary" icon={Download} disabled={busy || snapshot.status !== "ready"} onClick={runExport}>生成导出</Button>
    </section></div>
  </main></RouteGuard>;
}

"use client";

import { useMemo, useState } from "react";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import { Alert, Box, Button, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { SectionCard } from "@/components/ui/SectionCard";
import { ToolPageShell } from "@/components/ui/ToolPageShell";
import { verifyMasterPassword } from "@/features/auth/api";
import { authSecretStore } from "@/features/auth/secret-store";
import { importVaultDocument, type FolderStrategy, type ImportResult } from "@/features/import-export/api";
import { detectImportSource, IMPORT_SOURCES, parseImportPayload, preflightImport, type ImportDocument, type ImportSource } from "@/features/import-export/import-registry";
import { buildAttachmentArchive, buildBitwardenCsv, buildBitwardenJson, openProtectedExport, protectExport, readAttachmentArchive, type AttachmentArchiveEntry, type ProtectedExport } from "@/features/import-export/exporters";
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
            const opened = await openProtectedExport(possible as unknown as ProtectedExport, { accountKey: key ?? undefined, password: importPassword || undefined });
            content = JSON.stringify(opened);
          } finally {
            wipeBytes(key ?? undefined);
          }
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
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setBusy(true);
    setError(null);
    setProgress("正在准备导出…");
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
        try {
          download(JSON.stringify(await protectExport(json, { mode: "account", accountKey: key }), null, 2), "application/json", "vercelwarden-account-encrypted.json");
        } finally {
          wipeBytes(key);
        }
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
        try {
          download(buildAttachmentArchive(json, attachments), "application/zip", "vercelwarden-vault-attachments.zip");
        } finally {
          for (const attachment of attachments) wipeBytes(attachment.bytes);
        }
      }
      setProgress("导出完成");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "导出失败。");
      setProgress("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteGuard>
      <ToolPageShell
        title="导入与导出"
        description="迁移数据时，解析、加密和导出保护均在浏览器内完成。"
        feedback={error ? <AsyncState kind="fatal" title="导入或导出失败" description={error} /> : progress ? <Alert severity={progress.endsWith("完成") ? "success" : "info"} icon={false}><Stack spacing={1}><Typography>{progress}</Typography>{busy ? <LinearProgress aria-label={progress} /> : null}</Stack></Alert> : undefined}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2.5, alignItems: "start" }}>
          <SectionCard title="导入" description="支持常见密码管理器格式和带附件归档。" action={<FileUploadOutlined color="primary" />}>
            <Stack spacing={2.25}>
              <FormControl>
                <InputLabel id="import-source-label">来源</InputLabel>
                <Select labelId="import-source-label" label="来源" value={source} onChange={(event) => { setSource(event.target.value as ImportSource); setDocument(null); }}>
                  {IMPORT_SOURCES.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="受保护导出密码（如适用）" type="password" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} />
              <TextField label="选择文件" type="file" slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: `${IMPORT_SOURCES.find((item) => item.id === source)?.accept ?? ""},.zip` } }} onChange={(event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (file) void readImportFile(file); }} />
              <FormControl>
                <InputLabel id="folder-strategy-label">文件夹策略</InputLabel>
                <Select labelId="folder-strategy-label" label="文件夹策略" value={folderStrategy} onChange={(event) => setFolderStrategy(event.target.value as FolderStrategy)}>
                  <MenuItem value="preserve">保留并新建</MenuItem>
                  <MenuItem value="merge">同名合并</MenuItem>
                  <MenuItem value="flatten">全部放到根目录</MenuItem>
                </Select>
              </FormControl>
              {document ? (
                <Alert severity={preview?.ok ? "info" : "warning"}>
                  <Typography sx={{ fontWeight: 700 }}>预览</Typography>
                  <Typography variant="body2">{document.items.length} 个项目，{document.folders.length} 个文件夹，{archiveAttachments.length} 个附件。</Typography>
                  {document.warnings.map((warning) => <Typography variant="body2" key={warning}>{warning}</Typography>)}
                </Alert>
              ) : null}
              <Button variant="contained" startIcon={<FileUploadOutlined />} disabled={busy || !document || !preview?.ok} onClick={() => void runImport()}>开始导入</Button>
              {importResult ? <AsyncState kind={importResult.failed ? "partial" : "success"} title="导入完成" description={`已导入 ${importResult.imported} 项，创建 ${importResult.foldersCreated} 个文件夹。${importResult.failed ? ` ${importResult.failed} 项失败。` : ""}`} /> : null}
            </Stack>
          </SectionCard>

          <SectionCard title="导出" description="选择明文、账号密钥或独立密码保护格式。" action={<DownloadOutlined color="primary" />}>
            <Stack spacing={2.25}>
              <FormControl>
                <InputLabel id="export-format-label">格式</InputLabel>
                <Select labelId="export-format-label" label="格式" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
                  <MenuItem value="json">Bitwarden JSON（明文）</MenuItem>
                  <MenuItem value="csv">Bitwarden CSV（明文）</MenuItem>
                  <MenuItem value="account">账号密钥加密 JSON</MenuItem>
                  <MenuItem value="password">密码保护 JSON</MenuItem>
                  <MenuItem value="attachments">JSON + 附件 ZIP（明文归档）</MenuItem>
                </Select>
              </FormControl>
              {exportFormat === "password" ? <TextField label="导出密码" type="password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} /> : null}
              {exportFormat === "json" || exportFormat === "csv" || exportFormat === "attachments" ? <TextField label="主密码再认证" type="password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} /> : null}
              <Alert severity="info" icon={<VerifiedUserOutlined />}>明文格式会要求重新验证；CSV 单元格会防止公式执行。</Alert>
              <Button variant="contained" startIcon={<DownloadOutlined />} disabled={busy || snapshot.status !== "ready"} onClick={() => void runExport()}>生成导出</Button>
            </Stack>
          </SectionCard>
        </Box>
      </ToolPageShell>
    </RouteGuard>
  );
}

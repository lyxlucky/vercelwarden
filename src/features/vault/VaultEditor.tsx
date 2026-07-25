"use client";

import { useState } from "react";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApiClientError } from "@/lib/client/api/client";
import { useSession } from "@/lib/client/state/session-store";
import { fetchCipher, saveVaultItemDraft } from "@/features/vault/api";
import type { VaultFolderView, VaultItemView } from "@/features/vault/store";
import type { SupportedCipherType } from "@/lib/cipher-types";
import type { VaultItemDraft } from "@/features/vault/item-codecs";
import { CredentialEditors } from "@/features/vault/editors/CredentialEditors";
import { IdentityKeyEditors } from "@/features/vault/editors/IdentityKeyEditors";
import { DocumentEditors } from "@/features/vault/editors/DocumentEditors";
import { generateSshKeyPair } from "@/lib/client/crypto/ssh";
import { downloadEncryptedAttachment, removeAttachment, uploadEncryptedAttachment, type AttachmentTransferProgress } from "@/features/vault/attachments";

const TYPE_LABELS: Record<SupportedCipherType, string> = { 1: "登录", 2: "安全笔记", 3: "银行卡", 4: "身份", 5: "SSH 密钥", 6: "银行账户", 7: "驾驶证", 8: "护照" };
function emptyDraft(): VaultItemDraft { return { type: 1, name: "", notes: "", favorite: false, folderId: null, reprompt: 0, fields: [], passwordHistory: [], payload: { username: "", password: "", totp: "", uris: [] }, extensions: {} }; }
function cloneDraft(item: VaultItemView | null): VaultItemDraft { return item?.draft ? structuredClone(item.draft) : emptyDraft(); }

export function VaultEditor({ open, item, folders, onOpenChange, onSaved }: { open: boolean; item: VaultItemView | null; folders: VaultFolderView[]; onOpenChange(open: boolean): void; onSaved(item: VaultItemView): void }) {
  const session = useSession();
  const muiTheme = useTheme();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const [draft, setDraft] = useState<VaultItemDraft>(() => cloneDraft(item));
  const [revision, setRevision] = useState(item?.updatedAt);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmSshReplacement, setConfirmSshReplacement] = useState(false);
  const [attachments, setAttachments] = useState(item?.attachments ?? []);
  const [transfer, setTransfer] = useState<AttachmentTransferProgress | null>(null);
  const [failedUpload, setFailedUpload] = useState<File | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const save = async (force = false) => {
    if (!draft.name.trim()) { setSaveError("请输入项目名称。"); return; }
    setBusy(true); setSaveError(null);
    try { const saved = await saveVaultItemDraft({ ...draft, name: draft.name.trim() }, revision, force); onSaved(saved); onOpenChange(false); }
    catch (error) { if (error instanceof ApiClientError && error.status === 409) { setConflict(true); return; } setSaveError(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  };
  const reload = async () => { if (!item) return; setBusy(true); try { const latest = await fetchCipher(item.id); setDraft(cloneDraft(latest)); setRevision(latest.updatedAt); setConflict(false); } finally { setBusy(false); } };
  const generateSsh = async () => { const hasMaterial = Boolean(draft.payload.privateKey || draft.payload.publicKey); if (hasMaterial && !confirmSshReplacement) { setConfirmSshReplacement(true); return; } setBusy(true); try { const generated = await generateSshKeyPair(draft.name || "vercelwarden"); setDraft((current) => ({ ...current, payload: { ...current.payload, privateKey: generated.privateKey, publicKey: generated.publicKey, keyFingerprint: generated.fingerprint } })); setConfirmSshReplacement(false); } finally { setBusy(false); } };
  const moveField = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= draft.fields.length) return; const fields = [...draft.fields]; [fields[index], fields[target]] = [fields[target]!, fields[index]!]; setDraft({ ...draft, fields }); };
  const upload = async (file: File) => { if (!item) return; setBusy(true); setFailedUpload(null); setTransferError(null); try { const snapshot = await uploadEncryptedAttachment(item.id, file, setTransfer); setAttachments(snapshot.items.find((entry) => entry.id === item.id)?.attachments ?? []); } catch (error) { setFailedUpload(file); setTransferError(error instanceof Error ? error.message : "附件上传失败。"); } finally { setBusy(false); } };

  return (
    <>
      <Dialog open={open} onClose={busy ? undefined : () => onOpenChange(false)} fullScreen={fullScreen} maxWidth="md">
        {busy ? <LinearProgress aria-label="正在处理" /> : null}
        <DialogTitle>{item ? `编辑 ${item.name}` : "新建密码库项目"}</DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>敏感字段会在浏览器中加密后再发送到服务端。</DialogContentText>
          <Stack spacing={3}>
            {session.readOnly ? <Alert severity="warning">离线密码库为只读模式，恢复连接后才能保存更改。</Alert> : null}
            {saveError ? <Alert severity="error" onClose={() => setSaveError(null)}>{saveError}</Alert> : null}

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              <FormControl><InputLabel id="vault-type-label">类型</InputLabel><Select labelId="vault-type-label" label="类型" value={String(draft.type)} onChange={(event) => { const type = Number(event.target.value) as SupportedCipherType; setDraft({ ...draft, type, payload: type === 1 ? { uris: [] } : {} }); }}>{(Object.entries(TYPE_LABELS) as Array<[string, string]>).map(([type, label]) => <MenuItem key={type} value={type}>{label}</MenuItem>)}</Select></FormControl>
              <TextField autoFocus label="名称" required value={draft.name} error={Boolean(saveError && !draft.name.trim())} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <FormControl><InputLabel id="vault-folder-label">文件夹</InputLabel><Select labelId="vault-folder-label" label="文件夹" value={draft.folderId ?? ""} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || null })}><MenuItem value="">无文件夹</MenuItem>{folders.map((folder) => <MenuItem key={folder.id} value={folder.id}>{folder.name}</MenuItem>)}</Select></FormControl>
              <FormControl><InputLabel id="vault-reprompt-label">主密码二次确认</InputLabel><Select labelId="vault-reprompt-label" label="主密码二次确认" value={String(draft.reprompt)} onChange={(event) => setDraft({ ...draft, reprompt: Number(event.target.value) })}><MenuItem value="0">不要求</MenuItem><MenuItem value="1">查看敏感字段前确认</MenuItem></Select></FormControl>
              <FormControlLabel control={<Checkbox checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} />} label="收藏此项目" />
            </Box>

            <Paper component="section" variant="outlined" sx={{ p: 2 }}>
              <Typography component="h3" variant="h6" sx={{ mb: 2 }}>{TYPE_LABELS[draft.type]}字段</Typography>
              <CredentialEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} />
              <IdentityKeyEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} onGenerateSsh={() => void generateSsh()} />
              <DocumentEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} />
            </Paper>

            <Paper component="section" variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2 }}><Typography component="h3" variant="h6">自定义字段</Typography><Button size="small" startIcon={<AddOutlined />} onClick={() => setDraft({ ...draft, fields: [...draft.fields, { name: "", value: "", type: 0, linkedId: null }] })}>添加字段</Button></Stack>
              <Stack spacing={1.5}>{draft.fields.map((field, index) => (
                <Box key={index} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr auto auto auto", sm: "minmax(0, 1fr) minmax(0, 1fr) 130px auto auto auto" }, gap: 1, alignItems: "start" }}>
                  <TextField label={`字段名称 ${index + 1}`} value={field.name} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, name: event.target.value } : entry) })} />
                  <TextField sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }} label={`字段值 ${index + 1}`} type={field.type === 1 ? "password" : "text"} value={field.value} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, value: event.target.value } : entry) })} />
                  <FormControl sx={{ gridColumn: { xs: "1", sm: "auto" } }}><InputLabel id={`field-type-${index}`}>字段类型 {index + 1}</InputLabel><Select labelId={`field-type-${index}`} label={`字段类型 ${index + 1}`} value={String(field.type)} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, type: Number(event.target.value) } : entry) })}><MenuItem value="0">文本</MenuItem><MenuItem value="1">隐藏</MenuItem><MenuItem value="2">布尔</MenuItem></Select></FormControl>
                  <Tooltip title={`上移字段 ${index + 1}`}><span><IconButton aria-label={`上移字段 ${index + 1}`} disabled={index === 0} onClick={() => moveField(index, -1)}><ArrowUpwardOutlined /></IconButton></span></Tooltip>
                  <Tooltip title={`下移字段 ${index + 1}`}><span><IconButton aria-label={`下移字段 ${index + 1}`} disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)}><ArrowDownwardOutlined /></IconButton></span></Tooltip>
                  <Tooltip title={`删除字段 ${index + 1}`}><IconButton aria-label={`删除字段 ${index + 1}`} color="error" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, fieldIndex) => fieldIndex !== index) })}><DeleteOutlineOutlined /></IconButton></Tooltip>
                </Box>
              ))}</Stack>
            </Paper>

            <Paper component="section" variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2 }}><Typography component="h3" variant="h6">附件</Typography>{item ? <Button component="label" size="small" startIcon={<AttachFileOutlined />} disabled={busy}>添加附件<input type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></Button> : null}</Stack>
              {!item ? <Typography color="text.secondary">先保存项目，再添加加密附件。</Typography> : attachments.length === 0 ? <Typography color="text.secondary">尚未添加附件。</Typography> : <Stack spacing={1}>{attachments.map((attachment) => (
                <Paper variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", gap: 1 }} key={attachment.id}><Box sx={{ flex: 1, minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 650 }}>{attachment.fileName}</Typography><Typography variant="body2" color="text.secondary">{attachment.size.toLocaleString()} bytes</Typography></Box><Tooltip title={`下载 ${attachment.fileName}`}><span><IconButton aria-label={`下载 ${attachment.fileName}`} disabled={busy} onClick={() => void downloadEncryptedAttachment(item.id, attachment, setTransfer)}><DownloadOutlined /></IconButton></span></Tooltip><Tooltip title={`移除 ${attachment.fileName}`}><span><IconButton aria-label={`移除 ${attachment.fileName}`} color="error" disabled={busy} onClick={async () => { setBusy(true); try { const snapshot = await removeAttachment(item.id, attachment.id); setAttachments(snapshot.items.find((entry) => entry.id === item.id)?.attachments ?? []); } finally { setBusy(false); } }}><DeleteOutlineOutlined /></IconButton></span></Tooltip></Paper>
              ))}</Stack>}
              {transfer ? <Box role="status" sx={{ mt: 2 }}><LinearProgress variant="determinate" value={transfer.percent} /><Typography variant="caption">{transfer.phase} {transfer.percent}%</Typography></Box> : null}
              {transferError ? <Alert severity="error" sx={{ mt: 2 }}>{transferError}</Alert> : null}
              {failedUpload ? <Button sx={{ mt: 1 }} size="small" variant="contained" onClick={() => void upload(failedUpload)}>重试上传 {failedUpload.name}</Button> : null}
            </Paper>

            <TextField label="备注" multiline minRows={5} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => onOpenChange(false)} disabled={busy}>取消</Button><Button variant="contained" disabled={busy || session.readOnly || !draft.name.trim()} onClick={() => void save()}>{busy ? "保存中…" : "保存"}</Button></DialogActions>
      </Dialog>

      <ConfirmDialog open={confirmSshReplacement} title="替换未保存的 SSH 密钥？" description="重新生成会立即替换编辑器中尚未保存的私钥、公钥和指纹。" consequences="保存前仍可关闭编辑器来放弃本次更改。" confirmLabel="确认替换" tone="danger" busy={busy} onCancel={() => setConfirmSshReplacement(false)} onConfirm={generateSsh} />
      <Dialog open={conflict} onClose={() => setConflict(false)}><DialogTitle>项目已在其他位置更改</DialogTitle><DialogContent><Alert severity="warning">为防止静默覆盖，请重新加载最新版本，或明确确认覆盖。</Alert><Typography sx={{ mt: 2 }}>覆盖会以当前编辑器内容替换服务端最新版本。</Typography></DialogContent><DialogActions><Button disabled={busy} onClick={() => void reload()}>重新加载</Button><Button color="error" variant="contained" disabled={busy} onClick={() => void save(true)}>覆盖最新版本</Button></DialogActions></Dialog>
    </>
  );
}

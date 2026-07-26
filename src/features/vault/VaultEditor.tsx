"use client";

import { useState } from "react";
import {
  AddOutlined,
  ArrowDownwardOutlined,
  ArrowUpwardOutlined,
  AttachFileOutlined,
  CloseOutlined,
  DeleteOutlineOutlined,
  DownloadOutlined,
  InfoOutlined,
  NotesOutlined,
  TuneOutlined,
} from "@mui/icons-material";
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
import { alpha } from "@mui/material/styles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { downloadEncryptedAttachment, removeAttachment, uploadEncryptedAttachment, type AttachmentTransferProgress } from "@/features/vault/attachments";
import { fetchCipher, saveVaultItemDraft } from "@/features/vault/api";
import { CredentialEditors } from "@/features/vault/editors/CredentialEditors";
import { DocumentEditors } from "@/features/vault/editors/DocumentEditors";
import { IdentityKeyEditors } from "@/features/vault/editors/IdentityKeyEditors";
import type { VaultItemDraft } from "@/features/vault/item-codecs";
import type { VaultFolderView, VaultItemView } from "@/features/vault/store";
import { VaultItemAvatar, VaultSection } from "@/features/vault/VaultVisuals";
import type { SupportedCipherType } from "@/lib/cipher-types";
import { ApiClientError } from "@/lib/client/api/client";
import { generateSshKeyPair } from "@/lib/client/crypto/ssh";
import { useSession } from "@/lib/client/state/session-store";

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
    try {
      const saved = await saveVaultItemDraft({ ...draft, name: draft.name.trim() }, revision, force);
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) { setConflict(true); return; }
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally { setBusy(false); }
  };
  const reload = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const latest = await fetchCipher(item.id);
      setDraft(cloneDraft(latest));
      setRevision(latest.updatedAt);
      setConflict(false);
    } finally { setBusy(false); }
  };
  const generateSsh = async () => {
    const hasMaterial = Boolean(draft.payload.privateKey || draft.payload.publicKey);
    if (hasMaterial && !confirmSshReplacement) { setConfirmSshReplacement(true); return; }
    setBusy(true);
    try {
      const generated = await generateSshKeyPair(draft.name || "vercelwarden");
      setDraft((current) => ({ ...current, payload: { ...current.payload, privateKey: generated.privateKey, publicKey: generated.publicKey, keyFingerprint: generated.fingerprint } }));
      setConfirmSshReplacement(false);
    } finally { setBusy(false); }
  };
  const moveField = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.fields.length) return;
    const fields = [...draft.fields];
    [fields[index], fields[target]] = [fields[target]!, fields[index]!];
    setDraft({ ...draft, fields });
  };
  const upload = async (file: File) => {
    if (!item) return;
    setBusy(true); setFailedUpload(null); setTransferError(null);
    try {
      const snapshot = await uploadEncryptedAttachment(item.id, file, setTransfer);
      setAttachments(snapshot.items.find((entry) => entry.id === item.id)?.attachments ?? []);
    } catch (error) {
      setFailedUpload(file);
      setTransferError(error instanceof Error ? error.message : "附件上传失败。");
    } finally { setBusy(false); }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={busy ? undefined : () => onOpenChange(false)}
        fullScreen={fullScreen}
        maxWidth="lg"
        aria-labelledby="vault-editor-title"
        slotProps={{ paper: { sx: { height: { sm: "min(92dvh, 940px)" }, borderRadius: { xs: 0, sm: "6px" }, overflow: "hidden" } } }}
      >
        {busy ? <LinearProgress aria-label="正在处理" /> : null}
        <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
            <VaultItemAvatar type={draft.type} size={44} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography id="vault-editor-title" component="span" variant="h6" sx={{ display: "block", fontWeight: 750 }}>{item ? `编辑 ${item.name}` : "新建密码库项目"}</Typography>
              <Typography variant="body2" color="text.secondary">{TYPE_LABELS[draft.type]} · 本地加密后保存</Typography>
            </Box>
            <Tooltip title="关闭编辑器"><span><IconButton aria-label="关闭编辑器" disabled={busy} onClick={() => onOpenChange(false)}><CloseOutlined /></IconButton></span></Tooltip>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ p: { xs: 2, sm: 3 }, bgcolor: "background.default" }}>
          <Stack spacing={2.5}>
            {session.readOnly ? <Alert severity="warning">离线密码库为只读模式，恢复连接后才能保存更改。</Alert> : null}
            {saveError ? <Alert severity="error" onClose={() => setSaveError(null)}>{saveError}</Alert> : null}

            <VaultSection title="基本信息" description="定义项目类型、归属和安全策略" action={<InfoOutlined color="action" />}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
                <FormControl><InputLabel id="vault-type-label">类型</InputLabel><Select labelId="vault-type-label" label="类型" value={String(draft.type)} onChange={(event) => { const type = Number(event.target.value) as SupportedCipherType; setDraft({ ...draft, type, payload: type === 1 ? { uris: [] } : {} }); }}>{(Object.entries(TYPE_LABELS) as Array<[string, string]>).map(([type, label]) => <MenuItem key={type} value={type}>{label}</MenuItem>)}</Select></FormControl>
                <TextField autoFocus label="名称" required value={draft.name} error={Boolean(saveError && !draft.name.trim())} helperText={saveError && !draft.name.trim() ? "名称不能为空" : " "} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                <FormControl><InputLabel id="vault-folder-label">文件夹</InputLabel><Select labelId="vault-folder-label" label="文件夹" value={draft.folderId ?? ""} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || null })}><MenuItem value="">无文件夹</MenuItem>{folders.map((folder) => <MenuItem key={folder.id} value={folder.id}>{folder.name}</MenuItem>)}</Select></FormControl>
                <FormControl><InputLabel id="vault-reprompt-label">主密码二次确认</InputLabel><Select labelId="vault-reprompt-label" label="主密码二次确认" value={String(draft.reprompt)} onChange={(event) => setDraft({ ...draft, reprompt: Number(event.target.value) })}><MenuItem value="0">不要求</MenuItem><MenuItem value="1">查看敏感字段前确认</MenuItem></Select></FormControl>
                <FormControlLabel sx={{ gridColumn: { sm: "1 / -1" }, m: 0 }} control={<Checkbox checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} />} label="收藏此项目" />
              </Box>
            </VaultSection>

            <VaultSection title={`${TYPE_LABELS[draft.type]}字段`} description="填写此类型的结构化信息" action={<TuneOutlined color="action" />}>
              <CredentialEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} />
              <IdentityKeyEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} onGenerateSsh={() => void generateSsh()} />
              <DocumentEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} />
            </VaultSection>

            <VaultSection
              title="自定义字段"
              description="补充密码库类型未覆盖的信息"
              action={<Button size="small" startIcon={<AddOutlined />} onClick={() => setDraft({ ...draft, fields: [...draft.fields, { name: "", value: "", type: 0, linkedId: null }] })}>添加字段</Button>}
            >
              {draft.fields.length === 0 ? <Typography color="text.secondary" variant="body2">尚未添加自定义字段。</Typography> : (
                <Stack spacing={1.5}>{draft.fields.map((field, index) => (
                  <Paper key={index} variant="outlined" sx={{ p: 1.5, borderRadius: 0 }}>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
                      <Typography variant="subtitle2">字段 {index + 1}</Typography>
                      <Stack direction="row">
                        <Tooltip title={`上移字段 ${index + 1}`}><span><IconButton size="small" aria-label={`上移字段 ${index + 1}`} disabled={index === 0} onClick={() => moveField(index, -1)}><ArrowUpwardOutlined /></IconButton></span></Tooltip>
                        <Tooltip title={`下移字段 ${index + 1}`}><span><IconButton size="small" aria-label={`下移字段 ${index + 1}`} disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)}><ArrowDownwardOutlined /></IconButton></span></Tooltip>
                        <Tooltip title={`删除字段 ${index + 1}`}><IconButton size="small" aria-label={`删除字段 ${index + 1}`} color="error" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, fieldIndex) => fieldIndex !== index) })}><DeleteOutlineOutlined /></IconButton></Tooltip>
                      </Stack>
                    </Stack>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) minmax(0, 1fr) 160px" }, gap: 1.5 }}>
                      <TextField label={`字段名称 ${index + 1}`} value={field.name} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, name: event.target.value } : entry) })} />
                      <TextField label={`字段值 ${index + 1}`} type={field.type === 1 ? "password" : "text"} value={field.value} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, value: event.target.value } : entry) })} />
                      <FormControl><InputLabel id={`field-type-${index}`}>字段类型 {index + 1}</InputLabel><Select labelId={`field-type-${index}`} label={`字段类型 ${index + 1}`} value={String(field.type)} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, type: Number(event.target.value) } : entry) })}><MenuItem value="0">文本</MenuItem><MenuItem value="1">隐藏</MenuItem><MenuItem value="2">布尔</MenuItem></Select></FormControl>
                    </Box>
                  </Paper>
                ))}</Stack>
              )}
            </VaultSection>

            <VaultSection
              title="附件"
              description="附件在浏览器内加密后上传"
              action={item ? <Button component="label" size="small" startIcon={<AttachFileOutlined />} disabled={busy}>添加附件<input type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></Button> : undefined}
            >
              {!item ? <Typography color="text.secondary" variant="body2">先保存项目，再添加加密附件。</Typography> : attachments.length === 0 ? <Typography color="text.secondary" variant="body2">尚未添加附件。</Typography> : (
                <Stack spacing={1}>{attachments.map((attachment) => (
                  <Paper variant="outlined" sx={{ p: 1.25, display: "flex", alignItems: "center", gap: 1, borderRadius: 0 }} key={attachment.id}>
                    <Box sx={{ flex: 1, minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 650 }}>{attachment.fileName}</Typography><Typography variant="body2" color="text.secondary">{attachment.size.toLocaleString()} bytes</Typography></Box>
                    <Tooltip title={`下载 ${attachment.fileName}`}><span><IconButton aria-label={`下载 ${attachment.fileName}`} disabled={busy} onClick={() => void downloadEncryptedAttachment(item.id, attachment, setTransfer)}><DownloadOutlined /></IconButton></span></Tooltip>
                    <Tooltip title={`移除 ${attachment.fileName}`}><span><IconButton aria-label={`移除 ${attachment.fileName}`} color="error" disabled={busy} onClick={async () => { setBusy(true); try { const snapshot = await removeAttachment(item.id, attachment.id); setAttachments(snapshot.items.find((entry) => entry.id === item.id)?.attachments ?? []); } finally { setBusy(false); } }}><DeleteOutlineOutlined /></IconButton></span></Tooltip>
                  </Paper>
                ))}</Stack>
              )}
              {transfer ? <Box role="status" sx={{ mt: 2 }}><LinearProgress variant="determinate" value={transfer.percent} /><Typography variant="caption">{transfer.phase} {transfer.percent}%</Typography></Box> : null}
              {transferError ? <Alert severity="error" sx={{ mt: 2 }}>{transferError}</Alert> : null}
              {failedUpload ? <Button sx={{ mt: 1 }} size="small" variant="contained" onClick={() => void upload(failedUpload)}>重试上传 {failedUpload.name}</Button> : null}
            </VaultSection>

            <VaultSection title="备注" description="记录补充说明或安全提示" action={<NotesOutlined color="action" />}>
              <TextField label="备注" multiline minRows={5} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </VaultSection>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: 1, borderColor: "divider", bgcolor: (theme) => alpha(theme.palette.background.paper, 0.96) }}>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button variant="contained" disabled={busy || session.readOnly || !draft.name.trim()} onClick={() => void save()}>{busy ? "保存中…" : "保存"}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={confirmSshReplacement} title="替换未保存的 SSH 密钥？" description="重新生成会立即替换编辑器中尚未保存的私钥、公钥和指纹。" consequences="保存前仍可关闭编辑器来放弃本次更改。" confirmLabel="确认替换" tone="danger" busy={busy} onCancel={() => setConfirmSshReplacement(false)} onConfirm={generateSsh} />
      <Dialog open={conflict} onClose={() => setConflict(false)}><DialogTitle>项目已在其他位置更改</DialogTitle><DialogContent><Alert severity="warning">为防止静默覆盖，请重新加载最新版本，或明确确认覆盖。</Alert><DialogContentText sx={{ mt: 2 }}>覆盖会以当前编辑器内容替换服务端最新版本。</DialogContentText></DialogContent><DialogActions><Button disabled={busy} onClick={() => void reload()}>重新加载</Button><Button color="error" variant="contained" disabled={busy} onClick={() => void save(true)}>覆盖最新版本</Button></DialogActions></Dialog>
    </>
  );
}

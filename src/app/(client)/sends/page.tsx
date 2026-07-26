"use client";

import { useEffect, useMemo, useState } from "react";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import {
  Box,
  Alert,
  Button,
  Card,
  CardContent,
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
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToolPageShell } from "@/components/ui/ToolPageShell";
import {
  createFileSend,
  createTextSend,
  deleteSends,
  listSends,
  updateSend,
  type SendTransferProgress,
  type SendView,
} from "@/features/sends/api";

export default function SendsPage() {
  const [items, setItems] = useState<SendView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SendView | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [type, setType] = useState<"text" | "file">("text");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [maxAccessCount, setMaxAccessCount] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [hideEmail, setHideEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [progress, setProgress] = useState<SendTransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const selectedItems = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected]);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await listSends());
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void listSends().then((next) => { if (active) setItems(next); }).catch((next) => { if (active) setError(next instanceof Error ? next.message : "无法加载 Send。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const reset = () => {
    setEditing(null);
    setType("text");
    setName("");
    setNotes("");
    setText("");
    setFile(null);
    setPassword("");
    setMaxAccessCount("");
    setDisabled(false);
    setHideEmail(false);
    setProgress(null);
    setFormError(null);
  };

  const edit = (item: SendView) => {
    setEditing(item);
    setType(item.type === 0 ? "text" : "file");
    setName(item.name);
    setNotes(item.notes);
    setMaxAccessCount(item.maxAccessCount == null ? "" : String(item.maxAccessCount));
    setDisabled(item.disabled);
    setHideEmail(item.hideEmail);
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setFormError(null);
    setPartial(null);
    try {
      if (editing) {
        await updateSend(editing.id, { name, notes, maxAccessCount: maxAccessCount ? Number(maxAccessCount) : null, disabled, hideEmail });
        await refresh();
      } else {
        const deletionDate = new Date(Date.now() + 7 * 86400_000).toISOString();
        const input = { name, notes, password, maxAccessCount: maxAccessCount ? Number(maxAccessCount) : null, deletionDate, disabled, hideEmail };
        const created = type === "text" ? await createTextSend({ ...input, text }) : await createFileSend({ ...input, file: file! }, setProgress);
        setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      }
      setOpen(false);
      reset();
    } catch (nextError) {
      setFormError(nextError instanceof Error ? nextError.message : "Send 操作失败。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    setPartial(null);
    try {
      const result = await deleteSends(ids);
      const deleted = new Set(result.outcomes.filter((outcome) => outcome.status === "deleted" || outcome.status === "partial").map((outcome) => outcome.id));
      setItems((current) => current.filter((item) => !deleted.has(item.id)));
      setSelected(new Set());
      if (result.failed) setPartial(`${result.failed} 个 Send 未能完全删除，可以稍后重试。`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "删除失败。");
    } finally {
      setBusy(false);
      setDeleteIds([]);
    }
  };

  const copyLink = async (item: SendView) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(item.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("浏览器拒绝了剪贴板权限，请手动复制分享链接。");
    }
  };

  const valid = Boolean(name.trim()) && (Boolean(editing) || (type === "text" ? Boolean(text) : Boolean(file)));
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  };
  const progressLabel: Record<SendTransferProgress["phase"], string> = {
    encrypting: "正在加密",
    uploading: "正在上传",
    downloading: "正在下载",
    decrypting: "正在解密",
    complete: "已完成",
  };
  return (
    <RouteGuard>
      <ToolPageShell
        title="Send"
        description="创建端到端加密的文本或文件分享，并限制密码、次数和有效期。"
        actions={(
          <>
            {selectedItems.length > 0 ? <Button color="error" startIcon={<DeleteOutlineOutlined />} disabled={busy} onClick={() => setDeleteIds(selectedItems.map((item) => item.id))}>删除所选（{selectedItems.length}）</Button> : null}
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => { reset(); setOpen(true); }}>新建 Send</Button>
          </>
        )}
        feedback={error ? <AsyncState kind="fatal" title="Send 操作失败" description={error} actionLabel="重新加载" onAction={() => void refresh()} /> : partial ? <AsyncState kind="partial" description={partial} /> : undefined}
      >
        {loading ? <AsyncState kind="loading" description="正在加载安全分享。" /> : null}
        {!loading && items.length === 0 ? <AsyncState kind="empty" title="暂无 Send" description="创建一个端到端加密的文本或文件分享。" actionLabel="新建 Send" onAction={() => setOpen(true)} /> : null}
        <Stack spacing={1.5}>
          {items.map((item) => (
            <Card component="article" variant="outlined" key={item.id}>
              <CardContent sx={{ display: "grid", gridTemplateColumns: { xs: "auto 1fr", sm: "auto 1fr auto" }, gap: 1.5, alignItems: "center" }}>
                <Checkbox aria-label={`选择 ${item.name}`} checked={selected.has(item.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    {item.type === 1 ? <DescriptionOutlined color="action" fontSize="small" /> : <SendOutlined color="action" fontSize="small" />}
                    <Typography component="h2" variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>{item.name}</Typography>
                  </Stack>
                  <Typography color="text.secondary" variant="body2">
                    {item.file?.fileName ?? "文本"} · 访问 {item.accessCount}{item.maxAccessCount == null ? "" : ` / ${item.maxAccessCount}`} · {item.disabled ? "已停用" : `删除 ${new Date(item.deletionDate).toLocaleString("zh-CN")}`}
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ gridColumn: { xs: "1 / -1", sm: "auto" }, justifyContent: { xs: "flex-end", sm: "initial" } }}>
                  <Tooltip title="复制分享链接"><IconButton aria-label="复制分享链接" onClick={() => void copyLink(item)}>{copied === item.id ? <CheckOutlined color="success" /> : <ContentCopyOutlined />}</IconButton></Tooltip>
                  <Tooltip title={`编辑 ${item.name}`}><IconButton aria-label={`编辑 ${item.name}`} onClick={() => edit(item)}><EditOutlined /></IconButton></Tooltip>
                  <Tooltip title={`删除 ${item.name}`}><IconButton aria-label={`删除 ${item.name}`} color="error" onClick={() => setDeleteIds([item.id])}><DeleteOutlineOutlined /></IconButton></Tooltip>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        <Dialog open={open} onClose={() => { if (!busy) { setOpen(false); reset(); } }} aria-labelledby="send-dialog-title" fullWidth maxWidth="sm">
          {busy ? <LinearProgress aria-label="正在处理 Send" /> : null}
          <DialogTitle id="send-dialog-title">{editing ? "编辑 Send" : "新建 Send"}</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>内容和文件会在浏览器中加密；URL 片段携带解密密钥。</DialogContentText>
            <Stack spacing={2.25}>
              {!editing ? (
                <FormControl>
                  <InputLabel id="send-type-label">类型</InputLabel>
                  <Select labelId="send-type-label" label="类型" value={type} onChange={(event) => {
                    const nextType = event.target.value as "text" | "file";
                    setType(nextType);
                    setFile(null);
                    setText("");
                    setProgress(null);
                    setFormError(null);
                  }}>
                    <MenuItem value="text">文本</MenuItem>
                    <MenuItem value="file">文件</MenuItem>
                  </Select>
                </FormControl>
              ) : null}
              <TextField label="名称" value={name} onChange={(event) => setName(event.target.value)} />
              <TextField label="备注" value={notes} onChange={(event) => setNotes(event.target.value)} />
              {!editing ? <TextField label="访问密码（可选）" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /> : null}
              <TextField label="最大访问次数（可选）" type="number" slotProps={{ htmlInput: { min: 1 } }} value={maxAccessCount} onChange={(event) => setMaxAccessCount(event.target.value)} />
              {!editing && type === "text" ? <TextField label="分享文本" multiline minRows={5} value={text} onChange={(event) => setText(event.target.value)} /> : null}
              {!editing && type === "file" ? (
                <Box>
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<AttachFileOutlined />}
                    sx={{ minHeight: 44, cursor: "pointer" }}
                  >
                    {file ? "更换文件" : "选择文件"}
                    <input
                      hidden
                      type="file"
                      aria-label="选择分享文件"
                      onClick={(event) => { event.currentTarget.value = ""; }}
                      onChange={(event) => {
                        setFile(event.currentTarget.files?.[0] ?? null);
                        setProgress(null);
                        setFormError(null);
                      }}
                    />
                  </Button>
                  <Typography id="send-file-summary" variant="body2" color="text.secondary" sx={{ mt: 1 }} aria-live="polite">
                    {file ? <><Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{file.name}</Box> · {formatFileSize(file.size)}</> : "请选择不超过 100 MB 的文件。文件会先在浏览器中加密。"}
                  </Typography>
                </Box>
              ) : null}
              <FormControlLabel control={<Checkbox checked={disabled} onChange={(event) => setDisabled(event.target.checked)} />} label="暂停访问" />
              <FormControlLabel control={<Checkbox checked={hideEmail} onChange={(event) => setHideEmail(event.target.checked)} />} label="隐藏创建者邮箱" />
              {formError ? <Alert severity="error" role="alert">{formError}</Alert> : null}
              {progress ? <Box aria-live="polite"><Typography variant="body2">{progressLabel[progress.phase]}：{progress.percent}%</Typography><LinearProgress variant="determinate" value={progress.percent} /></Box> : null}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setOpen(false); reset(); }} disabled={busy}>取消</Button>
            <Button variant="contained" disabled={busy || !valid} onClick={() => void submit()}>{editing ? "保存" : "创建"}</Button>
          </DialogActions>
        </Dialog>

        <ConfirmDialog
          open={deleteIds.length > 0}
          title="删除 Send"
          description={`确定删除 ${deleteIds.length} 个 Send？`}
          target={deleteIds.length === 1 ? items.find((item) => item.id === deleteIds[0])?.name : `${deleteIds.length} 个已选 Send`}
          consequences="公开链接将立即失效，且此操作无法撤销。"
          confirmLabel="确认删除"
          tone="danger"
          busy={busy}
          onCancel={() => setDeleteIds([])}
          onConfirm={() => remove(deleteIds)}
        />
      </ToolPageShell>
    </RouteGuard>
  );
}

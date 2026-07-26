"use client";

import { useState } from "react";
import {
  AddOutlined,
  DeleteOutlineOutlined,
  DriveFileMoveOutlined,
  EditOutlined,
  FolderOutlined,
  SyncProblemOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { VaultFolderView } from "@/features/vault/store";

export function FolderManagerDialog({ open, folders, onOpenChange, onCreate, onRename, onDelete }: {
  open: boolean;
  folders: VaultFolderView[];
  onOpenChange(open: boolean): void;
  onCreate(name: string): Promise<void>;
  onRename(id: string, name: string): Promise<void>;
  onDelete(id: string): Promise<void>;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<VaultFolderView | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VaultFolderView | null>(null);
  const [busy, setBusy] = useState(false);
  const handleOpenChange = (next: boolean) => { if (!next) { setName(""); setEditing(null); setPendingDelete(null); } onOpenChange(next); };
  const submit = async () => {
    const nextName = name.trim();
    if (!nextName) return;
    setBusy(true);
    try {
      if (editing) await onRename(editing.id, nextName); else await onCreate(nextName);
      setName(""); setEditing(null);
    } finally { setBusy(false); }
  };

  return (
    <>
      <Dialog open={open} onClose={() => handleOpenChange(false)} maxWidth="sm">
        <DialogTitle>管理文件夹</DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2.5 }}>文件夹只用于整理项目。删除文件夹不会删除其中的密码库内容。</DialogContentText>
          <Box sx={{ p: 2, borderRadius: 2, borderLeft: 3, borderColor: "primary.main", bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.12 : 0.06), mb: 2.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1, alignItems: "flex-start" }}>
              <TextField autoFocus label={editing ? "新文件夹名称" : "文件夹名称"} value={name} placeholder={editing ? "输入新名称" : "新建文件夹"} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} />
              <Button variant="contained" startIcon={editing ? <EditOutlined /> : <AddOutlined />} disabled={!name.trim() || busy} onClick={() => void submit()} sx={{ flexShrink: 0 }}>{editing ? "保存" : "新建"}</Button>
            </Stack>
            {editing ? <Button size="small" sx={{ mt: 1 }} onClick={() => { setEditing(null); setName(""); }}>取消重命名</Button> : null}
          </Box>

          {folders.length === 0 ? (
            <Stack sx={{ py: 4, alignItems: "center", color: "text.secondary" }}><FolderOutlined sx={{ fontSize: 40, mb: 1 }} /><Typography>暂无文件夹</Typography></Stack>
          ) : (
            <List disablePadding>{folders.map((folder) => (
              <ListItem
                key={folder.id}
                secondaryAction={(
                  <Stack direction="row">
                    <Tooltip title={`重命名 ${folder.name}`}><IconButton aria-label={`重命名 ${folder.name}`} onClick={() => { setEditing(folder); setName(folder.name); }}><EditOutlined /></IconButton></Tooltip>
                    <Tooltip title={`删除 ${folder.name}`}><IconButton aria-label={`删除 ${folder.name}`} color="error" onClick={() => setPendingDelete(folder)}><DeleteOutlineOutlined /></IconButton></Tooltip>
                  </Stack>
                )}
                sx={{ mb: 0.75, border: 1, borderColor: "divider", borderRadius: 2 }}
              >
                <ListItemAvatar><Avatar variant="rounded" sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), color: "primary.main" }}><FolderOutlined /></Avatar></ListItemAvatar>
                <ListItemText primary={folder.name} secondary="密码库文件夹" />
              </ListItem>
            ))}</List>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => handleOpenChange(false)}>完成</Button></DialogActions>
      </Dialog>
      <ConfirmDialog open={Boolean(pendingDelete)} title="删除文件夹" description={`“${pendingDelete?.name ?? ""}”中的项目将转为无文件夹状态。项目本身不会被删除。`} consequences="此操作无法撤销文件夹本身，但不会影响任何项目内容。" target={pendingDelete?.name} confirmLabel="删除文件夹" tone="danger" busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={async () => { if (!pendingDelete) return; setBusy(true); try { await onDelete(pendingDelete.id); setPendingDelete(null); } finally { setBusy(false); } }} />
    </>
  );
}

export function MoveItemsDialog({ open, count, folders, onOpenChange, onMove }: { open: boolean; count: number; folders: VaultFolderView[]; onOpenChange(open: boolean): void; onMove(folderId: string | null): Promise<void> }) {
  const [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogTitle>移动项目</DialogTitle>
      <DialogContent>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, mb: 2.5 }}>
          <Avatar variant="rounded" sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), color: "primary.main" }}><DriveFileMoveOutlined /></Avatar>
          <DialogContentText>将 {count} 个项目移动到所选文件夹。</DialogContentText>
        </Stack>
        <FormControl><InputLabel id="move-folder-label">目标文件夹</InputLabel><Select labelId="move-folder-label" label="目标文件夹" value={folderId} onChange={(event) => setFolderId(event.target.value)}><MenuItem value="">无文件夹</MenuItem>{folders.map((folder) => <MenuItem key={folder.id} value={folder.id}>{folder.name}</MenuItem>)}</Select></FormControl>
      </DialogContent>
      <DialogActions><Button onClick={() => onOpenChange(false)}>取消</Button><Button variant="contained" disabled={busy} onClick={async () => { setBusy(true); try { await onMove(folderId || null); onOpenChange(false); } finally { setBusy(false); } }}>移动</Button></DialogActions>
    </Dialog>
  );
}

export function ConfirmItemsDialog({ open, title, description, target, consequences, confirmLabel, danger = false, onOpenChange, onConfirm }: { open: boolean; title: string; description: string; target?: string; consequences?: string; confirmLabel: string; danger?: boolean; onOpenChange(open: boolean): void; onConfirm(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <ConfirmDialog open={open} title={title} description={description} target={target ?? "当前选择"} consequences={consequences ?? "请确认所选范围正确后继续。"} confirmLabel={confirmLabel} tone={danger ? "danger" : "warning"} busy={busy} onCancel={() => onOpenChange(false)} onConfirm={async () => { setBusy(true); try { await onConfirm(); onOpenChange(false); } finally { setBusy(false); } }} />;
}

export function ConflictDialog({ open, onOpenChange, onReload }: { open: boolean; onOpenChange(open: boolean): void; onReload(): Promise<void> }) {
  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogTitle>项目已在其他位置更改</DialogTitle>
      <DialogContent>
        <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5, mb: 2 }}><SyncProblemOutlined color="warning" sx={{ mt: 0.25 }} /><Typography>检测到同步冲突，本次操作没有覆盖其他位置的更新。</Typography></Stack>
        <Alert severity="warning">刷新后请复核最新内容，再重新执行操作。</Alert>
      </DialogContent>
      <DialogActions><Button onClick={() => onOpenChange(false)}>关闭</Button><Button variant="contained" onClick={async () => { await onReload(); onOpenChange(false); }}>重新加载最新版本</Button></DialogActions>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { Button, Dialog, IconButton, Input } from "@/components/primitives";
import type { VaultFolderView } from "@/features/vault/store";

export function FolderManagerDialog({
  open,
  folders,
  onOpenChange,
  onCreate,
  onRename,
  onDelete,
}: {
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

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
      setEditing(null);
      setPendingDelete(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (editing) await onRename(editing.id, value);
      else await onCreate(value);
      setName("");
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title="管理文件夹"
        description="删除文件夹只会解除项目归属，不会删除任何密码库项目。"
        footer={<Button onClick={() => handleOpenChange(false)}>完成</Button>}
      >
        <div className="vault-dialog-form">
          <Input aria-label={editing ? "新文件夹名称" : "文件夹名称"} value={name} placeholder={editing ? "输入新名称" : "新建文件夹"} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} />
          <Button icon={editing ? Pencil : FolderPlus} variant="primary" disabled={!name.trim() || busy} onClick={() => void submit()}>{editing ? "保存" : "新建"}</Button>
        </div>
        <div className="vault-folder-list">
          {folders.length === 0 ? <p>暂无文件夹</p> : folders.map((folder) => (
            <div key={folder.id}>
              <span>{folder.name}</span>
              <div>
                <IconButton icon={Pencil} label={`重命名 ${folder.name}`} size="sm" onClick={() => { setEditing(folder); setName(folder.name); }} />
                <IconButton icon={Trash2} label={`删除 ${folder.name}`} size="sm" onClick={() => setPendingDelete(folder)} />
              </div>
            </div>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => { if (!next) setPendingDelete(null); }}
        title="删除文件夹"
        description={`“${pendingDelete?.name ?? ""}”中的项目将转为无文件夹状态。项目本身不会被删除。`}
        footer={(
          <>
            <Button onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="danger" disabled={busy} onClick={async () => {
              if (!pendingDelete) return;
              setBusy(true);
              try { await onDelete(pendingDelete.id); setPendingDelete(null); }
              finally { setBusy(false); }
            }}>删除文件夹</Button>
          </>
        )}
      ><p className="vault-dialog-copy">此操作无法撤销文件夹本身，但不会影响任何项目内容。</p></Dialog>
    </>
  );
}

export function MoveItemsDialog({
  open,
  count,
  folders,
  onOpenChange,
  onMove,
}: {
  open: boolean;
  count: number;
  folders: VaultFolderView[];
  onOpenChange(open: boolean): void;
  onMove(folderId: string | null): Promise<void>;
}) {
  const [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="移动项目"
      description={`将 ${count} 个项目移动到所选文件夹。`}
      footer={(
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onMove(folderId || null); onOpenChange(false); }
            finally { setBusy(false); }
          }}>移动</Button>
        </>
      )}
    >
      <label className="vw-field"><span className="vw-field__label">目标文件夹</span>
        <select className="vw-input" value={folderId} onChange={(event) => setFolderId(event.target.value)}>
          <option value="">无文件夹</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </label>
    </Dialog>
  );
}

export function ConfirmItemsDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={(
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onConfirm(); onOpenChange(false); }
            finally { setBusy(false); }
          }}>{confirmLabel}</Button>
        </>
      )}
    ><p className="vault-dialog-copy">请确认所选范围正确后继续。</p></Dialog>
  );
}

export function ConflictDialog({ open, onOpenChange, onReload }: { open: boolean; onOpenChange(open: boolean): void; onReload(): Promise<void> }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="项目已在其他位置更改"
      description="为防止静默覆盖，本次操作没有修改冲突项目。"
      footer={<Button variant="primary" onClick={async () => { await onReload(); onOpenChange(false); }}>重新加载最新版本</Button>}
    ><p className="vault-dialog-copy">刷新后请复核最新内容，再重新执行操作。</p></Dialog>
  );
}

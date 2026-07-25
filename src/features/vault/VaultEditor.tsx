"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Download, Paperclip, Plus, Trash2 } from "lucide-react";
import { Button, Dialog, Field, IconButton, Input } from "@/components/primitives";
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
import {
  downloadEncryptedAttachment,
  removeAttachment,
  uploadEncryptedAttachment,
  type AttachmentTransferProgress,
} from "@/features/vault/attachments";

const TYPE_LABELS: Record<SupportedCipherType, string> = {
  1: "登录",
  2: "安全笔记",
  3: "银行卡",
  4: "身份",
  5: "SSH 密钥",
  6: "银行账户",
  7: "驾驶证",
  8: "护照",
};

function emptyDraft(): VaultItemDraft {
  return {
    type: 1,
    name: "",
    notes: "",
    favorite: false,
    folderId: null,
    reprompt: 0,
    fields: [],
    passwordHistory: [],
    payload: { username: "", password: "", totp: "", uris: [] },
    extensions: {},
  };
}

function cloneDraft(item: VaultItemView | null): VaultItemDraft {
  if (!item?.draft) return emptyDraft();
  return structuredClone(item.draft);
}

export function VaultEditor({
  open,
  item,
  folders,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  item: VaultItemView | null;
  folders: VaultFolderView[];
  onOpenChange(open: boolean): void;
  onSaved(item: VaultItemView): void;
}) {
  const session = useSession();
  const [draft, setDraft] = useState<VaultItemDraft>(() => cloneDraft(item));
  const [revision, setRevision] = useState(item?.updatedAt);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirmSshReplacement, setConfirmSshReplacement] = useState(false);
  const [attachments, setAttachments] = useState(item?.attachments ?? []);
  const [transfer, setTransfer] = useState<AttachmentTransferProgress | null>(null);
  const [failedUpload, setFailedUpload] = useState<File | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const save = async (force = false) => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const saved = await saveVaultItemDraft({ ...draft, name: draft.name.trim() }, revision, force);
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setConflict(true);
        return;
      }
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const latest = await fetchCipher(item.id);
      setDraft(cloneDraft(latest));
      setRevision(latest.updatedAt);
      setConflict(false);
    } finally {
      setBusy(false);
    }
  };

  const generateSsh = async () => {
    const hasMaterial = Boolean(draft.payload.privateKey || draft.payload.publicKey);
    if (hasMaterial && !confirmSshReplacement) {
      setConfirmSshReplacement(true);
      return;
    }
    setBusy(true);
    try {
      const generated = await generateSshKeyPair(draft.name || "vercelwarden");
      setDraft((current) => ({
        ...current,
        payload: {
          ...current.payload,
          privateKey: generated.privateKey,
          publicKey: generated.publicKey,
          keyFingerprint: generated.fingerprint,
        },
      }));
      setConfirmSshReplacement(false);
    } finally {
      setBusy(false);
    }
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
    setBusy(true);
    setFailedUpload(null);
    setTransferError(null);
    try {
      const snapshot = await uploadEncryptedAttachment(item.id, file, setTransfer);
      setAttachments(snapshot.items.find((entry) => entry.id === item.id)?.attachments ?? []);
    } catch (error) {
      setFailedUpload(file);
      setTransferError(error instanceof Error ? error.message : "附件上传失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={item ? `编辑 ${item.name}` : "新建密码库项目"}
        description="敏感字段会在浏览器中加密后再发送到服务端。"
        footer={(
          <>
            <Button onClick={() => onOpenChange(false)}>取消</Button>
            <Button variant="primary" disabled={busy || session.readOnly || !draft.name.trim()} onClick={() => void save()}>{busy ? "保存中…" : "保存"}</Button>
          </>
        )}
      >
        <div className="vault-editor">
          {session.readOnly ? <p className="vault-editor__hint" role="status">离线密码库为只读模式，恢复连接后才能保存更改。</p> : null}
          <div className="vault-editor__grid">
            <Field label="类型">
              <select className="vw-input" value={draft.type} onChange={(event) => {
                const type = Number(event.target.value) as SupportedCipherType;
                setDraft({ ...draft, type, payload: type === 1 ? { uris: [] } : {} });
              }}>
                {(Object.entries(TYPE_LABELS) as Array<[string, string]>).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </select>
            </Field>
            <Field label="名称"><Input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="文件夹">
              <select className="vw-input" value={draft.folderId ?? ""} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || null })}>
                <option value="">无文件夹</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </Field>
            <Field label="主密码二次确认">
              <select className="vw-input" value={draft.reprompt} onChange={(event) => setDraft({ ...draft, reprompt: Number(event.target.value) })}>
                <option value={0}>不要求</option><option value={1}>查看敏感字段前确认</option>
              </select>
            </Field>
            <label className="vault-editor__check"><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} /> 收藏此项目</label>
          </div>

          <section className="vault-editor__section"><h3>{TYPE_LABELS[draft.type]}字段</h3>
            <CredentialEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} />
            <IdentityKeyEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} onGenerateSsh={() => void generateSsh()} />
            <DocumentEditors draft={draft} onPayloadChange={(payload) => setDraft({ ...draft, payload })} />
          </section>

          <section className="vault-editor__section">
            <div className="vault-editor__collection-heading"><h3>自定义字段</h3><Button size="sm" icon={Plus} onClick={() => setDraft({ ...draft, fields: [...draft.fields, { name: "", value: "", type: 0, linkedId: null }] })}>添加字段</Button></div>
            {draft.fields.map((field, index) => (
              <div className="vault-editor__row vault-editor__row--field" key={index}>
                <Input aria-label={`字段名称 ${index + 1}`} placeholder="字段名称" value={field.name} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, name: event.target.value } : entry) })} />
                <Input aria-label={`字段值 ${index + 1}`} placeholder="字段值" type={field.type === 1 ? "password" : "text"} value={field.value} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, value: event.target.value } : entry) })} />
                <select className="vw-input" aria-label={`字段类型 ${index + 1}`} value={field.type} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((entry, fieldIndex) => fieldIndex === index ? { ...entry, type: Number(event.target.value) } : entry) })}><option value={0}>文本</option><option value={1}>隐藏</option><option value={2}>布尔</option></select>
                <IconButton icon={ArrowUp} label={`上移字段 ${index + 1}`} disabled={index === 0} onClick={() => moveField(index, -1)} />
                <IconButton icon={ArrowDown} label={`下移字段 ${index + 1}`} disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)} />
                <IconButton icon={Trash2} label={`删除字段 ${index + 1}`} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, fieldIndex) => fieldIndex !== index) })} />
              </div>
            ))}
          </section>

          <section className="vault-editor__section">
            <div className="vault-editor__collection-heading"><h3>附件</h3>{item ? <label className="vw-button vw-button--secondary vw-button--sm"><Paperclip size={16} />添加附件<input type="file" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label> : null}</div>
            {!item ? <p className="vault-editor__hint">先保存项目，再添加加密附件。</p> : attachments.length === 0 ? <p className="vault-editor__hint">尚未添加附件。</p> : attachments.map((attachment) => (
              <div className="vault-editor__attachment" key={attachment.id}>
                <div><strong>{attachment.fileName}</strong><span>{attachment.size.toLocaleString()} bytes</span></div>
                <IconButton icon={Download} label={`下载 ${attachment.fileName}`} disabled={busy} onClick={() => void downloadEncryptedAttachment(item.id, attachment, setTransfer)} />
                <IconButton icon={Trash2} label={`移除 ${attachment.fileName}`} disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const snapshot = await removeAttachment(item.id, attachment.id);
                    setAttachments(snapshot.items.find((entry) => entry.id === item.id)?.attachments ?? []);
                  } finally { setBusy(false); }
                }} />
              </div>
            ))}
            {transfer ? <div className="vault-editor__transfer" aria-live="polite"><progress max={100} value={transfer.percent} /><span>{transfer.phase} {transfer.percent}%</span></div> : null}
            {transferError ? <p className="vw-field__error" role="alert">{transferError}</p> : null}
            {failedUpload ? <Button size="sm" variant="primary" onClick={() => void upload(failedUpload)}>重试上传 {failedUpload.name}</Button> : null}
          </section>

          <section className="vault-editor__section"><Field label="备注"><textarea className="vw-input vault-editor__textarea vault-editor__textarea--tall" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field></section>
        </div>
      </Dialog>

      <Dialog
        open={confirmSshReplacement}
        onOpenChange={setConfirmSshReplacement}
        title="替换未保存的 SSH 密钥？"
        description="重新生成会立即替换编辑器中尚未保存的私钥、公钥和指纹。"
        footer={<><Button onClick={() => setConfirmSshReplacement(false)}>取消</Button><Button variant="danger" onClick={() => void generateSsh()}>确认替换</Button></>}
      ><p>保存前仍可关闭编辑器来放弃本次更改。</p></Dialog>

      <Dialog
        open={conflict}
        onOpenChange={setConflict}
        title="项目已在其他位置更改"
        description="为防止静默覆盖，请重新加载最新版本，或明确确认覆盖。"
        footer={<><Button disabled={busy} onClick={() => void reload()}>重新加载</Button><Button variant="danger" disabled={busy} onClick={() => void save(true)}>覆盖最新版本</Button></>}
      ><p>覆盖会以当前编辑器内容替换服务端最新版本。</p></Dialog>
    </>
  );
}

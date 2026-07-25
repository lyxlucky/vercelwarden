"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Field, IconButton, Input } from "@/components/primitives";
import type { VaultItemDraft } from "@/features/vault/item-codecs";
import { TotpCapture } from "@/features/vault/TotpCapture";

interface EditorProps {
  draft: VaultItemDraft;
  onPayloadChange(payload: Record<string, unknown>): void;
}

function value(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? payload[key] as string : "";
}

function PayloadInput({ label, field, payload, onChange, type = "text" }: {
  label: string;
  field: string;
  payload: Record<string, unknown>;
  onChange(payload: Record<string, unknown>): void;
  type?: string;
}) {
  return <Field label={label}><Input type={type} value={value(payload, field)} onChange={(event) => onChange({ ...payload, [field]: event.target.value })} /></Field>;
}

function LoginEditor({ draft, onPayloadChange }: EditorProps) {
  const payload = draft.payload;
  const uris = Array.isArray(payload.uris) ? payload.uris.map((entry) => {
    const uri = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return { ...uri, uri: value(uri, "uri"), match: typeof uri.match === "number" ? uri.match : null };
  }) : [];
  const updateUri = (index: number, patch: Record<string, unknown>) => onPayloadChange({
    ...payload,
    uris: uris.map((uri, uriIndex) => uriIndex === index ? { ...uri, ...patch } : uri),
  });
  return (
    <div className="vault-editor__grid">
      <PayloadInput label="用户名" field="username" payload={payload} onChange={onPayloadChange} />
      <PayloadInput label="密码" field="password" payload={payload} onChange={onPayloadChange} type="password" />
      <div className="vault-editor__wide"><TotpCapture value={value(payload, "totp")} onChange={(totp) => onPayloadChange({ ...payload, totp })} /></div>
      <label className="vw-field"><span className="vw-field__label">自动填充偏好</span>
        <select className="vw-input" value={payload.autofillOnPageLoad === false ? "off" : "default"} onChange={(event) => onPayloadChange({ ...payload, autofillOnPageLoad: event.target.value !== "off" })}>
          <option value="default">允许自动填充</option><option value="off">禁止自动填充</option>
        </select>
      </label>
      <div className="vault-editor__wide vault-editor__collection">
        <div className="vault-editor__collection-heading"><strong>网站地址</strong><Button size="sm" icon={Plus} onClick={() => onPayloadChange({ ...payload, uris: [...uris, { uri: "", match: null }] })}>添加地址</Button></div>
        {uris.length === 0 ? <p className="vault-editor__hint">尚未添加网站地址。</p> : uris.map((uri, index) => (
          <div className="vault-editor__row" key={index}>
            <Input aria-label={`网站地址 ${index + 1}`} value={uri.uri} onChange={(event) => updateUri(index, { uri: event.target.value })} />
            <select className="vw-input" aria-label={`匹配规则 ${index + 1}`} value={uri.match == null ? "" : String(uri.match)} onChange={(event) => updateUri(index, { match: event.target.value ? Number(event.target.value) : null })}>
              <option value="">默认匹配</option><option value="0">域名</option><option value="1">主机</option><option value="2">开头</option><option value="3">完全匹配</option><option value="4">正则</option><option value="5">永不匹配</option>
            </select>
            <IconButton icon={Trash2} label={`删除网站地址 ${index + 1}`} onClick={() => onPayloadChange({ ...payload, uris: uris.filter((_, uriIndex) => uriIndex !== index) })} />
          </div>
        ))}
      </div>
      <Field label="Passkey 元数据" hint="兼容保留 FIDO2/Passkey JSON。">
        <textarea className="vw-input vault-editor__textarea" value={JSON.stringify(payload.fido2Credentials ?? [], null, 2)} onChange={(event) => {
          try { onPayloadChange({ ...payload, fido2Credentials: JSON.parse(event.target.value) }); } catch { /* keep the last valid value */ }
        }} />
      </Field>
    </div>
  );
}

function SecureNoteEditor() {
  return <p className="vault-editor__hint">安全笔记内容保存在下方备注字段中。</p>;
}

function CardEditor({ draft, onPayloadChange }: EditorProps) {
  return (
    <div className="vault-editor__grid">
      <PayloadInput label="持卡人" field="cardholderName" payload={draft.payload} onChange={onPayloadChange} />
      <PayloadInput label="品牌" field="brand" payload={draft.payload} onChange={onPayloadChange} />
      <PayloadInput label="卡号" field="number" payload={draft.payload} onChange={onPayloadChange} />
      <PayloadInput label="安全码" field="code" payload={draft.payload} onChange={onPayloadChange} type="password" />
      <PayloadInput label="有效月份" field="expMonth" payload={draft.payload} onChange={onPayloadChange} />
      <PayloadInput label="有效年份" field="expYear" payload={draft.payload} onChange={onPayloadChange} />
    </div>
  );
}

export function CredentialEditors(props: EditorProps) {
  if (props.draft.type === 1) return <LoginEditor {...props} />;
  if (props.draft.type === 2) return <SecureNoteEditor />;
  if (props.draft.type === 3) return <CardEditor {...props} />;
  return null;
}

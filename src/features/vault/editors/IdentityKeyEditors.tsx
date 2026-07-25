"use client";

import { Button, Field, Input } from "@/components/primitives";
import type { VaultItemDraft } from "@/features/vault/item-codecs";

interface EditorProps {
  draft: VaultItemDraft;
  onPayloadChange(payload: Record<string, unknown>): void;
  onGenerateSsh?(): void;
}

function InputField({ label, name, draft, onPayloadChange, secret = false }: {
  label: string;
  name: string;
  draft: VaultItemDraft;
  onPayloadChange(payload: Record<string, unknown>): void;
  secret?: boolean;
}) {
  const value = typeof draft.payload[name] === "string" ? draft.payload[name] as string : "";
  return <Field label={label}><Input type={secret ? "password" : "text"} value={value} onChange={(event) => onPayloadChange({ ...draft.payload, [name]: event.target.value })} /></Field>;
}

function IdentityEditor(props: EditorProps) {
  return (
    <div className="vault-editor__grid">
      <InputField label="称谓" name="title" {...props} />
      <InputField label="名字" name="firstName" {...props} />
      <InputField label="中间名" name="middleName" {...props} />
      <InputField label="姓氏" name="lastName" {...props} />
      <InputField label="邮箱" name="email" {...props} />
      <InputField label="电话" name="phone" {...props} />
      <InputField label="地址" name="address1" {...props} />
      <InputField label="地址补充" name="address2" {...props} />
      <InputField label="城市" name="city" {...props} />
      <InputField label="省/州" name="state" {...props} />
      <InputField label="邮编" name="postalCode" {...props} />
      <InputField label="国家/地区" name="country" {...props} />
    </div>
  );
}

function SshEditor(props: EditorProps) {
  const update = (name: string, value: string) => props.onPayloadChange({ ...props.draft.payload, [name]: value });
  return (
    <div className="vault-editor__grid">
      <div className="vault-editor__wide vault-editor__collection-heading"><strong>SSH 密钥材料</strong><Button variant="primary" onClick={props.onGenerateSsh}>生成密钥</Button></div>
      <Field label="私钥"><textarea className="vw-input vault-editor__textarea vault-editor__textarea--tall" value={String(props.draft.payload.privateKey ?? "")} onChange={(event) => update("privateKey", event.target.value)} /></Field>
      <Field label="公钥"><textarea className="vw-input vault-editor__textarea" value={String(props.draft.payload.publicKey ?? "")} onChange={(event) => update("publicKey", event.target.value)} /></Field>
      <InputField label="指纹" name="keyFingerprint" {...props} />
    </div>
  );
}

export function IdentityKeyEditors(props: EditorProps) {
  if (props.draft.type === 4) return <IdentityEditor {...props} />;
  if (props.draft.type === 5) return <SshEditor {...props} />;
  return null;
}

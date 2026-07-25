"use client";

import { Field, Input } from "@/components/primitives";
import type { VaultItemDraft } from "@/features/vault/item-codecs";

interface EditorProps {
  draft: VaultItemDraft;
  onPayloadChange(payload: Record<string, unknown>): void;
}

function InputField({ label, name, draft, onPayloadChange, type = "text" }: {
  label: string;
  name: string;
  draft: VaultItemDraft;
  onPayloadChange(payload: Record<string, unknown>): void;
  type?: string;
}) {
  return <Field label={label}><Input type={type} value={String(draft.payload[name] ?? "")} onChange={(event) => onPayloadChange({ ...draft.payload, [name]: event.target.value })} /></Field>;
}

function BankAccountEditor(props: EditorProps) {
  return <div className="vault-editor__grid">
    <InputField label="银行" name="bankName" {...props} /><InputField label="账户名" name="accountHolderName" {...props} />
    <InputField label="账号" name="accountNumber" {...props} /><InputField label="账户类型" name="accountType" {...props} />
    <InputField label="路由号码" name="routingNumber" {...props} /><InputField label="SWIFT/BIC" name="swift" {...props} />
    <InputField label="IBAN" name="iban" {...props} />
  </div>;
}

function LicenceEditor(props: EditorProps) {
  return <div className="vault-editor__grid">
    <InputField label="驾驶证号码" name="licenseNumber" {...props} /><InputField label="签发国家/地区" name="issuingCountry" {...props} />
    <InputField label="名字" name="givenName" {...props} /><InputField label="姓氏" name="familyName" {...props} />
    <InputField label="出生日期" name="dateOfBirth" type="date" {...props} /><InputField label="到期日" name="expiryDate" type="date" {...props} />
  </div>;
}

function PassportEditor(props: EditorProps) {
  return <div className="vault-editor__grid">
    <InputField label="护照号码" name="passportNumber" {...props} /><InputField label="国籍" name="nationality" {...props} />
    <InputField label="名字" name="givenName" {...props} /><InputField label="姓氏" name="familyName" {...props} />
    <InputField label="签发国家/地区" name="issuingCountry" {...props} /><InputField label="出生日期" name="dateOfBirth" type="date" {...props} />
    <InputField label="到期日" name="expiryDate" type="date" {...props} />
  </div>;
}

export function DocumentEditors(props: EditorProps) {
  if (props.draft.type === 6) return <BankAccountEditor {...props} />;
  if (props.draft.type === 7) return <LicenceEditor {...props} />;
  if (props.draft.type === 8) return <PassportEditor {...props} />;
  return null;
}

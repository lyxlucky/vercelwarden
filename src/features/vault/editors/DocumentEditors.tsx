"use client";

import { Box, TextField } from "@mui/material";
import type { VaultItemDraft } from "@/features/vault/item-codecs";

interface EditorProps { draft: VaultItemDraft; onPayloadChange(payload: Record<string, unknown>): void }
const gridSx = { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 } as const;
function InputField({ label, name, draft, onPayloadChange, type = "text" }: { label: string; name: string; draft: VaultItemDraft; onPayloadChange(payload: Record<string, unknown>): void; type?: string }) {
  return <TextField label={label} type={type} value={String(draft.payload[name] ?? "")} slotProps={type === "date" ? { inputLabel: { shrink: true } } : undefined} onChange={(event) => onPayloadChange({ ...draft.payload, [name]: event.target.value })} />;
}
function BankAccountEditor(props: EditorProps) { return <Box sx={gridSx}><InputField label="银行" name="bankName" {...props} /><InputField label="账户名" name="accountHolderName" {...props} /><InputField label="账号" name="accountNumber" {...props} /><InputField label="账户类型" name="accountType" {...props} /><InputField label="路由号码" name="routingNumber" {...props} /><InputField label="SWIFT/BIC" name="swift" {...props} /><InputField label="IBAN" name="iban" {...props} /></Box>; }
function LicenceEditor(props: EditorProps) { return <Box sx={gridSx}><InputField label="驾驶证号码" name="licenseNumber" {...props} /><InputField label="签发国家/地区" name="issuingCountry" {...props} /><InputField label="名字" name="givenName" {...props} /><InputField label="姓氏" name="familyName" {...props} /><InputField label="出生日期" name="dateOfBirth" type="date" {...props} /><InputField label="到期日" name="expiryDate" type="date" {...props} /></Box>; }
function PassportEditor(props: EditorProps) { return <Box sx={gridSx}><InputField label="护照号码" name="passportNumber" {...props} /><InputField label="国籍" name="nationality" {...props} /><InputField label="名字" name="givenName" {...props} /><InputField label="姓氏" name="familyName" {...props} /><InputField label="签发国家/地区" name="issuingCountry" {...props} /><InputField label="出生日期" name="dateOfBirth" type="date" {...props} /><InputField label="到期日" name="expiryDate" type="date" {...props} /></Box>; }
export function DocumentEditors(props: EditorProps) { if (props.draft.type === 6) return <BankAccountEditor {...props} />; if (props.draft.type === 7) return <LicenceEditor {...props} />; if (props.draft.type === 8) return <PassportEditor {...props} />; return null; }

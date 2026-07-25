"use client";

import AutoFixHighOutlined from "@mui/icons-material/AutoFixHighOutlined";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import type { VaultItemDraft } from "@/features/vault/item-codecs";

interface EditorProps { draft: VaultItemDraft; onPayloadChange(payload: Record<string, unknown>): void; onGenerateSsh?(): void }
const gridSx = { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 } as const;
function InputField({ label, name, draft, onPayloadChange, secret = false }: { label: string; name: string; draft: VaultItemDraft; onPayloadChange(payload: Record<string, unknown>): void; secret?: boolean }) {
  return <TextField label={label} type={secret ? "password" : "text"} value={typeof draft.payload[name] === "string" ? draft.payload[name] as string : ""} onChange={(event) => onPayloadChange({ ...draft.payload, [name]: event.target.value })} />;
}
function IdentityEditor(props: EditorProps) { return <Box sx={gridSx}>{[["称谓","title"],["名字","firstName"],["中间名","middleName"],["姓氏","lastName"],["邮箱","email"],["电话","phone"],["地址","address1"],["地址补充","address2"],["城市","city"],["省/州","state"],["邮编","postalCode"],["国家/地区","country"]].map(([label,name]) => <InputField key={name} label={label!} name={name!} {...props} />)}</Box>; }
function SshEditor(props: EditorProps) {
  const update = (name: string, value: string) => props.onPayloadChange({ ...props.draft.payload, [name]: value });
  return <Box sx={gridSx}><Stack direction="row" sx={{ gridColumn: "1 / -1", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Typography component="h4" variant="subtitle1">SSH 密钥材料</Typography><Button variant="contained" startIcon={<AutoFixHighOutlined />} onClick={props.onGenerateSsh}>生成密钥</Button></Stack><TextField label="私钥" multiline minRows={6} value={String(props.draft.payload.privateKey ?? "")} onChange={(event) => update("privateKey", event.target.value)} /><TextField label="公钥" multiline minRows={3} value={String(props.draft.payload.publicKey ?? "")} onChange={(event) => update("publicKey", event.target.value)} /><InputField label="指纹" name="keyFingerprint" {...props} /></Box>;
}
export function IdentityKeyEditors(props: EditorProps) { if (props.draft.type === 4) return <IdentityEditor {...props} />; if (props.draft.type === 5) return <SshEditor {...props} />; return null; }

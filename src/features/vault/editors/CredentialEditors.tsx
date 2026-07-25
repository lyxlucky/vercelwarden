"use client";

import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import {
  Alert,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { VaultItemDraft } from "@/features/vault/item-codecs";
import { TotpCapture } from "@/features/vault/TotpCapture";

interface EditorProps { draft: VaultItemDraft; onPayloadChange(payload: Record<string, unknown>): void }
const gridSx = { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 } as const;

function value(payload: Record<string, unknown>, key: string) { return typeof payload[key] === "string" ? payload[key] as string : ""; }
function PayloadInput({ label, field, payload, onChange, type = "text" }: { label: string; field: string; payload: Record<string, unknown>; onChange(payload: Record<string, unknown>): void; type?: string }) {
  return <TextField label={label} type={type} value={value(payload, field)} onChange={(event) => onChange({ ...payload, [field]: event.target.value })} />;
}

function LoginEditor({ draft, onPayloadChange }: EditorProps) {
  const payload = draft.payload;
  const uris = Array.isArray(payload.uris) ? payload.uris.map((entry) => {
    const uri = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return { ...uri, uri: value(uri, "uri"), match: typeof uri.match === "number" ? uri.match : null };
  }) : [];
  const updateUri = (index: number, patch: Record<string, unknown>) => onPayloadChange({ ...payload, uris: uris.map((uri, uriIndex) => uriIndex === index ? { ...uri, ...patch } : uri) });
  return (
    <Box sx={gridSx}>
      <PayloadInput label="用户名" field="username" payload={payload} onChange={onPayloadChange} />
      <PayloadInput label="密码" field="password" payload={payload} onChange={onPayloadChange} type="password" />
      <Box sx={{ gridColumn: "1 / -1" }}><TotpCapture value={value(payload, "totp")} onChange={(totp) => onPayloadChange({ ...payload, totp })} /></Box>
      <FormControl>
        <InputLabel id="autofill-label">自动填充偏好</InputLabel>
        <Select labelId="autofill-label" label="自动填充偏好" value={payload.autofillOnPageLoad === false ? "off" : "default"} onChange={(event) => onPayloadChange({ ...payload, autofillOnPageLoad: event.target.value !== "off" })}>
          <MenuItem value="default">允许自动填充</MenuItem><MenuItem value="off">禁止自动填充</MenuItem>
        </Select>
      </FormControl>
      <Box sx={{ gridColumn: "1 / -1" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1 }}><Typography component="h4" variant="subtitle1">网站地址</Typography><Button size="small" startIcon={<AddOutlined />} onClick={() => onPayloadChange({ ...payload, uris: [...uris, { uri: "", match: null }] })}>添加地址</Button></Stack>
        {uris.length === 0 ? <Typography color="text.secondary" variant="body2">尚未添加网站地址。</Typography> : <Stack spacing={1}>{uris.map((uri, index) => (
          <Paper key={index} variant="outlined" sx={{ p: 1.25, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr) auto", sm: "minmax(0, 1fr) 180px auto" }, gap: 1, borderRadius: 2.5 }}>
            <TextField label={`网站地址 ${index + 1}`} value={uri.uri} onChange={(event) => updateUri(index, { uri: event.target.value })} />
            <FormControl sx={{ gridColumn: { xs: "1", sm: "auto" } }}><InputLabel id={`match-${index}`}>匹配规则 {index + 1}</InputLabel><Select labelId={`match-${index}`} label={`匹配规则 ${index + 1}`} value={uri.match == null ? "" : String(uri.match)} onChange={(event) => updateUri(index, { match: event.target.value ? Number(event.target.value) : null })}>
              <MenuItem value="">默认匹配</MenuItem><MenuItem value="0">域名</MenuItem><MenuItem value="1">主机</MenuItem><MenuItem value="2">开头</MenuItem><MenuItem value="3">完全匹配</MenuItem><MenuItem value="4">正则</MenuItem><MenuItem value="5">永不匹配</MenuItem>
            </Select></FormControl>
            <Tooltip title={`删除网站地址 ${index + 1}`}><IconButton aria-label={`删除网站地址 ${index + 1}`} color="error" onClick={() => onPayloadChange({ ...payload, uris: uris.filter((_, uriIndex) => uriIndex !== index) })}><DeleteOutlineOutlined /></IconButton></Tooltip>
          </Paper>
        ))}</Stack>}
      </Box>
      <TextField sx={{ gridColumn: "1 / -1" }} label="Passkey 元数据" helperText="兼容保留 FIDO2/Passkey JSON。" multiline minRows={3} value={JSON.stringify(payload.fido2Credentials ?? [], null, 2)} onChange={(event) => { try { onPayloadChange({ ...payload, fido2Credentials: JSON.parse(event.target.value) }); } catch { /* keep last valid value */ } }} />
    </Box>
  );
}

function CardEditor({ draft, onPayloadChange }: EditorProps) { return <Box sx={gridSx}><PayloadInput label="持卡人" field="cardholderName" payload={draft.payload} onChange={onPayloadChange} /><PayloadInput label="品牌" field="brand" payload={draft.payload} onChange={onPayloadChange} /><PayloadInput label="卡号" field="number" payload={draft.payload} onChange={onPayloadChange} /><PayloadInput label="安全码" field="code" payload={draft.payload} onChange={onPayloadChange} type="password" /><PayloadInput label="有效月份" field="expMonth" payload={draft.payload} onChange={onPayloadChange} /><PayloadInput label="有效年份" field="expYear" payload={draft.payload} onChange={onPayloadChange} /></Box>; }

export function CredentialEditors(props: EditorProps) {
  if (props.draft.type === 1) return <LoginEditor {...props} />;
  if (props.draft.type === 2) return <Alert severity="info">安全笔记内容保存在下方备注字段中。</Alert>;
  if (props.draft.type === 3) return <CardEditor {...props} />;
  return null;
}

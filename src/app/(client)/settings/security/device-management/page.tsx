"use client";

import { useCallback, useEffect, useState } from "react";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DevicesOutlined from "@mui/icons-material/DevicesOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import ShieldOffOutlined from "@mui/icons-material/ShieldOutlined";
import { Alert, Box, Button, Checkbox, List, ListItem, ListItemIcon, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { AuthRequestApproval } from "@/features/devices/AuthRequestApproval";
import { listDevices, listPendingAuthRequests, removeAllOtherDevices, removeDevice, removeDevices, renameDevice, trustDevice, untrustAllDevices, untrustDevice, type AuthRequestSummary, type DeviceSummary } from "@/features/devices/api";
import { useSession } from "@/lib/client/state/session-store";

export default function DeviceManagementPage() {
  const session = useSession();
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [requests, setRequests] = useState<AuthRequestSummary[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState<"selected" | "others" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [owned, pending] = await Promise.all([listDevices(), session.capabilities["authRequests.approval"] ? listPendingAuthRequests() : Promise.resolve([])]);
    setDevices(owned);
    setNames(Object.fromEntries(owned.map((device) => [device.identifier, device.name])));
    setSelected((current) => new Set([...current].filter((identifier) => owned.some((device) => device.identifier === identifier && !device.current))));
    setRequests(pending);
  }, [session.capabilities]);

  useEffect(() => { const timer = window.setTimeout(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "设备加载失败。")); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await load(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); setConfirm(null); }
  };

  return (
    <RouteGuard capability="device.management" requireOnline unavailableFallback={<AsyncState kind="forbidden" title="当前实例未启用设备管理" />}>
      <Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0 }}>
        <PageHeader title="设备与登录请求" description="当前设备会被明确标记，移除其他设备会撤销其刷新会话与待处理请求。" />
        {error ? <AsyncState kind="fatal" title="设备操作失败" description={error} /> : null}
        {message ? <Alert severity="success" role="status">{message}</Alert> : null}
        <SectionCard title="敏感设备操作"><TextField label="当前主密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></SectionCard>
        <SectionCard title="批量操作" description="当前设备永远不会被批量移除。移除设备会同时撤销其刷新会话和待处理登录请求。">
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}><Button color="error" startIcon={<DeleteOutlineOutlined />} disabled={busy || !password || selected.size === 0} onClick={() => setConfirm("selected")}>移除选中设备</Button><Button disabled={busy || !password} onClick={() => void run(() => untrustAllDevices(password), "全部设备信任已撤销。")}>撤销全部信任</Button><Button color="error" disabled={busy || !password || devices.every((device) => device.current)} onClick={() => setConfirm("others")}>移除全部其他设备</Button></Stack>
        </SectionCard>
        <SectionCard title="授权设备">
          {devices.length === 0 ? <AsyncState kind="empty" compact title="没有授权设备" /> : <List disablePadding>{devices.map((device) => <ListItem key={device.id} divider sx={{ px: 0, display: "grid", gridTemplateColumns: { xs: "auto 1fr", lg: "auto auto 1fr auto auto" }, gap: 1, alignItems: "center" }}><Checkbox aria-label={`选择 ${device.name}`} checked={selected.has(device.identifier)} disabled={device.current || busy} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(device.identifier); else next.delete(device.identifier); return next; })} /><ListItemIcon sx={{ minWidth: 36 }}><DevicesOutlined color={device.current ? "primary" : "action"} /></ListItemIcon><Box sx={{ minWidth: 0 }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField size="small" label={`${device.name} 的设备名称`} value={names[device.identifier] ?? device.name} onChange={(event) => setNames({ ...names, [device.identifier]: event.target.value })} /><Button size="small" disabled={busy || names[device.identifier] === device.name} onClick={() => void run(() => renameDevice(device.identifier, names[device.identifier]), "设备已重命名。")}>保存名称</Button></Stack><Typography color="text.secondary" variant="body2">{device.current ? "当前设备 · " : ""}{device.online ? "在线" : `最后活动 ${new Date(device.lastSeenDate).toLocaleString()}`} · {device.trustState}</Typography></Box>{device.trustState === "trusted-permanent" ? <Button size="small" startIcon={<ShieldOffOutlined />} disabled={busy} onClick={() => void run(() => untrustDevice(device.identifier), "设备信任已撤销。")}>撤销信任</Button> : <Button size="small" startIcon={<ShieldOutlined />} disabled={busy || !password} onClick={() => void run(() => trustDevice(device.identifier, password), "设备已永久信任。")}>永久信任</Button>}<Button size="small" color="error" startIcon={<DeleteOutlineOutlined />} disabled={busy || device.current || !password} onClick={() => void run(() => removeDevice(device.identifier, password), "设备已移除。")}>移除</Button></ListItem>)}</List>}
        </SectionCard>
        {session.capabilities["authRequests.approval"] ? <SectionCard title="待处理登录请求"><AuthRequestApproval requests={requests} busy={busy} onBusyChange={setBusy} onHandled={load} onError={setError} /></SectionCard> : null}
        <ConfirmDialog open={confirm !== null} title={confirm === "selected" ? "移除选中设备" : "移除全部其他设备"} description={confirm === "selected" ? `确认移除选中的 ${selected.size} 台设备？` : "确认移除当前设备之外的全部设备？"} consequences="相关刷新会话和待处理登录请求会立即失效。" confirmLabel="确认移除" tone="danger" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm === "selected" ? run(() => removeDevices([...selected], password), "选中设备已移除。") : run(() => removeAllOtherDevices(password), "其他设备已全部移除。")} />
      </Stack>
    </RouteGuard>
  );
}

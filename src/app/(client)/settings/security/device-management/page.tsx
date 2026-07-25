"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AuthRequestApproval } from "@/features/devices/AuthRequestApproval";
import {
  listDevices,
  listPendingAuthRequests,
  removeAllOtherDevices,
  removeDevice,
  removeDevices,
  renameDevice,
  trustDevice,
  untrustAllDevices,
  untrustDevice,
  type AuthRequestSummary,
  type DeviceSummary,
} from "@/features/devices/api";
import { SettingsNav } from "@/features/security/SettingsNav";
import { useSession } from "@/lib/client/state/session-store";

export default function DeviceManagementPage() {
  const session = useSession();
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [requests, setRequests] = useState<AuthRequestSummary[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [owned, pending] = await Promise.all([
      listDevices(),
      session.capabilities["authRequests.approval"] ? listPendingAuthRequests() : Promise.resolve([]),
    ]);
    setDevices(owned);
    setNames(Object.fromEntries(owned.map((device) => [device.identifier, device.name])));
    setSelected((current) => new Set(
      [...current].filter((identifier) => owned.some((device) => device.identifier === identifier && !device.current))
    ));
    setRequests(pending);
  }, [session.capabilities]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) => setError(reason instanceof Error ? reason.message : "设备加载失败。"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await load(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); }
  };

  return (
    <RouteGuard capability="device.management" requireOnline unavailableFallback={<p className="tool-error">当前实例未启用设备管理。</p>}>
      <main className="settings-page"><SettingsNav /><header className="settings-header"><h1>设备与登录请求</h1><p>当前设备会被明确标记，移除其他设备会撤销其刷新会话与待处理请求。</p></header>
        {error ? <p className="tool-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
        <section className="settings-card settings-grid"><h2>敏感设备操作</h2><Field label="当前主密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field></section>
        <section className="settings-card"><h2>批量操作</h2><p>当前设备永远不会被批量移除。移除设备会同时撤销其刷新会话和待处理登录请求。</p><div className="settings-actions"><Button variant="danger" disabled={busy || !password || selected.size === 0} onClick={() => { if (window.confirm(`确认移除选中的 ${selected.size} 台设备？`)) void run(() => removeDevices([...selected], password), "选中设备已移除。"); }}>移除选中设备</Button><Button disabled={busy || !password} onClick={() => void run(() => untrustAllDevices(password), "全部设备信任已撤销。")}>撤销全部信任</Button><Button variant="danger" disabled={busy || !password || devices.every((device) => device.current)} onClick={() => { if (window.confirm("确认移除当前设备之外的全部设备？")) void run(() => removeAllOtherDevices(password), "其他设备已全部移除。"); }}>移除全部其他设备</Button></div></section>
        <section className="settings-card"><h2>授权设备</h2><div className="settings-list">{devices.map((device) => <div className="device-row" key={device.id}>
          <input type="checkbox" aria-label={`选择 ${device.name}`} checked={selected.has(device.identifier)} disabled={device.current || busy} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(device.identifier); else next.delete(device.identifier); return next; })} /><Laptop size={20} aria-hidden="true" /><div className="device-row__body"><div><Input aria-label={`${device.name} 的设备名称`} value={names[device.identifier] ?? device.name} onChange={(event) => setNames({ ...names, [device.identifier]: event.target.value })} /><Button size="sm" disabled={busy || names[device.identifier] === device.name} onClick={() => void run(() => renameDevice(device.identifier, names[device.identifier]), "设备已重命名。")}>保存名称</Button></div><span>{device.current ? "当前设备 · " : ""}{device.online ? "在线" : `最后活动 ${new Date(device.lastSeenDate).toLocaleString()}`} · {device.trustState}</span></div>
          {device.trustState === "trusted-permanent" ? <Button size="sm" icon={ShieldOff} disabled={busy} onClick={() => void run(() => untrustDevice(device.identifier), "设备信任已撤销。")}>撤销信任</Button> : <Button size="sm" icon={ShieldCheck} disabled={busy || !password} onClick={() => void run(() => trustDevice(device.identifier, password), "设备已永久信任。")}>永久信任</Button>}
          <Button size="sm" icon={Trash2} variant="danger" disabled={busy || device.current || !password} onClick={() => void run(() => removeDevice(device.identifier, password), "设备已移除。")}>移除</Button>
        </div>)}</div></section>
        {session.capabilities["authRequests.approval"] ? <section className="settings-card"><h2>待处理登录请求</h2><AuthRequestApproval requests={requests} busy={busy} onBusyChange={setBusy} onHandled={load} onError={setError} /></section> : null}
      </main>
    </RouteGuard>
  );
}

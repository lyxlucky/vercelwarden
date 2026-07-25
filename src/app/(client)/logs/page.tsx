"use client";

import { useCallback, useEffect, useState } from "react";
import { Filter, Trash2 } from "lucide-react";
import { Button, Dialog, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AdminNav } from "@/features/admin/AdminNav";
import {
  clearAuditEvents,
  getAuditRetentionSettings,
  listAuditEvents,
  updateAuditRetentionSettings,
  type AuditEventSummary,
} from "@/features/admin/api";

export default function AuditLogsPage() {
  const [events, setEvents] = useState<AuditEventSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ action: "", category: "", level: "", outcome: "" });
  const [retentionDays, setRetentionDays] = useState(90);
  const [maxEntries, setMaxEntries] = useState(100000);
  const [password, setPassword] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (append = false) => {
    const [page, settings] = await Promise.all([
      listAuditEvents({ ...filters, cursor: append ? cursor : null }),
      getAuditRetentionSettings(),
    ]);
    setEvents((current) => append ? [...current, ...page.data] : page.data);
    setCursor(page.continuationToken);
    setRetentionDays(settings.retentionDays ?? 90);
    setMaxEntries(settings.maxEntries ?? 100000);
  }, [cursor, filters]);

  useEffect(() => { const timer = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "审计日志加载失败。")), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: () => Promise<unknown>, success: string, reload = true) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); if (reload) await load(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); }
  };

  return <RouteGuard roles={["admin"]} requireOnline><main className="settings-page"><AdminNav /><header className="settings-header"><h1>审计日志</h1><p>事件元数据经过动作白名单过滤，不记录密码、令牌、密钥或密码库内容。</p></header>
    {error ? <p className="tool-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
    <section className="settings-card settings-grid"><h2>筛选</h2><Field label="动作"><Input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} /></Field><Field label="类别"><select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">全部</option><option value="authentication">认证</option><option value="security">安全</option><option value="device">设备</option><option value="user">用户</option><option value="backup">备份</option><option value="system">系统</option></select></Field><Field label="级别"><select value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })}><option value="">全部</option><option value="info">信息</option><option value="warning">警告</option><option value="critical">严重</option></select></Field><Field label="结果"><select value={filters.outcome} onChange={(event) => setFilters({ ...filters, outcome: event.target.value })}><option value="">全部</option><option value="succeeded">成功</option><option value="failed">失败</option><option value="denied">拒绝</option><option value="partial">部分成功</option></select></Field><div className="settings-actions"><Button icon={Filter} disabled={busy} onClick={() => void run(() => load(), "筛选已应用。", false)}>应用筛选</Button></div></section>
    <section className="settings-card"><h2>事件</h2><div className="settings-list">{events.length ? events.map((event) => <article className="domain-group" key={event.id}><div className="settings-section-heading"><div><strong>{event.action}</strong><p>{event.category} · {event.level} · {event.outcome}</p></div><time>{new Date(event.creationDate).toLocaleString()}</time></div><p>{event.actorEmail ?? "系统"} → {[event.targetType, event.targetId].filter(Boolean).join(":") || "无目标"}</p>{Object.keys(event.metadata).length ? <code className="settings-secret">{JSON.stringify(event.metadata)}</code> : null}</article>) : <p>没有匹配的审计事件。</p>}</div>{cursor ? <div className="settings-actions"><Button disabled={busy} onClick={() => void run(() => load(true), "已加载更多事件。", false)}>加载更多</Button></div> : null}</section>
    <section className="settings-card settings-grid"><h2>保留策略</h2><Field label="保留天数"><Input type="number" min={1} max={3650} value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} /></Field><Field label="最大条数"><Input type="number" min={100} max={1000000} value={maxEntries} onChange={(event) => setMaxEntries(Number(event.target.value))} /></Field><div className="settings-actions"><Button disabled={busy} onClick={() => void run(() => updateAuditRetentionSettings({ retentionDays, maxEntries }), "保留策略已更新。")}>保存保留策略</Button></div></section>
    <section className="settings-card settings-grid"><h2>清空日志</h2><p>清空后会保留一条不含旧事件内容的清理摘要。</p><Field label="当前主密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><div className="settings-actions"><Button icon={Trash2} variant="danger" disabled={busy || !password} onClick={() => setConfirmClear(true)}>清空审计日志</Button></div></section>
    <Dialog open={confirmClear} onOpenChange={setConfirmClear} title="确认清空审计日志" description="此操作不可撤销。" footer={<><Button disabled={busy} onClick={() => setConfirmClear(false)}>取消</Button><Button variant="danger" disabled={busy || !password} onClick={() => void run(async () => { const result = await clearAuditEvents(password); setConfirmClear(false); setMessage(`已清除 ${result.removed} 条事件。`); }, "审计日志已清空。")}>确认清空</Button></>}><p>清空前请确认已按运维要求导出必要记录。</p></Dialog>
  </main></RouteGuard>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SectionCard } from "@/components/ui/SectionCard";
import { AdminSectionShell } from "@/features/admin/AdminSectionShell";
import { clearAuditEvents, getAuditRetentionSettings, listAuditEvents, updateAuditRetentionSettings, type AuditEventSummary } from "@/features/admin/api";

const choices = { category: [["", "全部"], ["authentication", "认证"], ["security", "安全"], ["device", "设备"], ["user", "用户"], ["backup", "备份"], ["system", "系统"]], level: [["", "全部"], ["info", "信息"], ["warning", "警告"], ["critical", "严重"]], outcome: [["", "全部"], ["succeeded", "成功"], ["failed", "失败"], ["denied", "拒绝"], ["partial", "部分成功"]] } as const;

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
  const load = useCallback(async (append = false) => { const [page, settings] = await Promise.all([listAuditEvents({ ...filters, cursor: append ? cursor : null }), getAuditRetentionSettings()]); setEvents((current) => append ? [...current, ...page.data] : page.data); setCursor(page.continuationToken); setRetentionDays(settings.retentionDays ?? 90); setMaxEntries(settings.maxEntries ?? 100000); }, [cursor, filters]);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "审计日志加载失败。")), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (action: () => Promise<unknown>, success: string, reload = true) => { setBusy(true); setError(""); setMessage(""); try { await action(); if (reload) await load(); setMessage(success); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); } finally { setBusy(false); } };

  return <RouteGuard roles={["admin"]} requireOnline><AdminSectionShell title="审计日志" description="事件元数据经过动作白名单过滤，不记录密码、令牌、密钥或密码库内容。" feedback={error ? <AsyncState kind="fatal" description={error} /> : message ? <Alert severity="success" role="status">{message}</Alert> : undefined}>
    <SectionCard title="筛选"><Stack spacing={2}><TextField label="动作" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} /><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>{(["category", "level", "outcome"] as const).map((key) => <FormControl key={key}><InputLabel id={`${key}-filter-label`}>{({ category: "类别", level: "级别", outcome: "结果" })[key]}</InputLabel><Select labelId={`${key}-filter-label`} label={({ category: "类别", level: "级别", outcome: "结果" })[key]} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}>{choices[key].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>)}</Box><Button startIcon={<FilterAltOutlined />} disabled={busy} onClick={() => void run(() => load(), "筛选已应用。", false)}>应用筛选</Button></Stack></SectionCard>
    <SectionCard title="事件"><Stack spacing={1.5}>{events.length ? events.map((event) => <Box component="article" key={event.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 3 }}><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography sx={{ fontWeight: 700 }}>{event.action}</Typography><Typography color="text.secondary" variant="body2">{event.category} · {event.level} · {event.outcome}</Typography></Box><Typography component="time" variant="body2">{new Date(event.creationDate).toLocaleString()}</Typography></Stack><Typography variant="body2" sx={{ mt: 1 }}>{event.actorEmail ?? "系统"} → {[event.targetType, event.targetId].filter(Boolean).join(":") || "无目标"}</Typography>{Object.keys(event.metadata).length ? <Box component="code" sx={{ display: "block", mt: 1, p: 1.5, borderRadius: 2, bgcolor: "action.hover", overflowWrap: "anywhere" }}>{JSON.stringify(event.metadata)}</Box> : null}</Box>) : <AsyncState kind="empty" compact title="没有匹配的审计事件" />}{cursor ? <Button disabled={busy} onClick={() => void run(() => load(true), "已加载更多事件。", false)}>加载更多</Button> : null}</Stack></SectionCard>
    <SectionCard title="保留策略"><Stack spacing={2}><TextField label="保留天数" type="number" slotProps={{ htmlInput: { min: 1, max: 3650 } }} value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} /><TextField label="最大条数" type="number" slotProps={{ htmlInput: { min: 100, max: 1000000 } }} value={maxEntries} onChange={(event) => setMaxEntries(Number(event.target.value))} /><Button disabled={busy} onClick={() => void run(() => updateAuditRetentionSettings({ retentionDays, maxEntries }), "保留策略已更新。")}>保存保留策略</Button></Stack></SectionCard>
    <SectionCard title="清空日志" description="清空后会保留一条不含旧事件内容的清理摘要。" danger><Stack spacing={2}><TextField label="当前主密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><Button startIcon={<DeleteOutlineOutlined />} color="error" variant="contained" disabled={busy || !password} onClick={() => setConfirmClear(true)}>清空审计日志</Button></Stack></SectionCard>
    <ConfirmDialog open={confirmClear} title="确认清空审计日志" description="此操作不可撤销。" consequences="清空前请确认已按运维要求导出必要记录。" confirmLabel="确认清空" tone="danger" busy={busy} onCancel={() => setConfirmClear(false)} onConfirm={() => run(async () => { const result = await clearAuditEvents(password); setConfirmClear(false); setMessage(`已清除 ${result.removed} 条事件。`); }, "审计日志已清空。")} />
  </AdminSectionShell></RouteGuard>;
}

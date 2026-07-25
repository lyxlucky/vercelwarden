"use client";

import { useCallback, useEffect, useState } from "react";
import BackupOutlined from "@mui/icons-material/BackupOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import VerifiedOutlined from "@mui/icons-material/VerifiedOutlined";
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, InputLabel, LinearProgress, List, ListItem, ListItemText, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SectionCard } from "@/components/ui/SectionCard";
import { AdminSectionShell } from "@/features/admin/AdminSectionShell";
import { deleteBackupArtifact, downloadBackupArtifact, listBackupArtifacts, listBackupDestinations, listBackupRuns, restoreBackupArtifact, saveBackupDestination, startBackupRun, verifyBackupIntegrity, type BackupArtifactSummary, type BackupDestinationSummary, type BackupRunSummary } from "@/features/admin/api";

type ConfirmAction = { artifact: BackupArtifactSummary; action: "delete" | "merge" | "replace" } | null;
function formatBytes(size: number) { if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`; return `${(size / 1024 / 1024).toFixed(1)} MiB`; }

export default function BackupPage() {
  const [destinations, setDestinations] = useState<BackupDestinationSummary[]>([]);
  const [runs, setRuns] = useState<BackupRunSummary[]>([]);
  const [artifacts, setArtifacts] = useState<BackupArtifactSummary[]>([]);
  const [integrity, setIntegrity] = useState<Record<string, string>>({});
  const [name, setName] = useState("本地下载");
  const [provider, setProvider] = useState<BackupDestinationSummary["provider"]>("local");
  const [schedule, setSchedule] = useState("");
  const [retentionCount, setRetentionCount] = useState(10);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [webDavUrl, setWebDavUrl] = useState("");
  const [webDavUsername, setWebDavUsername] = useState("");
  const [webDavPassword, setWebDavPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => { const [destinationList, runList, artifactList] = await Promise.all([listBackupDestinations(), listBackupRuns(), listBackupArtifacts()]); setDestinations(destinationList); setRuns(runList); setArtifacts(artifactList); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "备份数据加载失败。")), 0); return () => window.clearTimeout(timer); }, [load]);
  const run = async (action: () => Promise<unknown>, success: string, reload = true) => { setBusy(true); setError(""); setMessage(""); try { await action(); if (reload) await load(); setMessage(success); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); } finally { setBusy(false); } };
  const saveDestination = () => run(() => saveBackupDestination({ name, provider, enabled: true, schedule: schedule.trim() || null, retentionCount, includeAttachments, config: provider === "webdav" ? { baseUrl: webDavUrl, username: webDavUsername, password: webDavPassword } : {} }, password), "备份目标已保存。");
  const download = (artifact: BackupArtifactSummary) => run(async () => { const blob = await downloadBackupArtifact(artifact.id, password); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `vercelwarden-backup-${artifact.creationDate.slice(0, 10)}.vwb`; anchor.click(); URL.revokeObjectURL(url); }, "备份文件已开始下载。", false);
  const executeConfirmed = async () => { if (!confirm) return; const { artifact, action } = confirm; if (action === "delete") await run(() => deleteBackupArtifact(artifact.id, password), "备份文件已删除。"); else await run(async () => { const result = await restoreBackupArtifact(artifact.id, action, password); setMessage(`恢复完成：成功 ${result.restored}，失败 ${result.failed}。`); }, "恢复完成。"); setConfirm(null); };

  return <RouteGuard roles={["admin"]} requireOnline><AdminSectionShell title="系统备份" description="服务端生成加密归档并校验清单、认证标签和 SHA-256。管理员仍无法解密用户密码库内容。" feedback={error ? <AsyncState kind="fatal" description={error} /> : message ? <Alert severity="success" role="status">{message}</Alert> : busy ? <LinearProgress aria-label="正在处理备份操作" /> : undefined}>
    <SectionCard title="再认证" description="保存目标、下载、删除和恢复操作需要用途绑定的一次性再认证证明。"><TextField label="当前主密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></SectionCard>
    <SectionCard title="添加备份目标"><Stack spacing={2}><TextField label="名称" value={name} onChange={(event) => setName(event.target.value)} /><FormControl><InputLabel id="backup-provider-label">类型</InputLabel><Select labelId="backup-provider-label" label="类型" value={provider} onChange={(event) => setProvider(event.target.value as BackupDestinationSummary["provider"])}><MenuItem value="local">本地临时存储</MenuItem><MenuItem value="vercel-blob">Vercel Blob</MenuItem><MenuItem value="webdav">WebDAV</MenuItem></Select></FormControl><TextField label="计划标识（可选）" value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="例如 daily-02:00" /><TextField label="保留份数" type="number" slotProps={{ htmlInput: { min: 1, max: 365 } }} value={retentionCount} onChange={(event) => setRetentionCount(Number(event.target.value))} /><FormControlLabel control={<Checkbox checked={includeAttachments} onChange={(event) => setIncludeAttachments(event.target.checked)} />} label="包含附件和 Send 文件" />{provider === "webdav" ? <><TextField label="WebDAV 地址" type="url" value={webDavUrl} onChange={(event) => setWebDavUrl(event.target.value)} /><TextField label="用户名" value={webDavUsername} onChange={(event) => setWebDavUsername(event.target.value)} /><TextField label="密码" type="password" value={webDavPassword} onChange={(event) => setWebDavPassword(event.target.value)} /></> : null}<Button startIcon={<SaveOutlined />} disabled={busy || !password || !name || (provider === "webdav" && !webDavUrl)} onClick={() => void saveDestination()}>保存目标</Button></Stack></SectionCard>
    <SectionCard title="目标与手动运行" description="运行过程记录进度、部分失败和保留清理结果。" action={<Button startIcon={<RefreshOutlined />} disabled={busy} onClick={() => void run(load, "已刷新。", false)}>刷新</Button>}><List disablePadding>{destinations.length ? destinations.map((destination) => <ListItem key={destination.id} divider disableGutters secondaryAction={<Button startIcon={<PlayArrowOutlined />} size="small" disabled={busy || !destination.enabled} onClick={() => void run(() => startBackupRun(destination.id, destination.includeAttachments ? "full" : "database"), "备份运行已完成。")}>立即备份</Button>}><ListItemText primary={destination.name} secondary={`${destination.provider} · 保留 ${destination.retentionCount} 份 · ${destination.includeAttachments ? "含附件" : "仅数据库"}`} /></ListItem>) : <AsyncState kind="empty" compact title="尚未配置备份目标" />}</List></SectionCard>
    <SectionCard title="运行历史"><Stack spacing={1.5}>{runs.length ? runs.map((item) => <Box component="article" key={item.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 3 }}><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography sx={{ fontWeight: 700 }}>{item.status}</Typography><Typography color="text.secondary" variant="body2">{item.trigger} · {item.mode} · {item.progress}%</Typography></Box><Typography component="time" variant="body2">{new Date(item.creationDate).toLocaleString()}</Typography></Stack><LinearProgress sx={{ my: 1 }} variant="determinate" value={item.progress} />{item.summary ? <Box component="code" sx={{ display: "block", p: 1.5, borderRadius: 2, bgcolor: "action.hover", overflowWrap: "anywhere" }}>{JSON.stringify(item.summary)}</Box> : null}{item.errorCode ? <Alert severity="error">{item.errorCode}</Alert> : null}</Box>) : <AsyncState kind="empty" compact title="尚无备份运行" />}</Stack></SectionCard>
    <SectionCard title="备份文件与恢复"><Stack spacing={1.5}>{artifacts.length ? artifacts.map((artifact) => <Box component="article" key={artifact.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 3 }}><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography sx={{ fontWeight: 700 }}>{new Date(artifact.creationDate).toLocaleString()}</Typography><Typography color="text.secondary" variant="body2">{formatBytes(artifact.size)} · 格式 v{artifact.formatVersion} · {integrity[artifact.id] ?? "未校验"}</Typography></Box><Box component="code">{artifact.sha256.slice(0, 16)}…</Box></Stack><Stack direction="row" sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}><Button size="small" startIcon={<VerifiedOutlined />} disabled={busy} onClick={() => void run(async () => { const result = await verifyBackupIntegrity(artifact.id); setIntegrity((current) => ({ ...current, [artifact.id]: result.status })); }, "完整性检查完成。", false)}>校验</Button><Button size="small" startIcon={<DownloadOutlined />} disabled={busy || !password} onClick={() => void download(artifact)}>下载</Button><Button size="small" startIcon={<RestoreOutlined />} disabled={busy || !password} onClick={() => setConfirm({ artifact, action: "merge" })}>合并恢复</Button><Button size="small" color="error" startIcon={<BackupOutlined />} disabled={busy || !password} onClick={() => setConfirm({ artifact, action: "replace" })}>清空后恢复</Button><Button size="small" color="error" startIcon={<DeleteOutlineOutlined />} disabled={busy || !password} onClick={() => setConfirm({ artifact, action: "delete" })}>删除</Button></Stack></Box>) : <AsyncState kind="empty" compact title="尚无可用备份文件" />}</Stack></SectionCard>
    <ConfirmDialog open={confirm !== null} title={confirm?.action === "delete" ? "删除备份文件" : confirm?.action === "replace" ? "清空后恢复" : "合并恢复"} description={confirm?.action === "replace" ? "此操作会替换当前数据库内容，必须确认备份完整且可恢复。" : "该操作会写入审计日志并返回逐类恢复结果。"} target={confirm?.artifact.id} consequences={confirm?.action === "replace" ? "当前数据库内容会被替换。" : undefined} confirmLabel="确认操作" tone="danger" busy={busy} onCancel={() => setConfirm(null)} onConfirm={executeConfirmed} />
  </AdminSectionShell></RouteGuard>;
}

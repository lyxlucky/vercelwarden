"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudDownload, DatabaseBackup, Play, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Dialog, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AdminNav } from "@/features/admin/AdminNav";
import {
  deleteBackupArtifact,
  downloadBackupArtifact,
  listBackupArtifacts,
  listBackupDestinations,
  listBackupRuns,
  restoreBackupArtifact,
  saveBackupDestination,
  startBackupRun,
  verifyBackupIntegrity,
  type BackupArtifactSummary,
  type BackupDestinationSummary,
  type BackupRunSummary,
} from "@/features/admin/api";

type ConfirmAction = { artifact: BackupArtifactSummary; action: "delete" | "merge" | "replace" } | null;

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / 1024 / 1024).toFixed(1)} MiB`;
}

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

  const load = useCallback(async () => {
    const [destinationList, runList, artifactList] = await Promise.all([
      listBackupDestinations(),
      listBackupRuns(),
      listBackupArtifacts(),
    ]);
    setDestinations(destinationList);
    setRuns(runList);
    setArtifacts(artifactList);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "备份数据加载失败。")), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string, reload = true) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await action();
      if (reload) await load();
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  };

  const saveDestination = () => run(() => saveBackupDestination({
    name,
    provider,
    enabled: true,
    schedule: schedule.trim() || null,
    retentionCount,
    includeAttachments,
    config: provider === "webdav" ? { baseUrl: webDavUrl, username: webDavUsername, password: webDavPassword } : {},
  }, password), "备份目标已保存。");

  const download = (artifact: BackupArtifactSummary) => run(async () => {
    const blob = await downloadBackupArtifact(artifact.id, password);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vercelwarden-backup-${artifact.creationDate.slice(0, 10)}.vwb`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, "备份文件已开始下载。", false);

  const executeConfirmed = async () => {
    if (!confirm) return;
    const { artifact, action } = confirm;
    if (action === "delete") {
      await run(() => deleteBackupArtifact(artifact.id, password), "备份文件已删除。");
    } else {
      await run(async () => {
        const result = await restoreBackupArtifact(artifact.id, action, password);
        setMessage(`恢复完成：成功 ${result.restored}，失败 ${result.failed}。`);
      }, "恢复完成。");
    }
    setConfirm(null);
  };

  return <RouteGuard roles={["admin"]} requireOnline><main className="settings-page">
    <AdminNav />
    <header className="settings-header"><h1>系统备份</h1><p>服务端生成加密归档并校验清单、认证标签和 SHA-256。管理员仍无法解密用户密码库内容。</p></header>
    {error ? <p className="tool-error" role="alert">{error}</p> : null}
    {message ? <p className="settings-success" role="status">{message}</p> : null}

    <section className="settings-card settings-grid">
      <h2>再认证</h2>
      <Field label="当前主密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      <p>保存目标、下载、删除和恢复操作需要用途绑定的一次性再认证证明。</p>
    </section>

    <section className="settings-card settings-grid">
      <h2>添加备份目标</h2>
      <Field label="名称"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="类型"><select value={provider} onChange={(event) => setProvider(event.target.value as BackupDestinationSummary["provider"])}><option value="local">本地临时存储</option><option value="vercel-blob">Vercel Blob</option><option value="webdav">WebDAV</option></select></Field>
      <Field label="计划标识（可选）"><Input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="例如 daily-02:00" /></Field>
      <Field label="保留份数"><Input type="number" min={1} max={365} value={retentionCount} onChange={(event) => setRetentionCount(Number(event.target.value))} /></Field>
      <label><input type="checkbox" checked={includeAttachments} onChange={(event) => setIncludeAttachments(event.target.checked)} /> 包含附件和 Send 文件</label>
      {provider === "webdav" ? <><Field label="WebDAV 地址"><Input type="url" value={webDavUrl} onChange={(event) => setWebDavUrl(event.target.value)} /></Field><Field label="用户名"><Input value={webDavUsername} onChange={(event) => setWebDavUsername(event.target.value)} /></Field><Field label="密码"><Input type="password" value={webDavPassword} onChange={(event) => setWebDavPassword(event.target.value)} /></Field></> : null}
      <div className="settings-actions"><Button icon={Save} disabled={busy || !password || !name || (provider === "webdav" && !webDavUrl)} onClick={() => void saveDestination()}>保存目标</Button></div>
    </section>

    <section className="settings-card">
      <div className="settings-section-heading"><div><h2>目标与手动运行</h2><p>运行过程记录进度、部分失败和保留清理结果。</p></div><Button icon={RefreshCw} disabled={busy} onClick={() => void run(load, "已刷新。", false)}>刷新</Button></div>
      <div className="settings-list">{destinations.length ? destinations.map((destination) => <div className="settings-row" key={destination.id}><div><strong>{destination.name}</strong><span>{destination.provider} · 保留 {destination.retentionCount} 份 · {destination.includeAttachments ? "含附件" : "仅数据库"}</span></div><Button icon={Play} size="sm" disabled={busy || !destination.enabled} onClick={() => void run(() => startBackupRun(destination.id, destination.includeAttachments ? "full" : "database"), "备份运行已完成。")}>立即备份</Button></div>) : <p>尚未配置备份目标。</p>}</div>
    </section>

    <section className="settings-card">
      <h2>运行历史</h2>
      <div className="settings-list">{runs.length ? runs.map((item) => <article className="domain-group" key={item.id}><div className="settings-section-heading"><div><strong>{item.status}</strong><p>{item.trigger} · {item.mode} · {item.progress}%</p></div><time>{new Date(item.creationDate).toLocaleString()}</time></div>{item.summary ? <code className="settings-secret">{JSON.stringify(item.summary)}</code> : null}{item.errorCode ? <p className="tool-error">{item.errorCode}</p> : null}</article>) : <p>尚无备份运行。</p>}</div>
    </section>

    <section className="settings-card">
      <h2>备份文件与恢复</h2>
      <div className="settings-list">{artifacts.length ? artifacts.map((artifact) => <article className="domain-group" key={artifact.id}><div className="settings-section-heading"><div><strong>{new Date(artifact.creationDate).toLocaleString()}</strong><p>{formatBytes(artifact.size)} · 格式 v{artifact.formatVersion} · {integrity[artifact.id] ?? "未校验"}</p></div><code>{artifact.sha256.slice(0, 16)}…</code></div><div className="settings-actions"><Button size="sm" icon={ShieldCheck} disabled={busy} onClick={() => void run(async () => { const result = await verifyBackupIntegrity(artifact.id); setIntegrity((current) => ({ ...current, [artifact.id]: result.status })); }, "完整性检查完成。", false)}>校验</Button><Button size="sm" icon={CloudDownload} disabled={busy || !password} onClick={() => void download(artifact)}>下载</Button><Button size="sm" icon={RotateCcw} disabled={busy || !password} onClick={() => setConfirm({ artifact, action: "merge" })}>合并恢复</Button><Button size="sm" icon={DatabaseBackup} variant="danger" disabled={busy || !password} onClick={() => setConfirm({ artifact, action: "replace" })}>清空后恢复</Button><Button size="sm" icon={Trash2} variant="danger" disabled={busy || !password} onClick={() => setConfirm({ artifact, action: "delete" })}>删除</Button></div></article>) : <p>尚无可用备份文件。</p>}</div>
    </section>

    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }} title={confirm?.action === "delete" ? "删除备份文件" : confirm?.action === "replace" ? "清空后恢复" : "合并恢复"} description={confirm?.action === "replace" ? "此操作会替换当前数据库内容，必须确认备份完整且可恢复。" : "该操作会写入审计日志并返回逐类恢复结果。"} footer={<><Button disabled={busy} onClick={() => setConfirm(null)}>取消</Button><Button variant="danger" disabled={busy || !password} onClick={() => void executeConfirmed()}>确认操作</Button></>}><p>{confirm?.artifact.id}</p></Dialog>
  </main></RouteGuard>;
}

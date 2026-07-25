"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileUp, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button, Dialog, Field, IconButton, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import {
  createFileSend,
  createTextSend,
  deleteSends,
  listSends,
  updateSend,
  type SendTransferProgress,
  type SendView,
} from "@/features/sends/api";

export default function SendsPage() {
  const [items, setItems] = useState<SendView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SendView | null>(null);
  const [type, setType] = useState<"text" | "file">("text");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [maxAccessCount, setMaxAccessCount] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [hideEmail, setHideEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [progress, setProgress] = useState<SendTransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedItems = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected]);
  const refresh = async () => setItems(await listSends());
  useEffect(() => { let active = true; void listSends().then((next) => { if (active) setItems(next); }).catch((next) => { if (active) setError(next instanceof Error ? next.message : "无法加载 Send。"); }); return () => { active = false; }; }, []);

  const reset = () => {
    setEditing(null); setType("text"); setName(""); setNotes(""); setText(""); setFile(null); setPassword(""); setMaxAccessCount(""); setDisabled(false); setHideEmail(false); setProgress(null);
  };
  const edit = (item: SendView) => {
    setEditing(item); setType(item.type === 0 ? "text" : "file"); setName(item.name); setNotes(item.notes); setMaxAccessCount(item.maxAccessCount == null ? "" : String(item.maxAccessCount)); setDisabled(item.disabled); setHideEmail(item.hideEmail); setOpen(true);
  };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (editing) {
        await updateSend(editing.id, { name, notes, maxAccessCount: maxAccessCount ? Number(maxAccessCount) : null, disabled, hideEmail });
        await refresh();
      } else {
        const deletionDate = new Date(Date.now() + 7 * 86400_000).toISOString();
        const input = { name, notes, password, maxAccessCount: maxAccessCount ? Number(maxAccessCount) : null, deletionDate, disabled, hideEmail };
        const created = type === "text"
          ? await createTextSend({ ...input, text })
          : await createFileSend({ ...input, file: file! }, setProgress);
        setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      }
      setOpen(false); reset();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Send 操作失败。"); }
    finally { setBusy(false); }
  };
  const remove = async (ids: string[]) => {
    if (ids.length === 0 || !window.confirm(`确定删除 ${ids.length} 个 Send？`)) return;
    setBusy(true); setError(null);
    try {
      const result = await deleteSends(ids);
      const deleted = new Set(result.outcomes.filter((outcome) => outcome.status === "deleted" || outcome.status === "partial").map((outcome) => outcome.id));
      setItems((current) => current.filter((item) => !deleted.has(item.id)));
      setSelected(new Set());
      if (result.failed) setError(`${result.failed} 个 Send 未能完全删除。`);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "删除失败。"); }
    finally { setBusy(false); }
  };

  const valid = Boolean(name.trim()) && (Boolean(editing) || (type === "text" ? Boolean(text) : Boolean(file)));
  return <RouteGuard><main className="tool-page"><header className="tool-page__header"><div><Link href="/vault">← 返回密码库</Link><h1>Send</h1><p>创建端到端加密的文本或文件分享，并限制密码、次数和有效期。</p></div><div className="tool-actions">{selectedItems.length > 0 && <Button variant="danger" icon={Trash2} disabled={busy} onClick={() => remove(selectedItems.map((item) => item.id))}>删除所选（{selectedItems.length}）</Button>}<Button variant="primary" icon={Plus} onClick={() => { reset(); setOpen(true); }}>新建 Send</Button></div></header>
    {error && <p className="tool-error" role="alert">{error}</p>}
    <section className="tool-card send-list">{items.length === 0 ? <p className="tool-empty">暂无 Send。</p> : items.map((item) => <article className="send-row" key={item.id}>
      <input type="checkbox" aria-label={`选择 ${item.name}`} checked={selected.has(item.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />
      <div><strong>{item.type === 1 ? <FileUp size={16} /> : <Send size={16} />} {item.name}</strong><span>{item.file?.fileName ?? "文本"} · 访问 {item.accessCount}{item.maxAccessCount == null ? "" : ` / ${item.maxAccessCount}`} · {item.disabled ? "已停用" : `删除 ${new Date(item.deletionDate).toLocaleString("zh-CN")}`}</span></div>
      <IconButton icon={copied === item.id ? Check : Copy} label="复制分享链接" onClick={async () => { await navigator.clipboard.writeText(item.url); setCopied(item.id); window.setTimeout(() => setCopied(null), 1500); }} />
      <IconButton icon={Pencil} label={`编辑 ${item.name}`} onClick={() => edit(item)} />
      <IconButton icon={Trash2} label={`删除 ${item.name}`} onClick={() => remove([item.id])} />
    </article>)}</section>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }} title={editing ? "编辑 Send" : "新建 Send"} description="内容和文件会在浏览器中加密；URL 片段携带解密密钥。" footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" disabled={busy || !valid} onClick={submit}>{editing ? "保存" : "创建"}</Button></>}>
      <div className="vault-editor__grid">{!editing && <Field label="类型"><select className="vw-input" value={type} onChange={(event) => setType(event.target.value as "text" | "file")}><option value="text">文本</option><option value="file">文件</option></select></Field>}
        <Field label="名称"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="备注"><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        {!editing && <Field label="访问密码（可选）"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>}
        <Field label="最大访问次数（可选）"><Input type="number" min={1} value={maxAccessCount} onChange={(event) => setMaxAccessCount(event.target.value)} /></Field>
        {!editing && type === "text" && <Field label="分享文本"><textarea className="vw-input vault-editor__textarea vault-editor__textarea--tall" value={text} onChange={(event) => setText(event.target.value)} /></Field>}
        {!editing && type === "file" && <Field label="分享文件"><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>}
        <label><input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} /> 暂停访问</label>
        <label><input type="checkbox" checked={hideEmail} onChange={(event) => setHideEmail(event.target.checked)} /> 隐藏创建者邮箱</label>
        {progress && <p aria-live="polite">{progress.phase}：{progress.percent}%</p>}
      </div>
    </Dialog>
  </main></RouteGuard>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, ShieldBan, Trash2, UserPlus } from "lucide-react";
import { Button, Dialog, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AdminNav } from "@/features/admin/AdminNav";
import {
  cleanupAdminInvites,
  createAdminInvite,
  deleteAdminUser,
  listAdminInvites,
  listAdminUsers,
  revokeAdminInvite,
  updateAdminUserStatus,
  type AdminInviteSummary,
  type AdminUserSummary,
} from "@/features/admin/api";

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [invites, setInvites] = useState<AdminInviteSummary[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteHours, setInviteHours] = useState(72);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [createdLink, setCreatedLink] = useState("");
  const [confirm, setConfirm] = useState<{ user: AdminUserSummary; action: "status" | "delete" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (append = false) => {
    const [userPage, inviteList] = await Promise.all([
      listAdminUsers({ query, status, cursor: append ? cursor : null }),
      listAdminInvites(),
    ]);
    setUsers((current) => append ? [...current, ...userPage.data] : userPage.data);
    setCursor(userPage.continuationToken);
    setInvites(inviteList);
  }, [cursor, query, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "管理数据加载失败。")), 0);
    return () => window.clearTimeout(timer);
  }, [query, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: () => Promise<unknown>, success: string, reload = true) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); if (reload) await load(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); }
  };

  const executeConfirmed = async () => {
    if (!confirm) return;
    const { user, action } = confirm;
    await run(
      () => action === "delete" ? deleteAdminUser(user.id, password) : updateAdminUserStatus(user.id, !user.enabled, password),
      action === "delete" ? "用户已永久删除。" : `用户已${user.enabled ? "停用" : "启用"}。`
    );
    setConfirm(null);
  };

  return <RouteGuard roles={["admin"]} requireOnline><main className="settings-page"><AdminNav /><header className="settings-header"><h1>用户与邀请</h1><p>管理员使用当前 Bearer 会话；停用和删除操作还需要用途绑定的再次验证。</p></header>
    {error ? <p className="tool-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
    <section className="settings-card settings-grid"><h2>再次验证</h2><Field label="当前主密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field></section>
    <section className="settings-card settings-grid"><h2>用户</h2><Field label="搜索"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="邮箱、名称或用户 ID" /></Field><Field label="状态"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部</option><option value="active">已启用</option><option value="disabled">已停用</option></select></Field><div className="settings-list">{users.map((user) => <div className="settings-row" key={user.id}><div><strong>{user.email}</strong><span>{user.name || "未设置名称"} · {user.role} · {user.enabled ? "已启用" : "已停用"}{user.twoFactorEnabled ? " · 2FA" : ""}</span></div><Button size="sm" icon={ShieldBan} disabled={busy || !password || user.role === "admin"} onClick={() => setConfirm({ user, action: "status" })}>{user.enabled ? "停用" : "启用"}</Button><Button size="sm" icon={Trash2} variant="danger" disabled={busy || !password || user.role === "admin"} onClick={() => setConfirm({ user, action: "delete" })}>删除</Button></div>)}</div>{cursor ? <div className="settings-actions"><Button disabled={busy} onClick={() => void run(() => load(true), "已加载更多用户。", false)}>加载更多</Button></div> : null}</section>
    <section className="settings-card settings-grid"><h2>创建邀请</h2><Field label="邮箱"><Input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></Field><Field label="有效小时数"><Input type="number" min={1} max={720} value={inviteHours} onChange={(event) => setInviteHours(Number(event.target.value))} /></Field><Field label="最大使用次数"><Input type="number" min={1} max={100} value={inviteMaxUses} onChange={(event) => setInviteMaxUses(Number(event.target.value))} /></Field><div className="settings-actions"><Button icon={UserPlus} disabled={busy || !inviteEmail} onClick={() => void run(async () => { const created = await createAdminInvite({ email: inviteEmail, expiresInHours: inviteHours, maxUses: inviteMaxUses }); setCreatedLink(created.registrationUrl); setInviteEmail(""); }, "邀请已创建；链接只显示一次。")}>创建邀请</Button></div>{createdLink ? <div><p>一次性显示的注册链接：</p><code className="settings-secret">{createdLink}</code><div className="settings-actions"><Button icon={Copy} onClick={() => void navigator.clipboard.writeText(createdLink)}>复制链接</Button></div></div> : null}</section>
    <section className="settings-card"><div className="settings-section-heading"><div><h2>邀请记录</h2><p>历史列表不会再次返回原始邀请码。</p></div><Button icon={RefreshCw} disabled={busy} onClick={() => void run(async () => { const result = await cleanupAdminInvites(); setMessage(`已清理 ${result.removed} 条邀请。`); }, "邀请清理完成。")}>清理</Button></div><div className="settings-list">{invites.map((invite) => <div className="settings-row" key={invite.id}><div><strong>{invite.email}</strong><span>{invite.status} · {invite.useCount}/{invite.maxUses} · 到期 {new Date(invite.expirationDate).toLocaleString()}</span></div><Button size="sm" variant="danger" disabled={busy || invite.status !== "active"} onClick={() => void run(() => revokeAdminInvite(invite.id), "邀请已撤销。")}>撤销</Button></div>)}</div></section>
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }} title={confirm?.action === "delete" ? "永久删除用户" : `${confirm?.user.enabled ? "停用" : "启用"}用户`} description="此操作会记录审计事件；停用或删除会撤销相关会话。" footer={<><Button disabled={busy} onClick={() => setConfirm(null)}>取消</Button><Button variant="danger" disabled={busy || !password} onClick={() => void executeConfirmed()}>确认操作</Button></>}><p>{confirm?.user.email}</p></Dialog>
  </main></RouteGuard>;
}

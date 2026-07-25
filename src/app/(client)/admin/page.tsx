"use client";

import { useCallback, useEffect, useState } from "react";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { Alert, Box, Button, FormControl, InputLabel, List, ListItem, ListItemText, MenuItem, Select, Stack, TextField } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SectionCard } from "@/components/ui/SectionCard";
import { AdminSectionShell } from "@/features/admin/AdminSectionShell";
import { cleanupAdminInvites, createAdminInvite, deleteAdminUser, listAdminInvites, listAdminUsers, revokeAdminInvite, updateAdminUserStatus, type AdminInviteSummary, type AdminUserSummary } from "@/features/admin/api";

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

  const load = useCallback(async (append = false) => { const [userPage, inviteList] = await Promise.all([listAdminUsers({ query, status, cursor: append ? cursor : null }), listAdminInvites()]); setUsers((current) => append ? [...current, ...userPage.data] : userPage.data); setCursor(userPage.continuationToken); setInvites(inviteList); }, [cursor, query, status]);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "管理数据加载失败。")), 0); return () => window.clearTimeout(timer); }, [query, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (action: () => Promise<unknown>, success: string, reload = true) => { setBusy(true); setError(""); setMessage(""); try { await action(); if (reload) await load(); setMessage(success); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); } finally { setBusy(false); } };
  const executeConfirmed = async () => { if (!confirm) return; const { user, action } = confirm; await run(() => action === "delete" ? deleteAdminUser(user.id, password) : updateAdminUserStatus(user.id, !user.enabled, password), action === "delete" ? "用户已永久删除。" : `用户已${user.enabled ? "停用" : "启用"}。`); setConfirm(null); };

  return <RouteGuard roles={["admin"]} requireOnline><AdminSectionShell title="用户与邀请" description="管理员使用当前 Bearer 会话；停用和删除操作还需要用途绑定的再次验证。" feedback={error ? <AsyncState kind="fatal" description={error} /> : message ? <Alert severity="success" role="status">{message}</Alert> : undefined}>
    <SectionCard title="再次验证"><TextField label="当前主密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></SectionCard>
    <SectionCard title="用户"><Stack spacing={2}><TextField label="搜索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="邮箱、名称或用户 ID" /><FormControl><InputLabel id="admin-status-label">状态</InputLabel><Select labelId="admin-status-label" label="状态" value={status} onChange={(event) => setStatus(event.target.value)}><MenuItem value="all">全部</MenuItem><MenuItem value="active">已启用</MenuItem><MenuItem value="disabled">已停用</MenuItem></Select></FormControl><List disablePadding>{users.map((user) => <ListItem key={user.id} divider disableGutters secondaryAction={<Stack direction="row" spacing={1}><Button size="small" disabled={busy || !password || user.role === "admin"} onClick={() => setConfirm({ user, action: "status" })}>{user.enabled ? "停用" : "启用"}</Button><Button size="small" color="error" startIcon={<DeleteOutlineOutlined />} disabled={busy || !password || user.role === "admin"} onClick={() => setConfirm({ user, action: "delete" })}>删除</Button></Stack>}><ListItemText primary={user.email} secondary={`${user.name || "未设置名称"} · ${user.role} · ${user.enabled ? "已启用" : "已停用"}${user.twoFactorEnabled ? " · 2FA" : ""}`} /></ListItem>)}</List>{cursor ? <Button disabled={busy} onClick={() => void run(() => load(true), "已加载更多用户。", false)}>加载更多</Button> : null}</Stack></SectionCard>
    <SectionCard title="创建邀请"><Stack spacing={2}><TextField label="邮箱" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}><TextField label="有效小时数" type="number" slotProps={{ htmlInput: { min: 1, max: 720 } }} value={inviteHours} onChange={(event) => setInviteHours(Number(event.target.value))} /><TextField label="最大使用次数" type="number" slotProps={{ htmlInput: { min: 1, max: 100 } }} value={inviteMaxUses} onChange={(event) => setInviteMaxUses(Number(event.target.value))} /></Box><Button startIcon={<PersonAddOutlined />} disabled={busy || !inviteEmail} onClick={() => void run(async () => { const created = await createAdminInvite({ email: inviteEmail, expiresInHours: inviteHours, maxUses: inviteMaxUses }); setCreatedLink(created.registrationUrl); setInviteEmail(""); }, "邀请已创建；链接只显示一次。")}>创建邀请</Button>{createdLink ? <Alert severity="warning"><Box component="code" sx={{ display: "block", overflowWrap: "anywhere", userSelect: "all" }}>{createdLink}</Box><Button startIcon={<ContentCopyOutlined />} onClick={() => void navigator.clipboard.writeText(createdLink)}>复制链接</Button></Alert> : null}</Stack></SectionCard>
    <SectionCard title="邀请记录" description="历史列表不会再次返回原始邀请码。" action={<Button startIcon={<RefreshOutlined />} disabled={busy} onClick={() => void run(async () => { const result = await cleanupAdminInvites(); setMessage(`已清理 ${result.removed} 条邀请。`); }, "邀请清理完成。")}>清理</Button>}><List disablePadding>{invites.map((invite) => <ListItem key={invite.id} divider disableGutters secondaryAction={<Button size="small" color="error" disabled={busy || invite.status !== "active"} onClick={() => void run(() => revokeAdminInvite(invite.id), "邀请已撤销。")}>撤销</Button>}><ListItemText primary={invite.email} secondary={`${invite.status} · ${invite.useCount}/${invite.maxUses} · 到期 ${new Date(invite.expirationDate).toLocaleString()}`} /></ListItem>)}</List></SectionCard>
    <ConfirmDialog open={confirm !== null} title={confirm?.action === "delete" ? "永久删除用户" : `${confirm?.user.enabled ? "停用" : "启用"}用户`} description="此操作会记录审计事件；停用或删除会撤销相关会话。" target={confirm?.user.email} consequences={confirm?.action === "delete" ? "用户数据将永久删除且无法恢复。" : "相关会话将立即失效。"} confirmLabel="确认操作" tone="danger" busy={busy} onCancel={() => setConfirm(null)} onConfirm={executeConfirmed} />
  </AdminSectionShell></RouteGuard>;
}

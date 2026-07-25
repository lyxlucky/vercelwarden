"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { SettingsNav } from "@/features/security/SettingsNav";
import { lockController } from "@/features/auth/lock-controller";
import {
  changeKdf,
  changeMasterPassword,
  fetchAccountProfile,
  revealApiKey,
  updateAccountProfile,
  type AccountProfile,
} from "@/features/security/api";

export default function AccountSettingsPage() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [kdfType, setKdfType] = useState(1);
  const [kdfIterations, setKdfIterations] = useState(3);
  const [kdfMemory, setKdfMemory] = useState(64);
  const [kdfParallelism, setKdfParallelism] = useState(4);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void fetchAccountProfile().then((value) => { setProfile(value); setName(value.name); setHint(value.masterPasswordHint ?? ""); }).catch((reason) => setError(String(reason))); }, []);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); }
  };

  return (
    <RouteGuard requireOnline>
      <main className="settings-page">
        <SettingsNav />
        <header className="settings-header"><h1>账号设置</h1><p>{profile?.email ?? "正在加载账号…"}</p></header>
        {error ? <p className="tool-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
        <section className="settings-card settings-grid"><h2>资料与密码提示</h2>
          <Field label="显示名称"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="密码提示"><Input value={hint} onChange={(event) => setHint(event.target.value)} /></Field>
          <Field label="当前主密码" hint="修改提示需要用途绑定的再次验证。"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
          <div className="settings-actions"><Button disabled={busy || !profile || !password} variant="primary" onClick={() => void run(async () => { const updated = await updateAccountProfile({ name, hint: hint || null, password }); setProfile(updated); }, "账号资料已更新。")}>保存资料</Button></div>
        </section>
        <section className="settings-card settings-grid"><h2>修改主密码</h2>
          <Field label="新主密码"><Input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field>
          <Field label="确认新主密码"><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field>
          <div className="settings-actions"><Button disabled={busy || !password || newPassword.length < 8 || newPassword !== confirmPassword} variant="danger" onClick={() => void run(async () => { await changeMasterPassword({ currentPassword: password, newPassword }); await lockController.logout(); }, "主密码已修改，请重新登录。")}>修改主密码</Button></div>
        </section>
        <section className="settings-card settings-grid"><h2>KDF 安全参数</h2>
          <Field label="算法"><select value={kdfType} onChange={(event) => { const value = Number(event.target.value); setKdfType(value); setKdfIterations(value === 1 ? 3 : 600000); }}><option value={1}>Argon2id</option><option value={0}>PBKDF2-SHA256</option></select></Field>
          <Field label="迭代次数"><Input type="number" min={kdfType === 1 ? 1 : 100000} value={kdfIterations} onChange={(event) => setKdfIterations(Number(event.target.value))} /></Field>
          {kdfType === 1 ? <><Field label="内存 (MiB)"><Input type="number" min={16} max={1024} value={kdfMemory} onChange={(event) => setKdfMemory(Number(event.target.value))} /></Field><Field label="并行度"><Input type="number" min={1} max={16} value={kdfParallelism} onChange={(event) => setKdfParallelism(Number(event.target.value))} /></Field></> : null}
          <div className="settings-actions"><Button disabled={busy || !password} onClick={() => void run(async () => { await changeKdf({ password, type: kdfType, iterations: kdfIterations, memory: kdfType === 1 ? kdfMemory : null, parallelism: kdfType === 1 ? kdfParallelism : null }); await lockController.logout(); }, "KDF 已更新，请重新登录。")}>更新 KDF</Button></div>
        </section>
        <section className="settings-card settings-grid"><h2>账号 API key</h2><p>仅在再次验证后显示。轮换后旧 key 立即失效。</p>
          {apiKey ? <code className="settings-secret">{apiKey}</code> : null}
          <div className="settings-actions"><Button disabled={busy || !password} onClick={() => void run(async () => setApiKey((await revealApiKey(password)).apiKey), "API key 已显示。")}>显示</Button><Button disabled={busy || !password} variant="danger" onClick={() => void run(async () => setApiKey((await revealApiKey(password, true)).apiKey), "API key 已轮换。")}>轮换</Button></div>
        </section>
      </main>
    </RouteGuard>
  );
}

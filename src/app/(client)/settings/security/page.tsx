"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { SettingsNav } from "@/features/security/SettingsNav";
import {
  addYubiKey,
  beginTotpSetup,
  createAccountPasskey,
  createTwoFactorPasskey,
  deleteAccountPasskey,
  deleteTwoFactorPasskey,
  disableTwoFactor,
  finishTotpSetup,
  listAccountPasskeys,
  listTwoFactorCredentials,
  renameTwoFactorCredential,
  rotateRecoveryCodes,
  type AccountPasskeySummary,
  type TwoFactorCredential,
} from "@/features/security/api";
import { useSession } from "@/lib/client/state/session-store";

export default function SecuritySettingsPage() {
  const session = useSession();
  const [credentials, setCredentials] = useState<TwoFactorCredential[]>([]);
  const [credentialNames, setCredentialNames] = useState<Record<string, string>>({});
  const [passkeys, setPasskeys] = useState<AccountPasskeySummary[]>([]);
  const [password, setPassword] = useState("");
  const [totpKey, setTotpKey] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [totpName, setTotpName] = useState("Authenticator");
  const [yubikeyOtp, setYubikeyOtp] = useState("");
  const [twoFactorPasskeyName, setTwoFactorPasskeyName] = useState("安全密钥");
  const [passkeyName, setPasskeyName] = useState("我的 Passkey");
  const [directUnlock, setDirectUnlock] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [nextCredentials, nextPasskeys] = await Promise.all([
      listTwoFactorCredentials(),
      session.capabilities["auth.accountPasskey"] ? listAccountPasskeys() : Promise.resolve([]),
    ]);
    setCredentials(nextCredentials);
    setCredentialNames(Object.fromEntries(nextCredentials.map((credential) => [credential.id, credential.name])));
    setPasskeys(nextPasskeys);
  }, [session.capabilities]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) => setError(reason instanceof Error ? reason.message : "无法加载安全凭据。"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string, reload = true) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); if (reload) await load(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); }
  };

  return (
    <RouteGuard requireOnline>
      <main className="settings-page">
        <SettingsNav />
        <header className="settings-header"><h1>安全凭据</h1><p>管理二步验证、恢复码与账号 Passkey。所有变更均需要用途绑定的再次验证。</p></header>
        {error ? <p className="tool-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
        <section className="settings-card settings-grid"><h2>再次验证</h2><Field label="当前主密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field></section>
        <section className="settings-card"><h2>已配置的二步验证</h2>
          <div className="settings-list">{credentials.length ? credentials.map((credential) => <div key={credential.id} className="settings-row"><ShieldCheck size={18} aria-hidden="true" /><div><Input aria-label={`${credential.name} 的名称`} value={credentialNames[credential.id] ?? credential.name} disabled={credential.id === "legacy-totp"} onChange={(event) => setCredentialNames({ ...credentialNames, [credential.id]: event.target.value })} /><span>{credential.provider} · {credential.status}</span></div><Button size="sm" disabled={busy || !password || credential.id === "legacy-totp" || !credentialNames[credential.id]?.trim() || credentialNames[credential.id] === credential.name} onClick={() => void run(() => renameTwoFactorCredential(credential.id, credentialNames[credential.id], password), "验证方式名称已更新。")}>保存名称</Button><Button size="sm" variant="danger" icon={Trash2} disabled={busy || !password} onClick={() => void run(() => credential.provider === "webauthn" ? deleteTwoFactorPasskey(credential.id, password) : disableTwoFactor(credential.type, password), "验证方式已禁用。")}>禁用</Button></div>) : <p>尚未配置二步验证。</p>}</div>
        </section>
        <section className="settings-card settings-grid"><h2>验证器 (TOTP)</h2>
          {!totpKey ? <div className="settings-actions"><Button icon={Plus} disabled={busy || !password} onClick={() => void run(async () => { const setup = await beginTotpSetup(password); setTotpKey(setup.key); setTotpUri(setup.uri); }, "已生成待确认密钥。", false)}>开始设置</Button></div> : <>
            <Field label="密钥"><Input readOnly value={totpKey} /></Field><Field label="OTP Auth URI"><Input readOnly value={totpUri} /></Field><Field label="名称"><Input value={totpName} onChange={(event) => setTotpName(event.target.value)} /></Field><Field label="6 位验证码"><Input inputMode="numeric" autoComplete="one-time-code" value={totpToken} onChange={(event) => setTotpToken(event.target.value)} /></Field>
            <div className="settings-actions"><Button variant="primary" disabled={busy || totpToken.length !== 6} onClick={() => void run(async () => { const result = await finishTotpSetup({ password, key: totpKey, token: totpToken, name: totpName }); setRecoveryCodes([result.recoveryCode]); setTotpKey(""); setTotpToken(""); }, "验证器已启用。")}>确认启用</Button></div>
          </>}
        </section>
        {session.capabilities["auth.yubikey"] ? <section className="settings-card settings-grid"><h2>YubiKey OTP</h2><Field label="名称"><Input value={totpName} onChange={(event) => setTotpName(event.target.value)} /></Field><Field label="触碰 YubiKey 生成 OTP"><Input value={yubikeyOtp} onChange={(event) => setYubikeyOtp(event.target.value.trim())} /></Field><div className="settings-actions"><Button disabled={busy || !password || yubikeyOtp.length !== 44} onClick={() => void run(async () => { await addYubiKey({ password, otp: yubikeyOtp, name: totpName }); setYubikeyOtp(""); }, "YubiKey 已添加。")}>添加 YubiKey</Button></div></section> : null}
        {session.capabilities["auth.twoFactorPasskey"] ? <section className="settings-card settings-grid"><h2>二步验证 Passkey</h2><p>使用安全密钥、平台验证器或密码管理器作为登录后的第二步验证。</p><Field label="名称"><Input value={twoFactorPasskeyName} onChange={(event) => setTwoFactorPasskeyName(event.target.value)} /></Field><div className="settings-actions"><Button icon={Plus} disabled={busy || !password || !twoFactorPasskeyName.trim()} onClick={() => void run(async () => { const result = await createTwoFactorPasskey({ password, name: twoFactorPasskeyName }); setRecoveryCodes([result.recoveryCode]); }, "二步验证 Passkey 已添加。")}>添加二步验证 Passkey</Button></div></section> : null}
        <section className="settings-card"><h2>恢复码</h2><p>新代码只显示一次，生成后旧代码立即失效。</p>{recoveryCodes.length ? <pre className="settings-secret">{recoveryCodes.join("\n")}</pre> : null}<div className="settings-actions"><Button icon={RefreshCw} disabled={busy || !password} onClick={() => void run(async () => setRecoveryCodes((await rotateRecoveryCodes(password)).codes), "恢复码已轮换。", false)}>重新生成</Button></div></section>
        <section className="settings-card settings-grid"><h2>账号 Passkey</h2>
          {!session.capabilities["auth.accountPasskey"] ? <p>当前实例未启用账号 Passkey。</p> : <><div className="settings-list">{passkeys.map((passkey) => <div key={passkey.id} className="settings-row"><KeyRound size={18} aria-hidden="true" /><div><strong>{passkey.name}</strong><span>{passkey.directUnlock ? "登录 + 直接解锁" : "仅登录"}</span></div><Button size="sm" variant="danger" icon={Trash2} disabled={busy || !password} onClick={() => void run(() => deleteAccountPasskey(passkey.id, password), "Passkey 已删除。")}>删除</Button></div>)}</div><Field label="新 Passkey 名称"><Input value={passkeyName} onChange={(event) => setPasskeyName(event.target.value)} /></Field>{session.capabilities["auth.passkeyDirectUnlock"] ? <label className="settings-choice"><input type="checkbox" checked={directUnlock} onChange={(event) => setDirectUnlock(event.target.checked)} /><span><strong>启用直接解锁</strong><small>使用 WebAuthn PRF 在验证器中派生包装密钥；不支持时不会保存直接解锁机密。</small></span></label> : null}<div className="settings-actions"><Button icon={Plus} disabled={busy || !password || !passkeyName.trim()} onClick={() => void run(() => createAccountPasskey({ password, name: passkeyName, directUnlock }), directUnlock ? "直接解锁 Passkey 已添加。" : "Passkey 已添加。")}>添加 Passkey</Button></div>{session.capabilities["auth.passkeyDirectUnlock"] ? <p className="settings-note">直接解锁仅在浏览器返回可用 PRF 包装后开放；普通 Passkey 始终可安全用于登录。</p> : null}</>}
        </section>
      </main>
    </RouteGuard>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
import { TwoFactorChallenge } from "@/features/auth/TwoFactorChallenge";
import {
  cancelPreparedLogin,
  fetchServerConfig,
  loginWithPasskey,
  preparePasswordLogin,
  submitPasswordLogin,
  TwoFactorRequiredError,
  type PreparedPasswordLogin,
} from "@/features/auth/api";
import { sessionStore } from "@/lib/client/state/session-store";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [prepared, setPrepared] = useState<PreparedPasswordLogin | null>(null);
  const [providers, setProviders] = useState<number[]>([]);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchServerConfig()
      .then((config) => setPasskeyEnabled(config.vercelwarden.capabilities["auth.accountPasskey"]))
      .catch(() => setPasskeyEnabled(false));
    return () => cancelPreparedLogin(prepared);
  }, [prepared]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    let nextPrepared: PreparedPasswordLogin | null = null;
    try {
      nextPrepared = await preparePasswordLogin(email, password);
      setPassword("");
      await submitPasswordLogin(nextPrepared);
      router.replace("/vault");
    } catch (caught) {
      if (caught instanceof TwoFactorRequiredError) {
        setPrepared(caught.prepared);
        setProviders(caught.providers);
      } else {
        cancelPreparedLogin(nextPrepared);
        setError(caught instanceof Error ? caught.message : "登录失败，请重试。");
      }
    } finally {
      setLoading(false);
    }
  }

  if (prepared && providers.length > 0) {
    return (
      <TwoFactorChallenge
        providers={providers}
        loading={loading}
        error={error}
        onCancel={() => {
          cancelPreparedLogin(prepared);
          setPrepared(null);
          setProviders([]);
          setError("");
        }}
        onSubmit={async (provider, token) => {
          setLoading(true);
          setError("");
          try {
            await submitPasswordLogin(prepared, { provider, token });
            router.replace("/vault");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "验证失败，请重试。");
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <div className="auth-panel__heading">
        <h1 id="login-title">登录密码库</h1>
        <p>主密码只在此设备上用于派生解密密钥。</p>
      </div>
      <form className="auth-form" onSubmit={signIn}>
        <Field label="邮箱">
          <Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
        </Field>
        <Field label="主密码">
          <Input type="password" autoComplete="current-password" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <Button variant="primary" type="submit" disabled={loading || !email || !password}>
          {loading ? "正在登录" : "登录"}
        </Button>
      </form>
      {passkeyEnabled ? (
        <Button
          icon={KeyRound}
          onClick={async () => {
            setLoading(true);
            setError("");
            try {
              await loginWithPasskey();
              router.replace(sessionStore.getSnapshot().phase === "unlocked" ? "/vault" : "/lock");
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Passkey 登录未完成。");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
        >
          使用 Passkey
        </Button>
      ) : null}
      <p className="auth-panel__footer">还没有账号？ <a className="auth-link" href="/register">创建账号</a></p>
    </section>
  );
}

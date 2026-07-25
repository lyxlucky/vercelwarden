"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/primitives";
import { recoverTwoFactor } from "@/features/auth/api";

export default function RecoverTwoFactorPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await recoverTwoFactor(email, password, code);
      router.replace("/login?recovered=1");
    } catch {
      setError("恢复信息无效或已经使用。");
    } finally {
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="recover-title">
      <div className="auth-panel__heading">
        <h1 id="recover-title">使用恢复码</h1>
        <p>成功后将禁用二步验证并撤销所有现有设备会话。</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <Field label="邮箱"><Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></Field>
        <Field label="主密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
        <Field label="恢复码"><Input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required /></Field>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <Button variant="danger" type="submit" disabled={loading}>{loading ? "正在验证" : "恢复账号"}</Button>
      </form>
      <a className="auth-link" href="/login">返回登录</a>
    </section>
  );
}


"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/primitives";
import { fetchServerConfig, registerAccount } from "@/features/auth/api";
import { TaskState } from "@/components/feedback/TaskState";

export default function RegisterPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<{ enabled: boolean; inviteRequired: boolean } | null>(null);
  const [values, setValues] = useState({ email: "", name: "", password: "", confirm: "", hint: "", invitationCode: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchServerConfig()
      .then((config) => setPolicy(config.vercelwarden.registration))
      .catch(() => setError("无法读取当前实例的注册策略。"));
  }, []);

  function update(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (values.password !== values.confirm) {
      setError("两次输入的主密码不一致。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await registerAccount({
        email: values.email,
        name: values.name,
        password: values.password,
        passwordHint: values.hint,
        invitationCode: values.invitationCode,
      });
      router.replace("/login?registered=1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号创建失败，请检查输入后重试。");
    } finally {
      setLoading(false);
    }
  }

  if (!policy && !error) return <TaskState kind="loading" title="正在读取注册策略" />;
  if (policy && !policy.enabled) {
    return <TaskState kind="forbidden" title="当前实例未开放注册" secondaryAction={<a className="auth-link" href="/login">返回登录</a>} />;
  }

  return (
    <section className="auth-panel auth-panel--wide" aria-labelledby="register-title">
      <div className="auth-panel__heading">
        <h1 id="register-title">创建账号</h1>
        <p>加密密钥在本设备生成，服务端只保存密文和登录验证哈希。</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-form__row">
          <Field label="邮箱"><Input type="email" autoComplete="username" value={values.email} onChange={(event) => update("email", event.target.value)} required autoFocus /></Field>
          <Field label="名称"><Input autoComplete="name" value={values.name} onChange={(event) => update("name", event.target.value)} required /></Field>
        </div>
        {policy?.inviteRequired ? <Field label="邀请码"><Input value={values.invitationCode} onChange={(event) => update("invitationCode", event.target.value)} required /></Field> : null}
        <div className="auth-form__row">
          <Field label="主密码"><Input type="password" autoComplete="new-password" spellCheck={false} value={values.password} onChange={(event) => update("password", event.target.value)} minLength={12} required /></Field>
          <Field label="确认主密码"><Input type="password" autoComplete="new-password" spellCheck={false} value={values.confirm} onChange={(event) => update("confirm", event.target.value)} required /></Field>
        </div>
        <Field label="密码提示" hint="可选。不要在提示中包含主密码。"><Input value={values.hint} onChange={(event) => update("hint", event.target.value)} maxLength={200} /></Field>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <div className="auth-actions">
          <Button variant="primary" type="submit" disabled={loading || !policy?.enabled}>{loading ? "正在创建" : "创建账号"}</Button>
          <Button variant="ghost" onClick={() => router.push("/login")} disabled={loading}>取消</Button>
        </div>
      </form>
    </section>
  );
}


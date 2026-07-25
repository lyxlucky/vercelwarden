"use client";

import { useState } from "react";
import { Button, Field, Input, Tabs } from "@/components/primitives";

const providerLabels: Record<number, string> = { 0: "验证器", 3: "YubiKey", 7: "Passkey" };

export function TwoFactorChallenge({
  providers,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  providers: number[];
  loading: boolean;
  error?: string;
  onSubmit(provider: number, token: string): Promise<void>;
  onCancel(): void;
}) {
  const [provider, setProvider] = useState(String(providers[0] ?? 0));
  const [token, setToken] = useState("");
  const selected = Number(provider);
  return (
    <section className="auth-panel" aria-labelledby="two-factor-title">
      <div className="auth-panel__heading">
        <h1 id="two-factor-title">二步验证</h1>
        <p>选择已配置的验证方式完成登录。</p>
      </div>
      <Tabs.Root value={provider} defaultValue={provider} onValueChange={(value) => { setProvider(value); setToken(""); }}>
        <Tabs.List aria-label="二步验证方式">
          {providers.map((id) => <Tabs.Trigger key={id} value={String(id)}>{providerLabels[id] ?? `方式 ${id}`}</Tabs.Trigger>)}
        </Tabs.List>
      </Tabs.Root>
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void onSubmit(selected, token); }}>
        <Field label={selected === 3 ? "YubiKey OTP" : selected === 7 ? "Passkey 响应" : "验证码"}>
          <Input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            inputMode={selected === 0 ? "numeric" : "text"}
            autoComplete="one-time-code"
            required
            autoFocus
          />
        </Field>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <div className="auth-actions">
          <Button variant="primary" type="submit" disabled={loading || !token}>验证</Button>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>取消</Button>
        </div>
      </form>
      <a className="auth-link" href="/recover-2fa">使用恢复码</a>
    </section>
  );
}


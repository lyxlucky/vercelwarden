"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
import { useSession } from "@/lib/client/state/session-store";
import { unlockWithPasskey, unlockWithPassword } from "@/features/auth/api";
import { lockController } from "@/features/auth/lock-controller";

export default function LockPage() {
  const session = useSession();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.phase === "anonymous") router.replace("/login");
    if (session.phase === "unlocked" || session.phase === "unlocked-offline") router.replace("/vault");
  }, [router, session.phase]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await unlockWithPassword(password);
      router.replace("/vault");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法解锁密码库。");
    } finally {
      setPassword("");
      setLoading(false);
    }
  }

  async function passkeyUnlock() {
    setLoading(true);
    setError("");
    try {
      await unlockWithPasskey();
      router.replace("/vault");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法使用 Passkey 解锁密码库。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="lock-title">
      <div className="auth-lock-icon"><LockKeyhole size={24} aria-hidden="true" /></div>
      <div className="auth-panel__heading">
        <h1 id="lock-title">密码库已锁定</h1>
        <p>{session.user?.email ?? "当前账号"}</p>
      </div>
      <form className="auth-form" onSubmit={unlock}>
        <Field label="主密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></Field>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <Button variant="primary" type="submit" disabled={loading || !password}>{loading ? "正在解锁" : "解锁"}</Button>
      </form>
      {session.capabilities["auth.accountPasskey"] ? <Button icon={KeyRound} disabled={loading} onClick={() => void passkeyUnlock()}>使用 Passkey 解锁</Button> : null}
      <Button variant="ghost" onClick={() => void lockController.logout()}>退出账号</Button>
    </section>
  );
}

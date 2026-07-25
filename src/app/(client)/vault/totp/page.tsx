"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { fetchVaultSnapshot } from "@/features/vault/api";
import { buildTotpCodeViews, type TotpCodeView } from "@/features/security/totp-codes";
import type { VaultItemView } from "@/features/vault/store";

export default function TotpPage() {
  const [items, setItems] = useState<TotpCodeView[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultItemView[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const refresh = async () => {
    try {
      const snapshot = await fetchVaultSnapshot();
      setVaultItems(snapshot.items);
      setError(null);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "无法加载验证码。"); }
  };
  useEffect(() => {
    let active = true;
    void fetchVaultSnapshot().then(async (snapshot) => {
      if (!active) return;
      setVaultItems(snapshot.items);
      setItems(await buildTotpCodeViews(snapshot.items));
      setError(null);
    }).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : "无法加载验证码。"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void buildTotpCodeViews(vaultItems, now).then((next) => { if (active) setItems(next); });
    return () => { active = false; };
  }, [now, vaultItems]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? items.filter((item) => `${item.name}\n${item.username}\n${item.config.issuer}\n${item.config.accountName}`.toLocaleLowerCase().includes(normalized)) : items;
  }, [items, query]);
  return <RouteGuard><main className="tool-page"><header className="tool-page__header"><div><Link href="/vault">← 返回密码库</Link><h1>验证码</h1><p>集中查看密码库中的标准与 Steam TOTP。</p></div><Button icon={RefreshCw} onClick={() => void refresh()}>刷新</Button></header><section className="tool-card"><Input aria-label="搜索验证码" placeholder="搜索项目或账号" value={query} onChange={(event) => setQuery(event.target.value)} />{error ? <p className="vw-field__error">{error}</p> : null}<div className="totp-grid">{filtered.map((item) => <article className="totp-card" key={item.itemId}><div><Link href={`/vault?item=${encodeURIComponent(item.itemId)}`}>{item.name}</Link><span>{item.username || item.config.accountName}</span></div><code>{item.code}</code><progress max={item.config.period} value={item.remaining} /><Button size="sm" icon={copied === item.itemId ? Check : Copy} onClick={async () => { await navigator.clipboard.writeText(item.code); setCopied(item.itemId); window.setTimeout(() => setCopied(null), 1500); }}>{copied === item.itemId ? "已复制" : `${item.remaining} 秒`}</Button></article>)}</div>{!error && filtered.length === 0 ? <p className="tool-empty">没有可显示的验证码。</p> : null}</section></main></RouteGuard>;
}

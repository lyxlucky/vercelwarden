"use client";

import Link from "next/link";
import { useState } from "react";
import { RefreshCw, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { fetchVaultSnapshot } from "@/features/vault/api";
import { checkBreachedPasswords, classifyPasswordHealth, type PasswordRiskItem } from "@/features/security/password-health";

const LAST_CHECK_KEY = "vercelwarden.password-health.last-check";

function RiskList({ title, items, detail }: { title: string; items: PasswordRiskItem[]; detail(item: PasswordRiskItem): string }) {
  return <section className="tool-card risk-section"><h2>{title}<span>{items.length}</span></h2>{items.length === 0 ? <p className="tool-empty">未发现此类项目。</p> : items.map((item) => <Link className="risk-row" key={item.itemId} href={`/vault?item=${encodeURIComponent(item.itemId)}`}><div><strong>{item.name}</strong><span>{item.username}</span></div><span>{detail(item)}</span></Link>)}</section>;
}

export default function PasswordHealthPage() {
  const [results, setResults] = useState<PasswordRiskItem[]>([]);
  const [lastChecked, setLastChecked] = useState<string | null>(() => typeof window === "undefined" ? null : localStorage.getItem(LAST_CHECK_KEY));
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const scan = async () => {
    setBusy(true);
    try {
      const snapshot = await fetchVaultSnapshot();
      setResults(await checkBreachedPasswords(classifyPasswordHealth(snapshot.items)));
      const checked = new Date().toISOString();
      localStorage.setItem(LAST_CHECK_KEY, checked);
      setLastChecked(checked);
      setStarted(true);
    } finally { setBusy(false); }
  };
  const unknown = results.filter((item) => item.breached === "unknown");
  return <RouteGuard><main className="tool-page"><header className="tool-page__header"><div><Link href="/vault">← 返回密码库</Link><h1>密码健康</h1><p>检查只在用户主动触发后执行；未知泄露状态不会标记为安全。</p>{lastChecked ? <small>上次检查：{new Date(lastChecked).toLocaleString("zh-CN")}</small> : null}</div><Button variant="primary" icon={RefreshCw} disabled={busy} onClick={() => void scan()}>{busy ? "检查中…" : started ? "重新检查" : "开始检查"}</Button></header>{!started ? <section className="tool-card health-intro"><ShieldAlert size={42} /><h2>尚未运行检查</h2><p>将分析弱密码、重复密码，并以 HIBP k-anonymity 查询泄露情况。完整密码不会发送到外部服务。</p></section> : <><RiskList title="弱密码" items={results.filter((item) => item.weak)} detail={() => "建议更换"} /><RiskList title="重复密码" items={results.filter((item) => item.reused)} detail={() => "多个项目共用"} /><RiskList title="已知泄露" items={results.filter((item) => item.breached === "yes")} detail={(item) => `${item.breachCount?.toLocaleString() ?? 0} 次`} />{unknown.length > 0 ? <section className="tool-card health-unavailable"><ShieldQuestion size={28} /><div><h2>泄露检查未完成</h2><p>{unknown.length} 个项目因外部数据源不可用而保持未知状态，请稍后重试。</p></div></section> : null}</>}</main></RouteGuard>;
}

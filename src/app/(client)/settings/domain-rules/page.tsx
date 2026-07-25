"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { fetchDomainSettings, saveDomainSettings, type DomainSettingsResponse } from "@/features/domains/api";
import type { CustomEquivalentDomainGroup } from "@/features/domains/domain-rules";
import { SettingsNav } from "@/features/security/SettingsNav";

function lines(value: string) {
  return value.split(/\r?\n|,/u).map((item) => item.trim()).filter(Boolean);
}

export default function DomainRulesPage() {
  const [settings, setSettings] = useState<DomainSettingsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { void fetchDomainSettings().then(setSettings).catch((reason) => setError(reason instanceof Error ? reason.message : "域名规则加载失败。")); }, []);
  const globals = useMemo(() => settings?.globalEquivalentDomains.filter((group) => `${group.name} ${group.domains.join(" ")}`.toLowerCase().includes(search.toLowerCase())) ?? [], [search, settings]);

  const updateCustom = (id: string, patch: Partial<CustomEquivalentDomainGroup>) => setSettings((current) => current ? ({ ...current, customEquivalentDomains: current.customEquivalentDomains.map((group) => group.id === id ? { ...group, ...patch } : group) }) : current);
  const save = async () => {
    if (!settings) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await saveDomainSettings({
        equivalentDomains: settings.equivalentDomains,
        customEquivalentDomains: settings.customEquivalentDomains,
        excludedGlobalDomainIds: settings.excludedGlobalDomainIds,
      });
      setSettings(updated); setMessage("域名规则已规范化并保存。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败。"); }
    finally { setBusy(false); }
  };

  return (
    <RouteGuard capability="domainRules.write" requireOnline unavailableFallback={<p className="tool-error">当前实例未启用域名规则写入。</p>}>
      <main className="settings-page"><SettingsNav /><header className="settings-header"><h1>域名规则</h1><p>协议、路径、大小写、端口与 IDNA 会在服务端统一规范化；同一域名不能出现在多个组。</p></header>
        {error ? <p className="tool-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
        <section className="settings-card"><div className="settings-section-heading"><div><h2>自定义等效域名组</h2><p>每组至少两个不同域名，每行一个。</p></div><Button icon={Plus} onClick={() => setSettings((current) => current ? ({ ...current, customEquivalentDomains: [...current.customEquivalentDomains, { id: crypto.randomUUID(), enabled: true, domains: ["example.com", "www.example.com"] }] }) : current)}>新增组</Button></div>
          <div className="domain-groups">{settings?.customEquivalentDomains.map((group) => <article key={group.id} className="domain-group"><div className="domain-group__heading"><Field label="组 ID"><Input value={group.id} onChange={(event) => updateCustom(group.id, { id: event.target.value })} /></Field><label className="tool-check"><input type="checkbox" checked={group.enabled} onChange={(event) => updateCustom(group.id, { enabled: event.target.checked })} />启用</label><Button icon={Trash2} variant="danger" onClick={() => setSettings((current) => current ? ({ ...current, customEquivalentDomains: current.customEquivalentDomains.filter((item) => item.id !== group.id) }) : current)}>删除</Button></div><Field label="域名"><textarea className="vw-input settings-textarea" value={group.domains.join("\n")} onChange={(event) => updateCustom(group.id, { domains: lines(event.target.value) })} /></Field></article>)}</div>
        </section>
        <section className="settings-card"><h2>兼容等效域名组</h2><p>用于兼容既有客户端同步格式。</p><div className="domain-groups">{settings?.equivalentDomains.map((group, index) => <article className="domain-group" key={index}><Field label={`组 ${index + 1}`}><textarea className="vw-input settings-textarea" value={group.join("\n")} onChange={(event) => setSettings((current) => current ? ({ ...current, equivalentDomains: current.equivalentDomains.map((item, itemIndex) => itemIndex === index ? lines(event.target.value) : item) }) : current)} /></Field><Button size="sm" variant="danger" onClick={() => setSettings((current) => current ? ({ ...current, equivalentDomains: current.equivalentDomains.filter((_, itemIndex) => itemIndex !== index) }) : current)}>删除组</Button></article>)}</div><Button icon={Plus} onClick={() => setSettings((current) => current ? ({ ...current, equivalentDomains: [...current.equivalentDomains, ["example.com", "www.example.com"]] }) : current)}>新增兼容组</Button></section>
        <section className="settings-card"><h2>排除全局等效域名</h2><Field label="搜索全局规则"><Input value={search} onChange={(event) => setSearch(event.target.value)} /></Field><div className="global-domain-list">{globals.map((group) => <label key={group.id}><input type="checkbox" checked={settings?.excludedGlobalDomainIds.includes(group.id) ?? false} onChange={(event) => setSettings((current) => current ? ({ ...current, excludedGlobalDomainIds: event.target.checked ? [...current.excludedGlobalDomainIds, group.id] : current.excludedGlobalDomainIds.filter((id) => id !== group.id) }) : current)} /><span><strong>{group.name}</strong><small>{group.domains.join(" · ")}</small></span></label>)}</div></section>
        <div className="settings-sticky-actions"><Button icon={Save} variant="primary" disabled={busy || !settings} onClick={() => void save()}>保存域名规则</Button></div>
      </main>
    </RouteGuard>
  );
}

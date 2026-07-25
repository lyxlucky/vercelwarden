"use client";

import { useEffect, useMemo, useState } from "react";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { Alert, Box, Button, Checkbox, FormControlLabel, List, ListItem, ListItemText, Stack, TextField } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { fetchDomainSettings, saveDomainSettings, type DomainSettingsResponse } from "@/features/domains/api";
import type { CustomEquivalentDomainGroup } from "@/features/domains/domain-rules";

function lines(value: string) { return value.split(/\r?\n|,/u).map((item) => item.trim()).filter(Boolean); }

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
      const updated = await saveDomainSettings({ equivalentDomains: settings.equivalentDomains, customEquivalentDomains: settings.customEquivalentDomains, excludedGlobalDomainIds: settings.excludedGlobalDomainIds });
      setSettings(updated); setMessage("域名规则已规范化并保存。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败。"); }
    finally { setBusy(false); }
  };

  return (
    <RouteGuard capability="domainRules.write" requireOnline unavailableFallback={<AsyncState kind="forbidden" title="当前实例未启用域名规则写入" />}>
      <Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0, pb: 10 }}>
        <PageHeader title="域名规则" description="协议、路径、大小写、端口与 IDNA 会在服务端统一规范化；同一域名不能出现在多个组。" />
        {error ? <AsyncState kind="fatal" title="域名规则操作失败" description={error} /> : null}
        {message ? <Alert severity="success" role="status">{message}</Alert> : null}
        {!settings && !error ? <AsyncState kind="loading" description="正在加载域名规则。" /> : null}

        <SectionCard title="自定义等效域名组" description="每组至少两个不同域名，每行一个。" action={<Button startIcon={<AddOutlined />} onClick={() => setSettings((current) => current ? ({ ...current, customEquivalentDomains: [...current.customEquivalentDomains, { id: crypto.randomUUID(), enabled: true, domains: ["example.com", "www.example.com"] }] }) : current)}>新增组</Button>}>
          <Stack spacing={2}>{settings?.customEquivalentDomains.map((group) => <Box component="article" key={group.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 3 }}><Stack spacing={2}><TextField label="组 ID" value={group.id} onChange={(event) => updateCustom(group.id, { id: event.target.value })} /><FormControlLabel control={<Checkbox checked={group.enabled} onChange={(event) => updateCustom(group.id, { enabled: event.target.checked })} />} label="启用" /><TextField label="域名" multiline minRows={4} value={group.domains.join("\n")} onChange={(event) => updateCustom(group.id, { domains: lines(event.target.value) })} /><Button color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => setSettings((current) => current ? ({ ...current, customEquivalentDomains: current.customEquivalentDomains.filter((item) => item.id !== group.id) }) : current)}>删除</Button></Stack></Box>)}</Stack>
        </SectionCard>

        <SectionCard title="兼容等效域名组" description="用于兼容既有客户端同步格式。">
          <Stack spacing={2}>{settings?.equivalentDomains.map((group, index) => <Box component="article" key={index} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 3 }}><Stack spacing={1.5}><TextField label={`组 ${index + 1}`} multiline minRows={3} value={group.join("\n")} onChange={(event) => setSettings((current) => current ? ({ ...current, equivalentDomains: current.equivalentDomains.map((item, itemIndex) => itemIndex === index ? lines(event.target.value) : item) }) : current)} /><Button size="small" color="error" onClick={() => setSettings((current) => current ? ({ ...current, equivalentDomains: current.equivalentDomains.filter((_, itemIndex) => itemIndex !== index) }) : current)}>删除组</Button></Stack></Box>)}<Button startIcon={<AddOutlined />} onClick={() => setSettings((current) => current ? ({ ...current, equivalentDomains: [...current.equivalentDomains, ["example.com", "www.example.com"]] }) : current)}>新增兼容组</Button></Stack>
        </SectionCard>

        <SectionCard title="排除全局等效域名">
          <Stack spacing={2}><TextField label="搜索全局规则" value={search} onChange={(event) => setSearch(event.target.value)} /><List disablePadding>{globals.map((group) => <ListItem key={group.id} divider disableGutters><Checkbox edge="start" slotProps={{ input: { "aria-label": `排除 ${group.name}` } }} checked={settings?.excludedGlobalDomainIds.includes(group.id) ?? false} onChange={(event) => setSettings((current) => current ? ({ ...current, excludedGlobalDomainIds: event.target.checked ? [...current.excludedGlobalDomainIds, group.id] : current.excludedGlobalDomainIds.filter((id) => id !== group.id) }) : current)} /><ListItemText primary={group.name} secondary={group.domains.join(" · ")} /></ListItem>)}</List></Stack>
        </SectionCard>
        <Box sx={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "flex-end", pointerEvents: "none" }}><Button startIcon={<SaveOutlined />} variant="contained" disabled={busy || !settings} onClick={() => void save()} sx={{ pointerEvents: "auto", boxShadow: 4 }}>保存域名规则</Button></Box>
      </Stack>
    </RouteGuard>
  );
}

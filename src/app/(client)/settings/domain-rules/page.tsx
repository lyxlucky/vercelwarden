"use client";

import { useEffect, useState } from "react";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { AsyncState } from "@/components/ui/AsyncState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { fetchDomainSettings, saveDomainSettings, type DomainSettingsResponse } from "@/features/domains/api";
import { normalizeDomainName, type DomainSettingsInput } from "@/features/domains/domain-rules";

interface DomainGroupDraft {
  id: string;
  text: string;
  enabled?: boolean;
}

function createDraft(settings: DomainSettingsResponse) {
  return {
    groups: settings.customEquivalentDomains.map(({ id, domains, enabled }): DomainGroupDraft => ({
      id, text: domains.join("\n"), enabled,
    })),
    compatibilityGroups: settings.equivalentDomains.map((domains): DomainGroupDraft => ({
      id: crypto.randomUUID(), text: domains.join("\n"),
    })),
    excluded: settings.excludedGlobalDomainIds,
  };
}

function buildSettings(draft: ReturnType<typeof createDraft>): DomainSettingsInput {
  const seen = new Set<string>();
  function readGroup(text: string, label: string) {
    const entries = text.split(/[\r\n,，]+/u).map((item) => item.trim()).filter(Boolean);
    if (entries.length < 2 || entries.length > 50) throw new Error(label + "需填写 2 到 50 个域名。");
    return entries.map((entry) => {
      let domain: string;
      try {
        domain = normalizeDomainName(entry);
      } catch {
        throw new Error(label + "包含无效域名：" + entry);
      }
      if (seen.has(domain)) throw new Error("域名 " + domain + " 重复，请在所有组中只保留一次。");
      seen.add(domain);
      return domain;
    });
  }
  return {
    customEquivalentDomains: draft.groups.map((group, index) => ({
      id: group.id,
      enabled: group.enabled ?? true,
      domains: readGroup(group.text, "自定义组 " + (index + 1) + " "),
    })),
    equivalentDomains: draft.compatibilityGroups.map((group, index) =>
      readGroup(group.text, "兼容组 " + (index + 1) + " ")),
    excludedGlobalDomainIds: draft.excluded,
  };
}

function DomainGroupEditor({ groups, label, disabled, onChange }: {
  groups: DomainGroupDraft[];
  label: string;
  disabled: boolean;
  onChange: (groups: DomainGroupDraft[]) => void;
}) {
  const update = (id: string, patch: Partial<DomainGroupDraft>) => {
    onChange(groups.map((group) => group.id === id ? { ...group, ...patch } : group));
  };

  return groups.length === 0 ? (
    <Typography variant="body2" color="text.secondary">暂无{label}。</Typography>
  ) : (
    <Stack spacing={2}>
      {groups.map((group, index) => {
        const groupLabel = label + " " + (index + 1);
        return (
          <Stack component="article" key={group.id} spacing={1.5} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
            <TextField
              label={groupLabel + " 的域名"}
              placeholder={"example.com\nexample.org"}
              multiline
              minRows={3}
              disabled={disabled}
              value={group.text}
              onChange={(event) => update(group.id, { text: event.target.value })}
            />
            <ActionGroup compact sx={{ justifyContent: group.enabled !== undefined ? "space-between" : "flex-end" }}>
              {group.enabled !== undefined ? (
                <FormControlLabel
                  control={<Checkbox checked={group.enabled} disabled={disabled} onChange={(_, enabled) => update(group.id, { enabled })} />}
                  label="启用此组"
                />
              ) : null}
              <Button size="small" color="error" aria-label={"删除" + groupLabel} startIcon={<DeleteOutlineOutlined />} disabled={disabled}
                onClick={() => onChange(groups.filter((item) => item.id !== group.id))}>
                删除
              </Button>
            </ActionGroup>
          </Stack>
        );
      })}
    </Stack>
  );
}

function DomainRulesEditor() {
  const [catalog, setCatalog] = useState<DomainSettingsResponse["globalEquivalentDomains"]>([]);
  const [draft, setDraft] = useState<ReturnType<typeof createDraft> | null>(null);
  const [search, setSearch] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchDomainSettings().then((settings) => {
      if (!active) return;
      setDraft(createDraft(settings));
      setCatalog(settings.globalEquivalentDomains);
    }).catch((reason: unknown) => {
      if (active) setLoadError(reason instanceof Error ? reason.message : "无法加载域名规则。");
    });
    return () => { active = false; };
  }, [loadAttempt]);

  const update = (patch: Partial<ReturnType<typeof createDraft>>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
    setSaved(false);
    setSaveError("");
  };

  const save = async () => {
    if (!draft || !dirty || busy) return;
    setBusy(true);
    setSaveError("");
    try {
      const settings = await saveDomainSettings(buildSettings(draft));
      setDraft(createDraft(settings));
      setCatalog(settings.globalEquivalentDomains);
      setDirty(false);
      setSaved(true);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const query = search.trim().toLowerCase();
  const globals = catalog.filter((group) =>
    group.name.toLowerCase().includes(query) || group.domains.some((domain) => domain.toLowerCase().includes(query)));

  return (
    <Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0 }}>
      <PageHeader title="域名规则" description="将共用登录凭据的网站归为等效域名组。保存后，支持域名规则的客户端会在同步时获取设置。" />
      {loadError ? (
        <AsyncState kind="fatal" title="无法加载域名规则" description={loadError} actionLabel="重试" onAction={() => {
          setLoadError("");
          setLoadAttempt((attempt) => attempt + 1);
        }} />
      ) : null}
      {!draft && !loadError ? <AsyncState kind="loading" title="正在加载域名规则" /> : null}
      {draft ? (
        <>
          <SectionCard
            title="自定义等效域名组"
            description="每组至少两个域名，每行一个，也可以用逗号分隔。"
            action={<Button startIcon={<AddOutlined />} disabled={busy} onClick={() => update({
              groups: [...draft.groups, { id: crypto.randomUUID(), enabled: true, text: "" }],
            })}>新增组</Button>}
          >
            <DomainGroupEditor groups={draft.groups} label="自定义组" disabled={busy} onChange={(groups) => update({ groups })} />
          </SectionCard>

          <SectionCard title="排除全局等效域名" description="勾选后，该内置组会从此账户的等效域名规则中排除。">
            <Stack spacing={1.5}>
              <TextField label="搜索全局规则" size="small" value={search} onChange={(event) => setSearch(event.target.value)} />
              {globals.length === 0 ? <Typography variant="body2" color="text.secondary">没有匹配的全局规则。</Typography> : null}
              {globals.map((group) => (
                <FormControlLabel
                  key={group.id}
                  sx={{ m: 0, alignItems: "flex-start", overflowWrap: "anywhere" }}
                  control={<Checkbox
                    checked={draft.excluded.includes(group.id)}
                    disabled={busy}
                    onChange={(_, excluded) => update({
                      excluded: excluded ? [...draft.excluded, group.id] : draft.excluded.filter((id) => id !== group.id),
                    })}
                  />}
                  label={<Stack sx={{ py: 0.75 }}>
                    <Typography variant="body2">排除 {group.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{group.domains.join(" · ")}</Typography>
                  </Stack>}
                />
              ))}
            </Stack>
          </SectionCard>

          <SectionCard
            title="兼容等效域名组"
            description="管理以既有客户端格式保存的域名组。"
            action={<Button startIcon={<AddOutlined />} disabled={busy} onClick={() => update({
              compatibilityGroups: [...draft.compatibilityGroups, { id: crypto.randomUUID(), text: "" }],
            })}>新增兼容组</Button>}
          >
            <DomainGroupEditor groups={draft.compatibilityGroups} label="兼容组" disabled={busy}
              onChange={(compatibilityGroups) => update({ compatibilityGroups })} />
          </SectionCard>

          {saveError ? <AsyncState kind="fatal" title="无法保存域名规则" description={saveError} /> : null}
          {saved ? <Alert severity="success" role="status">域名规则已保存。</Alert> : null}
          <ActionGroup mobileStack sx={{ justifyContent: "flex-end" }}>
            <Button startIcon={<SaveOutlined />} variant="contained" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? "正在保存…" : "保存域名规则"}
            </Button>
          </ActionGroup>
        </>
      ) : null}
    </Stack>
  );
}

export default function DomainRulesPage() {
  return (
    <RouteGuard capability="domainRules.write" requireOnline unavailableFallback={<AsyncState kind="forbidden" title="当前实例未启用域名规则写入" />}>
      <DomainRulesEditor />
    </RouteGuard>
  );
}

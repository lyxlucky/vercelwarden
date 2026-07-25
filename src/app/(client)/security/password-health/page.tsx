"use client";

import { useState } from "react";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import { Alert, Box, Button, Chip, List, ListItemButton, ListItemText, Stack, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AppLink } from "@/components/theme/AppLink";
import { AsyncState } from "@/components/ui/AsyncState";
import { SectionCard } from "@/components/ui/SectionCard";
import { ToolPageShell } from "@/components/ui/ToolPageShell";
import { checkBreachedPasswords, classifyPasswordHealth, type PasswordRiskItem } from "@/features/security/password-health";
import { fetchVaultSnapshot } from "@/features/vault/api";

const LAST_CHECK_KEY = "vercelwarden.password-health.last-check";

function RiskList({ title, items, detail }: { title: string; items: PasswordRiskItem[]; detail(item: PasswordRiskItem): string }) {
  return (
    <SectionCard title={title} action={<Chip size="small" label={items.length} />}>
      {items.length === 0 ? <AsyncState kind="success" compact title="未发现此类项目" /> : (
        <List disablePadding>
          {items.map((item) => (
            <ListItemButton key={item.itemId} component={AppLink} href={`/vault?item=${encodeURIComponent(item.itemId)}`} divider>
              <ListItemText primary={item.name} secondary={item.username} />
              <Typography color="text.secondary" variant="body2">{detail(item)}</Typography>
            </ListItemButton>
          ))}
        </List>
      )}
    </SectionCard>
  );
}

export default function PasswordHealthPage() {
  const [results, setResults] = useState<PasswordRiskItem[]>([]);
  const [lastChecked, setLastChecked] = useState<string | null>(() => typeof window === "undefined" ? null : localStorage.getItem(LAST_CHECK_KEY));
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    setBusy(true);
    setError(null);
    try {
      const snapshot = await fetchVaultSnapshot();
      setResults(await checkBreachedPasswords(classifyPasswordHealth(snapshot.items)));
      const checked = new Date().toISOString();
      localStorage.setItem(LAST_CHECK_KEY, checked);
      setLastChecked(checked);
      setStarted(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "密码健康检查失败。");
    } finally {
      setBusy(false);
    }
  };

  const unknown = results.filter((item) => item.breached === "unknown");
  return (
    <RouteGuard>
      <ToolPageShell
        title="密码健康"
        description="检查只在你主动触发后执行；未知泄露状态不会标记为安全。"
        actions={<Button variant="contained" startIcon={<RefreshOutlined />} disabled={busy} onClick={() => void scan()}>{busy ? "检查中…" : started ? "重新检查" : "开始检查"}</Button>}
        feedback={error ? <AsyncState kind="fatal" title="检查失败" description={error} actionLabel="重试" onAction={() => void scan()} /> : undefined}
      >
        {lastChecked ? <Typography color="text.secondary" variant="body2">上次检查：{new Date(lastChecked).toLocaleString("zh-CN")}</Typography> : null}
        {busy ? <AsyncState kind="loading" title="正在检查密码健康" description="正在分析弱密码、重复密码和泄露状态。" /> : null}
        {!started && !busy ? (
          <SectionCard title="尚未运行检查">
            <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
              <SecurityOutlined color="primary" sx={{ fontSize: 44 }} aria-hidden="true" />
              <Typography color="text.secondary">将分析弱密码、重复密码，并以 HIBP k-anonymity 查询泄露情况。完整密码不会发送到外部服务。</Typography>
            </Stack>
          </SectionCard>
        ) : null}
        {started ? (
          <Box sx={{ display: "grid", gap: 2 }}>
            <RiskList title="弱密码" items={results.filter((item) => item.weak)} detail={() => "建议更换"} />
            <RiskList title="重复密码" items={results.filter((item) => item.reused)} detail={() => "多个项目共用"} />
            <RiskList title="已知泄露" items={results.filter((item) => item.breached === "yes")} detail={(item) => `${item.breachCount?.toLocaleString() ?? 0} 次`} />
            {unknown.length > 0 ? <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => void scan()}>重试</Button>}>泄露检查未完成：{unknown.length} 个项目因外部数据源不可用而保持未知状态。</Alert> : null}
          </Box>
        ) : null}
      </ToolPageShell>
    </RouteGuard>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { Alert, Box, Button, Card, CardContent, LinearProgress, Link, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AppLink } from "@/components/theme/AppLink";
import { AsyncState } from "@/components/ui/AsyncState";
import { ToolPageShell } from "@/components/ui/ToolPageShell";
import { buildTotpCodeViews, type TotpCodeView } from "@/features/security/totp-codes";
import { fetchVaultSnapshot } from "@/features/vault/api";
import type { VaultItemView } from "@/features/vault/store";

export default function TotpPage() {
  const [items, setItems] = useState<TotpCodeView[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultItemView[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const snapshot = await fetchVaultSnapshot();
      setVaultItems(snapshot.items);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "无法加载验证码。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
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

  const copy = async (item: TotpCodeView) => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopyError(false);
      setCopied(item.itemId);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <RouteGuard>
      <ToolPageShell
        title="验证码"
        description="集中查看密码库中的标准与 Steam TOTP。"
        actions={<Button startIcon={<RefreshOutlined />} onClick={() => void refresh()} disabled={loading}>刷新</Button>}
        feedback={copyError ? <Alert severity="error">浏览器拒绝了剪贴板权限，请手动复制验证码。</Alert> : undefined}
      >
        <TextField label="搜索验证码" placeholder="搜索项目或账号" value={query} onChange={(event) => setQuery(event.target.value)} />
        {loading && vaultItems.length === 0 ? <AsyncState kind="loading" description="正在读取密码库中的验证器。" /> : null}
        {error ? <AsyncState kind="fatal" title="无法加载验证码" description={error} actionLabel="重试" onAction={() => void refresh()} /> : null}
        {!loading && !error && filtered.length === 0 ? <AsyncState kind="empty" title="没有可显示的验证码" description={query ? "请尝试其他搜索词。" : "为密码库项目添加 TOTP 后会显示在这里。"} /> : null}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }, gap: 2 }}>
          {filtered.map((item) => (
            <Card component="article" variant="outlined" key={item.itemId}>
              <CardContent>
                <Stack spacing={2}>
                  <Box>
                    <Link component={AppLink} href={`/vault?item=${encodeURIComponent(item.itemId)}`} variant="h6" sx={{ fontWeight: 700 }}>{item.name}</Link>
                    <Typography color="text.secondary" noWrap>{item.username || item.config.accountName}</Typography>
                  </Box>
                  <Typography component="code" aria-label={`${item.name} 验证码`} sx={{ fontFamily: "monospace", fontSize: "clamp(1.6rem, 5vw, 2.2rem)", letterSpacing: "0.12em", fontWeight: 700 }}>{item.code}</Typography>
                  <LinearProgress variant="determinate" value={(item.remaining / item.config.period) * 100} aria-label={`${item.remaining} 秒后刷新`} />
                  <Button size="small" startIcon={copied === item.itemId ? <CheckOutlined /> : <ContentCopyOutlined />} onClick={() => void copy(item)}>
                    {copied === item.itemId ? "已复制" : `复制 · ${item.remaining} 秒`}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      </ToolPageShell>
    </RouteGuard>
  );
}

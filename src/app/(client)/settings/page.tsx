"use client";

import { useState } from "react";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { Alert, Button, FormControl, InputLabel, MenuItem, Select, Stack } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { loadPreferences, savePreferences, type ClientPreferences } from "@/lib/client/state/preferences";

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<ClientPreferences>(loadPreferences);
  const [saved, setSaved] = useState(false);
  const { setMode } = useColorScheme();

  const save = () => {
    savePreferences(preferences);
    setMode(preferences.theme);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <RouteGuard>
      <Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0 }}>
        <PageHeader title="本机偏好" description="这些设置只保存在当前浏览器，不包含账号机密。" />
        {saved ? <Alert severity="success" role="status">偏好已保存。</Alert> : null}
        <SectionCard title="外观与安全超时">
          <Stack spacing={2.25}>
            <FormControl><InputLabel id="theme-label">主题</InputLabel><Select labelId="theme-label" label="主题" value={preferences.theme} onChange={(event) => setPreferences({ ...preferences, theme: event.target.value as ClientPreferences["theme"] })}><MenuItem value="system">跟随系统</MenuItem><MenuItem value="light">浅色</MenuItem><MenuItem value="dark">深色</MenuItem></Select></FormControl>
            <FormControl><InputLabel id="locale-label">语言</InputLabel><Select labelId="locale-label" label="语言" value={preferences.locale} onChange={(event) => setPreferences({ ...preferences, locale: event.target.value as ClientPreferences["locale"] })}><MenuItem value="zh-CN">简体中文</MenuItem><MenuItem value="en">English</MenuItem></Select></FormControl>
            <FormControl><InputLabel id="timeout-label">空闲锁定时间</InputLabel><Select labelId="timeout-label" label="空闲锁定时间" value={preferences.lockTimeoutMs} onChange={(event) => setPreferences({ ...preferences, lockTimeoutMs: Number(event.target.value) })}><MenuItem value={60_000}>1 分钟</MenuItem><MenuItem value={5 * 60_000}>5 分钟</MenuItem><MenuItem value={15 * 60_000}>15 分钟</MenuItem><MenuItem value={30 * 60_000}>30 分钟</MenuItem><MenuItem value={60 * 60_000}>1 小时</MenuItem></Select></FormControl>
            <FormControl><InputLabel id="timeout-action-label">超时动作</InputLabel><Select labelId="timeout-action-label" label="超时动作" value={preferences.timeoutAction} onChange={(event) => setPreferences({ ...preferences, timeoutAction: event.target.value as ClientPreferences["timeoutAction"] })}><MenuItem value="lock">锁定</MenuItem><MenuItem value="logout">退出账号</MenuItem></Select></FormControl>
            <Button variant="contained" startIcon={<SaveOutlined />} onClick={save} sx={{ alignSelf: "flex-start" }}>保存偏好</Button>
          </Stack>
        </SectionCard>
      </Stack>
    </RouteGuard>
  );
}

"use client";

import { useState } from "react";
import { Button, Field } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { SettingsNav } from "@/features/security/SettingsNav";
import {
  loadPreferences,
  savePreferences,
  type ClientPreferences,
} from "@/lib/client/state/preferences";

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<ClientPreferences>(loadPreferences);
  const [saved, setSaved] = useState(false);
  return (
    <RouteGuard>
      <main className="settings-page">
        <SettingsNav />
        <header className="settings-header"><h1>本机偏好</h1><p>这些设置只保存在当前浏览器，不包含账号机密。</p></header>
        <section className="settings-card settings-grid">
          <Field label="主题">
            <select value={preferences.theme} onChange={(event) => setPreferences({ ...preferences, theme: event.target.value as ClientPreferences["theme"] })}>
              <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
            </select>
          </Field>
          <Field label="语言">
            <select value={preferences.locale} onChange={(event) => setPreferences({ ...preferences, locale: event.target.value as ClientPreferences["locale"] })}>
              <option value="zh-CN">简体中文</option><option value="en">English</option>
            </select>
          </Field>
          <Field label="空闲锁定时间">
            <select value={preferences.lockTimeoutMs} onChange={(event) => setPreferences({ ...preferences, lockTimeoutMs: Number(event.target.value) })}>
              <option value={60_000}>1 分钟</option><option value={5 * 60_000}>5 分钟</option><option value={15 * 60_000}>15 分钟</option><option value={30 * 60_000}>30 分钟</option><option value={60 * 60_000}>1 小时</option>
            </select>
          </Field>
          <Field label="超时动作">
            <select value={preferences.timeoutAction} onChange={(event) => setPreferences({ ...preferences, timeoutAction: event.target.value as ClientPreferences["timeoutAction"] })}>
              <option value="lock">锁定</option><option value="logout">退出账号</option>
            </select>
          </Field>
          <div className="settings-actions"><Button variant="primary" onClick={() => { savePreferences(preferences); setSaved(true); }}>保存偏好</Button>{saved ? <span role="status">已保存</span> : null}</div>
        </section>
      </main>
    </RouteGuard>
  );
}

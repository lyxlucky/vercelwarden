"use client";

import Link from "next/link";

const links = [
  ["/settings", "本机偏好"],
  ["/settings/account", "账号"],
  ["/settings/security", "安全凭据"],
  ["/settings/security/device-management", "设备与登录请求"],
  ["/settings/domain-rules", "域名规则"],
] as const;

export function SettingsNav() {
  return (
    <nav className="settings-nav" aria-label="设置导航">
      <Link href="/vault">← 密码库</Link>
      {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
    </nav>
  );
}

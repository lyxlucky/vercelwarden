"use client";

import Link from "next/link";

export function AdminNav() {
  return <nav className="settings-nav" aria-label="管理导航"><Link href="/vault">← 密码库</Link><Link href="/admin">用户与邀请</Link><Link href="/logs">审计日志</Link><Link href="/backup">系统备份</Link></nav>;
}

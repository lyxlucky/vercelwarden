"use client";

import type { ReactNode } from "react";
import type { CapabilityKey } from "@/lib/contracts/capabilities";
import { isUnlockedPhase, useSession, type SessionRole } from "@/lib/client/state/session-store";
import { AsyncState } from "@/components/ui/AsyncState";

export function RouteGuard({
  children,
  capability,
  requireUnlocked = true,
  requireOnline = false,
  roles,
  unavailableFallback = null,
  anonymousFallback,
  lockedFallback,
}: {
  children: ReactNode;
  capability?: CapabilityKey;
  requireUnlocked?: boolean;
  requireOnline?: boolean;
  roles?: SessionRole[];
  unavailableFallback?: ReactNode;
  anonymousFallback?: ReactNode;
  lockedFallback?: ReactNode;
}) {
  const session = useSession();

  if (capability && !session.capabilities[capability]) return unavailableFallback;
  if (session.phase === "bootstrapping") return <AsyncState kind="loading" />;
  if (session.phase === "anonymous") {
    return anonymousFallback ?? <AsyncState kind="forbidden" description="请先登录后再访问此页面。" />;
  }
  if (requireUnlocked && !isUnlockedPhase(session.phase)) {
    return lockedFallback ?? <AsyncState kind="forbidden" title="密码库已锁定" description="解锁密码库后继续。" />;
  }
  if (requireOnline && !session.online) {
    return <AsyncState kind="offline" description="此操作需要连接服务器。" />;
  }
  if (roles?.length && !roles.some((role) => session.user?.roles.includes(role))) {
    return <AsyncState kind="forbidden" description="当前账户没有执行此操作的权限。" />;
  }
  return children;
}

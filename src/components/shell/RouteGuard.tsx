"use client";

import type { ReactNode } from "react";
import type { CapabilityKey } from "@/lib/contracts/capabilities";
import { isUnlockedPhase, useSession, type SessionRole } from "@/lib/client/state/session-store";
import { TaskState } from "@/components/feedback/TaskState";

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
  if (session.phase === "bootstrapping") return <TaskState kind="loading" />;
  if (session.phase === "anonymous") {
    return anonymousFallback ?? <TaskState kind="forbidden" description="请先登录后再访问此页面。" />;
  }
  if (requireUnlocked && !isUnlockedPhase(session.phase)) {
    return lockedFallback ?? <TaskState kind="forbidden" title="密码库已锁定" description="解锁密码库后继续。" />;
  }
  if (requireOnline && !session.online) {
    return <TaskState kind="offline" description="此操作需要连接服务器。" />;
  }
  if (roles?.length && !roles.some((role) => session.user?.roles.includes(role))) {
    return <TaskState kind="forbidden" description="当前账户没有执行此操作的权限。" />;
  }
  return children;
}

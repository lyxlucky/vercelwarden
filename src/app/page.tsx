"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TaskState } from "@/components/feedback/TaskState";
import { legacyHashRouteDestination } from "@/lib/client/routing/legacy-hash-route";
import { useSession } from "@/lib/client/state/session-store";

export default function Home() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (legacyHashRouteDestination(window.location.pathname, window.location.hash)) return;
    if (session.phase === "anonymous") router.replace("/login");
    if (session.phase === "locked" || session.phase === "locked-offline") router.replace("/lock");
    if (session.phase === "unlocked" || session.phase === "unlocked-offline") router.replace("/vault");
  }, [router, session.phase]);
  return <TaskState kind="loading" title="正在打开密码库" />;
}

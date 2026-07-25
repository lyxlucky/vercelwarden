"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sessionStore } from "@/lib/client/state/session-store";
import { refreshSession } from "@/features/auth/api";
import { lockController } from "@/features/auth/lock-controller";
import { discoverOfflineAccount } from "@/lib/client/offline/unlock";
import { registerServiceWorker } from "@/lib/client/pwa/register";
import { connectivityController } from "@/lib/client/state/connectivity";

const authPaths = new Set(["/login", "/register", "/recover-2fa"]);

function isPublicSendPath(pathname: string) {
  return pathname === "/send" || pathname.startsWith("/send/");
}

export function AuthLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    if (isPublicSendPath(pathname)) return;

    lockController.start();
    connectivityController.start();
    void registerServiceWorker();

    if (sessionStore.getSnapshot().phase === "bootstrapping") {
      void (async () => {
        if (authPaths.has(pathname)) {
          sessionStore.setAnonymous();
          return;
        }
        if (navigator.onLine) {
          try {
            await refreshSession();
            if (window.location.pathname !== "/lock") window.location.replace("/lock");
            return;
          } catch {
            // An encrypted offline snapshot may still be available.
          }
        }
        const offlineUser = await discoverOfflineAccount().catch((error) => {
          console.warn("Offline snapshot discovery failed", error instanceof Error ? error.message : "unknown");
          return null;
        });
        if (offlineUser) {
          sessionStore.setOfflineAvailable(offlineUser);
          if (window.location.pathname !== "/lock") window.location.replace("/lock");
        }
        else sessionStore.setAnonymous();
      })();
    }
    return () => {
      connectivityController.stop();
      lockController.stop();
    };
  }, [pathname]);

  return null;
}

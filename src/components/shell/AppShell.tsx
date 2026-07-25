"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { IconButton } from "@/components/primitives";

export type MobilePane = "navigation" | "list" | "detail";

export function AppShell({
  header,
  navigation,
  list,
  detail,
  mobilePane = "list",
  onMobileBack,
}: {
  header: ReactNode;
  navigation: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  mobilePane?: MobilePane;
  onMobileBack?: () => void;
}) {
  return (
    <div className="app-shell" data-mobile-pane={mobilePane}>
      <header className="app-shell__header">{header}</header>
      <aside className="app-shell__navigation" aria-label="密码库导航" data-active={mobilePane === "navigation" || undefined}>
        {navigation}
      </aside>
      <section className="app-shell__list" aria-label="项目列表" data-active={mobilePane === "list" || undefined}>
        {mobilePane !== "navigation" && onMobileBack ? (
          <div className="app-shell__mobile-back"><IconButton icon={ChevronLeft} label="返回" onClick={onMobileBack} /></div>
        ) : null}
        {list}
      </section>
      <main className="app-shell__detail" data-active={mobilePane === "detail" || undefined}>
        {mobilePane === "detail" && onMobileBack ? (
          <div className="app-shell__mobile-back"><IconButton icon={ChevronLeft} label="返回列表" onClick={onMobileBack} /></div>
        ) : null}
        {detail}
      </main>
    </div>
  );
}

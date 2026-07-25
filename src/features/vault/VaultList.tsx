"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, Check, FileText, Heart, KeyRound } from "lucide-react";
import { TaskState } from "@/components/feedback/TaskState";
import type { VaultItemView } from "@/features/vault/store";

function ItemIcon({ type }: { type: number }) {
  const Icon = type === 1 ? KeyRound : FileText;
  return <Icon size={18} strokeWidth={1.7} aria-hidden="true" />;
}

export function VaultList({
  items,
  selectedId,
  checkedIds,
  onSelect,
  onToggle,
}: {
  items: VaultItemView[];
  selectedId: string | null;
  checkedIds: ReadonlySet<string>;
  onSelect(item: VaultItemView): void;
  onToggle(id: string): void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual returns imperative functions that React Compiler intentionally skips.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  if (items.length === 0) {
    return <TaskState kind="empty" title="此视图没有项目" description="调整搜索条件或选择其他密码库视图。" />;
  }

  return (
    <div ref={scrollRef} className="vault-list" role="listbox" aria-label="密码库项目">
      <div className="vault-list__spacer" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          const checked = checkedIds.has(item.id);
          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={row.index}
              data-vault-row
              className="vault-row"
              data-selected={selectedId === item.id || undefined}
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <button
                type="button"
                className="vault-row__check"
                aria-label={`${checked ? "取消选择" : "选择"} ${item.name}`}
                aria-pressed={checked}
                onClick={() => onToggle(item.id)}
              >
                {checked ? <Check size={14} aria-hidden="true" /> : null}
              </button>
              <button type="button" className="vault-row__main" onClick={() => onSelect(item)} aria-label={`${item.name} ${item.username || ""}`.trim()}>
                <span className="vault-row__icon"><ItemIcon type={item.type} /></span>
                <span className="vault-row__copy">
                  <strong>{item.name}</strong>
                  <span>{item.username || item.uris[0] || "无账号信息"}</span>
                </span>
                <span className="vault-row__badges">
                  {item.favorite ? <Heart size={14} fill="currentColor" aria-label="收藏" /> : null}
                  {item.archivedAt ? <Archive size={14} aria-label="已归档" /> : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

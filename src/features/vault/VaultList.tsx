"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ArchiveOutlined from "@mui/icons-material/ArchiveOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import FavoriteOutlined from "@mui/icons-material/FavoriteOutlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import {
  Avatar,
  Box,
  Checkbox,
  ListItemButton,
  ListItemText,
  Stack,
  Tooltip,
} from "@mui/material";
import { TaskState } from "@/components/feedback/TaskState";
import type { VaultItemView } from "@/features/vault/store";

function ItemIcon({ type }: { type: number }) {
  return type === 1 ? <KeyOutlined fontSize="small" /> : <DescriptionOutlined fontSize="small" />;
}

export function VaultList({ items, selectedId, checkedIds, onSelect, onToggle }: {
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
    estimateSize: () => 68,
    overscan: 8,
  });

  if (items.length === 0) {
    return <Box sx={{ p: 2 }}><TaskState kind="empty" title="此视图没有项目" description="调整搜索条件或选择其他密码库视图。" /></Box>;
  }

  return (
    <Box ref={scrollRef} data-vault-scroll role="list" aria-label="密码库项目" sx={{ minHeight: 0, flex: 1, overflow: "auto", position: "relative" }}>
      <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          const checked = checkedIds.has(item.id);
          return (
            <Box
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={row.index}
              data-vault-row
              data-selected={selectedId === item.id || undefined}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start}px)`, display: "flex", alignItems: "center", px: 0.5 }}
            >
              <Checkbox
                checked={checked}
                size="small"
                slotProps={{ input: { "aria-label": `${checked ? "取消选择" : "选择"} ${item.name}` } }}
                onChange={() => onToggle(item.id)}
                sx={{ flex: "0 0 auto" }}
              />
              <ListItemButton
                component="button"
                selected={selectedId === item.id}
                onClick={() => onSelect(item)}
                aria-label={`${item.name} ${item.username || ""}`.trim()}
                sx={{ minWidth: 0, borderRadius: 1, py: 1 }}
              >
                <Avatar variant="rounded" sx={{ width: 36, height: 36, mr: 1.5, bgcolor: "primary.light", color: "primary.dark" }}><ItemIcon type={item.type} /></Avatar>
                <ListItemText
                  primary={item.name}
                  secondary={item.username || item.uris[0] || "无账号信息"}
                  slotProps={{ primary: { noWrap: true, sx: { fontWeight: 650 } }, secondary: { noWrap: true } }}
                />
                <Stack direction="row" sx={{ ml: 1, gap: 0.5, color: "text.secondary" }}>
                  {item.favorite ? <Tooltip title="收藏"><FavoriteOutlined fontSize="small" color="error" /></Tooltip> : null}
                  {item.archivedAt ? <Tooltip title="已归档"><ArchiveOutlined fontSize="small" /></Tooltip> : null}
                </Stack>
              </ListItemButton>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

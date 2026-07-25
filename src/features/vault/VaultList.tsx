"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ArchiveOutlined from "@mui/icons-material/ArchiveOutlined";
import FavoriteOutlined from "@mui/icons-material/FavoriteOutlined";
import { Box, Checkbox, Chip, ListItemButton, ListItemText, Stack, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { TaskState } from "@/components/feedback/TaskState";
import type { VaultItemView } from "@/features/vault/store";
import { VaultItemAvatar, vaultTypeLabel } from "@/features/vault/VaultVisuals";

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
    estimateSize: () => 76,
    overscan: 8,
  });

  if (items.length === 0) {
    return <Box sx={{ p: 3 }}><TaskState kind="empty" title="此视图没有项目" description="调整搜索条件，或从左侧选择其他密码库视图。" /></Box>;
  }

  return (
    <Box ref={scrollRef} data-vault-scroll role="list" aria-label="密码库项目" sx={{ minHeight: 0, flex: 1, overflow: "auto", position: "relative", px: 0.5 }}>
      <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          const checked = checkedIds.has(item.id);
          const selected = selectedId === item.id;
          return (
            <Box
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={row.index}
              data-vault-row
              data-selected={selected || undefined}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start}px)`, display: "flex", alignItems: "center", px: 0.5, py: 0.25 }}
            >
              <Checkbox
                checked={checked}
                size="small"
                slotProps={{ input: { "aria-label": `${checked ? "取消选择" : "选择"} ${item.name}` } }}
                onChange={() => onToggle(item.id)}
                sx={{ flex: "0 0 auto", p: 1 }}
              />
              <ListItemButton
                component="button"
                selected={selected}
                onClick={() => onSelect(item)}
                aria-label={`${item.name} ${item.username || ""}`.trim()}
                sx={{
                  minWidth: 0,
                  minHeight: 68,
                  borderRadius: 3,
                  px: 1.25,
                  py: 0.75,
                  transition: (theme) => theme.transitions.create(["background-color", "box-shadow"]),
                  "&.Mui-selected": {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.2 : 0.11),
                    "&:hover": { bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.25 : 0.15) },
                  },
                  "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
                }}
              >
                <Box sx={{ mr: 1.5, flex: "0 0 auto" }}><VaultItemAvatar type={item.type} /></Box>
                <ListItemText
                  primary={item.name}
                  secondary={item.username || item.uris[0] || vaultTypeLabel(item.type)}
                  slotProps={{ primary: { noWrap: true, sx: { fontWeight: 650, letterSpacing: 0.05 } }, secondary: { noWrap: true, variant: "body2" } }}
                />
                <Stack direction="row" sx={{ ml: 1, gap: 0.5, color: "text.secondary", alignItems: "center" }}>
                  {item.favorite ? <Tooltip title="收藏"><FavoriteOutlined sx={{ fontSize: 18 }} color="error" /></Tooltip> : null}
                  {item.archivedAt ? <Chip icon={<ArchiveOutlined />} label="归档" size="small" variant="outlined" sx={{ display: { xs: "none", sm: "inline-flex" } }} /> : null}
                </Stack>
              </ListItemButton>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

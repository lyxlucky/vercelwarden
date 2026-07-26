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

export function VaultList({ items, selectedId, checkedIds, selectionMode, onSelect, onToggle }: {
  items: VaultItemView[];
  selectedId: string | null;
  checkedIds: ReadonlySet<string>;
  selectionMode: boolean;
  onSelect(item: VaultItemView): void;
  onToggle(id: string): void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual returns imperative functions that React Compiler intentionally skips.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  if (items.length === 0) {
    return <Box sx={{ p: 3 }}><TaskState kind="empty" title="此视图没有项目" description="调整搜索条件，或从左侧选择其他密码库视图。" /></Box>;
  }

  return (
    <Box ref={scrollRef} data-vault-scroll role="list" aria-label="密码库项目" sx={{ minHeight: 0, flex: 1, overflow: "auto", position: "relative" }}>
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
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start}px)`, px: 1 }}
            >
              <ListItemButton
                selected={selectionMode ? checked : selected}
                onClick={() => selectionMode ? onToggle(item.id) : onSelect(item)}
                aria-label={`${item.name} ${item.username || ""}`.trim()}
                aria-pressed={selectionMode ? checked : undefined}
                sx={{
                  minWidth: 0,
                  minHeight: 72,
                  borderRadius: 2,
                  px: 1,
                  py: 0.5,
                  borderBottom: 1,
                  borderColor: "divider",
                  transition: (theme) => theme.transitions.create(["background-color", "box-shadow"]),
                  "&.Mui-selected": {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.2 : 0.11),
                    boxShadow: "inset 3px 0 0 currentColor",
                    "&:hover": { bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.25 : 0.15) },
                  },
                  "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
                }}
              >
                <Box sx={{ width: 44, mr: 1, flex: "0 0 auto", display: "grid", placeItems: "center" }}>
                  {selectionMode ? (
                    <Checkbox
                      checked={checked}
                      size="small"
                      slotProps={{ input: { "aria-label": `${checked ? "取消选择" : "选择"} ${item.name}` } }}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggle(item.id)}
                    />
                  ) : <VaultItemAvatar type={item.type} />}
                </Box>
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

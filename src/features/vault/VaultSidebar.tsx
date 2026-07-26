"use client";

import type { ElementType } from "react";
import {
  ArchiveOutlined,
  AutoAwesomeOutlined,
  BadgeOutlined,
  ContentCopyOutlined,
  CreditCardOutlined,
  DeleteOutlineOutlined,
  DescriptionOutlined,
  DriveFileRenameOutlineOutlined,
  FavoriteBorderOutlined,
  FolderOutlined,
  FolderSpecialOutlined,
  HealthAndSafetyOutlined,
  ImportExportOutlined,
  KeyOutlined,
  AccountBalanceOutlined,
  ListAltOutlined,
  NoteAltOutlined,
  SendOutlined,
  TimerOutlined,
} from "@mui/icons-material";
import {
  Box,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { AppLink } from "@/components/theme/AppLink";
import type { VaultFilter, VaultFolderView } from "@/features/vault/store";

interface Counts {
  all: number;
  favorites: number;
  archive: number;
  trash: number;
  duplicates: number;
  types: Record<number, number>;
  folders: Record<string, number>;
}

const typeRows: Array<{ type: number; label: string; icon: ElementType }> = [
  { type: 1, label: "登录", icon: KeyOutlined },
  { type: 2, label: "安全笔记", icon: DescriptionOutlined },
  { type: 3, label: "银行卡", icon: CreditCardOutlined },
  { type: 4, label: "身份", icon: BadgeOutlined },
  { type: 5, label: "SSH 密钥", icon: DriveFileRenameOutlineOutlined },
  { type: 6, label: "银行账户", icon: AccountBalanceOutlined },
  { type: 7, label: "驾驶证", icon: NoteAltOutlined },
  { type: 8, label: "护照", icon: BadgeOutlined },
];

function isActive(current: VaultFilter, candidate: VaultFilter) {
  if (current.kind !== candidate.kind) return false;
  if (current.kind === "folder" && candidate.kind === "folder") return current.folderId === candidate.folderId;
  if (current.kind === "type" && candidate.kind === "type") return current.type === candidate.type;
  return true;
}

const itemSx = {
  minHeight: 48,
  mx: 1.5,
  my: 0.5,
  px: 1.5,
  position: "relative",
  borderRadius: 2,
  overflow: "hidden",
  "&::before": {
    content: '""',
    position: "absolute",
    insetInlineStart: 4,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 999,
    bgcolor: "primary.main",
    opacity: 0,
    transform: "scaleY(0.45)",
    transition: (theme: import("@mui/material/styles").Theme) => theme.transitions.create(
      ["opacity", "transform"],
      { duration: theme.transitions.duration.shorter, easing: theme.transitions.easing.easeOut },
    ),
  },
  "&:active": { transform: "translateY(1px)" },
  "&.Mui-selected": {
    bgcolor: (theme: import("@mui/material/styles").Theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.12),
    color: "primary.main",
    "&:hover": { bgcolor: (theme: import("@mui/material/styles").Theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.27 : 0.16) },
    "& .MuiListItemIcon-root": { color: "primary.main" },
    "&::before": { opacity: 1, transform: "scaleY(1)" },
  },
} as const;

function Count({ value }: { value: number }) {
  return <Typography component="span" variant="caption" color="text.secondary" sx={{ minWidth: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>;
}

function ViewButton({ icon: Icon, label, count, active, onClick }: {
  icon: ElementType;
  label: string;
  count: number;
  active: boolean;
  onClick(): void;
}) {
  return (
    <ListItemButton selected={active} aria-current={active ? "page" : undefined} onClick={onClick} sx={itemSx}>
      <ListItemIcon sx={{ minWidth: 40 }}><Icon fontSize="small" /></ListItemIcon>
      <ListItemText primary={label} slotProps={{ primary: { variant: "body2", sx: { fontWeight: active ? 700 : 550 } } }} />
      <Count value={count} />
    </ListItemButton>
  );
}

function ToolLink({ href, icon: Icon, children }: { href: string; icon: ElementType; children: string }) {
  return (
    <ListItemButton component={AppLink} href={href} sx={itemSx}>
      <ListItemIcon sx={{ minWidth: 40 }}><Icon fontSize="small" /></ListItemIcon>
      <ListItemText primary={children} slotProps={{ primary: { variant: "body2", sx: { fontWeight: 550 } } }} />
    </ListItemButton>
  );
}

function SectionHeader({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <ListSubheader disableSticky component="div" sx={{ bgcolor: "transparent", lineHeight: 1, px: 3, pt: 2.5, pb: 1 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 750, letterSpacing: 0.9 }}>{children}</Typography>
        {action}
      </Stack>
    </ListSubheader>
  );
}

export function VaultSidebar({ filter, counts, folders, onFilterChange, onManageFolders }: {
  filter: VaultFilter;
  counts: Counts;
  folders: VaultFolderView[];
  onFilterChange(filter: VaultFilter): void;
  onManageFolders(): void;
}) {
  const viewRows: Array<{ filter: VaultFilter; label: string; count: number; icon: ElementType }> = [
    { filter: { kind: "all" }, label: "所有项目", count: counts.all, icon: ListAltOutlined },
    { filter: { kind: "favorites" }, label: "收藏", count: counts.favorites, icon: FavoriteBorderOutlined },
    { filter: { kind: "archive" }, label: "归档", count: counts.archive, icon: ArchiveOutlined },
    { filter: { kind: "trash" }, label: "回收站", count: counts.trash, icon: DeleteOutlineOutlined },
    { filter: { kind: "duplicates", mode: "exact" }, label: "重复项", count: counts.duplicates, icon: ContentCopyOutlined },
  ];

  return (
    <Box component="nav" aria-label="密码库视图" sx={{ height: "100%", overflow: "auto", py: 1, pb: 3 }}>
      <Box sx={{ px: 3, pt: 3, pb: 1.5 }}>
        <Typography component="p" variant="subtitle1" sx={{ fontWeight: 750 }}>工作区</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>浏览、整理和保护你的项目</Typography>
      </Box>

      <List disablePadding subheader={<SectionHeader>密码库</SectionHeader>}>
        {viewRows.map((row) => <ViewButton key={row.label} icon={row.icon} label={row.label} count={row.count} active={isActive(filter, row.filter)} onClick={() => onFilterChange(row.filter)} />)}
      </List>

      <List disablePadding subheader={<SectionHeader>安全工具</SectionHeader>}>
        <ToolLink href="/generator" icon={AutoAwesomeOutlined}>密码生成器</ToolLink>
        <ToolLink href="/vault/totp" icon={TimerOutlined}>验证码</ToolLink>
        <ToolLink href="/security/password-health" icon={HealthAndSafetyOutlined}>密码健康</ToolLink>
        <ToolLink href="/sends" icon={SendOutlined}>Send</ToolLink>
        <ToolLink href="/backup/import-export" icon={ImportExportOutlined}>导入与导出</ToolLink>
      </List>

      <List disablePadding subheader={<SectionHeader>类型</SectionHeader>}>
        {typeRows.map((row) => <ViewButton key={row.type} icon={row.icon} label={row.label} count={counts.types[row.type] ?? 0} active={filter.kind === "type" && filter.type === row.type} onClick={() => onFilterChange({ kind: "type", type: row.type })} />)}
      </List>

      <List
        disablePadding
        subheader={(
          <SectionHeader action={<Tooltip title="管理文件夹"><IconButton size="small" aria-label="管理文件夹" onClick={onManageFolders}><FolderSpecialOutlined fontSize="small" /></IconButton></Tooltip>}>
            文件夹
          </SectionHeader>
        )}
      >
        {folders.length === 0 ? <Typography color="text.secondary" variant="body2" sx={{ px: 3, py: 1 }}>暂无文件夹</Typography> : folders.map((folder) => (
          <ViewButton key={folder.id} icon={FolderOutlined} label={folder.name} count={counts.folders[folder.id] ?? 0} active={filter.kind === "folder" && filter.folderId === folder.id} onClick={() => onFilterChange({ kind: "folder", folderId: folder.id })} />
        ))}
      </List>
    </Box>
  );
}

"use client";

import type { ElementType } from "react";
import {
  ArchiveOutlined,
  ContentCopyOutlined,
  CreditCardOutlined,
  DeleteOutlineOutlined,
  DescriptionOutlined,
  DriveFileRenameOutlineOutlined,
  FolderOutlined,
  FolderSpecialOutlined,
  FavoriteBorderOutlined,
  BadgeOutlined,
  KeyOutlined,
  AccountBalanceOutlined,
  ListAltOutlined,
  NoteAltOutlined,
  AutoAwesomeOutlined,
  TimerOutlined,
  HealthAndSafetyOutlined,
  SendOutlined,
  ImportExportOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
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

function ViewButton({ icon: Icon, label, count, active, onClick }: {
  icon: ElementType;
  label: string;
  count: number;
  active: boolean;
  onClick(): void;
}) {
  return (
    <ListItemButton selected={active} aria-current={active ? "page" : undefined} onClick={onClick} sx={{ borderRadius: 1, mx: 1 }}>
      <ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon>
      <ListItemText primary={label} />
      <Chip component="span" label={count} size="small" variant={active ? "filled" : "outlined"} />
    </ListItemButton>
  );
}

function ToolLink({ href, icon: Icon, children }: { href: string; icon: ElementType; children: string }) {
  return (
    <ListItemButton component={AppLink} href={href} sx={{ borderRadius: 1, mx: 1 }}>
      <ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon>
      <ListItemText primary={children} />
    </ListItemButton>
  );
}

function GroupTitle({ children }: { children: string }) {
  return <Typography component="h2" variant="overline" color="text.secondary" sx={{ px: 2, pt: 1.5, display: "block" }}>{children}</Typography>;
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
    <Box component="nav" aria-label="密码库视图" sx={{ height: "100%", overflow: "auto", pb: 2 }}>
      <GroupTitle>密码库</GroupTitle>
      <List dense disablePadding>{viewRows.map((row) => (
        <ViewButton key={row.label} icon={row.icon} label={row.label} count={row.count} active={isActive(filter, row.filter)} onClick={() => onFilterChange(row.filter)} />
      ))}</List>
      <Divider sx={{ my: 1 }} />

      <GroupTitle>安全工具</GroupTitle>
      <List dense disablePadding>
        <ToolLink href="/generator" icon={AutoAwesomeOutlined}>密码生成器</ToolLink>
        <ToolLink href="/vault/totp" icon={TimerOutlined}>验证码</ToolLink>
        <ToolLink href="/security/password-health" icon={HealthAndSafetyOutlined}>密码健康</ToolLink>
        <ToolLink href="/sends" icon={SendOutlined}>Send</ToolLink>
        <ToolLink href="/backup/import-export" icon={ImportExportOutlined}>导入与导出</ToolLink>
      </List>
      <Divider sx={{ my: 1 }} />

      <GroupTitle>类型</GroupTitle>
      <List dense disablePadding>{typeRows.map((row) => (
        <ViewButton key={row.type} icon={row.icon} label={row.label} count={counts.types[row.type] ?? 0} active={filter.kind === "type" && filter.type === row.type} onClick={() => onFilterChange({ kind: "type", type: row.type })} />
      ))}</List>
      <Divider sx={{ my: 1 }} />

      <Stack direction="row" sx={{ px: 2, pt: 1, alignItems: "center", justifyContent: "space-between" }}>
        <GroupTitle>文件夹</GroupTitle>
        <Button size="small" variant="text" startIcon={<FolderSpecialOutlined />} onClick={onManageFolders}>管理</Button>
      </Stack>
      {folders.length === 0 ? <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 1 }}>暂无文件夹</Typography> : (
        <List dense disablePadding>{folders.map((folder) => (
          <ViewButton key={folder.id} icon={FolderOutlined} label={folder.name} count={counts.folders[folder.id] ?? 0} active={filter.kind === "folder" && filter.folderId === folder.id} onClick={() => onFilterChange({ kind: "folder", folderId: folder.id })} />
        ))}</List>
      )}
    </Box>
  );
}

"use client";

import Link from "next/link";

import {
  Archive,
  Copy,
  CreditCard,
  FileKey,
  FileText,
  Folder,
  FolderCog,
  Heart,
  IdCard,
  KeyRound,
  Landmark,
  List,
  NotebookTabs,
  Trash2,
  WandSparkles,
  Timer,
  ShieldAlert,
  Send,
  DatabaseBackup,
} from "lucide-react";
import { Button } from "@/components/primitives";
import type { LucideIcon } from "lucide-react";
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

const typeRows: Array<{ type: number; label: string; icon: LucideIcon }> = [
  { type: 1, label: "登录", icon: KeyRound },
  { type: 2, label: "安全笔记", icon: FileText },
  { type: 3, label: "银行卡", icon: CreditCard },
  { type: 4, label: "身份", icon: IdCard },
  { type: 5, label: "SSH 密钥", icon: FileKey },
  { type: 6, label: "银行账户", icon: Landmark },
  { type: 7, label: "驾驶证", icon: NotebookTabs },
  { type: 8, label: "护照", icon: IdCard },
];

function isActive(current: VaultFilter, candidate: VaultFilter) {
  if (current.kind !== candidate.kind) return false;
  if (current.kind === "folder" && candidate.kind === "folder") return current.folderId === candidate.folderId;
  if (current.kind === "type" && candidate.kind === "type") return current.type === candidate.type;
  return true;
}

function ViewButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button type="button" className="vault-sidebar__item" aria-current={active ? "page" : undefined} onClick={onClick}>
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
      <span className="vault-sidebar__count">{count}</span>
    </button>
  );
}

export function VaultSidebar({
  filter,
  counts,
  folders,
  onFilterChange,
  onManageFolders,
}: {
  filter: VaultFilter;
  counts: Counts;
  folders: VaultFolderView[];
  onFilterChange(filter: VaultFilter): void;
  onManageFolders(): void;
}) {
  const viewRows: Array<{ filter: VaultFilter; label: string; count: number; icon: LucideIcon }> = [
    { filter: { kind: "all" }, label: "所有项目", count: counts.all, icon: List },
    { filter: { kind: "favorites" }, label: "收藏", count: counts.favorites, icon: Heart },
    { filter: { kind: "archive" }, label: "归档", count: counts.archive, icon: Archive },
    { filter: { kind: "trash" }, label: "回收站", count: counts.trash, icon: Trash2 },
    { filter: { kind: "duplicates", mode: "exact" }, label: "重复项", count: counts.duplicates, icon: Copy },
  ];

  return (
    <nav className="vault-sidebar" aria-label="密码库视图">
      <div className="vault-sidebar__group">
        <h2>密码库</h2>
        {viewRows.map((row) => (
          <ViewButton
            key={row.label}
            icon={row.icon}
            label={row.label}
            count={row.count}
            active={isActive(filter, row.filter)}
            onClick={() => onFilterChange(row.filter)}
          />
        ))}
      </div>

      <div className="vault-sidebar__group">
        <h2>安全工具</h2>
        <Link className="vault-sidebar__item" href="/generator"><WandSparkles size={16} /><span>密码生成器</span></Link>
        <Link className="vault-sidebar__item" href="/vault/totp"><Timer size={16} /><span>验证码</span></Link>
        <Link className="vault-sidebar__item" href="/security/password-health"><ShieldAlert size={16} /><span>密码健康</span></Link>
        <Link className="vault-sidebar__item" href="/sends"><Send size={16} /><span>Send</span></Link>
        <Link className="vault-sidebar__item" href="/backup/import-export"><DatabaseBackup size={16} /><span>导入与导出</span></Link>
      </div>

      <div className="vault-sidebar__group">
        <h2>类型</h2>
        {typeRows.map((row) => (
          <ViewButton
            key={row.type}
            icon={row.icon}
            label={row.label}
            count={counts.types[row.type] ?? 0}
            active={filter.kind === "type" && filter.type === row.type}
            onClick={() => onFilterChange({ kind: "type", type: row.type })}
          />
        ))}
      </div>

      <div className="vault-sidebar__group">
        <div className="vault-sidebar__group-heading">
          <h2>文件夹</h2>
          <Button size="sm" variant="ghost" icon={FolderCog} onClick={onManageFolders}>管理</Button>
        </div>
        {folders.length === 0 ? <p className="vault-sidebar__empty">暂无文件夹</p> : folders.map((folder) => (
          <ViewButton
            key={folder.id}
            icon={Folder}
            label={folder.name}
            count={counts.folders[folder.id] ?? 0}
            active={filter.kind === "folder" && filter.folderId === folder.id}
            onClick={() => onFilterChange({ kind: "folder", folderId: folder.id })}
          />
        ))}
      </div>
    </nav>
  );
}

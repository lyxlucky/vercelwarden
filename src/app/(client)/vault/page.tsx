"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveOutlined,
  CheckBoxOutlined,
  FavoriteBorderOutlined,
  FolderOpenOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  AddOutlined,
  RefreshOutlined,
  RestoreOutlined,
  SearchOutlined,
  SettingsOutlined,
  AdminPanelSettingsOutlined,
  DeleteOutlineOutlined,
} from "@mui/icons-material";
import {
  Avatar,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { AppShell, type MobilePane } from "@/components/shell/AppShell";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AppLink } from "@/components/theme/AppLink";
import { useToast } from "@/components/ui/ToastProvider";
import { TaskState } from "@/components/feedback/TaskState";
import { useSession } from "@/lib/client/state/session-store";
import { lockController } from "@/features/auth/lock-controller";
import { archiveCiphers, createFolder, deleteFolder, favoriteCiphers, fetchVaultSnapshot, moveCiphers, permanentlyDeleteCiphers, renameFolder, restoreCiphers, trashCiphers, unarchiveCiphers, type BulkMutationResult } from "@/features/vault/api";
import { buildVaultCounts, selectVaultItems, useVaultSnapshot, vaultStore, type DuplicateDetectionMode, type VaultFilter, type VaultItemView, type VaultSort } from "@/features/vault/store";
import { VaultSidebar } from "@/features/vault/VaultSidebar";
import { VaultList } from "@/features/vault/VaultList";
import { VaultDetail } from "@/features/vault/VaultDetail";
import { VaultEditor } from "@/features/vault/VaultEditor";
import { ConfirmItemsDialog, ConflictDialog, FolderManagerDialog, MoveItemsDialog } from "@/features/vault/VaultDialogs";

type ConfirmMode = "archive" | "unarchive" | "restore" | "trash" | "permanent" | null;
const VAULT_SORT_STORAGE_KEY = "vercelwarden.vault.sort";
function storedSort(): VaultSort { if (typeof window === "undefined") return "name"; const value = window.localStorage.getItem(VAULT_SORT_STORAGE_KEY); return value === "created-desc" || value === "updated-desc" ? value : "name"; }
function filterTitle(filter: VaultFilter, folderName?: string) { if (filter.kind === "favorites") return "收藏"; if (filter.kind === "archive") return "归档"; if (filter.kind === "trash") return "回收站"; if (filter.kind === "duplicates") return "重复项"; if (filter.kind === "folder") return folderName ?? "文件夹"; if (filter.kind === "type") return "类型项目"; return "所有项目"; }

export default function VaultPage() {
  const session = useSession();
  const vault = useVaultSnapshot();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VaultFilter>({ kind: "all" });
  const [sort, setSort] = useState<VaultSort>(storedSort);
  const [selectedId, setSelectedId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item"));
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [folderDialog, setFolderDialog] = useState(false);
  const [moveDialog, setMoveDialog] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [conflictDialog, setConflictDialog] = useState(false);
  const [editorTarget, setEditorTarget] = useState<"new" | VaultItemView | null>(null);
  const refresh = useCallback(async () => { vaultStore.setLoading(); try { const snapshot = await fetchVaultSnapshot(); vaultStore.replace(snapshot.items, snapshot.folders); } catch (error) { vaultStore.setError(error instanceof Error ? error.message : "密码库加载失败。"); } }, []);
  useEffect(() => { if (session.phase === "unlocked" && vault.status === "idle") void refresh(); }, [refresh, session.phase, vault.status]);
  useEffect(() => { window.localStorage.setItem(VAULT_SORT_STORAGE_KEY, sort); }, [sort]);

  const counts = useMemo(() => buildVaultCounts(vault.items, vault.folders.map((folder) => folder.id)), [vault.folders, vault.items]);
  const visibleItems = useMemo(() => selectVaultItems(vault.items, { query, filter, sort }), [filter, query, sort, vault.items]);
  const selectedItem = useMemo(() => vault.items.find((item) => item.id === selectedId) ?? null, [selectedId, vault.items]);
  const checkedItems = useMemo(() => vault.items.filter((item) => checkedIds.has(item.id)), [checkedIds, vault.items]);
  const title = filterTitle(filter, filter.kind === "folder" ? vault.folders.find((folder) => folder.id === filter.folderId)?.name : undefined);
  const selectItem = (item: VaultItemView) => { setSelectedId(item.id); setMobilePane("detail"); const url = new URL(window.location.href); url.searchParams.set("item", item.id); window.history.replaceState(null, "", url); };
  const changeFilter = (next: VaultFilter) => { setFilter(next); setCheckedIds(new Set()); setSelectedId(null); setMobilePane("list"); };
  const handleBulkResult = (result: BulkMutationResult) => { const conflicts = result.outcomes.filter((outcome) => outcome.status === "conflict"); if (conflicts.length > 0) setConflictDialog(true); toast.push({ title: result.failed ? "操作部分完成" : "操作完成", description: `成功 ${result.succeeded} 项${result.failed ? `，未处理 ${result.failed} 项` : ""}`, tone: result.failed ? "warning" : "success" }); setCheckedIds(new Set(result.outcomes.filter((outcome) => outcome.status !== "succeeded").map((outcome) => outcome.id))); };
  const runBulk = async (operation: (items: readonly VaultItemView[]) => Promise<BulkMutationResult>) => { if (checkedItems.length === 0) return; try { handleBulkResult(await operation(checkedItems)); } catch (error) { toast.push({ title: "操作失败", description: error instanceof Error ? error.message : "请重试。", tone: "danger" }); } };
  const folderMutation = async (operation: () => Promise<unknown>, success: string) => { try { await operation(); toast.push({ title: success, tone: "success" }); await refresh(); } catch (error) { toast.push({ title: "文件夹操作失败", description: error instanceof Error ? error.message : "请重试。", tone: "danger" }); throw error; } };
  const listPanel = vault.status === "loading" || vault.status === "idle" ? <TaskState kind="loading" compact /> : vault.status === "error" ? <TaskState kind="fatal" title="无法加载密码库" description={vault.error ?? undefined} actionLabel="重试" onAction={() => void refresh()} /> : <VaultList items={visibleItems} selectedId={selectedId} checkedIds={checkedIds} onSelect={selectItem} onToggle={(id) => setCheckedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />;

  const headerAction = (label: string, icon: React.ReactNode, action?: () => void, href?: string) => (
    <Tooltip title={label}>{href ? <IconButton component={AppLink} href={href} aria-label={label}>{icon}</IconButton> : <IconButton aria-label={label} onClick={action}>{icon}</IconButton>}</Tooltip>
  );

  return (
    <RouteGuard>
      <AppShell
        mobilePane={mobilePane}
        onMobileBack={() => setMobilePane(mobilePane === "detail" ? "list" : mobilePane === "list" ? "navigation" : "list")}
        header={<Stack direction="row" sx={{ width: "100%", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Stack direction="row" sx={{ alignItems: "center", minWidth: 0, gap: 1 }}><Tooltip title="打开密码库视图"><IconButton aria-label="打开密码库视图" onClick={() => setMobilePane("navigation")} sx={{ display: { md: "none" } }}><MenuOutlined /></IconButton></Tooltip><Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: "primary.main", fontWeight: 700 }}>V</Avatar><Typography sx={{ fontWeight: 700, display: { xs: "none", sm: "block" } }}>Vercelwarden</Typography></Stack><Stack direction="row" sx={{ alignItems: "center", gap: 0.25 }}><Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 220, display: { xs: "none", lg: "block" }, mr: 1 }}>{session.user?.email}</Typography>{session.user?.roles.includes("admin") ? headerAction("管理控制台", <AdminPanelSettingsOutlined />, undefined, "/admin") : null}{headerAction("设置", <SettingsOutlined />, undefined, "/settings")}{headerAction("刷新密码库", <RefreshOutlined />, () => void refresh())}{headerAction("锁定", <LockOutlined />, () => lockController.lock())}{headerAction("退出", <LogoutOutlined />, () => void lockController.logout())}</Stack></Stack>}
        navigation={<VaultSidebar filter={filter} counts={counts} folders={vault.folders} onFilterChange={changeFilter} onManageFolders={() => setFolderDialog(true)} />}
        list={<Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
          <Box sx={{ p: 2, pb: 1.5 }}><Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}><Box><Typography component="h2" variant="h6">{title}</Typography><Typography variant="body2" color="text.secondary">{visibleItems.length} 项</Typography></Box><Stack direction="row" sx={{ gap: 0.5 }}><Button size="small" startIcon={<AddOutlined />} variant="contained" onClick={() => setEditorTarget("new")}>新建</Button><Button size="small" startIcon={<CheckBoxOutlined />} onClick={() => setCheckedIds(new Set(visibleItems.map((item) => item.id)))}>全选</Button></Stack></Stack></Box>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ px: 2, pb: 1.5, gap: 1 }}><TextField label="搜索密码库" placeholder="搜索名称、账号、网站或字段" value={query} onChange={(event) => setQuery(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> } }} /><FormControl sx={{ minWidth: 128 }}><InputLabel id="vault-sort-label">项目排序</InputLabel><Select labelId="vault-sort-label" label="项目排序" value={sort} onChange={(event) => setSort(event.target.value as VaultSort)}><MenuItem value="name">名称</MenuItem><MenuItem value="created-desc">最新创建</MenuItem><MenuItem value="updated-desc">最近修改</MenuItem></Select></FormControl></Stack>
          {filter.kind === "duplicates" ? <Box sx={{ px: 2, pb: 1.5 }}><FormControl><InputLabel id="duplicate-mode-label">匹配方式</InputLabel><Select labelId="duplicate-mode-label" label="匹配方式" value={filter.mode} onChange={(event) => setFilter({ ...filter, mode: event.target.value as DuplicateDetectionMode })}><MenuItem value="exact">完全相同</MenuItem><MenuItem value="login-site">站点 + 凭据</MenuItem><MenuItem value="login-credentials">登录凭据</MenuItem><MenuItem value="password">重复密码</MenuItem></Select></FormControl></Box> : null}
          {checkedItems.length > 0 ? <Paper square elevation={2} aria-label="批量操作" sx={{ px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 1 }}><Chip color="primary" label={`已选 ${checkedItems.length}`} onDelete={() => setCheckedIds(new Set())} /><Button size="small" startIcon={<FavoriteBorderOutlined />} onClick={() => void runBulk((items) => favoriteCiphers(items, true))}>收藏</Button><Button size="small" startIcon={<FolderOpenOutlined />} onClick={() => setMoveDialog(true)}>移动</Button>{filter.kind === "archive" ? <Button size="small" startIcon={<RestoreOutlined />} onClick={() => setConfirmMode("unarchive")}>取消归档</Button> : filter.kind !== "trash" ? <Button size="small" startIcon={<ArchiveOutlined />} onClick={() => setConfirmMode("archive")}>归档</Button> : null}{filter.kind === "trash" ? <><Button size="small" startIcon={<RestoreOutlined />} onClick={() => setConfirmMode("restore")}>恢复</Button><Button size="small" startIcon={<DeleteOutlineOutlined />} color="error" onClick={() => setConfirmMode("permanent")}>永久删除</Button></> : <Button size="small" startIcon={<DeleteOutlineOutlined />} color="error" onClick={() => setConfirmMode("trash")}>移入回收站</Button>}</Paper> : null}
          <Box sx={{ minHeight: 0, flex: 1, display: "flex" }}>{listPanel}</Box>
        </Box>}
        detail={<VaultDetail key={selectedItem?.id ?? "empty"} item={selectedItem} onEdit={(item) => setEditorTarget(item)} />}
      />

      {editorTarget !== null ? <VaultEditor open item={editorTarget === "new" ? null : editorTarget} folders={vault.folders} onOpenChange={(open) => { if (!open) setEditorTarget(null); }} onSaved={(item) => { setSelectedId(item.id); setMobilePane("detail"); const url = new URL(window.location.href); url.searchParams.set("item", item.id); window.history.replaceState(null, "", url); }} /> : null}
      <FolderManagerDialog open={folderDialog} folders={vault.folders} onOpenChange={setFolderDialog} onCreate={(name) => folderMutation(() => createFolder(name), "文件夹已创建")} onRename={(id, name) => folderMutation(() => renameFolder(id, name), "文件夹已重命名")} onDelete={(id) => folderMutation(() => deleteFolder(id), "文件夹已删除")} />
      <MoveItemsDialog open={moveDialog} count={checkedItems.length} folders={vault.folders} onOpenChange={setMoveDialog} onMove={async (folderId) => { await runBulk((items) => moveCiphers(items, folderId)); }} />
      <ConfirmItemsDialog open={confirmMode === "archive"} onOpenChange={(open) => { if (!open) setConfirmMode(null); }} title="归档项目" description={`归档 ${checkedItems.length} 个项目。`} confirmLabel="归档" onConfirm={async () => { await runBulk(archiveCiphers); }} />
      <ConfirmItemsDialog open={confirmMode === "unarchive"} onOpenChange={(open) => { if (!open) setConfirmMode(null); }} title="取消归档" description={`将 ${checkedItems.length} 个项目移回活动密码库。`} confirmLabel="取消归档" onConfirm={async () => { await runBulk(unarchiveCiphers); }} />
      <ConfirmItemsDialog open={confirmMode === "restore"} onOpenChange={(open) => { if (!open) setConfirmMode(null); }} title="恢复项目" description={`从回收站恢复 ${checkedItems.length} 个项目。`} confirmLabel="恢复" onConfirm={async () => { await runBulk(restoreCiphers); }} />
      <ConfirmItemsDialog open={confirmMode === "trash"} onOpenChange={(open) => { if (!open) setConfirmMode(null); }} title="移入回收站" description={`将 ${checkedItems.length} 个项目移入回收站。`} confirmLabel="移入回收站" danger onConfirm={async () => { await runBulk(trashCiphers); }} />
      <ConfirmItemsDialog open={confirmMode === "permanent"} onOpenChange={(open) => { if (!open) setConfirmMode(null); }} title="永久删除项目" description={`永久删除 ${checkedItems.length} 个项目。此操作无法撤销。`} confirmLabel="永久删除" danger onConfirm={async () => { await runBulk(permanentlyDeleteCiphers); }} />
      <ConflictDialog open={conflictDialog} onOpenChange={setConflictDialog} onReload={refresh} />
    </RouteGuard>
  );
}

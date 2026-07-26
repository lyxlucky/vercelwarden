"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AddOutlined,
  AdminPanelSettingsOutlined,
  ArchiveOutlined,
  ChecklistOutlined,
  CloseOutlined,
  DeleteOutlineOutlined,
  FavoriteBorderOutlined,
  FolderOpenOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoreVertOutlined,
  RefreshOutlined,
  RestoreOutlined,
  SearchOutlined,
  SelectAllOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { BrandLockup } from "@/components/brand/BrandLogo";
import { AppShell, type MobilePane } from "@/components/shell/AppShell";
import { NetworkStatus } from "@/components/shell/NetworkStatus";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AppLink } from "@/components/theme/AppLink";
import { TaskState } from "@/components/feedback/TaskState";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { useToast } from "@/components/ui/ToastProvider";
import { lockController } from "@/features/auth/lock-controller";
import {
  archiveCiphers,
  createFolder,
  deleteFolder,
  favoriteCiphers,
  fetchVaultSnapshot,
  moveCiphers,
  permanentlyDeleteCiphers,
  renameFolder,
  restoreCiphers,
  trashCiphers,
  unarchiveCiphers,
  type BulkMutationResult,
} from "@/features/vault/api";
import { VaultDetail, type VaultDetailAction } from "@/features/vault/VaultDetail";
import { ConfirmItemsDialog, ConflictDialog, FolderManagerDialog, MoveItemsDialog } from "@/features/vault/VaultDialogs";
import { VaultEditor } from "@/features/vault/VaultEditor";
import { VaultList } from "@/features/vault/VaultList";
import { VaultSidebar } from "@/features/vault/VaultSidebar";
import {
  buildVaultCounts,
  selectVaultItems,
  useVaultSnapshot,
  vaultStore,
  type DuplicateDetectionMode,
  type VaultFilter,
  type VaultItemView,
  type VaultSort,
} from "@/features/vault/store";
import { useSession } from "@/lib/client/state/session-store";

type ConfirmMode = "archive" | "unarchive" | "restore" | "trash" | "permanent" | null;
type PendingConfirm = { mode: Exclude<ConfirmMode, null>; items: VaultItemView[] } | null;
const VAULT_SORT_STORAGE_KEY = "vercelwarden.vault.sort";

function storedSort(): VaultSort {
  if (typeof window === "undefined") return "name";
  const value = window.localStorage.getItem(VAULT_SORT_STORAGE_KEY);
  return value === "created-desc" || value === "updated-desc" ? value : "name";
}

function filterTitle(filter: VaultFilter, folderName?: string) {
  if (filter.kind === "favorites") return "收藏";
  if (filter.kind === "archive") return "归档";
  if (filter.kind === "trash") return "回收站";
  if (filter.kind === "duplicates") return "重复项";
  if (filter.kind === "folder") return folderName ?? "文件夹";
  if (filter.kind === "type") return "类型项目";
  return "所有项目";
}

function TopBarAction({ label, icon, action, href, mobileHidden = false, disabled = false }: { label: string; icon: ReactNode; action?: () => void; href?: string; mobileHidden?: boolean; disabled?: boolean }) {
  return (
    <Tooltip title={label}>
      {href ? (
        <IconButton component={AppLink} href={href} aria-label={label} sx={{ display: mobileHidden ? { xs: "none", sm: "inline-flex" } : undefined }}>{icon}</IconButton>
      ) : (
        <IconButton aria-label={label} onClick={action} disabled={disabled} sx={{ display: mobileHidden ? { xs: "none", sm: "inline-flex" } : undefined }}>{icon}</IconButton>
      )}
    </Tooltip>
  );
}

export default function VaultPage() {
  const session = useSession();
  const vault = useVaultSnapshot();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VaultFilter>({ kind: "all" });
  const [sort, setSort] = useState<VaultSort>(storedSort);
  const [selectedId, setSelectedId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item"));
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [folderDialog, setFolderDialog] = useState(false);
  const [moveTargets, setMoveTargets] = useState<VaultItemView[] | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [conflictDialog, setConflictDialog] = useState(false);
  const [editorTarget, setEditorTarget] = useState<"new" | VaultItemView | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [selectionMoreAnchor, setSelectionMoreAnchor] = useState<HTMLElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const mutationInFlight = useRef(false);

  const refresh = useCallback((announce = false) => {
    if (refreshInFlight.current) return refreshInFlight.current;
    setRefreshing(true);
    vaultStore.setLoading();
    const operation = (async () => {
      try {
        const snapshot = await fetchVaultSnapshot();
        vaultStore.replace(snapshot.items, snapshot.folders);
        if (announce) toast.push({ title: "密码库已刷新", tone: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "密码库加载失败。";
        vaultStore.setError(message);
        if (announce) toast.push({ title: "刷新失败", description: message, tone: "danger" });
      } finally {
        setRefreshing(false);
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = operation;
    return operation;
  }, [toast]);

  useEffect(() => { if (session.phase === "unlocked" && vault.status === "idle") void refresh(false); }, [refresh, session.phase, vault.status]);
  useEffect(() => { window.localStorage.setItem(VAULT_SORT_STORAGE_KEY, sort); }, [sort]);
  useEffect(() => {
    if (!selectionMode) return;
    const exitOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelectionMode(false); setCheckedIds(new Set()); } };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [selectionMode]);

  const counts = useMemo(() => buildVaultCounts(vault.items, vault.folders.map((folder) => folder.id)), [vault.folders, vault.items]);
  const visibleItems = useMemo(() => selectVaultItems(vault.items, { query, filter, sort }), [filter, query, sort, vault.items]);
  const selectedItem = useMemo(() => vault.items.find((item) => item.id === selectedId) ?? null, [selectedId, vault.items]);
  const checkedItems = useMemo(() => vault.items.filter((item) => checkedIds.has(item.id)), [checkedIds, vault.items]);
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => checkedIds.has(item.id));
  const title = filterTitle(filter, filter.kind === "folder" ? vault.folders.find((folder) => folder.id === filter.folderId)?.name : undefined);

  const updateItemUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("item", id); else url.searchParams.delete("item");
    window.history.replaceState(null, "", url);
  };
  const selectItem = (item: VaultItemView) => { setSelectedId(item.id); setMobilePane("detail"); updateItemUrl(item.id); };
  const exitSelectionMode = () => { setSelectionMode(false); setCheckedIds(new Set()); setSelectionMoreAnchor(null); };
  const changeFilter = (next: VaultFilter) => { setFilter(next); exitSelectionMode(); setSelectedId(null); setMobilePane("list"); updateItemUrl(null); };
  const handleBulkResult = (result: BulkMutationResult) => {
    const conflicts = result.outcomes.filter((outcome) => outcome.status === "conflict");
    if (conflicts.length > 0) setConflictDialog(true);
    toast.push({ title: result.failed ? "操作部分完成" : "操作完成", description: `成功 ${result.succeeded} 项${result.failed ? `，未处理 ${result.failed} 项` : ""}`, tone: result.failed ? "warning" : "success" });
    const remaining = new Set(result.outcomes.filter((outcome) => outcome.status !== "succeeded").map((outcome) => outcome.id));
    setCheckedIds(remaining);
    if (selectionMode && remaining.size === 0) setSelectionMode(false);
  };
  const runItems = async (items: readonly VaultItemView[], operation: (items: readonly VaultItemView[]) => Promise<BulkMutationResult>) => {
    if (items.length === 0 || mutationInFlight.current) return null;
    mutationInFlight.current = true;
    setMutationBusy(true);
    try {
      const result = await operation(items);
      handleBulkResult(result);
      return result;
    } catch (error) {
      toast.push({ title: "操作失败", description: error instanceof Error ? error.message : "请重试。", tone: "danger" });
      return null;
    } finally {
      mutationInFlight.current = false;
      setMutationBusy(false);
    }
  };
  const folderMutation = async (operation: () => Promise<unknown>, success: string) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationBusy(true);
    try { await operation(); toast.push({ title: success, tone: "success" }); await refresh(false); }
    catch (error) { toast.push({ title: "文件夹操作失败", description: error instanceof Error ? error.message : "请重试。", tone: "danger" }); throw error; }
    finally { mutationInFlight.current = false; setMutationBusy(false); }
  };

  const listPanel = vault.status === "loading" || vault.status === "idle"
    ? <TaskState kind="loading" compact />
    : vault.status === "error"
      ? <TaskState kind="fatal" title="无法加载密码库" description={vault.error ?? undefined} actionLabel="重试" onAction={() => void refresh(true)} />
      : <VaultList items={visibleItems} selectedId={selectedId} checkedIds={checkedIds} selectionMode={selectionMode} onSelect={selectItem} onToggle={(id) => setCheckedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />;

  const requestConfirm = (mode: Exclude<ConfirmMode, null>, items: readonly VaultItemView[]) => setPendingConfirm({ mode, items: [...items] });
  const handleDetailAction = (action: VaultDetailAction, item: VaultItemView) => {
    if (action === "favorite") { void runItems([item], (items) => favoriteCiphers(items, !item.favorite)); return; }
    requestConfirm(action, [item]);
  };
  const runPendingConfirm = async (operation: (items: readonly VaultItemView[]) => Promise<BulkMutationResult>) => {
    if (!pendingConfirm) return;
    const result = await runItems(pendingConfirm.items, operation);
    const selectedSucceeded = result?.outcomes.some((outcome) => outcome.id === selectedId && outcome.status === "succeeded");
    if (selectedSucceeded) { setSelectedId(null); setMobilePane("list"); updateItemUrl(null); }
  };
  const pendingTarget = pendingConfirm?.items.length === 1 ? pendingConfirm.items[0]?.name : `${pendingConfirm?.items.length ?? 0} 个项目`;

  const openMore = (event: MouseEvent<HTMLElement>) => setMoreAnchor(event.currentTarget);
  const closeMore = () => setMoreAnchor(null);
  const moreAction = (action: () => void) => { closeMore(); action(); };
  const closeSelectionMore = () => setSelectionMoreAnchor(null);
  const selectionMoreAction = (action: () => void) => { closeSelectionMore(); action(); };

  return (
    <RouteGuard>
      <AppShell
        mobilePane={mobilePane}
        onMobileBack={() => setMobilePane(mobilePane === "detail" ? "list" : mobilePane === "list" ? "navigation" : "list")}
        header={(
          <Stack direction="row" sx={{ width: "100%", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Stack direction="row" sx={{ alignItems: "center", minWidth: 0, gap: 1.25 }}>
              <Tooltip title="打开密码库视图"><IconButton aria-label="打开密码库视图" onClick={() => setMobilePane("navigation")} sx={{ display: { md: "none" } }}><MenuOutlined /></IconButton></Tooltip>
              <BrandLockup
                subtitle="个人密码库"
                markSize={36}
                subtitleSx={{ display: { xs: "none", sm: "block" } }}
              />
            </Stack>
            <ActionGroup compact sx={{ flex: "0 0 auto", flexWrap: "nowrap" }}>
              {session.readOnly ? <Chip size="small" color="warning" variant="outlined" label="只读" sx={{ mr: 0.5 }} /> : null}
              <NetworkStatus />
              {session.user?.roles.includes("admin") ? <TopBarAction label="管理控制台" icon={<AdminPanelSettingsOutlined />} href="/admin" mobileHidden /> : null}
              <TopBarAction label="设置" icon={<SettingsOutlined />} href="/settings" mobileHidden />
              <TopBarAction label={refreshing ? "正在刷新密码库" : "刷新密码库"} icon={refreshing ? <CircularProgress size={20} color="inherit" /> : <RefreshOutlined />} action={() => void refresh(true)} mobileHidden disabled={refreshing} />
              <TopBarAction label="锁定" icon={<LockOutlined />} action={() => lockController.lock()} />
              <Tooltip title="更多"><IconButton aria-label="更多操作" onClick={openMore} sx={{ display: { sm: "none" } }}><MoreVertOutlined /></IconButton></Tooltip>
              <TopBarAction label="退出" icon={<LogoutOutlined />} action={() => void lockController.logout()} mobileHidden />
              <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={closeMore}>
                {session.user?.roles.includes("admin") ? <MenuItem component={AppLink} href="/admin" onClick={closeMore}><ListItemIcon><AdminPanelSettingsOutlined fontSize="small" /></ListItemIcon><ListItemText>管理控制台</ListItemText></MenuItem> : null}
                <MenuItem component={AppLink} href="/settings" onClick={closeMore}><ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon><ListItemText>设置</ListItemText></MenuItem>
                <MenuItem disabled={refreshing} onClick={() => moreAction(() => void refresh(true))}><ListItemIcon>{refreshing ? <CircularProgress size={18} /> : <RefreshOutlined fontSize="small" />}</ListItemIcon><ListItemText>{refreshing ? "正在刷新" : "刷新密码库"}</ListItemText></MenuItem>
                <MenuItem onClick={() => moreAction(() => void lockController.logout())}><ListItemIcon><LogoutOutlined fontSize="small" /></ListItemIcon><ListItemText>退出</ListItemText></MenuItem>
              </Menu>
            </ActionGroup>
          </Stack>
        )}
        navigation={<VaultSidebar filter={filter} counts={counts} folders={vault.folders} onFilterChange={changeFilter} onManageFolders={() => setFolderDialog(true)} />}
        list={(
          <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
            <Box
              component="header"
              aria-label={selectionMode ? "批量操作" : undefined}
              aria-busy={selectionMode && mutationBusy ? true : undefined}
              sx={{
                minHeight: 92,
                px: 2,
                py: 1.5,
                display: "flex",
                alignItems: "center",
                borderBottom: 1,
                borderColor: selectionMode ? "primary.main" : "divider",
                bgcolor: selectionMode ? (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.08) : "background.paper",
              }}
            >
              {selectionMode ? (
                <Stack direction="row" sx={{ width: "100%", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1, minWidth: 0 }}>
                    <Tooltip title="退出选择模式"><IconButton aria-label="退出选择模式" onClick={exitSelectionMode}><CloseOutlined /></IconButton></Tooltip>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>{checkedItems.length > 0 ? `已选择 ${checkedItems.length} 项` : "选择项目"}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{mutationBusy ? "正在处理所选项目…" : checkedItems.length > 0 ? "可直接执行批量操作" : "点击列表项进行多选，Esc 退出"}</Typography>
                    </Box>
                  </Stack>
                  <ActionGroup compact sx={{ display: { xs: "none", sm: "flex" }, flex: "0 0 auto", flexWrap: "nowrap" }}>
                    <Tooltip title={allVisibleSelected ? "取消全选" : "全选"}><span><IconButton aria-label={allVisibleSelected ? "取消全选" : "全选"} disabled={visibleItems.length === 0 || mutationBusy} onClick={() => setCheckedIds(allVisibleSelected ? new Set() : new Set(visibleItems.map((item) => item.id)))}><SelectAllOutlined /></IconButton></span></Tooltip>
                    <Tooltip title="收藏"><span><IconButton aria-label="收藏所选项目" disabled={checkedItems.length === 0 || mutationBusy} onClick={() => void runItems(checkedItems, (items) => favoriteCiphers(items, true))}><FavoriteBorderOutlined /></IconButton></span></Tooltip>
                    <Tooltip title="移动"><span><IconButton aria-label="移动所选项目" disabled={checkedItems.length === 0 || mutationBusy} onClick={() => setMoveTargets([...checkedItems])}><FolderOpenOutlined /></IconButton></span></Tooltip>
                    {filter.kind === "archive" ? <Tooltip title="取消归档"><span><IconButton aria-label="取消归档所选项目" disabled={checkedItems.length === 0 || mutationBusy} onClick={() => requestConfirm("unarchive", checkedItems)}><RestoreOutlined /></IconButton></span></Tooltip> : filter.kind !== "trash" ? <Tooltip title="归档"><span><IconButton aria-label="归档所选项目" disabled={checkedItems.length === 0 || mutationBusy} onClick={() => requestConfirm("archive", checkedItems)}><ArchiveOutlined /></IconButton></span></Tooltip> : null}
                    {filter.kind === "trash" ? <><Tooltip title="恢复"><span><IconButton aria-label="恢复所选项目" disabled={checkedItems.length === 0 || mutationBusy} onClick={() => requestConfirm("restore", checkedItems)}><RestoreOutlined /></IconButton></span></Tooltip><Tooltip title="永久删除"><span><IconButton aria-label="永久删除所选项目" color="error" disabled={checkedItems.length === 0 || mutationBusy} onClick={() => requestConfirm("permanent", checkedItems)}><DeleteOutlineOutlined /></IconButton></span></Tooltip></> : <Tooltip title="移入回收站"><span><IconButton aria-label="将所选项目移入回收站" color="error" disabled={checkedItems.length === 0 || mutationBusy} onClick={() => requestConfirm("trash", checkedItems)}><DeleteOutlineOutlined /></IconButton></span></Tooltip>}
                  </ActionGroup>
                  <ActionGroup compact sx={{ display: { xs: "flex", sm: "none" }, flex: "0 0 auto", flexWrap: "nowrap" }}>
                    <Tooltip title={allVisibleSelected ? "取消全选" : "全选"}><span><IconButton aria-label={allVisibleSelected ? "取消全选" : "全选"} disabled={visibleItems.length === 0 || mutationBusy} onClick={() => setCheckedIds(allVisibleSelected ? new Set() : new Set(visibleItems.map((item) => item.id)))}><SelectAllOutlined /></IconButton></span></Tooltip>
                    <Tooltip title="更多批量操作"><span><IconButton aria-label="更多批量操作" disabled={mutationBusy} onClick={(event) => setSelectionMoreAnchor(event.currentTarget)}><MoreVertOutlined /></IconButton></span></Tooltip>
                  </ActionGroup>
                  <Menu anchorEl={selectionMoreAnchor} open={Boolean(selectionMoreAnchor)} onClose={closeSelectionMore}>
                    <MenuItem disabled={checkedItems.length === 0 || mutationBusy} onClick={() => selectionMoreAction(() => void runItems(checkedItems, (items) => favoriteCiphers(items, true)))}><ListItemIcon><FavoriteBorderOutlined fontSize="small" /></ListItemIcon><ListItemText>收藏所选项目</ListItemText></MenuItem>
                    <MenuItem disabled={checkedItems.length === 0 || mutationBusy} onClick={() => selectionMoreAction(() => setMoveTargets([...checkedItems]))}><ListItemIcon><FolderOpenOutlined fontSize="small" /></ListItemIcon><ListItemText>移动所选项目</ListItemText></MenuItem>
                    {filter.kind === "archive" ? <MenuItem disabled={checkedItems.length === 0 || mutationBusy} onClick={() => selectionMoreAction(() => requestConfirm("unarchive", checkedItems))}><ListItemIcon><RestoreOutlined fontSize="small" /></ListItemIcon><ListItemText>取消归档</ListItemText></MenuItem> : filter.kind !== "trash" ? <MenuItem disabled={checkedItems.length === 0 || mutationBusy} onClick={() => selectionMoreAction(() => requestConfirm("archive", checkedItems))}><ListItemIcon><ArchiveOutlined fontSize="small" /></ListItemIcon><ListItemText>归档所选项目</ListItemText></MenuItem> : null}
                    {filter.kind === "trash" ? <><MenuItem disabled={checkedItems.length === 0 || mutationBusy} onClick={() => selectionMoreAction(() => requestConfirm("restore", checkedItems))}><ListItemIcon><RestoreOutlined fontSize="small" /></ListItemIcon><ListItemText>恢复所选项目</ListItemText></MenuItem><MenuItem disabled={checkedItems.length === 0 || mutationBusy} onClick={() => selectionMoreAction(() => requestConfirm("permanent", checkedItems))} sx={{ color: "error.main" }}><ListItemIcon sx={{ color: "inherit" }}><DeleteOutlineOutlined fontSize="small" /></ListItemIcon><ListItemText>永久删除</ListItemText></MenuItem></> : <MenuItem disabled={checkedItems.length === 0 || mutationBusy} onClick={() => selectionMoreAction(() => requestConfirm("trash", checkedItems))} sx={{ color: "error.main" }}><ListItemIcon sx={{ color: "inherit" }}><DeleteOutlineOutlined fontSize="small" /></ListItemIcon><ListItemText>移入回收站</ListItemText></MenuItem>}
                  </Menu>
                </Stack>
              ) : (
                <Stack direction={{ xs: "column", sm: "row" }} sx={{ width: "100%", alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", gap: 1.5 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 750 }}>当前视图</Typography>
                    <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography component="h2" variant="h6">{title}</Typography>
                      <Typography variant="caption" color="text.secondary">{visibleItems.length} 项</Typography>
                    </Stack>
                  </Box>
                  <ActionGroup compact sx={{ width: { xs: "100%", sm: "auto" }, flex: "0 0 auto", "& > .MuiButton-root": { flex: { xs: 1, sm: "0 0 auto" } } }}>
                    <Button startIcon={<ChecklistOutlined />} variant="outlined" disabled={visibleItems.length === 0} onClick={() => setSelectionMode(true)}>选择</Button>
                    <Button startIcon={<AddOutlined />} variant="contained" onClick={() => setEditorTarget("new")}>新建</Button>
                  </ActionGroup>
                </Stack>
              )}
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} sx={{ px: 2, py: 1.5, gap: 1, alignItems: "flex-start", borderBottom: 1, borderColor: "divider" }}>
              <TextField size="small" label="搜索密码库" placeholder="名称、账号、网站或字段" value={query} onChange={(event) => { setQuery(event.target.value); if (selectionMode) exitSelectionMode(); }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> } }} />
              <FormControl size="small" sx={{ width: { xs: "100%", sm: 138 }, flex: { xs: "1 1 auto", sm: "0 0 138px" } }}><InputLabel id="vault-sort-label">项目排序</InputLabel><Select labelId="vault-sort-label" label="项目排序" value={sort} onChange={(event) => setSort(event.target.value as VaultSort)}><MenuItem value="name">名称</MenuItem><MenuItem value="created-desc">最新创建</MenuItem><MenuItem value="updated-desc">最近修改</MenuItem></Select></FormControl>
            </Stack>

            {filter.kind === "duplicates" ? <Box sx={{ px: 2, pb: 2 }}><FormControl size="small"><InputLabel id="duplicate-mode-label">匹配方式</InputLabel><Select labelId="duplicate-mode-label" label="匹配方式" value={filter.mode} onChange={(event) => setFilter({ ...filter, mode: event.target.value as DuplicateDetectionMode })}><MenuItem value="exact">完全相同</MenuItem><MenuItem value="login-site">站点 + 凭据</MenuItem><MenuItem value="login-credentials">登录凭据</MenuItem><MenuItem value="password">重复密码</MenuItem></Select></FormControl></Box> : null}
            <Box sx={{ minHeight: 0, flex: 1, display: "flex" }}>{listPanel}</Box>
          </Box>
        )}
        detail={<VaultDetail key={selectedItem?.id ?? "empty"} item={selectedItem} onEdit={(item) => setEditorTarget(item)} onAction={handleDetailAction} />}
      />

      {editorTarget !== null ? <VaultEditor open item={editorTarget === "new" ? null : editorTarget} folders={vault.folders} onOpenChange={(open) => { if (!open) setEditorTarget(null); }} onSaved={(item) => { setSelectedId(item.id); setMobilePane("detail"); updateItemUrl(item.id); }} /> : null}
      <FolderManagerDialog open={folderDialog} folders={vault.folders} onOpenChange={setFolderDialog} onCreate={(name) => folderMutation(() => createFolder(name), "文件夹已创建")} onRename={(id, name) => folderMutation(() => renameFolder(id, name), "文件夹已重命名")} onDelete={(id) => folderMutation(() => deleteFolder(id), "文件夹已删除")} />
      <MoveItemsDialog open={Boolean(moveTargets)} count={moveTargets?.length ?? 0} folders={vault.folders} onOpenChange={(open) => { if (!open) setMoveTargets(null); }} onMove={async (folderId) => { if (moveTargets) await runItems(moveTargets, (items) => moveCiphers(items, folderId)); }} />
      <ConfirmItemsDialog open={pendingConfirm?.mode === "archive"} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }} title="归档项目" description={`归档 ${pendingConfirm?.items.length ?? 0} 个项目。`} target={pendingTarget} consequences="项目将离开活动密码库，可稍后从归档视图恢复。" confirmLabel="归档" onConfirm={async () => { await runPendingConfirm(archiveCiphers); }} />
      <ConfirmItemsDialog open={pendingConfirm?.mode === "unarchive"} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }} title="取消归档" description={`将 ${pendingConfirm?.items.length ?? 0} 个项目移回活动密码库。`} target={pendingTarget} confirmLabel="取消归档" onConfirm={async () => { await runPendingConfirm(unarchiveCiphers); }} />
      <ConfirmItemsDialog open={pendingConfirm?.mode === "restore"} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }} title="恢复项目" description={`从回收站恢复 ${pendingConfirm?.items.length ?? 0} 个项目。`} target={pendingTarget} confirmLabel="恢复" onConfirm={async () => { await runPendingConfirm(restoreCiphers); }} />
      <ConfirmItemsDialog open={pendingConfirm?.mode === "trash"} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }} title="移入回收站" description={`将 ${pendingConfirm?.items.length ?? 0} 个项目移入回收站。`} target={pendingTarget} consequences="项目不会立即永久删除，可从回收站恢复。" confirmLabel="移入回收站" danger onConfirm={async () => { await runPendingConfirm(trashCiphers); }} />
      <ConfirmItemsDialog open={pendingConfirm?.mode === "permanent"} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }} title="永久删除项目" description={`永久删除 ${pendingConfirm?.items.length ?? 0} 个项目。`} target={pendingTarget} consequences="此操作无法撤销，项目内容和附件将无法恢复。" confirmLabel="永久删除" danger onConfirm={async () => { await runPendingConfirm(permanentlyDeleteCiphers); }} />
      <ConflictDialog open={conflictDialog} onOpenChange={setConflictDialog} onReload={refresh} />
    </RouteGuard>
  );
}

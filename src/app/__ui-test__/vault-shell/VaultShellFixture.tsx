"use client";

import { useState, type MouseEvent } from "react";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ArchiveOutlined from "@mui/icons-material/ArchiveOutlined";
import ChecklistOutlined from "@mui/icons-material/ChecklistOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import MenuOutlined from "@mui/icons-material/MenuOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { AppShell, type MobilePane } from "@/components/shell/AppShell";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { useToast } from "@/components/ui/ToastProvider";
import { VaultSidebar } from "@/features/vault/VaultSidebar";
import type { VaultFilter } from "@/features/vault/store";

const counts = {
  all: 2,
  favorites: 1,
  archive: 1,
  trash: 0,
  duplicates: 0,
  types: { 1: 1, 2: 1 },
  folders: { "fixture-folder": 1 },
};

export function VaultShellFixture() {
  const toast = useToast();
  const [filter, setFilter] = useState<VaultFilter>({ kind: "all" });
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [selected, setSelected] = useState("Fixture item 1");
  const [selectionMode, setSelectionMode] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const chooseFilter = (next: VaultFilter) => {
    setFilter(next);
    setMobilePane("list");
  };

  const openSelectionMenu = (event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget);

  return (
    <Box sx={{ height: "100dvh", display: "flex", overflow: "hidden" }}>
      <AppShell
        mobilePane={mobilePane}
        onMobileBack={() => setMobilePane(mobilePane === "detail" ? "list" : mobilePane === "navigation" ? "list" : "navigation")}
        header={(
          <Stack direction="row" sx={{ width: "100%", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Stack direction="row" sx={{ alignItems: "center", minWidth: 0, gap: 1 }}>
              <Tooltip title="打开密码库视图"><IconButton aria-label="打开密码库视图" onClick={() => setMobilePane("navigation")} sx={{ display: { md: "none" } }}><MenuOutlined /></IconButton></Tooltip>
              <Box sx={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 2, color: "primary.main", bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12) }}><SecurityOutlined /></Box>
              <Typography noWrap sx={{ fontWeight: 800 }}>VercelWarden UI Fixture</Typography>
            </Stack>
            <ActionGroup compact sx={{ flexWrap: "nowrap" }}>
              <Tooltip title="设置"><IconButton aria-label="设置"><SettingsOutlined /></IconButton></Tooltip>
              <Button size="small" variant="contained" onClick={() => toast.push({ title: "测试反馈", description: "动作已完成", tone: "success" })}>显示反馈</Button>
            </ActionGroup>
          </Stack>
        )}
        navigation={(
          <VaultSidebar
            filter={filter}
            counts={counts}
            folders={[{ id: "fixture-folder", name: "Fixture folder" }]}
            onFilterChange={chooseFilter}
            onManageFolders={() => toast.push({ title: "管理文件夹" })}
          />
        )}
        list={(
          <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
            <Stack component="header" direction={{ xs: "column", sm: "row" }} sx={{ p: 2, gap: 1.5, alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", borderBottom: 1, borderColor: "divider" }}>
              <Box>
                <Typography component="h1" variant="h6">Fixture vault</Typography>
                <Typography variant="body2" color="text.secondary">响应式动作与面板测试</Typography>
              </Box>
              {selectionMode ? (
                <ActionGroup compact>
                  <Button onClick={() => setSelectionMode(false)}>退出选择</Button>
                  <Tooltip title="更多批量操作"><IconButton aria-label="更多批量操作" onClick={openSelectionMenu}><MoreVertOutlined /></IconButton></Tooltip>
                  <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                    <MenuItem onClick={() => setMenuAnchor(null)}><ArchiveOutlined fontSize="small" sx={{ mr: 1.5 }} />归档所选项目</MenuItem>
                    <MenuItem onClick={() => setMenuAnchor(null)} sx={{ color: "error.main" }}><DeleteOutlineOutlined fontSize="small" sx={{ mr: 1.5 }} />移入回收站</MenuItem>
                  </Menu>
                </ActionGroup>
              ) : (
                <ActionGroup compact sx={{ "& > .MuiButton-root": { flex: { xs: 1, sm: "0 0 auto" } } }}>
                  <Button startIcon={<ChecklistOutlined />} variant="outlined" onClick={() => setSelectionMode(true)}>选择</Button>
                  <Button startIcon={<AddOutlined />} variant="contained">新建</Button>
                </ActionGroup>
              )}
            </Stack>
            <List aria-label="Fixture items" sx={{ p: 1.5 }}>
              {["Fixture item 1", "Fixture item 2"].map((item) => (
                <ListItemButton
                  key={item}
                  selected={selected === item}
                  onClick={() => { setSelected(item); setMobilePane("detail"); }}
                  sx={{ mb: 1 }}
                >
                  <ListItemText primary={item} secondary="fixture@example.test" />
                </ListItemButton>
              ))}
            </List>
            <ActionGroup mobileStack sx={{ p: 2, mt: "auto", borderTop: 1, borderColor: "divider" }}>
              <Button variant="outlined" onClick={() => setDialogOpen(true)}>打开测试对话框</Button>
              <Button onClick={() => toast.push({ title: "列表动作完成", tone: "info" })}>运行列表动作</Button>
            </ActionGroup>
          </Box>
        )}
        detail={(
          <Box sx={{ p: { xs: 2, sm: 3 }, width: "100%" }}>
            <Card>
              <CardContent>
                <Typography component="h2" variant="h6">{selected}</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>当前详情面板保持键盘焦点和上下文。</Typography>
              </CardContent>
            </Card>
          </Box>
        )}
      />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} aria-labelledby="fixture-dialog-title">
        <DialogTitle id="fixture-dialog-title">测试对话框</DialogTitle>
        <DialogContent><Typography>验证 MUI 过渡与焦点恢复。</Typography></DialogContent>
        <DialogActions><Button onClick={() => setDialogOpen(false)}>关闭对话框</Button></DialogActions>
      </Dialog>
    </Box>
  );
}


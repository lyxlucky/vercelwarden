"use client";

import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import BackupOutlined from "@mui/icons-material/BackupOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import PeopleOutlined from "@mui/icons-material/PeopleOutlined";
import { List, ListItemButton, ListItemIcon, ListItemText, Paper } from "@mui/material";
import { usePathname } from "next/navigation";
import { AppLink } from "@/components/theme/AppLink";

const links = [["/admin", "用户与邀请", PeopleOutlined], ["/logs", "审计日志", HistoryOutlined], ["/backup", "系统备份", BackupOutlined]] as const;

export function AdminNav() {
  const pathname = usePathname();
  return <Paper component="nav" aria-label="管理导航" variant="outlined" sx={{ position: { md: "sticky" }, top: { md: 24 }, alignSelf: "start", overflow: "hidden" }}><List sx={{ display: { xs: "flex", md: "block" }, overflowX: { xs: "auto", md: "visible" }, p: 1 }}><ListItemButton component={AppLink} href="/vault" sx={{ minWidth: { xs: "max-content", md: 0 }, borderRadius: 2 }}><ListItemIcon sx={{ minWidth: 36 }}><ArrowBackOutlined fontSize="small" /></ListItemIcon><ListItemText primary="密码库" /></ListItemButton>{links.map(([href, label, Icon]) => <ListItemButton key={href} component={AppLink} href={href} selected={pathname === href} aria-current={pathname === href ? "page" : undefined} sx={{ minWidth: { xs: "max-content", md: 0 }, borderRadius: 2 }}><ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon><ListItemText primary={label} /></ListItemButton>)}</List></Paper>;
}

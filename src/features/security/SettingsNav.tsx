"use client";

import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import DevicesOutlined from "@mui/icons-material/DevicesOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import { List, ListItemButton, ListItemIcon, ListItemText, Paper } from "@mui/material";
import { usePathname } from "next/navigation";
import { AppLink } from "@/components/theme/AppLink";

const links = [
  ["/settings", "本机偏好", PaletteOutlined],
  ["/settings/account", "账号", AccountCircleOutlined],
  ["/settings/security", "安全凭据", SecurityOutlined],
  ["/settings/security/device-management", "设备与登录请求", DevicesOutlined],
  ["/settings/domain-rules", "域名规则", LanguageOutlined],
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <Paper component="nav" aria-label="设置导航" variant="outlined" sx={{ position: { md: "sticky" }, top: { md: 24 }, alignSelf: "start", overflow: "hidden" }}>
      <List sx={{ display: { xs: "flex", md: "block" }, overflowX: { xs: "auto", md: "visible" }, p: 1 }}>
        <ListItemButton component={AppLink} href="/vault" sx={{ minWidth: { xs: "max-content", md: 0 }, borderRadius: 2 }}>
          <ListItemIcon sx={{ minWidth: 36 }}><ArrowBackOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="密码库" />
        </ListItemButton>
        {links.map(([href, label, Icon]) => {
          const selected = href === "/settings" ? pathname === href : pathname === href || (href === "/settings/security" && pathname.startsWith(`${href}/`) && pathname !== "/settings/security/device-management");
          return (
            <ListItemButton key={href} component={AppLink} href={href} selected={selected} aria-current={selected ? "page" : undefined} sx={{ minWidth: { xs: "max-content", md: 0 }, borderRadius: 2 }}>
              <ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          );
        })}
      </List>
    </Paper>
  );
}

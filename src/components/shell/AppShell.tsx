"use client";

import type { ReactNode } from "react";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import { AppBar, Box, Drawer, IconButton, Toolbar, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";

export type MobilePane = "navigation" | "list" | "detail";

const navigationWidth = 280;
const listWidth = 408;

export function AppShell({
  header,
  navigation,
  list,
  detail,
  mobilePane = "list",
  onMobileBack,
}: {
  header: ReactNode;
  navigation: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  mobilePane?: MobilePane;
  onMobileBack?: () => void;
}) {
  const backButton = (label: string) => onMobileBack ? (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={onMobileBack}><ArrowBackOutlined /></IconButton>
    </Tooltip>
  ) : null;

  return (
    <Box
      data-mobile-pane={mobilePane}
      sx={{
        flex: 1,
        minHeight: 0,
        height: "100%",
        display: "grid",
        gridTemplateRows: "64px minmax(0, 1fr)",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: `${navigationWidth}px ${listWidth}px minmax(0, 1fr)` },
        gridTemplateAreas: { xs: '"header" "content"', md: '"header header header" "navigation list detail"' },
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <AppBar component="header" position="static" color="transparent" elevation={0} sx={{ gridArea: "header", borderBottom: 1, borderColor: "divider", bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.94 : 0.97), color: "text.primary", backdropFilter: "blur(12px)" }}>
        <Toolbar sx={{ minHeight: "64px !important", px: { xs: 1, sm: 2 } }}>{header}</Toolbar>
      </AppBar>

      <Box
        component="aside"
        aria-label="密码库导航"
        data-active={mobilePane === "navigation"}
        sx={{ gridArea: "navigation", display: { xs: "none", md: "block" }, minWidth: 0, overflow: "auto", borderRight: 1, borderColor: "divider", bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.06 : 0.025) }}
      >
        {navigation}
      </Box>

      <Drawer
        variant="temporary"
        open={mobilePane === "navigation"}
        onClose={onMobileBack}
        ModalProps={{ keepMounted: true }}
        slotProps={{ paper: { sx: { width: "min(88vw, 336px)", borderTopRightRadius: 4, borderBottomRightRadius: 4, bgcolor: "background.default" } } }}
        sx={{ display: { xs: "block", md: "none" } }}
      >
        {navigation}
      </Drawer>

      <Box
        component="section"
        aria-label="项目列表"
        data-active={mobilePane === "list"}
        sx={{
          gridArea: { xs: "content", md: "list" },
          display: { xs: mobilePane === "list" ? "flex" : "none", md: "flex" },
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          borderRight: { md: 1 },
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        {list}
      </Box>

      <Box
        component="main"
        data-active={mobilePane === "detail"}
        sx={{
          gridArea: { xs: "content", md: "detail" },
          display: { xs: mobilePane === "detail" ? "flex" : "none", md: "flex" },
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "auto",
          bgcolor: "background.default",
        }}
      >
        {mobilePane === "detail" && onMobileBack ? <Box sx={{ display: { xs: "block", md: "none" }, p: 0.5 }}>{backButton("返回列表")}</Box> : null}
        {detail}
      </Box>
    </Box>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import { AppBar, Box, Drawer, IconButton, Toolbar, Tooltip, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { motionTimeout, useReducedMotion } from "@/components/motion/useReducedMotion";

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  const reducedMotion = useReducedMotion();
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const previousPane = useRef(mobilePane);

  useEffect(() => {
    if (!isMobile || previousPane.current === mobilePane) return;
    previousPane.current = mobilePane;
    const target = mobilePane === "list" ? listRef.current : mobilePane === "detail" ? detailRef.current : null;
    if (target) window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }, [isMobile, mobilePane]);

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
        sx={{
          gridArea: "navigation",
          display: { xs: "none", md: "block" },
          minWidth: 0,
          overflow: "auto",
          borderRight: 1,
          borderColor: "divider",
          bgcolor: (muiTheme) => alpha(muiTheme.palette.primary.main, muiTheme.palette.mode === "dark" ? 0.065 : 0.035),
          transition: (muiTheme) => muiTheme.transitions.create(["background-color", "border-color"], { duration: muiTheme.transitions.duration.short }),
        }}
      >
        {navigation}
      </Box>

      <Drawer
        variant="temporary"
        open={mobilePane === "navigation"}
        onClose={onMobileBack}
        ModalProps={{ keepMounted: true }}
        transitionDuration={motionTimeout(reducedMotion, { enter: theme.transitions.duration.enteringScreen, exit: theme.transitions.duration.leavingScreen })}
        slotProps={{
          paper: {
            sx: (muiTheme) => ({
              width: "min(88vw, 336px)",
              borderTopRightRadius: typeof muiTheme.shape.borderRadius === "number" ? muiTheme.shape.borderRadius * 4 : muiTheme.shape.borderRadius,
              borderBottomRightRadius: typeof muiTheme.shape.borderRadius === "number" ? muiTheme.shape.borderRadius * 4 : muiTheme.shape.borderRadius,
              borderRight: 1,
              borderColor: "divider",
              bgcolor: "background.default",
              boxShadow: muiTheme.shadows[16],
              overflow: "hidden",
            }),
          },
        }}
        sx={{ display: { xs: "block", md: "none" } }}
      >
        {navigation}
      </Drawer>

      <Box
        sx={{
          gridArea: { xs: "content" },
          display: { xs: "block", md: "contents" },
          position: { xs: "relative", md: "static" },
          minWidth: 0,
          minHeight: 0,
          overflow: { xs: "hidden", md: "visible" },
        }}
      >
        <Box
          ref={listRef}
          component="section"
          aria-label="项目列表"
          aria-hidden={isMobile && mobilePane !== "list" ? true : undefined}
          inert={isMobile && mobilePane !== "list" ? true : undefined}
          tabIndex={isMobile ? -1 : undefined}
          data-active={mobilePane === "list"}
          data-mobile-pane-panel="list"
          sx={{
            gridArea: { md: "list" },
            position: { xs: "absolute", md: "static" },
            inset: { xs: 0, md: "auto" },
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            borderRight: { md: 1 },
            borderColor: "divider",
            bgcolor: "background.paper",
            opacity: { xs: mobilePane === "list" ? 1 : 0, md: 1 },
            transform: { xs: mobilePane === "list" ? "translateX(0)" : "translateX(-16px)", md: "none" },
            pointerEvents: { xs: mobilePane === "list" ? "auto" : "none", md: "auto" },
            transition: reducedMotion ? "none" : (muiTheme) => muiTheme.transitions.create(["opacity", "transform"], { duration: muiTheme.transitions.duration.short, easing: muiTheme.transitions.easing.easeOut }),
          }}
        >
          {list}
        </Box>

        <Box
          ref={detailRef}
          component="main"
          aria-hidden={isMobile && mobilePane !== "detail" ? true : undefined}
          inert={isMobile && mobilePane !== "detail" ? true : undefined}
          tabIndex={isMobile ? -1 : undefined}
          data-active={mobilePane === "detail"}
          data-mobile-pane-panel="detail"
          sx={{
            gridArea: { md: "detail" },
            position: { xs: "absolute", md: "static" },
            inset: { xs: 0, md: "auto" },
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            overflow: "auto",
            bgcolor: "background.default",
            opacity: { xs: mobilePane === "detail" ? 1 : 0, md: 1 },
            transform: { xs: mobilePane === "detail" ? "translateX(0)" : "translateX(16px)", md: "none" },
            pointerEvents: { xs: mobilePane === "detail" ? "auto" : "none", md: "auto" },
            transition: reducedMotion ? "none" : (muiTheme) => muiTheme.transitions.create(["opacity", "transform"], { duration: muiTheme.transitions.duration.short, easing: muiTheme.transitions.easing.easeOut }),
          }}
        >
          {mobilePane === "detail" && onMobileBack ? <Box sx={{ display: { xs: "block", md: "none" }, p: 0.5 }}>{backButton("返回列表")}</Box> : null}
          {detail}
        </Box>
      </Box>
    </Box>
  );
}

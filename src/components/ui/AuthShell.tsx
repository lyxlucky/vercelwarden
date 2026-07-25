"use client";

import { useId, useState, type ReactNode } from "react";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import DevicesOutlined from "@mui/icons-material/DevicesOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import LockClockOutlined from "@mui/icons-material/LockClockOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  type TextFieldProps,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";

const trustPoints = [
  { icon: ShieldOutlined, title: "端到端加密", description: "敏感数据离开设备前完成加密" },
  { icon: DevicesOutlined, title: "跨设备访问", description: "在可信设备间保持一致体验" },
  { icon: LockClockOutlined, title: "自动安全锁定", description: "离开时主动缩短暴露窗口" },
];

export function AuthShell({ children }: { children: ReactNode }) {
  const { mode, systemMode, setMode } = useColorScheme();
  const resolvedMode = mode === "system" ? systemMode : mode;
  const dark = resolvedMode === "dark";

  return (
    <Box
      sx={(theme) => ({
        minHeight: "100dvh",
        position: "relative",
        overflow: "hidden",
        bgcolor: "background.default",
        backgroundImage: [
          "radial-gradient(circle at 12% 18%, rgba(15, 107, 109, 0.16), transparent 32%)",
          "radial-gradient(circle at 88% 72%, rgba(37, 99, 168, 0.10), transparent 30%)",
          "linear-gradient(135deg, rgba(255,255,255,0.62), rgba(244,246,248,0.22))",
        ].join(","),
        ...theme.applyStyles("dark", {
          backgroundImage: [
            "radial-gradient(circle at 12% 18%, rgba(87, 183, 180, 0.16), transparent 34%)",
            "radial-gradient(circle at 88% 72%, rgba(112, 167, 228, 0.10), transparent 32%)",
            "linear-gradient(135deg, rgba(17,22,27,0.96), rgba(8,12,16,0.98))",
          ].join(","),
        }),
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          opacity: 0.34,
          pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(93,105,117,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(93,105,117,0.08) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to bottom, black, transparent 82%)",
        },
      })}
    >
      <Box
        component="header"
        sx={{
          position: "relative",
          zIndex: 2,
          width: "min(1180px, calc(100% - 32px))",
          mx: "auto",
          pt: { xs: 2, md: 3 },
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            minHeight: 58,
            px: { xs: 1.5, sm: 2 },
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 3,
            bgcolor: "background.paper",
            boxShadow: "0 12px 34px rgba(15, 23, 42, 0.08)",
          }}
        >
          <Stack direction="row" spacing={1.25} aria-label="Vercelwarden" sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                display: "grid",
                placeItems: "center",
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                boxShadow: "0 8px 20px rgba(15, 107, 109, 0.24)",
              }}
            >
              <ShieldOutlined fontSize="small" aria-hidden="true" />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Vercelwarden</Typography>
              <Typography variant="caption" color="text.secondary">可信的个人密码库</Typography>
            </Box>
          </Stack>
          <Tooltip title={dark ? "切换为浅色外观" : "切换为深色外观"}>
            <IconButton
              aria-label={dark ? "切换为浅色外观" : "切换为深色外观"}
              onClick={() => setMode(dark ? "light" : "dark")}
              sx={{ border: 1, borderColor: "divider", cursor: "pointer" }}
            >
              {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
            </IconButton>
          </Tooltip>
        </Paper>
      </Box>

      <Box
        component="main"
        id="main-content"
        sx={{
          position: "relative",
          zIndex: 1,
          width: "min(1120px, calc(100% - 32px))",
          mx: "auto",
          py: { xs: 4, sm: 6, md: 8 },
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 0.92fr) minmax(420px, 1.08fr)" },
          gap: { md: 8, lg: 11 },
          alignItems: "center",
        }}
      >
        <Stack
          component="aside"
          aria-label="产品安全特性"
          spacing={3}
          sx={{ display: { xs: "none", md: "flex" }, maxWidth: 480 }}
        >
          <Chip
            label="隐私优先 · 默认安全"
            color="primary"
            variant="outlined"
            sx={{ alignSelf: "flex-start", fontWeight: 700, bgcolor: "background.paper" }}
          />
          <Box>
            <Typography
              component="p"
              sx={{
                fontSize: { md: "2.65rem", lg: "3.2rem" },
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.045em",
              }}
            >
              你的密码，
              <Box component="span" sx={{ color: "primary.main" }}>始终由你掌控。</Box>
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 2, fontSize: "1.05rem", lineHeight: 1.75, maxWidth: 440 }}>
              简洁的安全入口、清晰的状态反馈，以及不会打断任务的保护机制。
            </Typography>
          </Box>
          <Stack spacing={1.25}>
            {trustPoints.map(({ icon: Icon, title, description }) => (
              <Paper
                key={title}
                variant="outlined"
                sx={{
                  p: 1.75,
                  display: "flex",
                  gap: 1.5,
                  alignItems: "center",
                  borderRadius: 2.5,
                  bgcolor: "background.paper",
                  transition: "border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease",
                  "&:hover": {
                    borderColor: "primary.main",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
                  },
                }}
              >
                <Box sx={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 2, bgcolor: "primary.light", color: "primary.dark", flex: "0 0 auto" }}>
                  <Icon fontSize="small" aria-hidden="true" />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 750 }}>{title}</Typography>
                  <Typography variant="body2" color="text.secondary">{description}</Typography>
                </Box>
              </Paper>
            ))}
          </Stack>
        </Stack>

        <Box sx={{ width: "100%", minWidth: 0 }}>{children}</Box>
      </Box>
    </Box>
  );
}

export function AuthPanel({
  eyebrow,
  title,
  description,
  icon,
  children,
  footer,
  wide = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  return (
    <Paper
      component="section"
      aria-labelledby={titleId}
      elevation={0}
      sx={(theme) => ({
        width: "100%",
        maxWidth: wide ? 680 : 500,
        ml: { xs: "auto", md: 0 },
        mr: "auto",
        p: { xs: 2.25, sm: 3.5, md: 4 },
        border: 1,
        borderColor: "divider",
        borderRadius: { xs: 3, sm: 4 },
        bgcolor: "background.paper",
        boxShadow: "0 28px 70px rgba(15, 23, 42, 0.14)",
        animation: "auth-panel-enter 320ms ease-out both",
        "@keyframes auth-panel-enter": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        ...theme.applyStyles("dark", {
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.38)",
        }),
      })}
    >
      <Stack spacing={3}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
          {icon ? (
            <Box sx={{ width: 46, height: 46, display: "grid", placeItems: "center", flex: "0 0 auto", borderRadius: 2.5, bgcolor: "primary.light", color: "primary.dark" }}>
              {icon}
            </Box>
          ) : null}
          <Box sx={{ minWidth: 0 }}>
            {eyebrow ? <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, letterSpacing: "0.12em" }}>{eyebrow}</Typography> : null}
            <Typography id={titleId} component="h1" variant="h1" sx={{ fontSize: { xs: "1.55rem", sm: "1.8rem" }, letterSpacing: "-0.025em" }}>
              {title}
            </Typography>
            {description ? <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>{description}</Typography> : null}
          </Box>
        </Stack>
        {children}
        {footer ? <Box sx={{ pt: 0.5 }}>{footer}</Box> : null}
      </Stack>
    </Paper>
  );
}

export function PasswordField({ label = "密码", ...props }: Omit<TextFieldProps, "type">) {
  const [visible, setVisible] = useState(false);
  const labelText = typeof label === "string" ? label : "密码";
  return (
    <TextField
      {...props}
      label={label}
      type={visible ? "text" : "password"}
      slotProps={{
        ...props.slotProps,
        input: {
          ...props.slotProps?.input,
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={visible ? `隐藏${labelText}` : `显示${labelText}`}>
                <IconButton
                  edge="end"
                  aria-label={visible ? "隐藏密码内容" : "显示密码内容"}
                  onClick={() => setVisible((value) => !value)}
                  onMouseDown={(event) => event.preventDefault()}
                  sx={{ cursor: "pointer" }}
                >
                  {visible ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

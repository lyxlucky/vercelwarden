"use client";

import { useId, useState, type ReactNode } from "react";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import {
  Box,
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
import { BrandLockup } from "@/components/brand/BrandLogo";
import { PageTransition } from "@/components/motion/PageTransition";

export function AuthShell({ children }: { children: ReactNode }) {
  const { mode, systemMode, setMode } = useColorScheme();
  const resolvedMode = mode === "system" ? systemMode : mode;
  const dark = resolvedMode === "dark";

  return (
    <Box
      sx={(theme) => ({
        minHeight: "100dvh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        bgcolor: "background.default",
        backgroundImage: "linear-gradient(180deg, rgba(37, 99, 235, 0.055) 0, rgba(37, 99, 235, 0) 260px)",
        ...theme.applyStyles("dark", {
          backgroundImage: "linear-gradient(180deg, rgba(96, 165, 250, 0.08) 0, rgba(96, 165, 250, 0) 260px)",
        }),
      })}
    >
      <Box
        component="header"
        sx={{
          width: "min(1120px, calc(100% - 32px))",
          minHeight: 72,
          mx: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <BrandLockup subtitle="安全、清晰的个人密码库" markSize={40} />
        <Tooltip title={dark ? "切换为浅色外观" : "切换为深色外观"}>
          <IconButton
            aria-label={dark ? "切换为浅色外观" : "切换为深色外观"}
            onClick={() => setMode(dark ? "light" : "dark")}
            sx={(theme) => ({
              border: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
              cursor: "pointer",
              transition: theme.transitions.create(["background-color", "border-color", "color"], { duration: theme.transitions.duration.shorter }),
              "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: "primary.light" },
            })}
          >
            {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        component="main"
        id="main-content"
        sx={{
          width: "min(760px, calc(100% - 32px))",
          mx: "auto",
          py: { xs: 4, sm: 6, md: 7 },
          display: "grid",
          placeItems: "center",
          alignSelf: "start",
        }}
      >
        {children}
      </Box>

      <Stack
        component="footer"
        direction="row"
        spacing={1}
        sx={{
          minHeight: 56,
          px: 2,
          pb: 2,
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <SecurityOutlined fontSize="small" aria-hidden="true" />
        <Typography variant="caption">敏感数据在离开设备前完成加密</Typography>
      </Stack>
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
    <PageTransition sx={{ width: "100%" }}>
      <Paper
        component="section"
        aria-labelledby={titleId}
        elevation={0}
        sx={(theme) => ({
          width: "100%",
          maxWidth: wide ? 720 : 520,
          mx: "auto",
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          borderTop: "4px solid",
          borderTopColor: "primary.main",
          borderRadius: { xs: 2.5, sm: 3 },
          bgcolor: "background.paper",
          boxShadow: "0 18px 50px rgba(30, 64, 175, 0.09)",
          ...theme.applyStyles("dark", {
            boxShadow: "0 20px 54px rgba(0, 0, 0, 0.28)",
          }),
        })}
      >
        <Stack spacing={3} sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
          {icon ? (
            <Box sx={{ width: 44, height: 44, display: "grid", placeItems: "center", flex: "0 0 auto", borderRadius: 2, bgcolor: "primary.light", color: "primary.dark" }}>
              {icon}
            </Box>
          ) : null}
          <Box sx={{ minWidth: 0 }}>
            {eyebrow ? <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, letterSpacing: "0.11em" }}>{eyebrow}</Typography> : null}
            <Typography id={titleId} component="h1" variant="h1" sx={{ fontSize: { xs: "1.55rem", sm: "1.85rem" }, letterSpacing: "-0.025em" }}>
              {title}
            </Typography>
            {description ? <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>{description}</Typography> : null}
          </Box>
        </Stack>
        {children}
        {footer ? <Box sx={{ pt: 0.5 }}>{footer}</Box> : null}
        </Stack>
      </Paper>
    </PageTransition>
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

"use client";

import { useId, useState, type ReactNode } from "react";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
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
import { alpha, useColorScheme } from "@mui/material/styles";
import { PageTransition } from "@/components/motion/PageTransition";
import { MONO_FONT } from "@/components/theme/theme";
import { VaultSeal } from "@/components/ui/VaultSeal";

// The brand side of the vault door is always the ink field, in either color scheme —
// a deliberate constant that makes the split read as a sealed door, not a themed panel.
const INK = "#0a0e17";
const INK_TEXT = "#e7ecf5";
const INK_DIM = "#93a0b8";

const specLines: Array<[string, string]> = [
  ["加密", "客户端 · Argon2id / PBKDF2"],
  ["同步", "仅密文离开设备"],
  ["托管", "Vercel · Turso"],
];

function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  return (
    <Tooltip title={dark ? "切换为浅色外观" : "切换为深色外观"}>
      <IconButton
        aria-label={dark ? "切换为浅色外观" : "切换为深色外观"}
        onClick={() => setMode(dark ? "light" : "dark")}
        sx={(theme) => ({
          border: 1,
          borderColor: "divider",
          bgcolor: alpha(theme.palette.background.paper, 0.7),
          backdropFilter: "blur(8px)",
          cursor: "pointer",
          "&:hover": { borderColor: "primary.main", color: "primary.main" },
        })}
      >
        {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
      </IconButton>
    </Tooltip>
  );
}

function BrandPanel() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "relative",
        overflow: "hidden",
        display: { xs: "none", lg: "flex" },
        flexDirection: "column",
        justifyContent: "space-between",
        p: 6,
        color: INK_TEXT,
        bgcolor: INK,
        backgroundImage:
          "radial-gradient(circle at 18% 12%, rgba(124,140,255,0.22), transparent 42%), radial-gradient(circle at 88% 88%, rgba(82,214,197,0.16), transparent 46%)",
      }}
    >
      {/* Hairline grid — an instrument backdrop, kept faint. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 40%, #000 0%, transparent 78%)",
        }}
      />
      <Stack direction="row" spacing={2} sx={{ position: "relative", alignItems: "center" }}>
        <VaultSeal size={64} />
        <Box>
          <Typography component="div" sx={{ fontFamily: MONO_FONT, fontSize: "0.66rem", letterSpacing: "0.32em", textTransform: "uppercase", color: INK_DIM }}>
            Self-hosted vault
          </Typography>
          <Typography component="div" sx={{ fontWeight: 600, letterSpacing: "-0.02em", fontSize: "1.15rem" }}>
            VercelWarden
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ position: "relative" }}>
        <Typography component="h2" sx={{ fontSize: "2rem", lineHeight: 1.18, fontWeight: 600, letterSpacing: "-0.02em", maxWidth: 360 }}>
          你独占密钥的
          <Box component="span" sx={{ color: "#7c8cff" }}> 密码</Box>
          <Box component="span" sx={{ color: "#52d6c5" }}>保险库</Box>
        </Typography>
        <Typography sx={{ mt: 2, color: INK_DIM, maxWidth: 340, lineHeight: 1.7 }}>
          主密码只在本设备派生解密密钥。服务端保存的只有密文，永远看不到明文。
        </Typography>
      </Box>

      <Stack spacing={1.25} sx={{ position: "relative" }}>
        {specLines.map(([key, value]) => (
          <Stack key={key} direction="row" spacing={2} sx={{ alignItems: "baseline" }}>
            <Typography component="span" sx={{ fontFamily: MONO_FONT, fontSize: "0.68rem", letterSpacing: "0.24em", color: INK_DIM, width: 40 }}>
              {key}
            </Typography>
            <Typography component="span" sx={{ fontFamily: MONO_FONT, fontSize: "0.8rem", color: INK_TEXT }}>
              {value}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "minmax(360px, 44%) 1fr" },
      }}
    >
      <BrandPanel />
      <Box
        component="main"
        id="main-content"
        sx={(theme) => ({
          position: "relative",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
          backgroundImage: {
            xs: "radial-gradient(circle at 50% -10%, rgba(124,140,255,0.10), transparent 55%)",
            lg: "none",
          },
          ...theme.applyStyles("dark", {
            backgroundImage: { xs: "radial-gradient(circle at 50% -10%, rgba(124,140,255,0.16), transparent 55%)", lg: "none" },
          }),
        })}
      >
        <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 1 }}>
          <ThemeToggle />
        </Box>

        {/* Compact brand lockup for narrow viewports where the ink panel is hidden. */}
        <Stack direction="row" spacing={1.5} sx={{ display: { xs: "flex", lg: "none" }, alignItems: "center", px: 3, pt: 3 }}>
          <VaultSeal size={40} />
          <Typography sx={{ fontWeight: 600, letterSpacing: "-0.02em" }}>VercelWarden</Typography>
        </Stack>

        <Box sx={{ flex: 1, display: "grid", placeItems: "center", px: { xs: 2.5, sm: 4 }, py: { xs: 4, sm: 6 } }}>
          {children}
        </Box>

        <Stack direction="row" spacing={1} sx={{ px: 3, pb: 3, alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
          <LockOutlined fontSize="small" aria-hidden="true" />
          <Typography variant="caption">敏感数据在离开设备前完成加密</Typography>
        </Stack>
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
    <PageTransition sx={{ width: "100%" }}>
      <Paper
        component="section"
        aria-labelledby={titleId}
        elevation={0}
        sx={(theme) => ({
          width: "100%",
          maxWidth: wide ? 720 : 460,
          mx: "auto",
          p: { xs: 3, sm: 4 },
          border: 1,
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "background.paper",
          boxShadow: "0 24px 60px rgba(10,14,23,0.10)",
          ...theme.applyStyles("dark", { boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }),
        })}
      >
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.75} sx={{ alignItems: "flex-start" }}>
            {icon ? (
              <Box
                sx={(theme) => ({
                  width: 44,
                  height: 44,
                  flex: "0 0 auto",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 2,
                  color: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  border: 1,
                  borderColor: alpha(theme.palette.primary.main, 0.28),
                })}
              >
                {icon}
              </Box>
            ) : null}
            <Box sx={{ minWidth: 0 }}>
              {eyebrow ? (
                <Typography
                  component="div"
                  sx={{ fontFamily: MONO_FONT, fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "success.main", mb: 0.75 }}
                >
                  {eyebrow}
                </Typography>
              ) : null}
              <Typography id={titleId} component="h1" variant="h1" sx={{ fontSize: { xs: "1.5rem", sm: "1.8rem" } }}>
                {title}
              </Typography>
              {description ? <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.65 }}>{description}</Typography> : null}
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
          sx: { fontFamily: MONO_FONT, ...(props.slotProps?.input as { sx?: object } | undefined)?.sx },
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

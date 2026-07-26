"use client";

import type { ElementType, ReactNode } from "react";
import {
  AccountBalanceOutlined,
  BadgeOutlined,
  CreditCardOutlined,
  DescriptionOutlined,
  DriveFileRenameOutlineOutlined,
  KeyOutlined,
  NoteAltOutlined,
  PublicOutlined,
} from "@mui/icons-material";
import { Avatar, Box, Stack, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";

const TYPE_META: Record<number, { label: string; icon: ElementType; color: string }> = {
  1: { label: "登录", icon: KeyOutlined, color: "#1565c0" },
  2: { label: "安全笔记", icon: DescriptionOutlined, color: "#6a1b9a" },
  3: { label: "银行卡", icon: CreditCardOutlined, color: "#00838f" },
  4: { label: "身份信息", icon: BadgeOutlined, color: "#ad1457" },
  5: { label: "SSH 密钥", icon: DriveFileRenameOutlineOutlined, color: "#455a64" },
  6: { label: "银行账户", icon: AccountBalanceOutlined, color: "#2e7d32" },
  7: { label: "驾驶证", icon: NoteAltOutlined, color: "#ef6c00" },
  8: { label: "护照", icon: PublicOutlined, color: "#283593" },
};

export function vaultTypeLabel(type: number) {
  return TYPE_META[type]?.label ?? "密码库项目";
}

export function VaultItemAvatar({ type, size = 40 }: { type: number; size?: number }) {
  const meta = TYPE_META[type] ?? TYPE_META[2]!;
  const Icon = meta.icon;

  return (
    <Avatar
      variant="rounded"
      sx={{
        width: size,
        height: size,
        bgcolor: (theme) => alpha(meta.color, theme.palette.mode === "dark" ? 0.24 : 0.12),
        color: meta.color,
        borderRadius: "3px",
      }}
    >
      <Icon fontSize={size >= 48 ? "medium" : "small"} aria-hidden="true" />
    </Avatar>
  );
}

export function VaultSection({ title, description, action, children, sx }: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={[
        { border: 1, borderColor: "divider", borderRadius: "4px", bgcolor: "background.paper", overflow: "hidden" },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          px: { xs: 2, sm: 2.5 },
          py: 2,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.08 : 0.035),
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
          {description ? <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{description}</Typography> : null}
        </Box>
        {action}
      </Stack>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>{children}</Box>
    </Box>
  );
}

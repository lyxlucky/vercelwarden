"use client";

import { useState, type ElementType, type ReactNode } from "react";
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
  1: { label: "登录", icon: KeyOutlined, color: "#5a6cf0" },
  2: { label: "安全笔记", icon: DescriptionOutlined, color: "#9a86ff" },
  3: { label: "银行卡", icon: CreditCardOutlined, color: "#12a594" },
  4: { label: "身份信息", icon: BadgeOutlined, color: "#e0679a" },
  5: { label: "SSH 密钥", icon: DriveFileRenameOutlineOutlined, color: "#7c8aa5" },
  6: { label: "银行账户", icon: AccountBalanceOutlined, color: "#3fae6f" },
  7: { label: "驾驶证", icon: NoteAltOutlined, color: "#d98a2b" },
  8: { label: "护照", icon: PublicOutlined, color: "#5b6ee0" },
};

// Shared type → icon map so navigation, list, and detail never drift apart.
export function vaultTypeIcon(type: number): ElementType {
  return (TYPE_META[type] ?? TYPE_META[2]!).icon;
}

export function vaultTypeLabel(type: number) {
  return TYPE_META[type]?.label ?? "密码库项目";
}

// Derive the first usable hostname from an item's URIs for the icon proxy.
// Mirrors the parsing in features/vault/store.ts so results stay consistent.
function faviconDomain(uris: readonly string[] | undefined): string | null {
  if (!uris) return null;
  for (const raw of uris) {
    const value = raw.trim();
    if (!value) continue;
    try {
      const parsed = new URL(/^\w+:\/\//.test(value) ? value : `https://${value}`);
      const host = parsed.hostname.toLowerCase();
      // The /api/icons proxy only accepts hostname-shaped segments.
      if (/^[a-z0-9.-]+$/.test(host) && host.includes(".")) return host;
    } catch {
      // Skip unparseable URIs and try the next one.
    }
  }
  return null;
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
        borderRadius: 2,
      }}
    >
      <Icon fontSize={size >= 48 ? "medium" : "small"} aria-hidden="true" />
    </Avatar>
  );
}

// Login items show the associated website's favicon (served through the same-origin
// /api/icons proxy, so the vault's domains never leak to a third party). Anything
// without a resolvable domain — or whose favicon fails to load — falls back to the
// colored type avatar, keeping every row visually anchored.
export function VaultItemIcon({ type, uris, size = 40 }: { type: number; uris?: readonly string[]; size?: number }) {
  const domain = type === 1 ? faviconDomain(uris) : null;
  const [failed, setFailed] = useState(false);

  if (!domain || failed) return <VaultItemAvatar type={type} size={size} />;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      <Box
        component="img"
        src={`/api/icons/${domain}/icon.png`}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        sx={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6), objectFit: "contain" }}
      />
    </Box>
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
        { border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.paper", overflow: "hidden" },
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

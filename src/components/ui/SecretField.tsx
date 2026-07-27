"use client";

import { useState, type ReactNode } from "react";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { MONO_FONT } from "@/components/theme/theme";

// Shared copy state with a teal "copied" pulse. Keyed so a page full of secret rows
// can share one hook and only the row you copied lights up.
export function useCopy(resetMs = 1600) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), resetMs);
    } catch {
      setError("浏览器拒绝了剪贴板访问，请手动选择并复制。");
    }
  };
  return { copiedKey, copy, error, clearError: () => setError(null) };
}

export function CopyButton({ copied, label, onCopy, size = "small" }: {
  copied: boolean;
  label: string;
  onCopy(): void;
  size?: "small" | "medium";
}) {
  return (
    <Tooltip title={copied ? `已复制${label}` : `复制${label}`}>
      <IconButton size={size} aria-label={copied ? `已复制${label}` : `复制${label}`} onClick={onCopy} sx={{ cursor: "pointer" }}>
        {copied ? <CheckOutlined color="success" fontSize={size} /> : <ContentCopyOutlined fontSize={size} />}
      </IconButton>
    </Tooltip>
  );
}

// The signature layout element: one addressable line of the vault ledger.
// A periwinkle hairline binds every row; the label is a spaced mono tag; the value
// area holds either plain content (LedgerRow) or a monospace secret (SecretField).
export function LedgerRow({ label, children, actions, tone = "neutral" }: {
  label: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: "neutral" | "active";
}) {
  return (
    <Stack
      direction="row"
      sx={(theme) => ({
        alignItems: "center",
        gap: 1.5,
        minHeight: 60,
        px: 1.75,
        py: 1,
        borderRadius: 2,
        border: 1,
        borderColor: tone === "active" ? alpha(theme.palette.success.main, 0.5) : "divider",
        borderLeft: "3px solid",
        borderLeftColor: tone === "active" ? theme.palette.success.main : alpha(theme.palette.primary.main, 0.55),
        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.05 : 0.03),
        transition: theme.transitions.create(["border-color", "background-color"], { duration: theme.transitions.duration.shorter }),
      })}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="div"
          sx={{ fontFamily: MONO_FONT, fontSize: "0.66rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "text.secondary", mb: 0.25 }}
        >
          {label}
        </Typography>
        <Box sx={{ minWidth: 0 }}>{children}</Box>
      </Box>
      {actions ? <Stack direction="row" sx={{ alignItems: "center", flex: "0 0 auto" }}>{actions}</Stack> : null}
    </Stack>
  );
}

// Render a masked-until-revealed secret as monospace ledger data. `authorize` lets a
// caller (e.g. VaultDetail's reprompt flow) gate reveal/copy behind master-password re-entry.
export function SecretField({
  label,
  value,
  fieldKey,
  secret = true,
  mono = true,
  copiedKey,
  onCopy,
  authorize,
  extraActions,
}: {
  label: string;
  value: string;
  fieldKey: string;
  secret?: boolean;
  mono?: boolean;
  copiedKey: string | null;
  onCopy(key: string, value: string): void;
  authorize?(action: () => void): void;
  extraActions?: ReactNode;
}) {
  const [revealed, setRevealed] = useState(!secret);
  if (!value) return null;
  const run = (action: () => void) => (authorize ? authorize(action) : action());
  const shown = revealed || !secret;

  return (
    <LedgerRow
      label={label}
      tone={secret && revealed ? "active" : "neutral"}
      actions={(
        <>
          {secret ? (
            <Tooltip title={shown ? `隐藏${label}` : `显示${label}`}>
              <IconButton size="small" aria-label={shown ? `隐藏${label}` : `显示${label}`} onClick={() => run(() => setRevealed((v) => !v))} sx={{ cursor: "pointer" }}>
                {shown ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
              </IconButton>
            </Tooltip>
          ) : null}
          {extraActions}
          <CopyButton copied={copiedKey === fieldKey} label={label} onCopy={() => run(() => onCopy(fieldKey, value))} />
        </>
      )}
    >
      <Typography
        component="span"
        sx={{
          display: "block",
          fontFamily: mono ? MONO_FONT : undefined,
          fontSize: mono ? "0.95rem" : undefined,
          letterSpacing: mono && shown ? "0.01em" : undefined,
          overflowWrap: "anywhere",
          color: shown ? "text.primary" : "text.secondary",
          fontVariantNumeric: "tabular-nums",
          userSelect: shown ? "text" : "none",
        }}
      >
        {shown ? value : "•".repeat(Math.min(16, Math.max(8, value.length)))}
      </Typography>
    </LedgerRow>
  );
}

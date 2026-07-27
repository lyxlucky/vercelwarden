"use client";

import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { MONO_FONT } from "@/components/theme/theme";

const SEGMENTS = 4;

// Maps generator score (0..3) to the brand spectrum: it climbs from error through
// periwinkle up to teal, so "strong" lands on the same verified hue used everywhere else.
function toneFor(score: number) {
  return (theme: import("@mui/material/styles").Theme) =>
    score <= 0
      ? theme.palette.error.main
      : score === 1
        ? theme.palette.warning.main
        : score === 2
          ? theme.palette.primary.main
          : theme.palette.success.main;
}

export function StrengthMeter({ score, label, entropy, hideLabel = false }: {
  score: number; // 0..3
  label?: string;
  entropy?: number;
  hideLabel?: boolean;
}) {
  const filled = Math.max(0, Math.min(SEGMENTS, score + 1));
  return (
    <Stack spacing={0.75} aria-label={label ? `密码强度：${label}` : "密码强度"}>
      <Stack direction="row" spacing={0.75} aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <Box
            key={index}
            sx={(theme) => ({
              flex: 1,
              height: 6,
              borderRadius: 3,
              bgcolor: index < filled ? toneFor(score)(theme) : alpha(theme.palette.text.primary, 0.12),
              transition: theme.transitions.create(["background-color"], { duration: theme.transitions.duration.short }),
            })}
          />
        ))}
      </Stack>
      {!hideLabel && (label || entropy != null) ? (
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
          {label ? <Typography variant="caption" sx={(theme) => ({ color: toneFor(score)(theme), fontWeight: 600 })}>{label}</Typography> : <span />}
          {entropy != null ? (
            <Typography component="span" sx={{ fontFamily: MONO_FONT, fontSize: "0.7rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(entropy)} bits
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

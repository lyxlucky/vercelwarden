"use client";

import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { MONO_FONT } from "@/components/theme/theme";

// Group a TOTP code for legibility: 6 digits -> "123 456", 8 -> "1234 5678".
export function formatTotp(code: string) {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

// A presentational one-time-code cell. Time is driven by props (parent ticks each second),
// so the ring depletes stepwise — no continuous animation, nothing to disable for reduced motion.
export function TotpRing({ code, remaining, period = 30, size = 40 }: {
  code: string;
  remaining: number;
  period?: number;
  size?: number;
}) {
  const fraction = Math.max(0, Math.min(1, remaining / period));
  const low = remaining <= 5;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 1.25, minWidth: 0 }}>
      <Box sx={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
        <Box
          component="svg"
          viewBox={`0 0 ${size} ${size}`}
          sx={{ width: size, height: size, transform: "rotate(-90deg)" }}
          aria-hidden="true"
        >
          <Box
            component="circle"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            sx={(theme) => ({ stroke: alpha(theme.palette.text.primary, 0.14) })}
          />
          <Box
            component="circle"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            sx={(theme) => ({
              stroke: low ? theme.palette.warning.main : theme.palette.success.main,
              transition: theme.transitions.create(["stroke-dashoffset", "stroke"], { duration: theme.transitions.duration.shortest }),
            })}
          />
        </Box>
        <Typography
          component="span"
          aria-label={`${remaining} 秒后刷新`}
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: MONO_FONT,
            fontSize: "0.7rem",
            fontVariantNumeric: "tabular-nums",
            color: low ? "warning.main" : "text.secondary",
          }}
        >
          {remaining}
        </Typography>
      </Box>
      <Typography
        component="span"
        sx={{ fontFamily: MONO_FONT, fontSize: "1.05rem", fontWeight: 600, letterSpacing: "0.08em", fontVariantNumeric: "tabular-nums", color: "text.primary" }}
      >
        {formatTotp(code)}
      </Typography>
    </Stack>
  );
}

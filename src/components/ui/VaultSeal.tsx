"use client";

import { Box } from "@mui/material";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

// The login signature: the brand's duotone shield rendered large, with a soft periwinkle/teal
// glow and a slow light sweep across the seal. Motion is dropped entirely for reduced-motion.
// Keyframes are defined inline in sx so the rule is always registered by the active emotion cache.
export function VaultSeal({ size = 96 }: { size?: number }) {
  const reducedMotion = useReducedMotion();
  const tileRadius = Math.round(size * 0.27);

  return (
    <Box sx={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: -size * 0.35,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, rgba(124,140,255,0.45), transparent 60%), radial-gradient(circle at 70% 75%, rgba(82,214,197,0.4), transparent 62%)",
          filter: "blur(22px)",
          animation: reducedMotion ? "none" : "vw-seal-breathe 6s ease-in-out infinite",
          "@keyframes vw-seal-breathe": {
            "0%, 100%": { opacity: 0.5, transform: "scale(1)" },
            "50%": { opacity: 0.85, transform: "scale(1.06)" },
          },
        }}
      />
      <Box
        sx={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: `${tileRadius}px`,
          overflow: "hidden",
          boxShadow: "0 18px 44px rgba(10,14,23,0.5)",
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 48 48"
          sx={{ display: "block", width: "100%", height: "100%" }}
          role="img"
          aria-label="VercelWarden 保险库"
        >
          <rect x="0" y="0" width="48" height="48" rx="13" fill="#0B1220" />
          <path d="M24 6.5 9 12v10.4c0 9.8 5.8 16.6 15 20.1v-36Z" fill="#52D6C5" />
          <path d="m24 6.5 15 5.5v10.4c0 9.8-5.8 16.6-15 20.1v-36Z" fill="#7186FF" />
          <path d="M14.5 17h4.2l2.75 10.9L24 20.35l2.55 7.55L29.3 17h4.2l-4.75 17h-3.5L24 29.95 22.75 34h-3.5L14.5 17Z" fill="#0B1220" />
        </Box>
        {reducedMotion ? null : (
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "45%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
              animation: "vw-seal-sweep 5.5s ease-in-out infinite",
              "@keyframes vw-seal-sweep": {
                "0%": { transform: "translateX(-140%) skewX(-14deg)" },
                "60%, 100%": { transform: "translateX(240%) skewX(-14deg)" },
              },
            }}
          />
        )}
      </Box>
    </Box>
  );
}

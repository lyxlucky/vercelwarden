"use client";

import { keyframes } from "@emotion/react";
import { Box, type BoxProps } from "@mui/material";

// A restrained enter: a short fade with a 6px rise reads as the page settling into
// place, rather than the flat full-opacity fade that feels machine-generated. The
// theme's CssBaseline neutralizes animation-duration under reduced motion, so this
// resolves to an instant appearance for users who ask for less motion.
const enter = keyframes({
  from: { opacity: 0, transform: "translateY(6px)" },
  to: { opacity: 1, transform: "none" },
});

export function PageTransition({ children, sx, ...props }: BoxProps) {
  return (
    <Box
      data-page-transition="true"
      {...props}
      sx={[
        { minWidth: 0, animation: `${enter} 220ms cubic-bezier(0, 0, 0.2, 1) both` },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {children}
    </Box>
  );
}

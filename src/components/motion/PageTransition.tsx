"use client";

import { Box, Fade, type BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export function PageTransition({ children, sx, ...props }: BoxProps) {
  const theme = useTheme();
  return (
    <Fade in appear timeout={theme.transitions.duration.enteringScreen} easing={theme.transitions.easing.easeOut}>
      <Box
        data-page-transition="true"
        {...props}
        sx={[
          { minWidth: 0 },
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
      >
        {children}
      </Box>
    </Fade>
  );
}


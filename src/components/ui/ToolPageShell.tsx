"use client";

import type { ReactNode } from "react";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import { Box, Container, Link, Stack } from "@mui/material";
import { AppLink } from "@/components/theme/AppLink";
import { PageHeader } from "@/components/ui/PageHeader";

export function ToolPageShell({
  title,
  description,
  actions,
  feedback,
  children,
  backHref = "/vault",
  backLabel = "返回密码库",
  maxWidth = "lg",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  feedback?: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  maxWidth?: "md" | "lg" | "xl";
}) {
  return (
    <Box component="main" id="main-content" sx={{ flex: 1, minWidth: 0, overflow: "auto" }}>
      <Container
        maxWidth={maxWidth}
        sx={{
          py: { xs: 2, sm: 3, lg: 4 },
          animation: "vw-tool-enter 240ms cubic-bezier(0, 0, 0.2, 1)",
          "@keyframes vw-tool-enter": {
            from: { opacity: 0, transform: "translateY(6px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <Stack spacing={{ xs: 2, sm: 3 }}>
          <Link component={AppLink} href={backHref} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, alignSelf: "flex-start" }}>
            <ArrowBackOutlined fontSize="small" aria-hidden="true" />
            {backLabel}
          </Link>
          <PageHeader title={title} description={description} actions={actions} />
          {feedback}
          {children}
        </Stack>
      </Container>
    </Box>
  );
}

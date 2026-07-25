"use client";

import type { ReactNode } from "react";
import { Box, Container, Stack } from "@mui/material";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminNav } from "@/features/admin/AdminNav";

export function AdminSectionShell({ title, description, feedback, children }: { title: string; description: string; feedback?: ReactNode; children: ReactNode }) {
  return <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}><Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 }, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "260px minmax(0, 1fr)" }, gap: 3 }}><AdminNav /><Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0 }}><PageHeader title={title} description={description} />{feedback}{children}</Stack></Container></Box>;
}

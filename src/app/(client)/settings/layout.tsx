import type { ReactNode } from "react";
import { Box, Container } from "@mui/material";
import { SettingsNav } from "@/features/security/SettingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 }, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "260px minmax(0, 1fr)" }, gap: 3 }}>
        <SettingsNav />
        {children}
      </Container>
    </Box>
  );
}

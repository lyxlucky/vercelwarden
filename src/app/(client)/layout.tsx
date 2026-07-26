import { Box } from "@mui/material";

export default function ClientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</Box>;
}

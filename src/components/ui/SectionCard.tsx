import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, Divider, Typography } from "@mui/material";

export function SectionCard({ title, description, action, children, danger = false }: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <Card variant="outlined" sx={danger ? { borderColor: "error.main" } : undefined}>
      <CardHeader title={<Typography component="h2" variant="h6">{title}</Typography>} subheader={description} action={action} />
      <Divider />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

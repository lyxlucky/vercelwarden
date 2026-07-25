import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

export function PageHeader({ title, description, actions, eyebrow }: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-start" }, gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow ? <Typography variant="overline" color="text.secondary">{eyebrow}</Typography> : null}
        <Typography component="h1" variant="h1">{title}</Typography>
        {description ? <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>{description}</Typography> : null}
      </Box>
      {actions ? <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>{actions}</Stack> : null}
    </Stack>
  );
}

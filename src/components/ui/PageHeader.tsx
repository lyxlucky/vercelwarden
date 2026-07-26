import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { ActionGroup } from "@/components/ui/ActionGroup";

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
      {actions ? <ActionGroup compact sx={{ justifyContent: { xs: "flex-start", sm: "flex-end" } }}>{actions}</ActionGroup> : null}
    </Stack>
  );
}

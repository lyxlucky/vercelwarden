import { Stack, type StackProps } from "@mui/material";

export interface ActionGroupProps extends Omit<StackProps, "direction"> {
  compact?: boolean;
  direction?: StackProps["direction"];
  mobileStack?: boolean;
}

export function ActionGroup({
  children,
  compact = false,
  direction,
  mobileStack = false,
  sx,
  ...props
}: ActionGroupProps) {
  return (
    <Stack
      data-action-group="true"
      direction={direction ?? (mobileStack ? { xs: "column", sm: "row" } : "row")}
      {...props}
      sx={[
        {
          alignItems: mobileStack ? { xs: "stretch", sm: "center" } : "center",
          flexWrap: mobileStack ? { xs: "nowrap", sm: "wrap" } : "wrap",
          gap: compact ? 1 : 1.25,
          minWidth: 0,
          "& > .MuiButton-root": mobileStack ? { width: { xs: "100%", sm: "auto" } } : undefined,
          "@media (pointer: coarse)": {
            "& > .MuiButtonBase-root": { minHeight: 44 },
            "& > .MuiIconButton-root": { minWidth: 44 },
          },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {children}
    </Stack>
  );
}


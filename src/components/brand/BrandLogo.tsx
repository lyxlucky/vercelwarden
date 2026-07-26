import { Box, Stack, Typography, type SxProps, type Theme } from "@mui/material";

const LOGO_SOURCE = "/brand/logo-mark.svg";

export function BrandMark({
  size = 40,
  alt = "",
  sx,
}: {
  size?: number;
  alt?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="img"
      src={LOGO_SOURCE}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={size}
      height={size}
      sx={[{ display: "block", flex: "0 0 auto" }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}

export function BrandLockup({
  subtitle,
  markSize = 40,
  sx,
  nameSx,
  subtitleSx,
}: {
  subtitle?: string;
  markSize?: number;
  sx?: SxProps<Theme>;
  nameSx?: SxProps<Theme>;
  subtitleSx?: SxProps<Theme>;
}) {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      aria-label="VercelWarden"
      sx={[{ alignItems: "center", minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <BrandMark size={markSize} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="span"
          sx={[{ display: "block", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15 }, ...(Array.isArray(nameSx) ? nameSx : [nameSx])]}
        >
          VercelWarden
        </Typography>
        {subtitle ? (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={[{ display: "block", mt: 0.2, lineHeight: 1.25 }, ...(Array.isArray(subtitleSx) ? subtitleSx : [subtitleSx])]}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

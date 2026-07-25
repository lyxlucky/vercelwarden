import { Link } from "@mui/material";

export function SkipLink() {
  return (
    <Link
      href="#main-content"
      sx={{
        position: "fixed",
        zIndex: (theme) => theme.zIndex.tooltip + 1,
        top: 8,
        left: 8,
        px: 2,
        py: 1,
        borderRadius: 1,
        bgcolor: "background.paper",
        color: "text.primary",
        boxShadow: 4,
        transform: "translateY(-160%)",
        "&:focus": { transform: "translateY(0)" },
      }}
    >
      跳到主要内容
    </Link>
  );
}

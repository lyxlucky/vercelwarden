import type { ReactNode } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import {
  BlockOutlined,
  CloudOffOutlined,
  ErrorOutlined,
  InfoOutlined,
  SearchOffOutlined,
  TaskAltOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";

export type AsyncStateKind =
  | "loading"
  | "empty"
  | "success"
  | "partial"
  | "forbidden"
  | "offline"
  | "conflict"
  | "fatal";

const defaults: Record<AsyncStateKind, { title: string; severity: "success" | "info" | "warning" | "error" }> = {
  loading: { title: "正在加载", severity: "info" },
  empty: { title: "暂无内容", severity: "info" },
  success: { title: "操作已完成", severity: "success" },
  partial: { title: "部分内容未能加载", severity: "warning" },
  forbidden: { title: "无法访问", severity: "warning" },
  offline: { title: "当前处于离线状态", severity: "warning" },
  conflict: { title: "内容已在其他位置更改", severity: "warning" },
  fatal: { title: "操作无法完成", severity: "error" },
};

const icons: Record<AsyncStateKind, ReactNode> = {
  loading: <CircularProgress size={22} aria-hidden="true" />,
  empty: <SearchOffOutlined fontSize="small" />,
  success: <TaskAltOutlined fontSize="small" />,
  partial: <WarningAmberOutlined fontSize="small" />,
  forbidden: <BlockOutlined fontSize="small" />,
  offline: <CloudOffOutlined fontSize="small" />,
  conflict: <InfoOutlined fontSize="small" />,
  fatal: <ErrorOutlined fontSize="small" />,
};

export function AsyncState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
  compact = false,
}: {
  kind: AsyncStateKind;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
  compact?: boolean;
}) {
  const state = defaults[kind];
  const isUrgent = kind === "fatal" || kind === "conflict" || kind === "forbidden";
  return (
    <Alert
      severity={state.severity}
      icon={icons[kind]}
      role={isUrgent ? "alert" : "status"}
      aria-live={kind === "loading" ? "polite" : undefined}
      data-kind={kind}
      sx={{ py: compact ? 0.5 : 1.25, width: "100%" }}
      action={actionLabel && onAction ? (
        <Button color="inherit" size="small" onClick={onAction}>{actionLabel}</Button>
      ) : undefined}
    >
      <AlertTitle>{title ?? state.title}</AlertTitle>
      {description ? <Typography component="span" variant="body2">{description}</Typography> : null}
      {secondaryAction ? <Box sx={{ mt: 1 }}>{secondaryAction}</Box> : null}
    </Alert>
  );
}

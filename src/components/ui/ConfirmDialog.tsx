"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

export function ConfirmDialog({
  open,
  title,
  description,
  target,
  consequences,
  confirmLabel,
  cancelLabel = "取消",
  tone = "warning",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  target?: string;
  consequences?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "warning" | "danger";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (!busy && reason !== "backdropClick") onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      {busy ? <LinearProgress aria-label="正在处理" /> : null}
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText id="confirm-dialog-description">{description}</DialogContentText>
          {target ? (
            <Typography variant="body2"><strong>目标：</strong>{target}</Typography>
          ) : null}
          {consequences ? <Alert severity={tone === "danger" ? "error" : "warning"}>{consequences}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button
          autoFocus
          variant="contained"
          color={tone === "danger" ? "error" : "warning"}
          onClick={() => void onConfirm()}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

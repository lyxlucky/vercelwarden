"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Alert, AlertTitle, Snackbar } from "@mui/material";

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone?: "info" | "success" | "warning" | "danger";
}

interface ToastContextValue {
  push(toast: Omit<ToastMessage, "id">): void;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastMessage[]>([]);
  const active = queue[0];
  const dismiss = useCallback((id: number) => {
    setQueue((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const push = useCallback((toast: Omit<ToastMessage, "id">) => {
    setQueue((current) => [...current, { ...toast, id: ++nextToastId }]);
  }, []);
  const value = useMemo(() => ({ push, dismiss }), [dismiss, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={active?.id ?? "empty-toast"}
        open={Boolean(active)}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        onClose={(_, reason) => {
          if (reason !== "clickaway" && active) dismiss(active.id);
        }}
      >
        {active ? (
          <Alert
            variant="filled"
            severity={active.tone === "danger" ? "error" : active.tone ?? "info"}
            onClose={() => dismiss(active.id)}
            sx={{ width: { xs: "calc(100vw - 32px)", sm: "auto" }, minWidth: { sm: 360 }, maxWidth: 520 }}
          >
            <AlertTitle>{active.title}</AlertTitle>
            {active.description}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value;
}

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  CircleAlert,
  CloudOff,
  LoaderCircle,
  SearchX,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/primitives";

export type TaskStateKind =
  | "loading"
  | "empty"
  | "partial"
  | "forbidden"
  | "offline"
  | "conflict"
  | "fatal";

const stateDefaults = {
  loading: { title: "正在加载", icon: LoaderCircle },
  empty: { title: "暂无内容", icon: SearchX },
  partial: { title: "部分内容未能加载", icon: AlertTriangle },
  forbidden: { title: "无法访问", icon: ShieldAlert },
  offline: { title: "当前处于离线状态", icon: CloudOff },
  conflict: { title: "内容已在其他位置更改", icon: CircleAlert },
  fatal: { title: "操作无法完成", icon: Ban },
} as const;

export function TaskState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
  compact = false,
}: {
  kind: TaskStateKind;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
  compact?: boolean;
}) {
  const defaults = stateDefaults[kind];
  const Icon = defaults.icon;
  return (
    <section className="task-state" data-kind={kind} data-compact={compact || undefined} aria-live={kind === "loading" ? "polite" : undefined}>
      <Icon className={kind === "loading" ? "task-state__spinner" : undefined} size={compact ? 20 : 28} strokeWidth={1.7} aria-hidden="true" />
      <div className="task-state__copy">
        <h2>{title ?? defaults.title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actionLabel && onAction ? <Button variant="primary" size="sm" onClick={onAction}>{actionLabel}</Button> : null}
      {secondaryAction}
    </section>
  );
}


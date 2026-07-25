import type { ReactNode } from "react";
import { AsyncState } from "@/components/ui/AsyncState";

export type TaskStateKind =
  | "loading"
  | "empty"
  | "partial"
  | "forbidden"
  | "offline"
  | "conflict"
  | "fatal";

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
  return (
    <AsyncState
      kind={kind}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
      secondaryAction={secondaryAction}
      compact={compact}
    />
  );
}

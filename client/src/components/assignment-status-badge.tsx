import { CheckCircle2, CircleDot, Clock3, PlayCircle, RotateCcw } from "lucide-react";

const statusConfig = {
  assigned: {
    label: "ASSIGNED",
    icon: CircleDot,
    classes: "border-[var(--sp-color-rule-strong)] bg-[var(--sp-color-surface-muted)] text-[var(--sp-color-ink-2)]",
  },
  in_progress: {
    label: "IN PROGRESS",
    icon: PlayCircle,
    classes: "border-[var(--sp-color-accent-rule)] bg-[var(--sp-color-accent-soft)] text-[var(--sp-color-accent)]",
  },
  awaiting_approval: {
    label: "AWAITING APPROVAL",
    icon: Clock3,
    classes: "border-[var(--sp-color-focus)] bg-[var(--sp-color-warn-soft)] text-[var(--sp-color-focus)]",
  },
  rework_required: {
    label: "REWORK REQUIRED",
    icon: RotateCcw,
    classes: "border-[var(--sp-color-danger-rule)] bg-[var(--sp-color-danger-soft)] text-[var(--sp-color-danger)]",
  },
  approved: {
    label: "APPROVED",
    icon: CheckCircle2,
    classes: "border-[var(--sp-color-success-rule)] bg-[var(--sp-color-success-soft)] text-[var(--sp-color-success-ink)]",
  },
} as const;

export type StructuredAssignmentStatus = keyof typeof statusConfig;

export function isStructuredLifecycleStatus(status: string): status is StructuredAssignmentStatus {
  return status in statusConfig;
}

export function AssignmentStatusBadge({ status, count, className = "" }: { status: string; count?: number; className?: string }) {
  const config = statusConfig[isStructuredLifecycleStatus(status) ? status : "assigned"];
  const Icon = config.icon;
  const label = `${count === undefined ? "" : `${count} `}${config.label}${status === "approved" ? " ✓" : ""}`;

  return (
    <span className={`inline-flex items-center gap-2 rounded-[var(--sp-radius-pill)] border px-3 py-1.5 [font-family:var(--sp-font-body)] text-sm font-extrabold uppercase tracking-[var(--sp-track-wide)] ${config.classes} ${className}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

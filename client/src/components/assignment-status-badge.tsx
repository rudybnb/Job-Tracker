import { CheckCircle2, CircleDot, Clock3, PlayCircle, RotateCcw } from "lucide-react";

const statusConfig = {
  assigned: { label: "ASSIGNED", icon: CircleDot, classes: "border-sky-300 bg-sky-950 text-sky-100" },
  in_progress: { label: "IN PROGRESS", icon: PlayCircle, classes: "border-amber-300 bg-amber-950 text-amber-100" },
  awaiting_approval: { label: "AWAITING APPROVAL", icon: Clock3, classes: "border-fuchsia-300 bg-fuchsia-950 text-fuchsia-100" },
  rework_required: { label: "REWORK REQUIRED", icon: RotateCcw, classes: "border-red-300 bg-red-950 text-red-100" },
  approved: { label: "APPROVED", icon: CheckCircle2, classes: "border-emerald-300 bg-emerald-950 text-emerald-100" },
} as const;

export type StructuredAssignmentStatus = keyof typeof statusConfig;

export function isStructuredLifecycleStatus(status: string): status is StructuredAssignmentStatus {
  return status in statusConfig;
}

export function AssignmentStatusBadge({ status }: { status: string }) {
  const config = statusConfig[isStructuredLifecycleStatus(status) ? status : "assigned"];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-sm font-extrabold tracking-wide ${config.classes}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {config.label}{status === "approved" ? " ✓" : ""}
    </span>
  );
}

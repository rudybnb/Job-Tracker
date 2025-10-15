import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AttendanceRowProps {
  id: string;
  staffName: string;
  initials: string;
  site: string;
  clockIn: string;
  clockOut?: string;
  status: "on-time" | "late" | "pending-approval" | "approved" | "rejected";
  duration?: string;
  onApprove?: () => void;
  onReject?: () => void;
}

const statusConfig = {
  "on-time": { label: "On Time", className: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
  late: { label: "Late", className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
  "pending-approval": { label: "Pending", className: "bg-secondary text-secondary-foreground" },
  approved: { label: "Approved", className: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function AttendanceRow({
  id,
  staffName,
  initials,
  site,
  clockIn,
  clockOut,
  status,
  duration,
  onApprove,
  onReject,
}: AttendanceRowProps) {
  return (
    <div
      className="flex items-center justify-between p-4 border-b hover-elevate transition-all"
      data-testid={`attendance-row-${id}`}
    >
      <div className="flex items-center gap-4 flex-1">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{staffName}</p>
          <p className="text-xs text-muted-foreground">{site}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right hidden md:block">
          <p className="text-xs text-muted-foreground">Clock In</p>
          <p className="font-mono text-sm">{clockIn}</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs text-muted-foreground">Clock Out</p>
          <p className="font-mono text-sm">{clockOut || "-"}</p>
        </div>
        {duration && (
          <div className="text-right hidden lg:block">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="font-mono text-sm">{duration}</p>
          </div>
        )}
        <Badge variant="outline" className={statusConfig[status].className}>
          {statusConfig[status].label}
        </Badge>
        {status === "pending-approval" && (
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onApprove}
              data-testid={`button-approve-${id}`}
            >
              <CheckCircle className="h-4 w-4 text-chart-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onReject}
              data-testid={`button-reject-${id}`}
            >
              <XCircle className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

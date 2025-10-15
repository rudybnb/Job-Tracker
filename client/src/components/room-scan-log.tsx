import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Smartphone } from "lucide-react";

interface RoomScanLogProps {
  id: string;
  roomName: string;
  staffName: string;
  timestamp: string;
  confidence: number;
  deviceId: string;
  status: "verified" | "low-confidence" | "failed";
}

const statusConfig = {
  verified: { label: "Verified", className: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
  "low-confidence": {
    label: "Low Confidence",
    className: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function RoomScanLog({
  id,
  roomName,
  staffName,
  timestamp,
  confidence,
  deviceId,
  status,
}: RoomScanLogProps) {
  return (
    <div
      className="flex items-center justify-between p-3 border-b hover-elevate transition-all"
      data-testid={`room-scan-${id}`}
    >
      <div className="flex items-center gap-3 flex-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <p className="font-medium text-sm truncate">{roomName}</p>
          </div>
          <p className="text-xs text-muted-foreground truncate">{staffName}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right hidden md:block">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="font-mono">{timestamp}</span>
          </div>
        </div>
        <div className="text-right hidden lg:block">
          <p className="text-xs text-muted-foreground">Confidence</p>
          <p className="font-mono text-sm">{confidence}%</p>
        </div>
        <div className="hidden xl:block">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Smartphone className="h-3 w-3" />
            <span className="font-mono">{deviceId}</span>
          </div>
        </div>
        <Badge variant="outline" className={statusConfig[status].className}>
          {statusConfig[status].label}
        </Badge>
      </div>
    </div>
  );
}

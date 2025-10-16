import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, User, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";

interface ShiftCardProps {
  id: string;
  staffName: string;
  role: string;
  site: string;
  siteColor: "purple" | "teal" | "orange";
  date: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "in-progress" | "completed" | "conflict";
  duration?: string;
  relievedBy?: string;
  shiftType?: "day" | "night";
}

const siteColors = {
  purple: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  teal: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  orange: "bg-chart-4/10 text-chart-4 border-chart-4/20",
};

const statusColors = {
  scheduled: "bg-secondary text-secondary-foreground",
  "in-progress": "bg-chart-5/10 text-chart-5 border-chart-5/20",
  completed: "bg-muted text-muted-foreground",
  conflict: "bg-destructive/10 text-destructive border-destructive/20",
};

export function ShiftCard({
  id,
  staffName,
  role,
  site,
  siteColor,
  date,
  startTime,
  endTime,
  status,
  duration,
  relievedBy,
  shiftType = "day",
}: ShiftCardProps) {
  const formattedDate = format(parseISO(date), "EEE, MMM d");
  
  const cardClass = shiftType === "night" 
    ? "hover-elevate cursor-pointer transition-all bg-primary/5 border-primary/20" 
    : "hover-elevate cursor-pointer transition-all";
  
  return (
    <Card
      className={cardClass}
      data-testid={`shift-card-${id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{staffName}</h4>
            <p className="text-xs text-muted-foreground">{role}</p>
          </div>
          <Badge variant="outline" className={siteColors[siteColor]}>
            {site}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span className="font-medium">{formattedDate}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="font-mono">{startTime} - {endTime}</span>
            {duration && <span>({duration})</span>}
          </div>
          {relievedBy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>Relieved by: <span className="font-medium">{relievedBy}</span></span>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Badge className={statusColors[status]} variant="outline">
              {status.replace("-", " ")}
            </Badge>
            {shiftType === "night" && (
              <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">
                Night Shift
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

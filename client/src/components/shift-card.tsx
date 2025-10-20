import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, User, Calendar, Sun, Moon } from "lucide-react";
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
    ? "hover-elevate cursor-pointer transition-all bg-primary/10 border-primary/30" 
    : "hover-elevate cursor-pointer transition-all bg-amber-500/5 border-amber-500/20";
  
  return (
    <Card
      className={cardClass}
      data-testid={`shift-card-${id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`p-1.5 rounded-md ${shiftType === "night" ? "bg-primary/20" : "bg-amber-500/20"}`}>
              {shiftType === "night" ? (
                <Moon className="h-4 w-4 text-primary" />
              ) : (
                <Sun className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{staffName}</h4>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
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
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono font-medium">{startTime} - {endTime}</span>
            {duration && <span className="text-muted-foreground">({duration})</span>}
          </div>
          {relievedBy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>Relieved by: <span className="font-medium text-foreground">{relievedBy}</span></span>
            </div>
          )}
          <div className="flex gap-2 flex-wrap pt-1">
            <Badge className={statusColors[status]} variant="outline">
              {status.replace("-", " ")}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Clock } from "lucide-react";

interface QueryTicketProps {
  id: string;
  subject: string;
  description: string;
  staffName: string;
  category: "pay" | "hr" | "schedule" | "general";
  status: "open" | "in-progress" | "resolved";
  createdAt: string;
  relatedTo?: string;
  onClick?: () => void;
}

const categoryColors = {
  pay: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  hr: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  schedule: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  general: "bg-secondary text-secondary-foreground",
};

const statusColors = {
  open: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  "in-progress": "bg-chart-1/10 text-chart-1 border-chart-1/20",
  resolved: "bg-chart-5/10 text-chart-5 border-chart-5/20",
};

export function QueryTicket({
  id,
  subject,
  description,
  staffName,
  category,
  status,
  createdAt,
  relatedTo,
  onClick,
}: QueryTicketProps) {
  return (
    <Card
      className="hover-elevate cursor-pointer transition-all"
      onClick={onClick}
      data-testid={`query-ticket-${id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{subject}</h4>
            <p className="text-xs text-muted-foreground mt-1">{staffName}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className={categoryColors[category]}>
              {category}
            </Badge>
            <Badge variant="outline" className={statusColors[status]}>
              {status.replace("-", " ")}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{createdAt}</span>
          </div>
          {relatedTo && (
            <span className="text-xs text-muted-foreground">
              Related to: {relatedTo}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

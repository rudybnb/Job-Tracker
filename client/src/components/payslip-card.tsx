import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Download } from "lucide-react";
import { useState } from "react";

interface PayslipLineItem {
  id: string;
  description: string;
  type: "earning" | "deduction";
  hours?: number;
  rate?: number;
  amount: number;
  reason?: string;
}

interface PayslipCardProps {
  id: string;
  period: string;
  site: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  lineItems: PayslipLineItem[];
  onDownload?: () => void;
}

export function PayslipCard({
  id,
  period,
  site,
  grossPay,
  deductions,
  netPay,
  lineItems,
  onDownload,
}: PayslipCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card data-testid={`payslip-card-${id}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{period}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{site}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDownload}
            data-testid={`button-download-${id}`}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Gross Pay</span>
            <span className="font-mono font-medium">£{grossPay.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Deductions</span>
            <span className="font-mono font-medium text-destructive">
              -£{deductions.toFixed(2)}
            </span>
          </div>
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="font-medium">Net Pay</span>
            <span className="font-mono font-bold text-lg text-chart-5">
              £{netPay.toFixed(2)}
            </span>
          </div>

          <Button
            variant="ghost"
            className="w-full justify-between"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-expand-${id}`}
          >
            <span className="text-sm">View Breakdown</span>
            <ChevronRight
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </Button>

          {expanded && (
            <div className="space-y-2 pt-2 border-t">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Earnings</p>
                {lineItems
                  .filter((item) => item.type === "earning")
                  .map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div>
                        <p>{item.description}</p>
                        {item.hours && item.rate && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {item.hours}h × £{item.rate}/h
                          </p>
                        )}
                      </div>
                      <span className="font-mono">£{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
              </div>
              <div className="space-y-1 pt-2">
                <p className="text-xs font-medium text-muted-foreground">Deductions</p>
                {lineItems
                  .filter((item) => item.type === "deduction")
                  .map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div>
                        <p>{item.description}</p>
                        {item.reason && (
                          <p className="text-xs text-muted-foreground">{item.reason}</p>
                        )}
                      </div>
                      <span className="font-mono text-destructive">
                        -£{item.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

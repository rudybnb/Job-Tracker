import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WorkerBottomNav } from "@/components/worker-bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Download, ChevronRight, DollarSign, TrendingUp, Clock } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { User, Payslip, PayrollRun } from "@shared/schema";

interface PayslipLineItem {
  id: string;
  description: string;
  type: "earning" | "deduction";
  hours?: number;
  rate?: number;
  amount: number;
  reason?: string;
}

export default function WorkerPay() {
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  const { data: payslips = [], isLoading: payslipsLoading } = useQuery<Payslip[]>({
    queryKey: ['/api/payslips', { userId: user?.id }],
    enabled: !!user,
  });

  const { data: payrollRuns = [], isLoading: runsLoading } = useQuery<PayrollRun[]>({
    queryKey: ['/api/payroll-runs'],
  });

  const latestPayslip = payslips.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const getPayrollRunPeriod = (payslipRunId: number) => {
    const run = payrollRuns.find(r => r.id === payslipRunId);
    return run?.period || "Unknown Period";
  };

  const calculateTotalHours = (lineItems: PayslipLineItem[]) => {
    const regularHours = lineItems
      .filter(item => item.type === 'earning' && item.description.toLowerCase().includes('base'))
      .reduce((sum, item) => sum + (item.hours || 0), 0);
    
    const overtimeHours = lineItems
      .filter(item => item.type === 'earning' && item.description.toLowerCase().includes('overtime'))
      .reduce((sum, item) => sum + (item.hours || 0), 0);

    return { regularHours, overtimeHours };
  };

  if (userLoading || payslipsLoading) {
    return (
      <div className="min-h-screen pb-20 md:pb-0">
        <div className="max-w-2xl mx-auto p-4 space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <WorkerBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-pay-title">My Pay</h1>
          <p className="text-muted-foreground mt-1">View your payslips and earnings</p>
        </div>

        {/* Current Period Summary */}
        {latestPayslip && (
          <Card className="border-2" data-testid="card-current-period">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">Current Pay Period</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getPayrollRunPeriod(latestPayslip.payrollRunId)}
                  </p>
                </div>
                <DollarSign className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Net Pay - Large Display */}
              <div className="text-center py-4 bg-card rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">Net Pay</p>
                <p className="text-4xl font-bold font-mono text-chart-5" data-testid="text-net-pay">
                  £{Number(latestPayslip.netPay).toFixed(2)}
                </p>
              </div>

              {/* Gross Pay & Deductions */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Gross Pay</p>
                  <p className="text-xl font-mono font-medium" data-testid="text-gross-pay">
                    £{Number(latestPayslip.grossPay).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Deductions</p>
                  <p className="text-xl font-mono font-medium text-destructive" data-testid="text-deductions">
                    -£{Number(latestPayslip.deductions).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Hours Breakdown */}
              {(() => {
                const lineItems = latestPayslip.lineItems as unknown as PayslipLineItem[];
                const { regularHours, overtimeHours } = calculateTotalHours(lineItems);
                
                if (regularHours > 0 || overtimeHours > 0) {
                  return (
                    <div className="space-y-2">
                      <Separator />
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Regular Hours</span>
                        </div>
                        <span className="font-mono font-medium">{regularHours}h</span>
                      </div>
                      {overtimeHours > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-chart-1" />
                            <span className="text-muted-foreground">Overtime Hours</span>
                          </div>
                          <span className="font-mono font-medium text-chart-1">{overtimeHours}h</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* View Details Button */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full min-h-12 justify-between"
                    onClick={() => setSelectedPayslip(latestPayslip)}
                    data-testid="button-view-breakdown"
                  >
                    View Detailed Breakdown
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <PayslipDetailDialog payslip={selectedPayslip} payrollRuns={payrollRuns} />
              </Dialog>
            </CardContent>
          </Card>
        )}

        {/* Recent Payslips */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Payslips</h2>
          
          {payslips.length > 0 ? (
            <div className="space-y-3">
              {payslips
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((payslip) => (
                  <Dialog key={payslip.id}>
                    <DialogTrigger asChild>
                      <Card 
                        className="hover-elevate cursor-pointer transition-all"
                        onClick={() => setSelectedPayslip(payslip)}
                        data-testid={`payslip-card-${payslip.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-medium">
                                {getPayrollRunPeriod(payslip.payrollRunId)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(payslip.createdAt), 'd MMM yyyy')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Net Pay</p>
                              <p className="text-xl font-mono font-bold text-chart-5">
                                £{Number(payslip.netPay).toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Gross: £{Number(payslip.grossPay).toFixed(2)}</span>
                            <span>Deductions: -£{Number(payslip.deductions).toFixed(2)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    <PayslipDetailDialog payslip={selectedPayslip} payrollRuns={payrollRuns} />
                  </Dialog>
                ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No payslips available yet
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <WorkerBottomNav />
    </div>
  );
}

function PayslipDetailDialog({ 
  payslip, 
  payrollRuns 
}: { 
  payslip: Payslip | null; 
  payrollRuns: PayrollRun[];
}) {
  if (!payslip) return null;

  const lineItems = payslip.lineItems as unknown as PayslipLineItem[];
  const earnings = lineItems.filter(item => item.type === 'earning');
  const deductions = lineItems.filter(item => item.type === 'deduction');
  const payrollRun = payrollRuns.find(r => r.id === payslip.payrollRunId);

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-payslip-detail">
      <DialogHeader>
        <DialogTitle>Payslip Details</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {payrollRun?.period || "Unknown Period"}
        </p>
      </DialogHeader>

      <div className="space-y-6">
        {/* Summary */}
        <div className="bg-card rounded-lg p-4 border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-muted-foreground">Gross Pay</span>
            <span className="font-mono font-medium">£{Number(payslip.grossPay).toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-muted-foreground">Total Deductions</span>
            <span className="font-mono font-medium text-destructive">
              -£{Number(payslip.deductions).toFixed(2)}
            </span>
          </div>
          <Separator className="my-3" />
          <div className="flex justify-between items-center">
            <span className="font-medium">Net Pay</span>
            <span className="text-2xl font-mono font-bold text-chart-5">
              £{Number(payslip.netPay).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Earnings Breakdown */}
        <div>
          <h3 className="font-medium mb-3">Earnings</h3>
          <div className="space-y-2">
            {earnings.map((item) => (
              <div 
                key={item.id} 
                className="flex justify-between items-start p-3 rounded-lg border"
                data-testid={`earning-${item.id}`}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.description}</p>
                  {item.hours && item.rate && (
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {item.hours}h × £{item.rate}/h
                    </p>
                  )}
                </div>
                <span className="font-mono font-medium">£{item.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Deductions Breakdown */}
        <div>
          <h3 className="font-medium mb-3">Deductions</h3>
          <div className="space-y-2">
            {deductions.map((item) => (
              <div 
                key={item.id} 
                className="flex justify-between items-start p-3 rounded-lg border"
                data-testid={`deduction-${item.id}`}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.description}</p>
                  {item.reason && (
                    <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                  )}
                </div>
                <span className="font-mono font-medium text-destructive">
                  -£{item.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Download Button */}
        <Button 
          variant="outline" 
          className="w-full min-h-12" 
          disabled
          data-testid="button-download-payslip"
        >
          <Download className="h-4 w-4 mr-2" />
          Download Payslip (Coming Soon)
        </Button>
      </div>
    </DialogContent>
  );
}

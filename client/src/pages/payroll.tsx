import { PayslipCard } from "@/components/payslip-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Download, Upload } from "lucide-react";

export default function Payroll() {
  //todo: remove mock functionality
  const mockPayslips = [
    {
      id: "1",
      period: "Week 15, 2025",
      site: "Kent Site",
      grossPay: 593.75,
      deductions: 166.25,
      netPay: 427.5,
      lineItems: [
        {
          id: "1",
          description: "Base Pay",
          type: "earning" as const,
          hours: 40,
          rate: 12.5,
          amount: 500,
        },
        {
          id: "2",
          description: "Overtime (1.5x)",
          type: "earning" as const,
          hours: 5,
          rate: 18.75,
          amount: 93.75,
        },
        {
          id: "3",
          description: "PAYE Tax",
          type: "deduction" as const,
          amount: 118.75,
          reason: "Income tax",
        },
        {
          id: "4",
          description: "National Insurance",
          type: "deduction" as const,
          amount: 47.5,
          reason: "NI contributions",
        },
      ],
    },
    {
      id: "2",
      period: "Week 14, 2025",
      site: "London Site",
      grossPay: 550,
      deductions: 155,
      netPay: 395,
      lineItems: [
        {
          id: "5",
          description: "Base Pay",
          type: "earning" as const,
          hours: 40,
          rate: 12.5,
          amount: 500,
        },
        {
          id: "6",
          description: "Bank Holiday",
          type: "earning" as const,
          hours: 2,
          rate: 25,
          amount: 50,
        },
        {
          id: "7",
          description: "PAYE Tax",
          type: "deduction" as const,
          amount: 110,
          reason: "Income tax",
        },
        {
          id: "8",
          description: "National Insurance",
          type: "deduction" as const,
          amount: 45,
          reason: "NI contributions",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Payroll Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage pay runs and generate payslips
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-import-csv">
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button variant="outline" data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export for Sage
          </Button>
          <Button data-testid="button-create-payrun">
            <Plus className="h-4 w-4 mr-2" />
            Create Pay Run
          </Button>
        </div>
      </div>

      <Tabs defaultValue="statements" className="w-full">
        <TabsList>
          <TabsTrigger value="statements" data-testid="tab-statements">
            Pay Statements
          </TabsTrigger>
          <TabsTrigger value="runs" data-testid="tab-runs">
            Pay Runs
          </TabsTrigger>
          <TabsTrigger value="adjustments" data-testid="tab-adjustments">
            Adjustments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="statements" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockPayslips.map((payslip) => (
              <PayslipCard
                key={payslip.id}
                {...payslip}
                onDownload={() => console.log("Download", payslip.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pay Run History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                No pay runs created yet
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Manual Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                No adjustments recorded
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

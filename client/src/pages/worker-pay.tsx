import { PayslipCard } from "@/components/payslip-card";
import { WorkerBottomNav } from "@/components/worker-bottom-nav";

export default function WorkerPay() {
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
      site: "Kent Site",
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
    <div className="min-h-screen pb-20 md:pb-0">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">My Pay</h1>
          <p className="text-muted-foreground mt-1">View your payslips and earnings</p>
        </div>

        <div className="space-y-4">
          {mockPayslips.map((payslip) => (
            <PayslipCard
              key={payslip.id}
              {...payslip}
              onDownload={() => console.log("Download", payslip.id)}
            />
          ))}
        </div>
      </div>
      <WorkerBottomNav />
    </div>
  );
}

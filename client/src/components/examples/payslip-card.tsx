import { PayslipCard } from "../payslip-card";

export default function PayslipCardExample() {
  const lineItems = [
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
  ];

  return (
    <div className="p-4 max-w-md">
      <PayslipCard
        id="1"
        period="Week 15, 2025"
        site="Kent Site"
        grossPay={593.75}
        deductions={166.25}
        netPay={427.5}
        lineItems={lineItems}
        onDownload={() => console.log("Download payslip")}
      />
    </div>
  );
}

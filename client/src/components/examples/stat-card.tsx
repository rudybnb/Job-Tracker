import { StatCard } from "../stat-card";
import { Users, Clock, DollarSign, CheckCircle } from "lucide-react";

export default function StatCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
      <StatCard
        title="Total Staff"
        value={156}
        icon={Users}
        trend={{ value: 12, label: "from last month" }}
      />
      <StatCard
        title="Clocked In"
        value={89}
        icon={Clock}
        variant="success"
      />
      <StatCard
        title="Pending Approvals"
        value={7}
        icon={CheckCircle}
        variant="warning"
      />
      <StatCard
        title="Weekly Payroll"
        value="£45.2k"
        icon={DollarSign}
        trend={{ value: -3, label: "from last week" }}
      />
    </div>
  );
}

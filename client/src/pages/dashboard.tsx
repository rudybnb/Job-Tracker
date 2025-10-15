import { StatCard } from "@/components/stat-card";
import { ShiftCard } from "@/components/shift-card";
import { AttendanceRow } from "@/components/attendance-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Clock, AlertCircle, DollarSign, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  //todo: remove mock functionality
  const mockShifts = [
    {
      id: "1",
      staffName: "Sarah Johnson",
      role: "Care Assistant",
      site: "Kent",
      siteColor: "purple" as const,
      startTime: "08:00",
      endTime: "16:00",
      status: "in-progress" as const,
      duration: "8h",
    },
    {
      id: "2",
      staffName: "Mike Chen",
      role: "Senior Care",
      site: "London",
      siteColor: "teal" as const,
      startTime: "14:00",
      endTime: "22:00",
      status: "scheduled" as const,
      duration: "8h",
    },
    {
      id: "3",
      staffName: "Emma Wilson",
      role: "Nurse",
      site: "Essex",
      siteColor: "orange" as const,
      startTime: "22:00",
      endTime: "06:00",
      status: "scheduled" as const,
      duration: "8h",
    },
  ];

  const mockAttendance = [
    {
      id: "1",
      staffName: "David Brown",
      initials: "DB",
      site: "Kent Site",
      clockIn: "07:58",
      clockOut: "16:05",
      status: "pending-approval" as const,
      duration: "8h 7m",
    },
    {
      id: "2",
      staffName: "Lisa White",
      initials: "LW",
      site: "London Site",
      clockIn: "08:15",
      status: "late" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Overview</h1>
        <p className="text-muted-foreground mt-1">
          Workforce management dashboard for all 3 sites
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Staff"
          value={156}
          icon={Users}
          trend={{ value: 12, label: "from last month" }}
        />
        <StatCard
          title="Clocked In Now"
          value={89}
          icon={Clock}
          variant="success"
        />
        <StatCard
          title="Pending Approvals"
          value={7}
          icon={AlertCircle}
          variant="warning"
        />
        <StatCard
          title="Weekly Payroll"
          value="£45.2k"
          icon={DollarSign}
          trend={{ value: -3, label: "from last week" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <CardTitle>Today's Shifts</CardTitle>
            <Link href="/rota">
              <Button variant="ghost" size="sm" data-testid="link-view-all-shifts">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockShifts.map((shift) => (
              <ShiftCard key={shift.id} {...shift} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <CardTitle>Recent Attendance</CardTitle>
            <Link href="/attendance">
              <Button variant="ghost" size="sm" data-testid="link-view-all-attendance">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-0">
            {mockAttendance.map((record) => (
              <AttendanceRow
                key={record.id}
                {...record}
                onApprove={() => console.log("Approved", record.id)}
                onReject={() => console.log("Rejected", record.id)}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

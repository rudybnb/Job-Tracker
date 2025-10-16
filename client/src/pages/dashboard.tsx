import { StatCard } from "@/components/stat-card";
import { ShiftCard } from "@/components/shift-card";
import { AttendanceRow } from "@/components/attendance-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Clock, AlertCircle, DollarSign, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Shift, Attendance, User, Site } from "@shared/schema";
import { format, parseISO } from "date-fns";

export default function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");
  
  // Get all upcoming shifts (not filtered by date)
  const { data: allShifts = [] } = useQuery<(Shift & { user?: User; site?: Site })[]>({
    queryKey: ["/api/shifts"],
  });

  const { data: attendance = [] } = useQuery<(Attendance & { user?: User; site?: Site })[]>({
    queryKey: ["/api/attendance", { limit: 5 }],
  });
  
  // Filter for today's and upcoming shifts
  const shifts = allShifts.filter(shift => shift.date >= today).slice(0, 10);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const totalStaff = users.length;
  const clockedInNow = attendance.filter(a => a.clockOut === null).length;
  const pendingApprovals = attendance.filter(a => a.approvalStatus === "pending").length;

  const getSiteColor = (siteId: number): "purple" | "teal" | "orange" => {
    const site = sites.find(s => s.id === siteId);
    return site?.color as "purple" | "teal" | "orange" || "purple";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Overview</h1>
        <p className="text-muted-foreground mt-1">
          Workforce management dashboard for all {sites.length} sites
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Staff"
          value={totalStaff}
          icon={Users}
        />
        <StatCard
          title="Clocked In Now"
          value={clockedInNow}
          icon={Clock}
          variant="success"
        />
        <StatCard
          title="Pending Approvals"
          value={pendingApprovals}
          icon={AlertCircle}
          variant="warning"
        />
        <StatCard
          title="Today's Shifts"
          value={shifts.length}
          icon={DollarSign}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <CardTitle>Upcoming Shifts</CardTitle>
            <Link href="/rota">
              <Button variant="ghost" size="sm" data-testid="link-view-all-shifts">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No upcoming shifts scheduled
              </p>
            ) : (
              shifts.slice(0, 5).map((shift) => (
                <ShiftCard
                  key={shift.id}
                  id={shift.id.toString()}
                  staffName={shift.user ? `${shift.user.firstName} ${shift.user.lastName}` : "Unknown"}
                  role={shift.role}
                  site={shift.site?.name || "Unknown"}
                  siteColor={getSiteColor(shift.siteId)}
                  startTime={shift.startTime}
                  endTime={shift.endTime}
                  status={shift.status as "scheduled" | "in-progress" | "completed"}
                  duration={`${Math.round((new Date(`2000-01-01 ${shift.endTime}`).getTime() - new Date(`2000-01-01 ${shift.startTime}`).getTime()) / 3600000)}h`}
                />
              ))
            )}
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
            {attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent attendance records
              </p>
            ) : (
              attendance.slice(0, 5).map((record) => {
                const user = record.user;
                const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : "??";
                return (
                  <AttendanceRow
                    key={record.id}
                    id={record.id.toString()}
                    staffName={user ? `${user.firstName} ${user.lastName}` : "Unknown"}
                    initials={initials}
                    site={record.site?.name || "Unknown"}
                    clockIn={record.clockIn}
                    clockOut={record.clockOut || undefined}
                    status={record.approvalStatus as "pending-approval" | "approved" | "late"}
                    onApprove={() => console.log("Approved", record.id)}
                    onReject={() => console.log("Rejected", record.id)}
                  />
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

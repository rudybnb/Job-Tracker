import { StatCard } from "@/components/stat-card";
import { ShiftCard } from "@/components/shift-card";
import { AttendanceRow } from "@/components/attendance-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertCircle, Calendar, ArrowRight, Plus, TrendingUp, Building2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Shift, Attendance, User, Site } from "@shared/schema";
import { format, parseISO } from "date-fns";

export default function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");
  
  // Get current user
  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });
  
  // Get all upcoming shifts (not filtered by date)
  const { data: allShifts = [] } = useQuery<(Shift & { user?: User; site?: Site })[]>({
    queryKey: ["/api/shifts"],
  });

  const { data: attendance = [] } = useQuery<(Attendance & { user?: User; site?: Site })[]>({
    queryKey: ["/api/attendance", { limit: 5 }],
  });
  
  // Filter for today's and upcoming shifts
  const shifts = allShifts.filter(shift => shift.date >= today).slice(0, 10);
  const todaysShifts = allShifts.filter(shift => shift.date === today);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const totalStaff = users.length;
  const clockedInNow = attendance.filter(a => a.clockOut === null).length;
  const pendingApprovals = attendance.filter(a => a.approvalStatus === "pending").length;
  const activeShiftsNow = todaysShifts.filter(s => s.status === "in-progress").length;

  const getSiteColor = (siteId: number): "purple" | "teal" | "orange" => {
    const site = sites.find(s => s.id === siteId);
    return site?.color as "purple" | "teal" | "orange" || "purple";
  };

  const getRelief = (shift: Shift & { user?: User; site?: Site }): string | undefined => {
    // Find the next shift at the same site that starts when this one ends
    const reliefShift = allShifts.find(s => 
      s.siteId === shift.siteId && 
      s.date === shift.date && 
      s.startTime === shift.endTime &&
      s.userId !== shift.userId
    );
    
    if (reliefShift && reliefShift.user) {
      return `${reliefShift.user.firstName} ${reliefShift.user.lastName}`;
    }
    return undefined;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent rounded-lg border border-primary/20 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">
              {getGreeting()}, {currentUser?.firstName || "Admin"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {format(new Date(), "EEEE, MMMM d, yyyy")} • Managing {sites.length} locations
            </p>
          </div>
          <Link href="/rota">
            <Button className="gap-2" data-testid="button-quick-create-shift">
              <Plus className="h-4 w-4" />
              Create Shift
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-chart-1/10 to-transparent border-chart-1/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Staff</p>
                <p className="text-3xl font-bold text-white mt-1">{totalStaff}</p>
                <p className="text-xs text-muted-foreground mt-1">Across all sites</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-chart-1/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-chart-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-chart-5/10 to-transparent border-chart-5/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clocked In</p>
                <p className="text-3xl font-bold text-white mt-1">{clockedInNow}</p>
                <p className="text-xs text-chart-5 mt-1 flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-5 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-chart-5"></span>
                  </span>
                  Live now
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-chart-5/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-chart-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-3xl font-bold text-white mt-1">{pendingApprovals}</p>
                <p className="text-xs text-muted-foreground mt-1">Require approval</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Shifts</p>
                <p className="text-3xl font-bold text-white mt-1">{todaysShifts.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{activeShiftsNow} in progress</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Site Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sites.map((site) => {
          const siteShiftsToday = todaysShifts.filter(s => s.siteId === site.id);
          const siteStaffCount = users.filter(u => u.siteId === site.id).length;
          const siteColor = site.color === "purple" ? "chart-3" : site.color === "teal" ? "chart-2" : "chart-4";
          
          return (
            <Card key={site.id} className={`bg-gradient-to-br from-${siteColor}/10 to-transparent border-${siteColor}/20`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className={`h-5 w-5 text-${siteColor}`} />
                      <h3 className="font-semibold text-white">{site.name}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{site.location}</p>
                  </div>
                  <Badge variant="outline" className={`bg-${siteColor}/10 text-${siteColor} border-${siteColor}/20`}>
                    {siteShiftsToday.length} shifts
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Staff assigned</span>
                    <span className="font-medium text-white">{siteStaffCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Today's shifts</span>
                    <span className="font-medium text-white">{siteShiftsToday.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Shifts - Takes 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <div>
              <CardTitle>Upcoming Shifts</CardTitle>
              <CardDescription>Next scheduled shifts across all sites</CardDescription>
            </div>
            <Link href="/rota">
              <Button variant="ghost" size="sm" data-testid="link-view-all-shifts">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {shifts.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No upcoming shifts scheduled</p>
                <Link href="/rota">
                  <Button variant="outline" size="sm" className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Shift
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shifts.slice(0, 6).map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    id={shift.id.toString()}
                    staffName={shift.user ? `${shift.user.firstName} ${shift.user.lastName}` : "Unknown"}
                    role={shift.role}
                    site={shift.site?.name || "Unknown"}
                    siteColor={getSiteColor(shift.siteId)}
                    date={shift.date}
                    startTime={shift.startTime}
                    endTime={shift.endTime}
                    status={shift.status as "scheduled" | "in-progress" | "completed"}
                    duration={`${Math.round((new Date(`2000-01-01 ${shift.endTime}`).getTime() - new Date(`2000-01-01 ${shift.startTime}`).getTime()) / 3600000)}h`}
                    relievedBy={getRelief(shift)}
                    shiftType={shift.shiftType as "day" | "night"}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Attendance - Takes 1 column */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest attendance records</CardDescription>
            </div>
            <Link href="/attendance">
              <Button variant="ghost" size="sm" data-testid="link-view-all-attendance">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-0">
            {attendance.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No recent attendance</p>
              </div>
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

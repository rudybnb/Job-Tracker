import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkerBottomNav } from "@/components/worker-bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Calendar, DollarSign, QrCode, MessageSquare, MapPin, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { format, isToday } from "date-fns";
import type { User, Shift, Attendance, Payslip, Query } from "@shared/schema";

export default function WorkerHome() {
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: todayShifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', { date: today, userId: user?.id }],
    enabled: !!user,
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery<Attendance[]>({
    queryKey: ['/api/attendance', { userId: user?.id }],
    enabled: !!user,
  });

  const { data: payslips = [], isLoading: payslipsLoading } = useQuery<Payslip[]>({
    queryKey: ['/api/payslips', { userId: user?.id }],
    enabled: !!user,
  });

  const { data: queries = [], isLoading: queriesLoading } = useQuery<Query[]>({
    queryKey: ['/api/queries', { userId: user?.id }],
    enabled: !!user,
  });

  const currentShift = todayShifts.find(s => s.status === 'in-progress' || s.status === 'scheduled');
  const lastAttendance = attendance.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  const latestPayslip = payslips.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  const openQueries = queries.filter(q => q.status === 'open' || q.status === 'in_progress');

  const isClockedIn = lastAttendance && !lastAttendance.clockOut;

  const siteColors = {
    purple: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    teal: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    orange: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  } as const;

  const statusColors = {
    scheduled: "bg-secondary text-secondary-foreground",
    "in-progress": "bg-chart-5/10 text-chart-5 border-chart-5/20",
    completed: "bg-muted text-muted-foreground",
    conflict: "bg-destructive/10 text-destructive border-destructive/20",
  } as const;

  if (userLoading) {
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
        {/* Welcome Header */}
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-welcome">
            Welcome back, {user?.firstName || 'Worker'}
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-date">
            {format(new Date(), 'EEEE, d MMMM yyyy')}
          </p>
        </div>

        {/* Clock In/Out Quick Action */}
        <Card className="border-2" data-testid="card-clock-status">
          <CardContent className="p-6">
            {isClockedIn ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-chart-5 animate-pulse" />
                    <div>
                      <p className="font-medium">Currently Clocked In</p>
                      <p className="text-sm text-muted-foreground">
                        Since {lastAttendance.clockIn}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-chart-5/10 text-chart-5 border-chart-5/20" variant="outline">
                    Active
                  </Badge>
                </div>
                <Button 
                  variant="destructive" 
                  size="lg" 
                  className="w-full min-h-12" 
                  asChild
                  data-testid="button-clock-out"
                >
                  <Link href="/worker/clock">
                    <Clock className="h-5 w-5 mr-2" />
                    Clock Out
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">Ready to start your shift?</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentShift ? `Shift starts at ${currentShift.startTime}` : 'No shift scheduled today'}
                  </p>
                </div>
                <Button 
                  size="lg" 
                  className="w-full min-h-12" 
                  asChild
                  data-testid="button-clock-in"
                >
                  <Link href="/worker/clock">
                    <Clock className="h-5 w-5 mr-2" />
                    Clock In
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Shift (if exists) */}
        {currentShift && (
          <Card data-testid="card-todays-shift">
            <CardHeader>
              <CardTitle className="text-lg">Today's Shift</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-medium">
                    {currentShift.startTime} - {currentShift.endTime}
                  </span>
                </div>
                <Badge className={statusColors[currentShift.status as keyof typeof statusColors]} variant="outline">
                  {currentShift.status.replace('-', ' ')}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{currentShift.role}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full min-h-12 justify-start" 
            asChild
            data-testid="button-view-schedule"
          >
            <Link href="/worker/clock">
              <Calendar className="h-5 w-5 mr-3" />
              View My Schedule
            </Link>
          </Button>

          <Button 
            variant="outline" 
            size="lg" 
            className="w-full min-h-12 justify-start" 
            asChild
            data-testid="button-view-pay"
          >
            <Link href="/worker/pay">
              <DollarSign className="h-5 w-5 mr-3" />
              View My Pay
            </Link>
          </Button>

          <Button 
            variant="outline" 
            size="lg" 
            className="w-full min-h-12 justify-start" 
            asChild
            data-testid="button-scan-room"
          >
            <Link href="/worker/scan">
              <QrCode className="h-5 w-5 mr-3" />
              Scan Room QR
            </Link>
          </Button>

          <Button 
            variant="outline" 
            size="lg" 
            className="w-full min-h-12 justify-start" 
            asChild
            data-testid="button-submit-query"
          >
            <Link href="/queries">
              <MessageSquare className="h-5 w-5 mr-3" />
              Submit Query
              {openQueries.length > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  {openQueries.length}
                </Badge>
              )}
            </Link>
          </Button>
        </div>

        {/* Recent Activity */}
        <Card data-testid="card-recent-activity">
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Last Attendance */}
            {lastAttendance && (
              <div className="flex items-start gap-3 pb-3 border-b">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Last Attendance</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(lastAttendance.date), 'EEE, d MMM')} • {lastAttendance.clockIn}
                    {lastAttendance.clockOut && ` - ${lastAttendance.clockOut}`}
                  </p>
                </div>
                <Badge 
                  variant="outline" 
                  className={
                    lastAttendance.approvalStatus === 'approved' 
                      ? 'bg-chart-5/10 text-chart-5 border-chart-5/20'
                      : lastAttendance.approvalStatus === 'rejected'
                      ? 'bg-destructive/10 text-destructive border-destructive/20'
                      : ''
                  }
                >
                  {lastAttendance.approvalStatus}
                </Badge>
              </div>
            )}

            {/* Last Payslip */}
            {latestPayslip && (
              <div className="flex items-start gap-3 pb-3 border-b">
                <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Latest Payslip</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Net Pay: £{Number(latestPayslip.netPay).toFixed(2)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild data-testid="button-view-payslip">
                  <Link href="/worker/pay">View</Link>
                </Button>
              </div>
            )}

            {/* Open Queries */}
            {openQueries.length > 0 ? (
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-chart-1 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Open Queries</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    You have {openQueries.length} open {openQueries.length === 1 ? 'query' : 'queries'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild data-testid="button-view-queries">
                  <Link href="/queries">View</Link>
                </Button>
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No recent activity
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <WorkerBottomNav />
    </div>
  );
}

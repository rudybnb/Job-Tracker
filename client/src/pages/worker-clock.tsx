import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkerBottomNav } from "@/components/worker-bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, Calendar, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, Site, Shift, Attendance } from "@shared/schema";

export default function WorkerClock() {
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  const { data: sites = [], isLoading: sitesLoading } = useQuery<Site[]>({
    queryKey: ['/api/sites'],
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: todayShifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', { date: today, userId: user?.id }],
    enabled: !!user,
  });

  const { data: weekAttendance = [], isLoading: attendanceLoading } = useQuery<Attendance[]>({
    queryKey: ['/api/attendance', { userId: user?.id }],
    enabled: !!user,
  });

  const currentShift = todayShifts.find(s => s.status === 'in-progress' || s.status === 'scheduled');
  const todayAttendance = weekAttendance.filter(a => a.date === today);
  const lastAttendance = todayAttendance.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  const isClockedIn = lastAttendance && !lastAttendance.clockOut;

  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSiteId) {
        throw new Error("Please select a site");
      }
      return apiRequest('POST', '/api/attendance/clock-in', {
        siteId: selectedSiteId,
        shiftId: currentShift?.id,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      setNotes("");
      toast({
        title: "Clocked In",
        description: "You have successfully clocked in",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!lastAttendance) {
        throw new Error("No active clock-in found");
      }
      return apiRequest('PATCH', `/api/attendance/${lastAttendance.id}/clock-out`, {
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      setNotes("");
      toast({
        title: "Clocked Out",
        description: "You have successfully clocked out",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const calculateDuration = (clockIn: string, clockOut?: string | null) => {
    const start = new Date();
    const [hours, minutes] = clockIn.split(":");
    start.setHours(parseInt(hours), parseInt(minutes), 0);
    
    const end = clockOut ? (() => {
      const e = new Date();
      const [h, m] = clockOut.split(":");
      e.setHours(parseInt(h), parseInt(m), 0);
      return e;
    })() : new Date();

    const diff = end.getTime() - start.getTime();
    const h = Math.floor(diff / 1000 / 60 / 60);
    const m = Math.floor((diff / 1000 / 60) % 60);
    return `${h}h ${m}m`;
  };

  if (userLoading || sitesLoading) {
    return (
      <div className="min-h-screen pb-20 md:pb-0">
        <div className="max-w-2xl mx-auto p-4 space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
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
          <h1 className="text-2xl font-semibold" data-testid="text-clock-title">Time Clock</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-clock-date">
            {format(currentTime, 'EEEE, d MMMM yyyy')}
          </p>
        </div>

        {/* Clock Display */}
        <Card className="border-2" data-testid="card-clock-display">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <div>
                <p className="text-6xl font-bold font-mono" data-testid="text-current-time">
                  {format(currentTime, 'HH:mm:ss')}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Current Time
                </p>
              </div>

              {isClockedIn && lastAttendance && (
                <div className="bg-card rounded-lg p-4 border space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-chart-5 animate-pulse" />
                    <Badge className="bg-chart-5/10 text-chart-5 border-chart-5/20" variant="outline">
                      Clocked In
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Clock In Time</span>
                    <span className="font-mono font-medium">{lastAttendance.clockIn}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-mono font-medium">
                      {calculateDuration(lastAttendance.clockIn)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today's Shift Info */}
        {currentShift && (
          <Card data-testid="card-shift-info">
            <CardHeader>
              <CardTitle className="text-base">Today's Shift</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{currentShift.startTime} - {currentShift.endTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{currentShift.role}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clock In/Out Controls */}
        <Card data-testid="card-clock-controls">
          <CardContent className="p-6 space-y-4">
            {!isClockedIn && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Site</label>
                <Select 
                  value={selectedSiteId?.toString()} 
                  onValueChange={(value) => setSelectedSiteId(parseInt(value))}
                  data-testid="select-site"
                >
                  <SelectTrigger className="min-h-12">
                    <SelectValue placeholder="Choose a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.filter(s => s.isActive).map(site => (
                      <SelectItem key={site.id} value={site.id.toString()}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {site.name} - {site.location}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Textarea
                placeholder="Add any notes about your shift..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-20"
                data-testid="input-notes"
              />
            </div>

            <Button
              size="lg"
              className="w-full min-h-14"
              variant={isClockedIn ? "destructive" : "default"}
              onClick={() => isClockedIn ? clockOutMutation.mutate() : clockInMutation.mutate()}
              disabled={clockInMutation.isPending || clockOutMutation.isPending || (!isClockedIn && !selectedSiteId)}
              data-testid={isClockedIn ? "button-clock-out-action" : "button-clock-in-action"}
            >
              <Clock className="h-5 w-5 mr-2" />
              {isClockedIn ? "Clock Out" : "Clock In"}
            </Button>
          </CardContent>
        </Card>

        {/* This Week's Attendance */}
        <Card data-testid="card-week-attendance">
          <CardHeader>
            <CardTitle className="text-base">This Week's Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : weekAttendance.length > 0 ? (
              <div className="space-y-3">
                {weekAttendance
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((record) => (
                    <div
                      key={record.id}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                      data-testid={`attendance-record-${record.id}`}
                    >
                      <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm">
                            {format(new Date(record.date), 'EEE, d MMM')}
                          </p>
                          {record.approvalStatus === 'approved' && (
                            <CheckCircle2 className="h-4 w-4 text-chart-5" />
                          )}
                          {record.approvalStatus === 'rejected' && (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          {record.approvalStatus === 'pending' && (
                            <AlertCircle className="h-4 w-4 text-chart-1" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {record.clockIn} {record.clockOut ? `- ${record.clockOut}` : '(in progress)'}
                        </p>
                        {record.clockOut && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Duration: {calculateDuration(record.clockIn, record.clockOut)}
                          </p>
                        )}
                        {record.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            {record.notes}
                          </p>
                        )}
                      </div>
                      <Badge 
                        variant="outline" 
                        className={
                          record.approvalStatus === 'approved'
                            ? 'bg-chart-5/10 text-chart-5 border-chart-5/20'
                            : record.approvalStatus === 'rejected'
                            ? 'bg-destructive/10 text-destructive border-destructive/20'
                            : ''
                        }
                      >
                        {record.approvalStatus}
                      </Badge>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-center py-8 text-sm text-muted-foreground">
                No attendance records this week
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <WorkerBottomNav />
    </div>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AttendanceRow } from "@/components/attendance-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Download, Calendar } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

interface AttendanceRecord {
  id: number;
  userId: string;
  siteId: number;
  shiftId: number | null;
  date: string;
  clockIn: string;
  clockOut: string | null;
  approvalStatus: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  duration: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  site: {
    id: number;
    name: string;
    color: string;
  };
}

export default function Attendance() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  // Fetch all attendance records
  const { data: allAttendance = [], isLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance"],
  });

  // Filter records based on search query
  const filteredAttendance = useMemo(() => {
    if (!searchQuery) return allAttendance;
    
    const query = searchQuery.toLowerCase();
    return allAttendance.filter(record => {
      const fullName = `${record.user.firstName || ''} ${record.user.lastName || ''}`.toLowerCase();
      const siteName = record.site.name.toLowerCase();
      return fullName.includes(query) || siteName.includes(query);
    });
  }, [allAttendance, searchQuery]);

  // Live tab: Currently clocked in (no clockOut)
  const liveAttendance = useMemo(() => {
    return filteredAttendance.filter(record => !record.clockOut);
  }, [filteredAttendance]);

  // Pending Approvals tab: Has clockOut and status is 'pending'
  const pendingApprovals = useMemo(() => {
    return filteredAttendance.filter(
      record => record.clockOut && record.approvalStatus === 'pending'
    );
  }, [filteredAttendance]);

  // History tab: approved or rejected records
  const historyRecords = useMemo(() => {
    let records = filteredAttendance.filter(
      record => record.approvalStatus === 'approved' || record.approvalStatus === 'rejected'
    );

    // Filter by date range if selected
    if (dateRange.from) {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      records = records.filter(record => record.date >= fromDate);
    }
    if (dateRange.to) {
      const toDate = format(dateRange.to, 'yyyy-MM-dd');
      records = records.filter(record => record.date <= toDate);
    }

    return records;
  }, [filteredAttendance, dateRange]);

  // Approve attendance mutation
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/attendance/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      toast({
        title: "Attendance Approved",
        description: "The attendance record has been approved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve attendance",
        variant: "destructive",
      });
    },
  });

  // Reject attendance mutation
  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/attendance/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      toast({
        title: "Attendance Rejected",
        description: "The attendance record has been rejected.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject attendance",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (id: number) => {
    approveMutation.mutate(id);
  };

  const handleReject = (id: number) => {
    rejectMutation.mutate(id);
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  };

  const getFullName = (firstName: string | null, lastName: string | null) => {
    return `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown User';
  };

  // Determine status (on-time or late) by comparing with shift start time if available
  const getStatus = (record: AttendanceRecord) => {
    if (record.approvalStatus === 'approved') return 'approved' as const;
    if (record.approvalStatus === 'rejected') return 'rejected' as const;
    if (record.clockOut && record.approvalStatus === 'pending') return 'pending-approval' as const;
    
    // For live records, we could check if they're late based on shift time
    // For now, assume on-time if no shift or if clockIn is reasonable
    return 'on-time' as const;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Attendance Tracking</h1>
          <p className="text-muted-foreground mt-1">
            Real-time attendance monitoring and approvals
          </p>
        </div>
        <Button variant="outline" data-testid="button-export-attendance">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-staff"
          />
        </div>
      </div>

      <Tabs defaultValue="live" className="w-full">
        <TabsList>
          <TabsTrigger value="live" data-testid="tab-live">
            Live ({liveAttendance.length})
          </TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-approvals">
            Pending Approvals ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Currently Clocked In</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : liveAttendance.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No staff currently clocked in
                </div>
              ) : (
                liveAttendance.map((record) => (
                  <AttendanceRow
                    key={record.id}
                    id={record.id.toString()}
                    staffName={getFullName(record.user.firstName, record.user.lastName)}
                    initials={getInitials(record.user.firstName, record.user.lastName)}
                    site={record.site.name}
                    clockIn={record.clockIn}
                    clockOut={record.clockOut || undefined}
                    status={getStatus(record)}
                    duration={record.duration || undefined}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Requires Approval</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : pendingApprovals.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No attendance records pending approval
                </div>
              ) : (
                pendingApprovals.map((record) => (
                  <AttendanceRow
                    key={record.id}
                    id={record.id.toString()}
                    staffName={getFullName(record.user.firstName, record.user.lastName)}
                    initials={getInitials(record.user.firstName, record.user.lastName)}
                    site={record.site.name}
                    clockIn={record.clockIn}
                    clockOut={record.clockOut || undefined}
                    status={getStatus(record)}
                    duration={record.duration || undefined}
                    onApprove={() => handleApprove(record.id)}
                    onReject={() => handleReject(record.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle>Attendance History</CardTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-select-date-range">
                    <Calendar className="h-4 w-4 mr-2" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd')}
                        </>
                      ) : (
                        format(dateRange.from, 'MMM dd, yyyy')
                      )
                    ) : (
                      'Select dates'
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range: any) => setDateRange(range || {})}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {dateRange.from 
                    ? 'No attendance records found for the selected date range'
                    : 'Select a date range to view historical attendance records'
                  }
                </div>
              ) : (
                historyRecords.map((record) => (
                  <AttendanceRow
                    key={record.id}
                    id={record.id.toString()}
                    staffName={getFullName(record.user.firstName, record.user.lastName)}
                    initials={getInitials(record.user.firstName, record.user.lastName)}
                    site={record.site.name}
                    clockIn={record.clockIn}
                    clockOut={record.clockOut || undefined}
                    status={getStatus(record)}
                    duration={record.duration || undefined}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, DollarSign, Users, TrendingUp, Download, CalendarIcon, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveUrl } from "@/lib/queryClient";

export default function Reports() {
  // Calculate default date range (current week)
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const [startDate, setStartDate] = useState<Date>(startOfWeek);
  const [endDate, setEndDate] = useState<Date>(endOfWeek);
  const [selectedSite, setSelectedSite] = useState<string>("all");

  // Format dates for API
  const formatDate = (date: Date) => format(date, "yyyy-MM-dd");

  // Build query params
  const getQueryParams = () => {
    const params = new URLSearchParams({
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    });
    if (selectedSite !== "all") {
      params.append("siteId", selectedSite);
    }
    return params.toString();
  };

  // Fetch sites for filter
  const { data: sites } = useQuery<any[]>({
    queryKey: ["/api/sites"],
  });

  // Fetch analytics data
  const { data: hoursData, isLoading: hoursLoading } = useQuery({
    queryKey: ["/api/analytics/hours", getQueryParams()],
    queryFn: async () => {
      const res = await fetch(resolveUrl(`/api/analytics/hours?${getQueryParams()}`), { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch hours data");
      return res.json();
    },
  });

  const { data: costsData, isLoading: costsLoading } = useQuery({
    queryKey: ["/api/analytics/costs", getQueryParams()],
    queryFn: async () => {
      const res = await fetch(resolveUrl(`/api/analytics/costs?${getQueryParams()}`), { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch costs data");
      return res.json();
    },
  });

  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ["/api/analytics/attendance", getQueryParams()],
    queryFn: async () => {
      const res = await fetch(resolveUrl(`/api/analytics/attendance?${getQueryParams()}`), { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch attendance data");
      return res.json();
    },
  });

  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ["/api/analytics/sites"],
    queryFn: async () => {
      const res = await fetch(resolveUrl("/api/analytics/sites"), { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch sites data");
      return res.json();
    },
  });

  const isLoading = hoursLoading || costsLoading || attendanceLoading || sitesLoading;

  // Calculate metrics
  const totalHours = hoursData?.totalHours || 0;
  const overtimeHours = hoursData?.overtimeHours || 0;
  const totalCost = costsData?.totalCost || 0;
  const attendanceRate = attendanceData?.total
    ? Math.round((attendanceData.approved / attendanceData.total) * 100)
    : 0;
  const avgHoursPerWorker = sitesData?.length
    ? Math.round((totalHours / sitesData.reduce((acc: number, s: any) => acc + s.activeWorkers, 0)) * 10) / 10
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Hours, costs, and compliance tracking
          </p>
        </div>
        <Button variant="outline" data-testid="button-export-report">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                    data-testid="button-start-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                    data-testid="button-end-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Site</label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger data-testid="select-site-filter">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id.toString()}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-hours">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Hours</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalHours.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {overtimeHours.toFixed(1)} overtime hours
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-cost">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Cost</p>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">£{totalCost.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                £{costsData?.overtimeCost?.toFixed(2) || 0} overtime
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-attendance-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Attendance Rate</p>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{attendanceRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {attendanceData?.approved || 0} approved records
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-avg-hours">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Avg Hours/Worker</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{avgHoursPerWorker.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Per worker this period
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Hours by Site</CardTitle>
          </CardHeader>
          <CardContent>
            {sitesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : sitesData && sitesData.length > 0 ? (
              <div className="space-y-4" data-testid="chart-hours-by-site">
                {sitesData.map((site: any, index: number) => {
                  const maxHours = Math.max(...sitesData.map((s: any) => s.totalHours));
                  const percentage = maxHours > 0 ? (site.totalHours / maxHours) * 100 : 0;
                  const colors = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
                  
                  return (
                    <div key={site.siteId}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{site.siteName}</span>
                        <span className="text-sm font-mono">{site.totalHours.toFixed(1)}h</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${colors[index % colors.length]}`}
                          style={{ width: `${percentage}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No site data available
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {costsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3" data-testid="breakdown-cost">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Regular Pay</span>
                  <span className="font-mono font-medium">
                    £{costsData?.regularCost?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Overtime</span>
                  <span className="font-mono font-medium">
                    £{costsData?.overtimeCost?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-medium">Total</span>
                  <span className="font-mono font-bold text-lg">
                    £{costsData?.totalCost?.toLocaleString() || 0}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attendance Status */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="breakdown-attendance">
              <div className="flex flex-col items-center p-4 rounded-lg border">
                <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
                <span className="text-2xl font-bold">{attendanceData?.approved || 0}</span>
                <span className="text-sm text-muted-foreground">Approved</span>
              </div>
              <div className="flex flex-col items-center p-4 rounded-lg border">
                <AlertCircle className="h-8 w-8 text-yellow-500 mb-2" />
                <span className="text-2xl font-bold">{attendanceData?.pending || 0}</span>
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <div className="flex flex-col items-center p-4 rounded-lg border">
                <XCircle className="h-8 w-8 text-red-500 mb-2" />
                <span className="text-2xl font-bold">{attendanceData?.rejected || 0}</span>
                <span className="text-sm text-muted-foreground">Rejected</span>
              </div>
              <div className="flex flex-col items-center p-4 rounded-lg border">
                <Clock className="h-8 w-8 text-blue-500 mb-2" />
                <span className="text-2xl font-bold">{attendanceData?.total || 0}</span>
                <span className="text-sm text-muted-foreground">Total</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Site Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {sitesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sitesData && sitesData.length > 0 ? (
            <div className="overflow-x-auto" data-testid="table-site-summary">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Site</th>
                    <th className="text-left py-3 px-4 font-medium">Active Workers</th>
                    <th className="text-left py-3 px-4 font-medium">Total Shifts</th>
                    <th className="text-left py-3 px-4 font-medium">Total Hours</th>
                    <th className="text-left py-3 px-4 font-medium">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {sitesData.map((site: any) => (
                    <tr key={site.siteId} className="border-b last:border-0">
                      <td className="py-3 px-4 font-medium">{site.siteName}</td>
                      <td className="py-3 px-4">{site.activeWorkers}</td>
                      <td className="py-3 px-4">{site.totalShifts}</td>
                      <td className="py-3 px-4 font-mono">{site.totalHours.toFixed(1)}h</td>
                      <td className="py-3 px-4 font-mono">£{site.totalCost.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No site data available
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { AttendanceRow } from "@/components/attendance-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Download } from "lucide-react";

export default function Attendance() {
  //todo: remove mock functionality
  const mockLiveAttendance = [
    {
      id: "1",
      staffName: "Sarah Johnson",
      initials: "SJ",
      site: "Kent Site",
      clockIn: "08:00",
      status: "on-time" as const,
    },
    {
      id: "2",
      staffName: "Mike Chen",
      initials: "MC",
      site: "London Site",
      clockIn: "08:15",
      status: "late" as const,
    },
    {
      id: "3",
      staffName: "Emma Wilson",
      initials: "EW",
      site: "Essex Site",
      clockIn: "14:00",
      clockOut: "22:05",
      status: "approved" as const,
      duration: "8h 5m",
    },
  ];

  const mockPendingApprovals = [
    {
      id: "4",
      staffName: "David Brown",
      initials: "DB",
      site: "Kent Site",
      clockIn: "07:58",
      clockOut: "16:05",
      status: "pending-approval" as const,
      duration: "8h 7m",
    },
    {
      id: "5",
      staffName: "Lisa White",
      initials: "LW",
      site: "London Site",
      clockIn: "08:20",
      clockOut: "16:25",
      status: "pending-approval" as const,
      duration: "8h 5m",
    },
  ];

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
            data-testid="input-search-staff"
          />
        </div>
      </div>

      <Tabs defaultValue="live" className="w-full">
        <TabsList>
          <TabsTrigger value="live" data-testid="tab-live">
            Live ({mockLiveAttendance.length})
          </TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-approvals">
            Pending Approvals ({mockPendingApprovals.length})
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
              {mockLiveAttendance.map((record) => (
                <AttendanceRow key={record.id} {...record} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Requires Approval</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {mockPendingApprovals.map((record) => (
                <AttendanceRow
                  key={record.id}
                  {...record}
                  onApprove={() => console.log("Approved", record.id)}
                  onReject={() => console.log("Rejected", record.id)}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Attendance History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                Select a date range to view historical attendance records
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

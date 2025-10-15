import { ClockInWidget } from "@/components/clock-in-widget";
import { ShiftCard } from "@/components/shift-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkerBottomNav } from "@/components/worker-bottom-nav";
import { useState } from "react";

export default function WorkerHome() {
  const [isClockedIn, setIsClockedIn] = useState(false);

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
      staffName: "Sarah Johnson",
      role: "Care Assistant",
      site: "Kent",
      siteColor: "purple" as const,
      startTime: "08:00",
      endTime: "16:00",
      status: "scheduled" as const,
      duration: "8h",
    },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back, Sarah</h1>
          <p className="text-muted-foreground mt-1">Monday, 15 April 2025</p>
        </div>

        <ClockInWidget
          isClockedIn={isClockedIn}
          currentSite="Kent Site"
          clockInTime="08:00"
          onClockIn={() => {
            console.log("Clocked in");
            setIsClockedIn(true);
          }}
          onClockOut={() => {
            console.log("Clocked out");
            setIsClockedIn(false);
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle>Today's Shifts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockShifts.map((shift) => (
              <ShiftCard key={shift.id} {...shift} />
            ))}
          </CardContent>
        </Card>
      </div>
      <WorkerBottomNav />
    </div>
  );
}

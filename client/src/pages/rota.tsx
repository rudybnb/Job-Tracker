import { ShiftCard } from "@/components/shift-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Calendar } from "lucide-react";

export default function Rota() {
  //todo: remove mock functionality
  const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  const mockShiftsByDay = {
    Monday: [
      {
        id: "1",
        staffName: "Sarah Johnson",
        role: "Care Assistant",
        site: "Kent",
        siteColor: "purple" as const,
        startTime: "08:00",
        endTime: "16:00",
        status: "scheduled" as const,
        duration: "8h",
      },
      {
        id: "2",
        staffName: "Mike Chen",
        role: "Senior Care",
        site: "London",
        siteColor: "teal" as const,
        startTime: "08:00",
        endTime: "16:00",
        status: "scheduled" as const,
        duration: "8h",
      },
    ],
    Tuesday: [
      {
        id: "3",
        staffName: "Emma Wilson",
        role: "Nurse",
        site: "Essex",
        siteColor: "orange" as const,
        startTime: "14:00",
        endTime: "22:00",
        status: "scheduled" as const,
        duration: "8h",
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Rota Management</h1>
          <p className="text-muted-foreground mt-1">Week 15, 2025</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-view-calendar">
            <Calendar className="h-4 w-4 mr-2" />
            Calendar View
          </Button>
          <Button data-testid="button-create-shift">
            <Plus className="h-4 w-4 mr-2" />
            Create Shift
          </Button>
        </div>
      </div>

      <Tabs defaultValue="Monday" className="w-full">
        <TabsList className="w-full justify-start">
          {weekDays.map((day) => (
            <TabsTrigger key={day} value={day} data-testid={`tab-${day.toLowerCase()}`}>
              {day}
            </TabsTrigger>
          ))}
        </TabsList>
        {weekDays.map((day) => (
          <TabsContent key={day} value={day} className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {day} - {mockShiftsByDay[day as keyof typeof mockShiftsByDay]?.length || 0} shifts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mockShiftsByDay[day as keyof typeof mockShiftsByDay]?.map((shift) => (
                    <ShiftCard key={shift.id} {...shift} />
                  )) || (
                    <p className="text-sm text-muted-foreground col-span-full text-center py-8">
                      No shifts scheduled for this day
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

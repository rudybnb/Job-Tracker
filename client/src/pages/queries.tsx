import { QueryTicket } from "@/components/query-ticket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";

export default function Queries() {
  //todo: remove mock functionality
  const mockOpenQueries = [
    {
      id: "1",
      subject: "Missing overtime payment",
      description:
        "I worked 5 hours overtime last week but it's not showing in my payslip. Can someone check?",
      staffName: "Sarah Johnson",
      category: "pay" as const,
      status: "open" as const,
      createdAt: "2 hours ago",
      relatedTo: "Week 15 Payslip",
    },
    {
      id: "2",
      subject: "Holiday request approval",
      description:
        "Submitted holiday request for next month but haven't received confirmation yet.",
      staffName: "Mike Chen",
      category: "hr" as const,
      status: "open" as const,
      createdAt: "1 day ago",
    },
  ];

  const mockInProgressQueries = [
    {
      id: "3",
      subject: "Shift swap request",
      description: "Need to swap my Thursday shift with Emma. Both parties agreed.",
      staffName: "David Brown",
      category: "schedule" as const,
      status: "in-progress" as const,
      createdAt: "3 days ago",
    },
  ];

  const mockResolvedQueries = [
    {
      id: "4",
      subject: "Clock-in device issue",
      description: "Fingerprint reader at Kent site wasn't working this morning.",
      staffName: "Emma Wilson",
      category: "general" as const,
      status: "resolved" as const,
      createdAt: "1 week ago",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Staff Queries</h1>
          <p className="text-muted-foreground mt-1">
            Pay, HR, and scheduling support tickets
          </p>
        </div>
        <Button data-testid="button-create-query">
          <Plus className="h-4 w-4 mr-2" />
          New Query
        </Button>
      </div>

      <Tabs defaultValue="open" className="w-full">
        <TabsList>
          <TabsTrigger value="open" data-testid="tab-open">
            Open ({mockOpenQueries.length})
          </TabsTrigger>
          <TabsTrigger value="in-progress" data-testid="tab-in-progress">
            In Progress ({mockInProgressQueries.length})
          </TabsTrigger>
          <TabsTrigger value="resolved" data-testid="tab-resolved">
            Resolved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mockOpenQueries.map((query) => (
              <QueryTicket
                key={query.id}
                {...query}
                onClick={() => console.log("Clicked query", query.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="in-progress" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mockInProgressQueries.map((query) => (
              <QueryTicket
                key={query.id}
                {...query}
                onClick={() => console.log("Clicked query", query.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resolved" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mockResolvedQueries.map((query) => (
              <QueryTicket
                key={query.id}
                {...query}
                onClick={() => console.log("Clicked query", query.id)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

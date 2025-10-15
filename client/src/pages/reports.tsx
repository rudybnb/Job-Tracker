import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, DollarSign, AlertCircle, TrendingUp, Download } from "lucide-react";

export default function Reports() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Hours (Week)"
          value="3,456"
          icon={Clock}
          trend={{ value: 8, label: "from last week" }}
        />
        <StatCard
          title="Overtime Hours"
          value="245"
          icon={TrendingUp}
          variant="warning"
        />
        <StatCard
          title="Total Cost"
          value="£45,234"
          icon={DollarSign}
        />
        <StatCard
          title="Exceptions"
          value={12}
          icon={AlertCircle}
          variant="destructive"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Hours by Site</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Kent Site</span>
                  <span className="text-sm font-mono">1,234h</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-chart-3" style={{ width: "36%" }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">London Site</span>
                  <span className="text-sm font-mono">1,456h</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-chart-2" style={{ width: "42%" }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Essex Site</span>
                  <span className="text-sm font-mono">766h</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-chart-4" style={{ width: "22%" }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Base Pay</span>
                <span className="font-mono font-medium">£38,450</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Overtime</span>
                <span className="font-mono font-medium">£4,592</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Bank Holidays</span>
                <span className="font-mono font-medium">£2,192</span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="font-medium">Total</span>
                <span className="font-mono font-bold text-lg">£45,234</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Exceptions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No exceptions to report
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Trash2, AlertTriangle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const { toast } = useToast();
  const clearDataMutation = useMutation({
    mutationFn: async (dataType: string) => {
      await apiRequest("DELETE", `/api/admin/clear-data/${dataType}`);
    },
    onSuccess: (_, dataType) => {
      queryClient.invalidateQueries();
      toast({
        title: "Data cleared",
        description: `Successfully cleared ${dataType} data`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear data",
        variant: "destructive",
      });
    },
  });

  const dataTypes = [
    { id: "shifts", label: "All Shifts", description: "Remove all scheduled shifts" },
    { id: "attendance", label: "All Attendance", description: "Remove all clock-in/out records" },
    { id: "payroll", label: "All Payroll", description: "Remove all payroll runs and payslips" },
    { id: "queries", label: "All Queries", description: "Remove all staff queries" },
    { id: "all", label: "Everything", description: "Reset all data (keeps sites and users)" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-page-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your application preferences and settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Data Management
          </CardTitle>
          <CardDescription>
            Clear data for testing or resetting the system. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dataTypes.map((dataType) => (
            <div
              key={dataType.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <p className="font-medium">{dataType.label}</p>
                <p className="text-sm text-muted-foreground">{dataType.description}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant={dataType.id === "all" ? "destructive" : "outline"}
                    size="sm"
                    data-testid={`button-clear-${dataType.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {dataType.label.toLowerCase()}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearDataMutation.mutate(dataType.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete {dataType.label}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

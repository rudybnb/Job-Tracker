import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Play, Lock, Eye } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const createPayrollRunSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
});

const addDeductionSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  reason: z.string().min(1, "Reason is required"),
  type: z.string().min(1, "Type is required"),
});

type PayrollRun = {
  id: number;
  period: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  finalizedAt: string | null;
};

type Payslip = {
  id: number;
  payrollRunId: number;
  userId: string;
  siteId: number;
  grossPay: string;
  deductions: string;
  netPay: string;
  lineItems: Array<{
    id: string;
    description: string;
    type: string;
    hours: string | null;
    rate: string | null;
    amount: string;
    reason: string | null;
  }>;
  user: {
    firstName: string | null;
    lastName: string | null;
  };
  site: {
    name: string;
  };
  payrollRun: {
    period: string;
  };
};

export default function Payroll() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deductionDialogOpen, setDeductionDialogOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  const { data: payrollRuns, isLoading: runsLoading } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll-runs"],
  });

  const { data: payslips, isLoading: payslipsLoading } = useQuery<Payslip[]>({
    queryKey: ["/api/payslips"],
  });

  const createForm = useForm<z.infer<typeof createPayrollRunSchema>>({
    resolver: zodResolver(createPayrollRunSchema),
    defaultValues: {
      startDate: "",
      endDate: "",
    },
  });

  const deductionForm = useForm<z.infer<typeof addDeductionSchema>>({
    resolver: zodResolver(addDeductionSchema),
    defaultValues: {
      amount: "",
      reason: "",
      type: "tax",
    },
  });

  const createRunMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createPayrollRunSchema>) => {
      return await apiRequest("POST", "/api/payroll-runs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-runs"] });
      toast({
        title: "Payroll run created",
        description: "New payroll run has been created successfully.",
      });
      setCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payroll run",
        variant: "destructive",
      });
    },
  });

  const processRunMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/payroll-runs/${id}/process`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payslips"] });
      toast({
        title: "Payroll processed",
        description: "Payslips have been generated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process payroll run",
        variant: "destructive",
      });
    },
  });

  const finalizeRunMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/payroll-runs/${id}/finalize`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-runs"] });
      toast({
        title: "Payroll finalized",
        description: "Payroll run has been locked and finalized.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize payroll run",
        variant: "destructive",
      });
    },
  });

  const addDeductionMutation = useMutation({
    mutationFn: async ({ payslipId, data }: { payslipId: number; data: z.infer<typeof addDeductionSchema> }) => {
      return await apiRequest("POST", `/api/payslips/${payslipId}/deductions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payslips"] });
      toast({
        title: "Deduction added",
        description: "Deduction has been added to the payslip.",
      });
      setDeductionDialogOpen(false);
      deductionForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add deduction",
        variant: "destructive",
      });
    },
  });

  const onCreateSubmit = (data: z.infer<typeof createPayrollRunSchema>) => {
    createRunMutation.mutate(data);
  };

  const onDeductionSubmit = (data: z.infer<typeof addDeductionSchema>) => {
    if (selectedPayslip) {
      addDeductionMutation.mutate({ payslipId: selectedPayslip.id, data });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" data-testid={`badge-status-draft`}>Draft</Badge>;
      case "processing":
        return <Badge variant="default" data-testid={`badge-status-processing`}>Processing</Badge>;
      case "finalized":
        return <Badge variant="outline" data-testid={`badge-status-finalized`}>Finalized</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Payroll Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage payroll runs and generate payslips with overtime calculations
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-payrun">
          <Plus className="h-4 w-4 mr-2" />
          Create Pay Run
        </Button>
      </div>

      <Tabs defaultValue="runs" className="w-full">
        <TabsList>
          <TabsTrigger value="runs" data-testid="tab-payroll-runs">
            Payroll Runs
          </TabsTrigger>
          <TabsTrigger value="payslips" data-testid="tab-payslips">
            Payslips
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Payroll Runs</CardTitle>
              <CardDescription>
                Create and manage payroll runs for different pay periods
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : payrollRuns && payrollRuns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Date Range</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollRuns.map((run) => (
                      <TableRow key={run.id} data-testid={`row-payroll-run-${run.id}`}>
                        <TableCell className="font-medium" data-testid={`text-period-${run.id}`}>
                          {run.period}
                        </TableCell>
                        <TableCell data-testid={`text-daterange-${run.id}`}>
                          {run.startDate} to {run.endDate}
                        </TableCell>
                        <TableCell>{getStatusBadge(run.status)}</TableCell>
                        <TableCell data-testid={`text-created-${run.id}`}>
                          {new Date(run.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {run.status === "draft" && (
                              <Button
                                size="sm"
                                onClick={() => processRunMutation.mutate(run.id)}
                                disabled={processRunMutation.isPending}
                                data-testid={`button-process-${run.id}`}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Process
                              </Button>
                            )}
                            {run.status === "processing" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => finalizeRunMutation.mutate(run.id)}
                                disabled={finalizeRunMutation.isPending}
                                data-testid={`button-finalize-${run.id}`}
                              >
                                <Lock className="h-3 w-3 mr-1" />
                                Finalize
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No payroll runs created yet. Create one to get started.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payslips" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Payslips</CardTitle>
              <CardDescription>
                View and manage employee payslips with detailed breakdowns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payslipsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : payslips && payslips.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead className="text-right">Gross Pay</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payslips.map((payslip) => (
                      <TableRow key={payslip.id} data-testid={`row-payslip-${payslip.id}`}>
                        <TableCell className="font-medium" data-testid={`text-employee-${payslip.id}`}>
                          {payslip.user.firstName} {payslip.user.lastName}
                        </TableCell>
                        <TableCell data-testid={`text-period-${payslip.id}`}>
                          {payslip.payrollRun.period}
                        </TableCell>
                        <TableCell data-testid={`text-site-${payslip.id}`}>
                          {payslip.site.name}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-gross-${payslip.id}`}>
                          £{parseFloat(payslip.grossPay).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-deductions-${payslip.id}`}>
                          £{parseFloat(payslip.deductions).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold" data-testid={`text-net-${payslip.id}`}>
                          £{parseFloat(payslip.netPay).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPayslip(payslip);
                                setDetailDialogOpen(true);
                              }}
                              data-testid={`button-view-${payslip.id}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPayslip(payslip);
                                setDeductionDialogOpen(true);
                              }}
                              data-testid={`button-add-deduction-${payslip.id}`}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Deduction
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No payslips generated yet. Process a payroll run to generate payslips.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Payroll Run</DialogTitle>
            <DialogDescription>
              Create a new payroll run for a specific date range
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-end-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createRunMutation.isPending}
                  data-testid="button-submit-create"
                >
                  Create
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payslip Details</DialogTitle>
            <DialogDescription>
              Detailed breakdown of earnings and deductions
            </DialogDescription>
          </DialogHeader>
          {selectedPayslip && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Employee</p>
                  <p className="font-medium">
                    {selectedPayslip.user.firstName} {selectedPayslip.user.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Period</p>
                  <p className="font-medium">{selectedPayslip.payrollRun.period}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Site</p>
                  <p className="font-medium">{selectedPayslip.site.name}</p>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPayslip.lineItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.description}
                          {item.type === "overtime" && (
                            <Badge variant="secondary" className="ml-2">1.5x</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.hours ? parseFloat(item.hours).toFixed(2) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.rate ? `£${parseFloat(item.rate).toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          £{Math.abs(parseFloat(item.amount)).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={3} className="font-semibold">Gross Pay</TableCell>
                      <TableCell className="text-right font-semibold">
                        £{parseFloat(selectedPayslip.grossPay).toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="font-semibold">Deductions</TableCell>
                      <TableCell className="text-right font-semibold">
                        £{parseFloat(selectedPayslip.deductions).toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell colSpan={3} className="font-bold text-lg">Net Pay</TableCell>
                      <TableCell className="text-right font-bold text-lg">
                        £{parseFloat(selectedPayslip.netPay).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
              data-testid="button-close-detail"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deductionDialogOpen} onOpenChange={setDeductionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Deduction</DialogTitle>
            <DialogDescription>
              Add a deduction to this payslip
            </DialogDescription>
          </DialogHeader>
          <Form {...deductionForm}>
            <form onSubmit={deductionForm.handleSubmit(onDeductionSubmit)} className="space-y-4">
              <FormField
                control={deductionForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., tax, loan, advance" data-testid="input-deduction-type" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={deductionForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Reason for deduction" data-testid="input-deduction-reason" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={deductionForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (£)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} placeholder="0.00" data-testid="input-deduction-amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeductionDialogOpen(false)}
                  data-testid="button-cancel-deduction"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addDeductionMutation.isPending}
                  data-testid="button-submit-deduction"
                >
                  Add Deduction
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

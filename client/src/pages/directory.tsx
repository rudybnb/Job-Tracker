import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, type InsertUser, type User, type Site } from "@shared/schema";
import { UserPlus, Edit2, Trash2, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "site_manager", label: "Site Manager" },
  { value: "worker", label: "Worker" },
];

const userFormSchema = insertUserSchema.extend({
  hourlyRate: z.string().optional().transform((val) => (val ? val : undefined)),
});

export default function Directory() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterSite, setFilterSite] = useState<string>("all");

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: sites, isLoading: sitesLoading } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      return await apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      form.reset({
        email: "",
        firstName: "",
        lastName: "",
        role: "worker",
        siteId: undefined,
        hourlyRate: "",
        isActive: true,
      });
      toast({
        title: "Success",
        description: "User created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertUser> }) => {
      return await apiRequest("PATCH", `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const form = useForm<z.infer<typeof userFormSchema>>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "worker",
      siteId: undefined,
      hourlyRate: "",
      isActive: true,
    },
  });


  const [employmentType, setEmploymentType] = useState("full-time");
  const [startDate, setStartDate] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [nightRate, setNightRate] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [pension, setPension] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");

  const onSubmit = (data: z.infer<typeof userFormSchema>) => {
    const submitData: any = {
      ...data,
      hourlyRate: data.hourlyRate ? data.hourlyRate : undefined,
    };

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    form.reset({
      email: user.email || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      role: user.role,
      siteId: user.siteId || undefined,
      hourlyRate: user.hourlyRate || "",
      isActive: user.isActive,
    });
  };

  const handleDelete = (userId: string) => {
    if (confirm("Are you sure you want to deactivate this user?")) {
      deleteMutation.mutate(userId);
    }
  };

  const handleCloseDialog = () => {
    if (editingUser) {
      setEditingUser(null);
    } else {
      setIsCreateOpen(false);
    }
    form.reset({
      email: "",
      firstName: "",
      lastName: "",
      role: "worker",
      siteId: undefined,
      hourlyRate: "",
      isActive: true,
    });
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "default";
      case "site_manager":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getSiteById = (siteId?: number | null) => {
    if (!siteId || !sites) return null;
    return sites.find((site) => site.id === siteId);
  };

  const filteredUsers = users?.filter((user) => {
    if (filterRole !== "all" && user.role !== filterRole) return false;
    if (filterSite !== "all" && user.siteId?.toString() !== filterSite) return false;
    return true;
  }) || [];

  const isLoading = usersLoading || sitesLoading;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Staff Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your team members and their assignments</p>
        </div>
      </div>

      {/* Add Staff Form (inline) */}
      <Card>
        <CardContent className="p-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Row 1: First Name + Last Name + Role */}
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., John" {...field} data-testid="input-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Doe" {...field} data-testid="input-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-role">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Row 2: Site + Employment Type + Start Date */}
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="siteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "all" ? undefined : parseInt(value))}
                        value={field.value !== undefined && field.value !== null ? field.value.toString() : undefined}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-site">
                            <SelectValue placeholder="All Sites" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">All Sites</SelectItem>
                          {sites?.map((site) => (
                            <SelectItem key={site.id} value={site.id.toString()}>
                              {site.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel>Employment Type</FormLabel>
                  <Select onValueChange={setEmploymentType} defaultValue={employmentType}>
                    <FormControl>
                      <SelectTrigger data-testid="select-employment-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>

                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="dd/mm/yyyy" />
                  </FormControl>
                </FormItem>
              </div>

              {/* Row 3: Tax Code + Night Rate */}
              <div className="grid grid-cols-2 gap-4">
                <FormItem>
                  <FormLabel>Tax Code</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 1257L, BR" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
                  </FormControl>
                </FormItem>

                <FormItem>
                  <FormLabel>Night Rate (£/h)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="e.g., 14.00" value={nightRate} onChange={(e) => setNightRate(e.target.value)} />
                  </FormControl>
                </FormItem>
              </div>

              {/* Row 4: Hourly Rate + Overtime Rate */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Rate (£/h)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="e.g., 12.50" {...field} value={field.value || ""} data-testid="input-hourly-rate" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel>Overtime Rate (£/h)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="e.g., 18.75" value={overtimeRate} onChange={(e) => setOvertimeRate(e.target.value)} />
                  </FormControl>
                </FormItem>
              </div>

              {/* Row 5: Pension + Other Deductions */}
              <div className="grid grid-cols-2 gap-4">
                <FormItem>
                  <FormLabel>Pension (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="e.g., 3" value={pension} onChange={(e) => setPension(e.target.value)} />
                  </FormControl>
                </FormItem>

                <FormItem>
                  <FormLabel>Other Deductions (£)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="e.g., 10.00" value={otherDeductions} onChange={(e) => setOtherDeductions(e.target.value)} />
                  </FormControl>
                </FormItem>
              </div>

              <div>
                <Button type="submit" data-testid="button-submit-user">Add Staff</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Staff List */}
      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Staff</div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1,2,3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : (users && users.length > 0) ? (
            users.map((user) => {
              const site = getSiteById(user.siteId);
              return (
                <div key={user.id} className="p-4 rounded-md border flex items-center justify-between" data-testid={`card-user-${user.id}`}>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {user.firstName} {user.lastName} 
                      <span className="mx-2">•</span>
                      {roleOptions.find((r) => r.value === user.role)?.label || user.role}
                      <span className="mx-2">•</span>
                      {site ? site.name : "All Sites"}
                    </div>
                    <div className="text-xs">
                      Status: {user.isActive ? "Active" : "Inactive"}
                    </div>
                    <div className="text-xs">
                      Rate £{user.hourlyRate ?? "—"}/h
                      <span className="mx-2">•</span> Night {nightRate ? `£${nightRate}/h` : "—"}
                      <span className="mx-2">•</span> OT {overtimeRate ? `£${overtimeRate}/h` : "—"}
                    </div>
                    <div className="text-xs">
                      Pension {pension ? `${pension}%` : "—"}
                      <span className="mx-2">•</span> Deductions £{otherDeductions || "0.00"}
                      <span className="mx-2">•</span> Tax {taxCode || "—"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleDeactivate(user.id)} data-testid={`button-deactivate-${user.id}`}>Deactivate</Button>
                    <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(user.id)} data-testid={`button-delete-${user.id}`}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <UserPlus className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium mt-4">No staff members found</h3>
              <p className="text-sm text-muted-foreground mt-1">Get started by adding your first team member</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

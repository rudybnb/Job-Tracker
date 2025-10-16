import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSiteSchema, type InsertSite, type Site } from "@shared/schema";
import { Building2, MapPin, Plus, Edit2, CheckCircle2, XCircle, QrCode, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const siteColors = [
  { value: "purple", label: "Purple", bg: "bg-purple-500", text: "text-purple-500" },
  { value: "teal", label: "Teal", bg: "bg-teal-500", text: "text-teal-500" },
  { value: "orange", label: "Orange", bg: "bg-orange-500", text: "text-orange-500" },
];

export default function Sites() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);

  const { data: sites, isLoading } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertSite) => {
      return await apiRequest("POST", "/api/sites", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setIsCreateOpen(false);
      toast({
        title: "Success",
        description: "Site created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create site",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertSite> }) => {
      return await apiRequest("PATCH", `/api/sites/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setEditingSite(null);
      toast({
        title: "Success",
        description: "Site updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update site",
        variant: "destructive",
      });
    },
  });

  const refreshQrMutation = useMutation({
    mutationFn: async (siteId: number) => {
      return await apiRequest("POST", `/api/sites/${siteId}/refresh-clock-qr`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({
        title: "QR Code Refreshed",
        description: "Clock-in QR code has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh QR code",
        variant: "destructive",
      });
    },
  });

  const form = useForm<InsertSite>({
    resolver: zodResolver(insertSiteSchema),
    defaultValues: {
      name: "",
      color: "purple",
      location: "",
      isActive: true,
    },
  });

  const onSubmit = (data: InsertSite) => {
    if (editingSite) {
      updateMutation.mutate({ id: editingSite.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (site: Site) => {
    setEditingSite(site);
    form.reset({
      name: site.name,
      color: site.color,
      location: site.location,
      isActive: site.isActive,
    });
  };

  const handleCloseDialog = () => {
    if (editingSite) {
      setEditingSite(null);
    } else {
      setIsCreateOpen(false);
    }
    form.reset({
      name: "",
      color: "purple",
      location: "",
      isActive: true,
    });
  };

  const getColorClasses = (color: string) => {
    const colorConfig = siteColors.find((c) => c.value === color);
    return colorConfig || siteColors[0];
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">
            Site Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your organization's locations and facilities
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          data-testid="button-create-site"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Site
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-8" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sites && sites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => {
            const colorClasses = getColorClasses(site.color);
            return (
              <Card
                key={site.id}
                className="hover-elevate"
                data-testid={`card-site-${site.id}`}
              >
                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-md ${colorClasses.bg} flex items-center justify-center`}>
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <CardTitle className="text-base font-medium">
                      {site.name}
                    </CardTitle>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleEdit(site)}
                    data-testid={`button-edit-site-${site.id}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span data-testid={`text-location-${site.id}`}>{site.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {site.isActive ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="text-xs text-success" data-testid={`text-status-${site.id}`}>Active</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground" data-testid={`text-status-${site.id}`}>
                          Inactive
                        </span>
                      </>
                    )}
                    <div className={`ml-auto h-3 w-3 rounded-full ${colorClasses.bg}`} />
                  </div>
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <QrCode className="h-3 w-3" />
                        Clock-in QR
                      </span>
                      {site.clockInQrExpiry ? (
                        <span className={new Date(site.clockInQrExpiry) > new Date() ? "text-success" : "text-destructive"}>
                          {new Date(site.clockInQrExpiry) > new Date() ? "Active" : "Expired"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not generated</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => refreshQrMutation.mutate(site.id)}
                      disabled={refreshQrMutation.isPending}
                      data-testid={`button-refresh-qr-${site.id}`}
                    >
                      <RefreshCw className="h-3 w-3 mr-2" />
                      {site.clockInQrCode ? "Refresh QR" : "Generate QR"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-12">
          <div className="text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">No sites yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Get started by creating your first site
              </p>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-site">
              <Plus className="h-4 w-4 mr-2" />
              Create Site
            </Button>
          </div>
        </Card>
      )}

      <Dialog open={isCreateOpen || !!editingSite} onOpenChange={handleCloseDialog}>
        <DialogContent data-testid="dialog-site-form">
          <DialogHeader>
            <DialogTitle>
              {editingSite ? "Edit Site" : "Create New Site"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Downtown Office"
                        {...field}
                        data-testid="input-site-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="123 Main St, City"
                        {...field}
                        data-testid="input-site-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color Identifier</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-site-color">
                          <SelectValue placeholder="Select a color" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {siteColors.map((color) => (
                          <SelectItem key={color.value} value={color.value}>
                            <div className="flex items-center gap-2">
                              <div className={`h-3 w-3 rounded-full ${color.bg}`} />
                              <span>{color.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-site"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingSite
                    ? "Update Site"
                    : "Create Site"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

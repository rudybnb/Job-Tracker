import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShiftCard } from "@/components/shift-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Calendar, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertShiftSchema, type InsertShift, type Shift, type User, type Site } from "@shared/schema";
import { z } from "zod";
import { queryClient, apiRequest, resolveUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, addWeeks, startOfWeek, endOfWeek, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";

type ShiftWithDetails = Shift & { user: User; site: Site };

const shiftFormSchema = insertShiftSchema.extend({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  shiftType: z.enum(["day", "night"]),
});

export default function Rota() {
  const { toast } = useToast();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [conflictWarning, setConflictWarning] = useState(false);
  const [showOverlapConfirm, setShowOverlapConfirm] = useState(false);
  const [pendingShiftData, setPendingShiftData] = useState<ShiftFormData | null>(null);
  const [overlapCount, setOverlapCount] = useState(0);
  const [showSecondaryShiftPrompt, setShowSecondaryShiftPrompt] = useState(false);
  const [createdShiftData, setCreatedShiftData] = useState<ShiftFormData | null>(null);
  const [staffingImbalance, setStaffingImbalance] = useState<{current: number, complementary: number} | null>(null);
  // New: override prompt state
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState("");
  const [pendingOverrideData, setPendingOverrideData] = useState<ShiftFormData | null>(null);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });

  // Get current user for role-based overrides
  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });
  const canOverride = currentUser?.role === "admin" || currentUser?.role === "site_manager";
  const canDelete = currentUser?.role === "admin";
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return {
        name: format(date, 'EEEE'),
        date: format(date, 'yyyy-MM-dd'),
        displayDate: format(date, 'MMM d'),
      };
    });
  }, [weekStart]);

  const { data: sites = [], isLoading: sitesLoading } = useQuery<Site[]>({
    queryKey: ['/api/sites'],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<ShiftWithDetails[]>({
    queryKey: ['/api/shifts', selectedSiteId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedSiteId) {
        params.append('siteId', selectedSiteId.toString());
      }
      const response = await fetch(resolveUrl(`/api/shifts?${params}`), { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch shifts');
      return response.json();
    },
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: z.infer<typeof shiftFormSchema>) => {
      const response = await fetch(resolveUrl('/api/shifts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create shift');
      }
      return response.json();
    },
    onSuccess: (response: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setIsCreateDialogOpen(false);
      form.reset();
      setConflictWarning(false);
      
      // Count current shift type workers (including the one just created)
      const currentShiftWorkers = shifts.filter(s => 
        s.siteId === variables.siteId && 
        s.date === variables.date && 
        s.shiftType === variables.shiftType
      ).length + 1; // +1 for the shift just created
      
      // Count complementary shift type workers
      const complementaryType = variables.shiftType === "day" ? "night" : "day";
      const complementaryShiftWorkers = shifts.filter(s => 
        s.siteId === variables.siteId && 
        s.date === variables.date && 
        s.shiftType === complementaryType
      ).length;
      
      // Prompt if complementary shift has fewer workers
      if (complementaryShiftWorkers < currentShiftWorkers) {
        setCreatedShiftData(variables);
        setStaffingImbalance({
          current: currentShiftWorkers,
          complementary: complementaryShiftWorkers
        });
        setShowSecondaryShiftPrompt(true);
      }
      
      if (response.hasConflict) {
        toast({
          title: "Shift created with conflict",
          description: "Warning: This shift overlaps with another shift for the same user.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Shift created",
          description: "The shift has been successfully created.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create shift",
        variant: "destructive",
      });
    },
  });

  // Delete shift mutation (admin only)
  const deleteShiftMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(resolveUrl(`/api/shifts/${id}`), { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        let msg = 'Failed to delete shift';
        try { const err = await res.json(); msg = err.message || msg; } catch {}
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      toast({ title: 'Shift deleted', description: 'The shift has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', selectedSiteId] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete shift', variant: 'destructive' });
    }
  });

  const handleDeleteShift = (id: number) => {
    if (!canDelete) {
      toast({ title: 'Not allowed', description: 'Only admins can delete shifts.', variant: 'destructive' });
      return;
    }
    if (window.confirm('Delete this shift? This cannot be undone.')) {
      deleteShiftMutation.mutate(id);
    }
  };

  type ShiftFormData = z.infer<typeof shiftFormSchema>;

  const form = useForm<ShiftFormData>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: {
      userId: "",
      siteId: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: "09:00",
      endTime: "17:00",
      role: "",
      shiftType: "day",
      status: "scheduled",
      notes: "",
    },
  });

  const shiftsByDay = useMemo(() => {
    const grouped: Record<string, ShiftWithDetails[]> = {};
    
    weekDays.forEach(day => {
      grouped[day.date] = shifts.filter(shift => shift.date === day.date);
    });
    
    return grouped;
  }, [shifts, weekDays]);

  const getSiteColor = (siteColor: string): "purple" | "teal" | "orange" => {
    if (siteColor === "purple") return "purple";
    if (siteColor === "teal") return "teal";
    return "orange";
  };

  const calculateDuration = (startTime: string, endTime: string): string => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60; // handle overnight
    const durationMinutes = endMinutes - startMinutes;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  // Derive which users are already assigned during the selected time window
  const watchedSiteId = form.watch('siteId');
  const watchedDate = form.watch('date');
  const watchedStart = form.watch('startTime');
  const watchedEnd = form.watch('endTime');
  const effectiveSiteId = watchedSiteId || selectedSiteId || null;

  const assignedUserIds = useMemo(() => {
    const set = new Set<string>();
    if (!watchedDate || !watchedStart || !watchedEnd) return set;
    shifts.forEach((s) => {
      if (s.date !== watchedDate) return;
      if (effectiveSiteId && s.siteId !== effectiveSiteId) return;
      // overlap: new start < existing end AND new end > existing start
      if (watchedStart < s.endTime && watchedEnd > s.startTime && s.user?.id) {
        set.add(s.user.id);
      }
    });
    return set;
  }, [shifts, watchedDate, watchedStart, watchedEnd, effectiveSiteId]);

  function checkOverlap(values: ShiftFormData): number {
    // Check if there are other shifts at the same site/date with overlapping times
    const overlapping = shifts.filter(shift => {
      if (shift.siteId !== values.siteId || shift.date !== values.date) {
        return false;
      }
      
      // Check if times overlap
      const newStart = values.startTime;
      const newEnd = values.endTime;
      const existingStart = shift.startTime;
      const existingEnd = shift.endTime;
      
      // Times overlap if: new start is before existing end AND new end is after existing start
      return newStart < existingEnd && newEnd > existingStart;
    });
    
    return overlapping.length;
  }

  async function onSubmit(values: ShiftFormData) {
    // R3 – Shift limit: single shift must be <= 12 hours
    const durH = calcDurationHours(values.startTime, values.endTime);
    if (durH > 12) {
      toast({ title: "Rule R3 violation", description: "Single shift cannot exceed 12 hours without explicit 24h approval.", variant: "destructive" });
      return;
    }

    // R1 – No same-shift duplication (site + date + shiftType)
    const sameShiftExists = shifts.some(s => s.siteId === values.siteId && s.date === values.date && s.shiftType === values.shiftType);
    if (sameShiftExists) {
      toast({ title: "Rule R1 violation", description: "Another worker is already scheduled for this shift type at this site.", variant: "destructive" });
      return;
    }

    // R2 – Site exclusivity per day; allow 24h same-site day+night with override
    const userDayShifts = shifts.filter(s => s.user?.id === values.userId && s.date === values.date);
    if (userDayShifts.length) {
      const atDifferentSite = userDayShifts.some(s => s.siteId !== values.siteId);
      if (atDifferentSite) {
        toast({ title: "Rule R2 violation", description: "Staff member is already scheduled at another site on this date.", variant: "destructive" });
        return;
      }
      // same site — attempting second shift
      const complementaryType = values.shiftType === "day" ? "night" : "day";
      const hasComplementary = userDayShifts.some(s => s.shiftType === complementaryType);
      if (hasComplementary) {
        if (!canOverride) {
          toast({ title: "Manager/Admin override required", description: "24-hour coverage (day + night at same site) requires approval.", variant: "destructive" });
          return;
        }
        setOverrideMessage("Approve 24-hour coverage: same site day + night for selected staff.");
        setPendingOverrideData(values);
        setShowOverrideConfirm(true);
        return;
      } else {
        // duplicate same type for same user at same site/day
        toast({ title: "Rule R1 violation", description: "This staff already has the same shift type at this site on this date.", variant: "destructive" });
        return;
      }
    }

    // R5 – Rest period: minimum 12 hours before new shift
    const newStartDT = getDateTime(values.date, values.startTime);
    const prevShift = findPrevShiftForUser(values.userId, newStartDT);
    if (prevShift) {
      const prevEndBase = getDateTime(prevShift.date, prevShift.endTime);
      const prevEndDT = prevShift.endTime <= prevShift.startTime ? new Date(prevEndBase.getTime() + 24 * 60 * 60 * 1000) : prevEndBase;
      const restHours = (newStartDT.getTime() - prevEndDT.getTime()) / 3600000;
      if (restHours < 12) {
        if (!canOverride) {
          toast({ title: "Rule R5 violation", description: `Rest period is ${restHours.toFixed(1)}h; minimum is 12h.`, variant: "destructive" });
          return;
        }
        setOverrideMessage(`Approve consecutive shifts: rest ${restHours.toFixed(1)}h < 12h.`);
        setPendingOverrideData(values);
        setShowOverrideConfirm(true);
        return;
      }
    }

    // Existing overlap detection (same site/time window): prompt
    const overlapCount = checkOverlap(values);
    if (overlapCount > 0) {
      setPendingShiftData(values);
      setOverlapCount(overlapCount);
      setShowOverlapConfirm(true);
    } else {
      createShiftMutation.mutate(values);
    }
  }
  
  function handleConfirmOverlap() {
    if (pendingShiftData) {
      createShiftMutation.mutate(pendingShiftData);
      setShowOverlapConfirm(false);
      setPendingShiftData(null);
      setOverlapCount(0);
    }
  }
  
  function handleCancelOverlap() {
    setShowOverlapConfirm(false);
    setPendingShiftData(null);
    setOverlapCount(0);
  }
  
  function handleCreateSecondaryShift() {
    if (createdShiftData) {
      const complementaryType = createdShiftData.shiftType === "day" ? "night" : "day";
      
      // For continuous coverage, the next shift should start exactly when this one ends
      // and end when this one starts (completing the 24-hour cycle)
      const complementaryTimes = {
        startTime: createdShiftData.endTime,
        endTime: createdShiftData.startTime,
      };
      
      // Pre-fill form with complementary shift data
      form.reset({
        userId: "",
        siteId: createdShiftData.siteId,
        date: createdShiftData.date,
        startTime: complementaryTimes.startTime,
        endTime: complementaryTimes.endTime,
        role: createdShiftData.role,
        shiftType: complementaryType,
        status: "scheduled",
        notes: "",
      });
      
      setShowSecondaryShiftPrompt(false);
      setCreatedShiftData(null);
      setStaffingImbalance(null);
      setIsCreateDialogOpen(true);
    }
  }
  
  function handleSkipSecondaryShift() {
    setShowSecondaryShiftPrompt(false);
    setCreatedShiftData(null);
    setStaffingImbalance(null);
  }

  const handlePreviousWeek = () => {
    setCurrentWeek(prev => addWeeks(prev, -1));
  };

  const handleNextWeek = () => {
    setCurrentWeek(prev => addWeeks(prev, 1));
  };

  const isLoading = shiftsLoading || sitesLoading || usersLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Rota Management</h1>
          <p className="text-muted-foreground mt-1">
            {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePreviousWeek}
              data-testid="button-previous-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentWeek(new Date())}
              data-testid="button-current-week"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextWeek}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {!sitesLoading && sites.length > 0 && (
            <Select
              value={selectedSiteId?.toString() || "all"}
              onValueChange={(value) => setSelectedSiteId(value === "all" ? null : parseInt(value))}
            >
              <SelectTrigger className="w-[180px]" data-testid="select-site-filter">
                <SelectValue placeholder="Filter by site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id.toString()}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-shift">
            <Plus className="h-4 w-4 mr-2" />
            Create Shift
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs defaultValue={weekDays[0].date} className="w-full">
          <TabsList className="w-full justify-start bg-muted/30 p-2 rounded-md border border-muted/30">
            {weekDays.map((day) => (
              <TabsTrigger
                key={day.date}
                value={day.date}
                data-testid={`tab-${day.name.toLowerCase()}`}
                className="rounded-md px-4 py-2 bg-background/20 border border-muted text-foreground data-[state=active]:bg-primary/10 data-[state=active]:border-primary/30"
              >
                {(() => {
                  const dayShifts = shiftsByDay[day.date] || [];
                  const dCount = dayShifts.filter((s) => s.shiftType === "day").length;
                  const nCount = dayShifts.filter((s) => s.shiftType === "night").length;
                  const dClass = dCount > 0
                    ? "bg-emerald-600/20 text-emerald-300 border-emerald-600/30"
                    : "bg-slate-700/40 text-slate-300 border-slate-600/40";
                  const nClass = nCount > 0
                    ? "bg-emerald-600/20 text-emerald-300 border-emerald-600/30"
                    : "bg-slate-700/40 text-slate-300 border-slate-600/40";
                  return (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex flex-col items-center">
                        <span className="font-medium">{day.name}</span>
                        <span className="text-xs text-muted-foreground">{day.displayDate}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`px-1 py-0.5 text-[10px] tracking-wide border ${dClass}`}>D{dCount}</Badge>
                        <Badge variant="outline" className={`px-1 py-0.5 text-[10px] tracking-wide border ${nClass}`}>N{nCount}</Badge>
                      </div>
                    </div>
                  );
                })()}
              </TabsTrigger>
            ))}
          </TabsList>
          {weekDays.map((day) => (
            <TabsContent key={day.date} value={day.date} className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {day.name}, {day.displayDate} - {shiftsByDay[day.date]?.length || 0} shifts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {shiftsByDay[day.date]?.length > 0 ? (
                      shiftsByDay[day.date].map((shift) => (
                        <ShiftCard
                          key={shift.id}
                          id={shift.id.toString()}
                          staffName={`${shift.user.firstName || ''} ${shift.user.lastName || ''}`.trim() || 'Unknown'}
                          role={shift.role}
                          site={shift.site.name}
                          siteColor={getSiteColor(shift.site.color)}
                          date={shift.date}
                          startTime={shift.startTime}
                          endTime={shift.endTime}
                          status={shift.status as any}
                          duration={calculateDuration(shift.startTime, shift.endTime)}
                          shiftType={shift.shiftType as "day" | "night"}
                          onDelete={canDelete ? () => handleDeleteShift(shift.id) : undefined}
                        />
                      ))
                    ) : (
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
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-create-shift">
          <DialogHeader>
            <DialogTitle>Create New Shift</DialogTitle>
            <DialogDescription>
              Schedule a new shift for a staff member. Conflicts will be detected automatically.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Staff Member</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-user">
                          <SelectValue placeholder="Select staff member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((user) => {
                          const label = (`${user.firstName || ''} ${user.lastName || ''}`).trim() || user.email || user.id;
                          const isAssigned = assignedUserIds.has(user.id);
                          return (
                            <SelectItem key={user.id} value={user.id} className={isAssigned ? 'text-amber-500' : undefined}>
                              <span className="flex items-center justify-between w-full">
                                <span>{label}</span>
                                {isAssigned && (
                                  <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-500 border-amber-500/30">Assigned</Badge>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger data-testid="select-site">
                          <SelectValue placeholder="Select site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sites.map((site) => (
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

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Care Assistant" data-testid="input-role" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shiftType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shift Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-shift-type">
                          <SelectValue placeholder="Select shift type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="day">Day Shift</SelectItem>
                        <SelectItem value="night">Night Shift</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Any additional notes..." data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {conflictWarning && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Warning: This shift may conflict with existing shifts for this user.
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    form.reset();
                    setConflictWarning(false);
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createShiftMutation.isPending} data-testid="button-submit">
                  {createShiftMutation.isPending ? "Creating..." : "Create Shift"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showOverlapConfirm} onOpenChange={setShowOverlapConfirm}>
        <DialogContent className="max-w-md" data-testid="dialog-overlap-confirm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Multiple Staff at Same Time
            </DialogTitle>
            <DialogDescription>
              There {overlapCount === 1 ? 'is' : 'are'} already <strong>{overlapCount} staff member{overlapCount > 1 ? 's' : ''}</strong> scheduled at this site during this time period.
            </DialogDescription>
          </DialogHeader>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Is this intentional? Confirm if multiple staff should work at the same time, or cancel to adjust the schedule.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelOverlap}
              data-testid="button-cancel-overlap"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmOverlap}
              data-testid="button-confirm-overlap"
            >
              Yes, Create Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New: Manager/Admin Override Confirmation */}
      <Dialog open={showOverrideConfirm} onOpenChange={setShowOverrideConfirm}>
        <DialogContent className="max-w-md" data-testid="dialog-override-confirm">
          <DialogHeader>
            <DialogTitle>Manager/Admin Override Required</DialogTitle>
            <DialogDescription>{overrideMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowOverrideConfirm(false); setPendingOverrideData(null); }}
              data-testid="button-cancel-override"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingOverrideData) {
                  const approvedBy = `${currentUser?.firstName ?? ''} ${currentUser?.lastName ?? ''}`.trim() || currentUser?.email || 'Manager';
                  const notes = `${pendingOverrideData.notes ? pendingOverrideData.notes + ' ' : ''}[Override] ${overrideMessage} — ApprovedBy: ${approvedBy}`;
                  createShiftMutation.mutate({ ...pendingOverrideData, notes });
                  setShowOverrideConfirm(false);
                  setPendingOverrideData(null);
                }
              }}
              data-testid="button-confirm-override"
            >
              Proceed with Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSecondaryShiftPrompt} onOpenChange={setShowSecondaryShiftPrompt}>
        <DialogContent className="max-w-md" data-testid="dialog-secondary-shift">
          <DialogHeader>
            <DialogTitle>Balance Staffing Levels?</DialogTitle>
            <DialogDescription>
              This site runs 24 hours a day, 365 days a year and requires balanced coverage.
            </DialogDescription>
          </DialogHeader>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Staffing imbalance detected:</strong>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span>{createdShiftData?.shiftType === "day" ? "Day" : "Night"} shift workers:</span>
                  <strong className="text-lg">{staffingImbalance?.current}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>{createdShiftData?.shiftType === "day" ? "Night" : "Day"} shift workers:</span>
                  <strong className="text-lg">{staffingImbalance?.complementary}</strong>
                </div>
              </div>
              <p className="mt-3">Would you like to add another {createdShiftData?.shiftType === "day" ? "night" : "day"} shift worker to balance coverage?</p>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleSkipSecondaryShift}
              data-testid="button-skip-secondary"
            >
              Skip for Now
            </Button>
            <Button
              type="button"
              onClick={handleCreateSecondaryShift}
              data-testid="button-create-secondary"
            >
              Add {createdShiftData?.shiftType === "day" ? "Night" : "Day"} Worker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

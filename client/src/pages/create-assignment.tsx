import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Edit3, Check, ArrowRight, UserCheck, MapPin, Briefcase } from "lucide-react";
import "./hallmark-sweep.css";

function LogoutButton() {
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
    window.location.reload();
  };

  return (
    <div className="fixed top-4 left-4 z-50 bg-slate-800 rounded-lg p-2 border border-slate-600 shadow-lg">
      <div className="flex items-center space-x-2">
        <span className="text-yellow-400 text-sm font-medium">Admin</span>
        <Button
          onClick={handleLogout}
          size="sm"
          className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white"
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

interface UploadedJob {
  id: string;
  title: string;
  clientName?: string;
  location: string;
  quotedAmount?: string;
}

interface JobLocation {
  id: string;
  jobId: string;
  name: string;
  normalizedName?: string;
  reviewStatus: "CONFIRMED" | "REVIEW_REQUIRED";
  reviewReason?: string;
}

interface JobLocationTask {
  id: string;
  jobId: string;
  locationId: string;
  workCategory: string;
  taskName: string;
  taskDescription?: string;
  status: string;
  assignedContractorName?: string;
}

interface Contractor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  primaryTrade: string;
}

export default function CreateAssignment() {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedContractorId, setSelectedContractorId] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const [isRenamingLocation, setIsRenamingLocation] = useState(false);
  const [editedLocationName, setEditedLocationName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  // Load all jobs
  const { data: jobs = [], refetch: refetchJobs } = useQuery<UploadedJob[]>({
    queryKey: ["/api/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json();
    },
  });

  // Load locations when job is selected
  const { data: locations = [], refetch: refetchLocations } = useQuery<JobLocation[]>({
    queryKey: ["/api/jobs", selectedJobId, "locations"],
    queryFn: async () => {
      if (!selectedJobId) return [];
      const res = await fetch(`/api/jobs/${selectedJobId}/locations`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedJobId,
  });

  // Load tasks when location is selected
  const { data: locationTasks = [], refetch: refetchTasks } = useQuery<JobLocationTask[]>({
    queryKey: ["/api/jobs", selectedJobId, "location-tasks", selectedLocationId],
    queryFn: async () => {
      if (!selectedJobId || !selectedLocationId) return [];
      const res = await fetch(`/api/jobs/${selectedJobId}/location-tasks?locationId=${selectedLocationId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedJobId && !!selectedLocationId,
  });

  // Fetch approved contractors
  const { data: approvedContractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractor-applications"],
    select: (data: any[]) =>
      data
        .filter((c) => c.status === "approved")
        .map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          primaryTrade: c.primaryTrade || "General Trades",
        })),
  });

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const selectedTask = locationTasks.find((t) => t.id === selectedTaskId);
  const selectedContractor = approvedContractors.find((c) => c.id === selectedContractorId);

  // Group tasks by category
  const tasksByCategory = locationTasks.reduce<Record<string, JobLocationTask[]>>((acc, task) => {
    const cat = task.workCategory || "General Works";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(task);
    return acc;
  }, {});

  const handleRenameLocation = async () => {
    if (!selectedJobId || !selectedLocationId || !editedLocationName.trim()) return;

    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/locations/${selectedLocationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedLocationName.trim(),
          reviewStatus: "CONFIRMED",
          reviewReason: null,
        }),
      });

      if (!res.ok) throw new Error("Failed to rename location");

      toast({
        title: "Location Renamed & Confirmed",
        description: `Location successfully updated to "${editedLocationName.trim()}".`,
      });

      setIsRenamingLocation(false);
      refetchLocations();
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update location name",
        variant: "destructive",
      });
    }
  };

  const handleCreateAssignment = async () => {
    if (!selectedJobId || !selectedLocationId || !selectedTaskId || !selectedContractorId) {
      toast({
        title: "Missing Information",
        description: "Please select Job, Location / Room, Specific Work Item, and Worker.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        jobId: selectedJobId,
        locationId: selectedLocationId,
        taskId: selectedTaskId,
        contractorId: selectedContractorId,
        startDate: startDate || new Date().toISOString().split("T")[0],
        endDate: endDate || startDate || new Date().toISOString().split("T")[0],
        specialInstructions: specialInstructions.trim(),
        sendTelegramNotification: true,
      };

      const res = await fetch("/api/assign-worker-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ error: "Assignment failed" }));
        throw new Error(errorJson.error || "Failed to create assignment");
      }

      toast({
        title: "Worker Assigned Successfully",
        description: `${selectedContractor?.firstName} assigned to ${selectedJob?.title} → ${selectedLocation?.name} → ${selectedTask?.taskName}`,
      });

      setTimeout(() => {
        window.location.href = "/job-assignments";
      }, 1500);
    } catch (err) {
      toast({
        title: "Assignment Failed",
        description: err instanceof Error ? err.message : "Failed to assign worker to task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-white">
      <LogoutButton />

      {/* Top Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center space-x-3">
          <div className="hallmark-logo-mark">
            <img src="/sculpt-projects-logo.png" alt="Sculpt Projects" />
          </div>
          <div>
            <div className="text-sm font-medium">Sculpt Projects</div>
            <div className="text-xs text-slate-400">Worker Allocation Desk</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Online</span>
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4">
            <span className="text-white font-bold text-sm">RD</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Page Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-yellow-400">Create Worker Assignment</h1>
            <p className="text-sm text-slate-400 mt-1">
              Operational flow: <strong>Job → Room / Location → Specific Work Item → Worker</strong>
            </p>
          </div>
          <Button
            onClick={() => (window.location.href = "/job-assignments")}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Back to Assignments
          </Button>
        </div>

        {/* 4-Step Assignment Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl space-y-6">
          {/* STEP 1: Select Job */}
          <div>
            <label className="block text-yellow-400 text-sm font-semibold mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs flex items-center justify-center border border-yellow-500/40">1</span>
              Select Job *
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                setSelectedLocationId("");
                setSelectedTaskId("");
              }}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            >
              <option value="">Choose a job...</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} {job.clientName ? `(Client: ${job.clientName})` : ""} {job.quotedAmount ? `— ${job.quotedAmount}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* STEP 2: Select Location / Room */}
          {selectedJobId && (
            <div className="border-t border-slate-700 pt-6">
              <label className="block text-yellow-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs flex items-center justify-center border border-yellow-500/40">2</span>
                Select Location / Room *
              </label>

              {locations.length === 0 ? (
                <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700 text-slate-400 text-sm">
                  No rooms or locations extracted for this job yet. Import an HBXL Word Quote on the Upload page to generate operational room structures.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {locations.map((loc) => {
                    const isSelected = selectedLocationId === loc.id;
                    const isFlagged = loc.reviewStatus === "REVIEW_REQUIRED";

                    return (
                      <div
                        key={loc.id}
                        onClick={() => {
                          setSelectedLocationId(loc.id);
                          setSelectedTaskId("");
                        }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-amber-950/40 border-yellow-500 shadow-md ring-1 ring-yellow-500/50"
                            : "bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <strong className="text-white text-sm">{loc.name}</strong>
                          {isFlagged ? (
                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Location needs review
                            </Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-300 border border-green-500/40 text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Confirmed
                            </Badge>
                          )}
                        </div>
                        {isFlagged && loc.reviewReason && (
                          <p className="text-xs text-amber-300/80 truncate">{loc.reviewReason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Admin Review Banner & Rename Action for Selected Location */}
              {selectedLocation && selectedLocation.reviewStatus === "REVIEW_REQUIRED" && (
                <div className="mt-4 bg-amber-950/30 border border-amber-600/60 rounded-lg p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        Location Requires Review: &quot;{selectedLocation.name}&quot;
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        {selectedLocation.reviewReason || "Generic location heading or spelling variant detected."}
                      </p>
                    </div>

                    {!isRenamingLocation && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setIsRenamingLocation(true);
                          setEditedLocationName(selectedLocation.name);
                        }}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs shrink-0"
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        Rename / Map Room
                      </Button>
                    )}
                  </div>

                  {isRenamingLocation && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={editedLocationName}
                        onChange={(e) => setEditedLocationName(e.target.value)}
                        placeholder="Enter confirmed room name..."
                        className="bg-slate-900 border border-amber-500 rounded px-3 py-1.5 text-sm text-white focus:outline-none flex-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={handleRenameLocation}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Save & Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsRenamingLocation(false)}
                        className="text-slate-400 hover:text-white text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Select Specific Work Item / Task */}
          {selectedLocationId && (
            <div className="border-t border-slate-700 pt-6">
              <label className="block text-yellow-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs flex items-center justify-center border border-yellow-500/40">3</span>
                Select Specific Work Item / Task *
              </label>

              {locationTasks.length === 0 ? (
                <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700 text-slate-400 text-sm">
                  No work items under this location.
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(tasksByCategory).map(([category, tasks]) => (
                    <div key={category} className="bg-slate-900/50 border border-slate-700/80 rounded-lg p-3">
                      <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                        {category}
                      </div>
                      <div className="space-y-1.5">
                        {tasks.map((task) => {
                          const isSelected = selectedTaskId === task.id;
                          const isAssigned = task.status === "assigned";

                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTaskId(task.id)}
                              className={`p-2.5 rounded-md border text-sm cursor-pointer flex items-center justify-between transition-all ${
                                isSelected
                                  ? "bg-amber-500/20 border-yellow-500 ring-1 ring-yellow-500/50 text-white font-medium"
                                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700/70"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-amber-400">•</span>
                                <span>{task.taskName}</span>
                              </div>
                              {isAssigned ? (
                                <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px]">
                                  Assigned to {task.assignedContractorName}
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-700 text-slate-300 text-[10px]">
                                  Available
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Select Worker */}
          {selectedTaskId && (
            <div className="border-t border-slate-700 pt-6">
              <label className="block text-yellow-400 text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 text-xs flex items-center justify-center border border-yellow-500/40">4</span>
                Select Worker *
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {approvedContractors.map((contractor) => {
                  const isSelected = selectedContractorId === contractor.id;

                  return (
                    <div
                      key={contractor.id}
                      onClick={() => setSelectedContractorId(contractor.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500/50"
                          : "bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-white text-sm">
                          {contractor.firstName} {contractor.lastName}
                        </strong>
                        <span className="text-xs text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-800/40">
                          {contractor.primaryTrade}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {contractor.email} · {contractor.phone}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Schedule Dates & Instructions */}
          {selectedContractorId && (
            <div className="border-t border-slate-700 pt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Special Instructions (Optional)</label>
                <textarea
                  rows={2}
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="e.g. Ensure subfloor is clean and primed before laying flooring..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-yellow-500 text-sm"
                />
              </div>

              {/* Assignment Summary Box */}
              <div className="bg-slate-900/80 border border-yellow-500/30 rounded-lg p-4 text-sm">
                <div className="font-semibold text-yellow-400 mb-2">Assignment Summary</div>
                <div className="flex flex-wrap items-center gap-2 text-slate-200">
                  <span className="font-semibold text-white">{selectedJob?.title}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-amber-300 font-semibold">{selectedLocation?.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-amber-200">{selectedTask?.workCategory}: {selectedTask?.taskName}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-blue-300 font-semibold">{selectedContractor?.firstName} {selectedContractor?.lastName}</span>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleCreateAssignment}
                disabled={isSubmitting}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold py-3 text-base"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-900 mr-2" />
                    Assigning Worker...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-5 w-5 mr-2" />
                    Confirm & Assign Worker to Task
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

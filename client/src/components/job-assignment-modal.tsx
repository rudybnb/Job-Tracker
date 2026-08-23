import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { JobWithContractor, Contractor } from "@shared/schema";

interface JobAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedJob?: JobWithContractor | null;
  contractors: Contractor[];
}

interface JobLocation {
  id: string;
  jobId: string;
  name: string;
  reviewStatus: string;
}

interface JobLocationTask {
  id: string;
  jobId: string;
  locationId: string;
  workCategory: string;
  taskName: string;
  status: string;
}

export default function JobAssignmentModal({ 
  isOpen, 
  onClose, 
  selectedJob, 
  contractors 
}: JobAssignmentModalProps) {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activeJobId = selectedJob?.id || selectedJobId;

  const { data: jobs = [] } = useQuery<JobWithContractor[]>({
    queryKey: ['/api/jobs', { status: 'pending' }],
    enabled: isOpen && !selectedJob,
  });

  // Fetch locations for selected job (additive)
  const { data: jobLocations = [] } = useQuery<JobLocation[]>({
    queryKey: ['/api/jobs', activeJobId, 'locations'],
    queryFn: async () => {
      if (!activeJobId) return [];
      const res = await fetch(`/api/jobs/${activeJobId}/locations`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen && Boolean(activeJobId),
  });

  // Fetch tasks for selected location (additive)
  const { data: locationTasks = [] } = useQuery<JobLocationTask[]>({
    queryKey: ['/api/jobs', activeJobId, 'location-tasks', selectedLocationId],
    queryFn: async () => {
      if (!activeJobId || !selectedLocationId) return [];
      const res = await fetch(`/api/jobs/${activeJobId}/location-tasks?locationId=${selectedLocationId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen && Boolean(activeJobId && selectedLocationId),
  });

  const assignJobMutation = useMutation({
    mutationFn: async (data: {
      jobId: string;
      contractorId: string;
      dueDate: string;
      notes?: string;
      locationId?: string;
      locationTaskId?: string;
    }) => {
      // If location and task are selected, also assign worker to specific task or whole package
      if (data.locationId && data.locationTaskId) {
        try {
          const isPackage = data.locationTaskId.startsWith("package:");
          await apiRequest('POST', '/api/assign-worker-task', {
            jobId: data.jobId,
            locationId: data.locationId,
            taskId: isPackage ? undefined : data.locationTaskId,
            workCategory: isPackage ? data.locationTaskId.replace(/^package:/, "") : undefined,
            contractorId: data.contractorId,
            startDate: new Date().toISOString().split("T")[0],
            endDate: data.dueDate,
            specialInstructions: data.notes,
          });
        } catch (e) {
          console.warn("Could not record location task assignment:", e);
        }
      }

      const response = await apiRequest('POST', '/api/assign-job', {
        jobId: data.jobId,
        contractorId: data.contractorId,
        dueDate: data.dueDate,
        notes: data.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Job Assigned Successfully",
        description: "The job has been assigned to the contractor.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Assignment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setSelectedJobId("");
    setSelectedLocationId("");
    setSelectedTaskId("");
    setSelectedContractorId("");
    setDueDate("");
    setNotes("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const jobId = activeJobId;
    if (!jobId || !selectedContractorId || !dueDate) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    assignJobMutation.mutate({
      jobId,
      contractorId: selectedContractorId,
      dueDate,
      notes,
      locationId: selectedLocationId || undefined,
      locationTaskId: selectedTaskId || undefined,
    });
  };

  const getContractorInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getAvatarColor = (index: number) => {
    const colors = ['bg-primary-600', 'bg-emerald-600', 'bg-purple-600', 'bg-blue-600', 'bg-amber-600'];
    return colors[index % colors.length];
  };

  const availableContractors = contractors.filter(c => c.status === 'available');

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Assign Job to Contractor
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Job Selection */}
          <div>
            <Label htmlFor="job-select" className="text-sm font-medium text-slate-700">
              Select Job *
            </Label>
            {selectedJob ? (
              <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                <div className="text-sm font-medium text-slate-900">{selectedJob.title}</div>
                <div className="text-sm text-slate-500">{selectedJob.location}</div>
              </div>
            ) : (
              <Select 
                value={selectedJobId} 
                onValueChange={(val) => {
                  setSelectedJobId(val);
                  setSelectedLocationId("");
                  setSelectedTaskId("");
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Choose a job..." />
                </SelectTrigger>
                <SelectContent>
                  {jobs.filter(job => job.status === 'pending').map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title} - {job.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Location / Room Selection (ADDITIVE) */}
          {activeJobId && jobLocations.length > 0 && (
            <div>
              <Label className="text-sm font-medium text-slate-700">
                Location / Room (Optional)
              </Label>
              <Select 
                value={selectedLocationId} 
                onValueChange={(val) => {
                  setSelectedLocationId(val);
                  setSelectedTaskId("");
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="All locations / entire job" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Locations</SelectItem>
                  {jobLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} {loc.reviewStatus === "REVIEW_REQUIRED" ? "⚠️" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Work Item Selection (ADDITIVE) */}
          {selectedLocationId && locationTasks.length > 0 && (
            <div>
              <Label className="text-sm font-medium text-slate-700">
                Work Package / Specific Task (Optional)
              </Label>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="All tasks / packages in this location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Tasks in Location</SelectItem>
                  {(() => {
                    const grouped = new Map<string, JobLocationTask[]>();
                    for (const t of locationTasks) {
                      const list = grouped.get(t.workCategory) || [];
                      list.push(t);
                      grouped.set(t.workCategory, list);
                    }

                    return Array.from(grouped.entries()).map(([catName, tasks]) => {
                      const isPurePackage = tasks.length === 1 && tasks[0].taskName === tasks[0].workCategory;

                      if (isPurePackage) {
                        const t = tasks[0];
                        return (
                          <SelectItem key={t.id} value={t.id}>
                            📁 {catName} (Work Package)
                          </SelectItem>
                        );
                      }

                      return (
                        <div key={catName}>
                          <SelectItem value={`package:${catName}`}>
                            📦 Whole Package: {catName} ({tasks.length} tasks)
                          </SelectItem>
                          {tasks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              &nbsp;&nbsp;• {t.taskName}
                            </SelectItem>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Contractor Selection */}
          <div>
            <Label className="text-sm font-medium text-slate-700">Select Contractor *</Label>
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {availableContractors.length > 0 ? availableContractors.map((contractor, index) => (
                <div
                  key={contractor.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedContractorId === contractor.id
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-slate-200 hover:bg-primary-50 hover:border-primary-300'
                  }`}
                  onClick={() => setSelectedContractorId(contractor.id)}
                >
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="contractor"
                      value={contractor.id}
                      checked={selectedContractorId === contractor.id}
                      onChange={() => setSelectedContractorId(contractor.id)}
                      className="mr-3"
                    />
                    <div className={`w-8 h-8 ${getAvatarColor(index)} rounded-full flex items-center justify-center mr-3`}>
                      <span className="text-white text-xs font-medium">
                        {getContractorInitials(contractor.name)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{contractor.name}</div>
                      <div className="text-xs text-slate-500">
                        {contractor.specialty} • {contractor.rating} ★ • {contractor.activeJobs} active jobs
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                      Available
                    </span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-4 text-sm text-slate-500">
                  No available contractors
                </div>
              )}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <Label htmlFor="due-date" className="text-sm font-medium text-slate-700">
              Due Date *
            </Label>
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-2"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-sm font-medium text-slate-700">
              Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any special instructions or notes..."
              className="mt-2"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={assignJobMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary-600 hover:bg-primary-700"
              disabled={assignJobMutation.isPending}
            >
              {assignJobMutation.isPending ? 'Assigning...' : 'Assign Job'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  buildRoomAssignmentChecklist,
  buildRoomTaskSelections,
  findAssignmentJobById,
  formatAssignmentJobLabel,
  getStructuredAssignmentConflict,
  hasStructuredJobData,
  toggleAllRoomTasks,
} from "@/lib/assignment-job-mode";
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
  name: string;
  location: string;
  clientName?: string;
  postcode?: string;
  notes?: string;
  phases?: string[];
  phaseData?: Record<string, any[]>;
  resources?: any[];
  clientInfo?: {
    name: string;
    address: string;
    postCode: string;
    projectType: string;
  };
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
}

interface AssignablePerson {
  identity: {
    type: "worker" | "contractor";
    id: string;
  };
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  trade: string;
}

interface ExistingJobAssignment {
  id: string;
  contractorName: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  jobId?: string | null;
  locationId?: string | null;
  locationTaskId?: string | null;
}

const assignmentPersonKey = (person: AssignablePerson) => `${person.identity.type}:${person.identity.id}`;

function parseHbxlDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  const text = value.trim();
  const ukMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) {
    const day = Number(ukMatch[1]);
    const month = Number(ukMatch[2]);
    const year = Number(ukMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatAssignmentDate(date: Date): string {
  return [
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    date.getUTCFullYear(),
  ].join("/");
}

function parseStoredPhaseTaskData(value: unknown): { phaseData: Record<string, any[]>; resources: any[] } {
  if (!value) return { phaseData: {}, resources: [] };

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return { phaseData: {}, resources: [] };

    const container = parsed as { phases?: unknown; resources?: unknown };
    const phaseData =
      container.phases && typeof container.phases === "object" && !Array.isArray(container.phases)
        ? (container.phases as Record<string, any[]>)
        : (parsed as Record<string, any[]>);

    return {
      phaseData,
      resources: Array.isArray(container.resources) ? container.resources : [],
    };
  } catch {
    return { phaseData: {}, resources: [] };
  }
}

function calculateSelectedPhaseDateRange(job: UploadedJob | undefined, selectedPhases: string[]) {
  if (!job || selectedPhases.length === 0) return { startDate: "", endDate: "" };

  const selected = new Set(selectedPhases);
  const orderDates: Date[] = [];
  const requiredDates: Date[] = [];

  for (const phase of selectedPhases) {
    const tasks = Array.isArray(job.phaseData?.[phase]) ? job.phaseData[phase] : [];
    for (const task of tasks) {
      const orderDate = parseHbxlDate(task?.orderDate);
      const requiredDate = parseHbxlDate(task?.requiredDate);
      if (orderDate) orderDates.push(orderDate);
      if (requiredDate) requiredDates.push(requiredDate);
      else if (orderDate) requiredDates.push(orderDate);
    }
  }

  for (const resource of job.resources ?? []) {
    if (!selected.has(resource?.buildPhase)) continue;

    const orderDate = parseHbxlDate(resource?.orderDate);
    const requiredDate = parseHbxlDate(resource?.requiredDate);
    if (orderDate) orderDates.push(orderDate);
    if (requiredDate) requiredDates.push(requiredDate);
    else if (orderDate) requiredDates.push(orderDate);
  }

  if (orderDates.length === 0 && requiredDates.length === 0) return { startDate: "", endDate: "" };

  return {
    startDate: orderDates.length > 0 ? formatAssignmentDate(new Date(Math.min(...orderDates.map((date) => date.getTime())))) : "",
    endDate: requiredDates.length > 0 ? formatAssignmentDate(new Date(Math.max(...requiredDates.map((date) => date.getTime())))) : "",
  };
}

export default function CreateAssignment() {
  const [selectedContractors, setSelectedContractors] = useState<string[]>([]);
  const [contractorName, setContractorName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [uploadedJobs, setUploadedJobs] = useState<UploadedJob[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [availablePhases, setAvailablePhases] = useState<string[]>([]);
  const selectedPhaseKey = selectedPhases.join("\n");
  const { toast } = useToast();

  // Assignment Desk uses canonical active workers plus unmatched active contractor profiles.
  const { data: assignablePeople = [] } = useQuery<AssignablePerson[]>({
    queryKey: ["/api/assignment-desk/assignable-people"],
  });

  // Fetch locations for selected job (additive)
  const {
    data: jobLocations = [],
    isPending: areJobLocationsLoading,
    isError: didJobLocationsFail,
  } = useQuery<JobLocation[]>({
    queryKey: ["/api/jobs", selectedJobId, "locations"],
    queryFn: async () => {
      if (!selectedJobId) return [];
      const res = await fetch(`/api/jobs/${selectedJobId}/locations`);
      if (!res.ok) throw new Error("Failed to load job locations");
      return res.json();
    },
    enabled: Boolean(selectedJobId),
  });

  // Fetch all tasks so mode is known before presenting structured or legacy controls.
  const {
    data: allJobLocationTasks = [],
    isPending: areJobLocationTasksLoading,
    isError: didJobLocationTasksFail,
  } = useQuery<JobLocationTask[]>({
    queryKey: ["/api/jobs", selectedJobId, "location-tasks"],
    queryFn: async () => {
      if (!selectedJobId) return [];
      const res = await fetch(`/api/jobs/${selectedJobId}/location-tasks`);
      if (!res.ok) throw new Error("Failed to load job location tasks");
      return res.json();
    },
    enabled: Boolean(selectedJobId),
  });

  const { data: existingJobAssignments = [] } = useQuery<ExistingJobAssignment[]>({
    queryKey: ["/api/job-assignments"],
    enabled: Boolean(selectedJobId && selectedContractors.length > 0),
  });

  const selectedJob = findAssignmentJobById(uploadedJobs, selectedJobId);
  const selectedHbxlJob = selectedJob?.name ?? "";
  const selectedPeople = selectedContractors.flatMap((key) => {
    const person = assignablePeople.find((candidate) => assignmentPersonKey(candidate) === key);
    return person ? [{ name: person.name, email: person.email, phone: person.phone }] : [];
  });
  const existingStructuredAssignments = existingJobAssignments.filter((assignment) =>
    assignment.jobId === selectedJobId && assignment.locationId && assignment.locationTaskId,
  );
  const assignmentConflictsByTaskId = new Map(
    allJobLocationTasks.map((task) => [
      task.id,
      getStructuredAssignmentConflict(selectedJobId, task.id, selectedPeople, existingStructuredAssignments),
    ]),
  );
  const unavailableTaskIds = new Set(
    Array.from(assignmentConflictsByTaskId.entries())
      .filter(([, conflict]) => conflict.isUnavailable)
      .map(([taskId]) => taskId),
  );
  const unavailableTaskIdsKey = Array.from(unavailableTaskIds).sort().join("\n");
  const selectedRooms = jobLocations
    .filter((location) => selectedLocationIds.includes(location.id))
    .map((location) => ({
      location,
      checklist: buildRoomAssignmentChecklist(allJobLocationTasks, location.id),
    }));
  const roomTaskSelections = buildRoomTaskSelections(allJobLocationTasks, selectedLocationIds, selectedTaskIds, unavailableTaskIds);
  const isJobStructureLoading = Boolean(selectedJobId) && (areJobLocationsLoading || areJobLocationTasksLoading);
  const didJobStructureFail = Boolean(selectedJobId) && (didJobLocationsFail || didJobLocationTasksFail);
  const isStructuredWordJob = !isJobStructureLoading
    && !didJobStructureFail
    && hasStructuredJobData(jobLocations, allJobLocationTasks);

  useEffect(() => {
    // Load jobs from database
    const loadJobsFromDatabase = async () => {
      try {
        console.log('🔍 Loading jobs from database...');
        const response = await fetch('/api/jobs');
        if (!response.ok) {
          throw new Error('Failed to fetch jobs');
        }
        const jobs = await response.json();
        console.log('✅ Loaded jobs from database:', jobs.length);
        
        // Transform database jobs to match expected format
        const transformedJobs = jobs.map((job: any) => {
          const storedTaskData = parseStoredPhaseTaskData(job.phaseTaskData);
          const phases = job.phases ? job.phases.split(', ').filter(Boolean) : Object.keys(storedTaskData.phaseData);

          return {
            id: job.id,
            name: job.title,
            location: job.location,
            clientName: job.clientName,
            postcode: job.postcode,
            notes: job.notes,
            status: job.status,
            phases,
            phaseData: storedTaskData.phaseData,
            resources: storedTaskData.resources,
          };
        });
        
        setUploadedJobs(transformedJobs);
      } catch (error) {
        console.error('❌ Error loading jobs:', error);
        toast({
          title: "Error Loading Jobs",
          description: "Could not load jobs from database",
          variant: "destructive",
        });
      }
    };
    
    loadJobsFromDatabase();
  }, []);

  useEffect(() => {
    // When a job ID is selected, load any legacy phase data for that exact record.
    if (selectedJobId) {
      const selectedJob = findAssignmentJobById(uploadedJobs, selectedJobId);

      if (selectedJob) {
        if (selectedJob.phases && selectedJob.phases.length > 0) {
          setAvailablePhases(selectedJob.phases);
        } else if (selectedJob.phaseData && typeof selectedJob.phaseData === 'object' && selectedJob.phaseData !== null) {
          const phases = Object.keys(selectedJob.phaseData);
          setAvailablePhases(phases);
        } else {
          setAvailablePhases([]);
        }
      } else {
        setAvailablePhases([]);
      }
    } else {
      setSelectedLocationIds([]);
      setSelectedTaskIds([]);
      setAvailablePhases([]);
    }
  }, [selectedJobId, uploadedJobs]);

  useEffect(() => {
    const dateRange = calculateSelectedPhaseDateRange(selectedJob, selectedPhases);

    if (dateRange.startDate) setStartDate(dateRange.startDate);
    if (dateRange.endDate) setEndDate(dateRange.endDate);
  }, [selectedJob, selectedPhaseKey]);

  useEffect(() => {
    if (!isStructuredWordJob || unavailableTaskIds.size === 0) return;
    setSelectedTaskIds((current) => current.filter((taskId) => !unavailableTaskIds.has(taskId)));
  }, [isStructuredWordJob, unavailableTaskIdsKey]);

  const handlePhaseToggle = (phase: string) => {
    setSelectedPhases(prev => 
      prev.includes(phase) 
        ? prev.filter(p => p !== phase)
        : [...prev, phase]
    );
  };

  const handleSelectAllPhases = () => {
    setSelectedPhases([...availablePhases]);
  };

  const handleClearAllPhases = () => {
    setSelectedPhases([]);
  };

  const handleTaskToggle = (taskId: string) => {
    if (unavailableTaskIds.has(taskId)) return;
    setSelectedTaskIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  };

  const handleRoomToggle = (locationId: string) => {
    if (selectedLocationIds.includes(locationId)) {
      const roomTaskIdSet = new Set(
        allJobLocationTasks.filter((task) => task.locationId === locationId).map((task) => task.id),
      );
      setSelectedLocationIds((current) => current.filter((id) => id !== locationId));
      setSelectedTaskIds((current) => current.filter((id) => !roomTaskIdSet.has(id)));
      return;
    }

    setSelectedLocationIds((current) => [...current, locationId]);
  };

  const handleSelectAllRoomTasks = (locationId: string) => {
    const roomTaskIds = allJobLocationTasks
      .filter((task) => task.locationId === locationId)
      .filter((task) => !unavailableTaskIds.has(task.id))
      .map((task) => task.id);
    setSelectedTaskIds((current) => toggleAllRoomTasks(current, roomTaskIds));
  };

  const handleCreateAssignment = async () => {
    // Validate required fields
    if (selectedContractors.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select at least one contractor",
        variant: "destructive"
      });
      return;
    }

    if (!workLocation || !selectedJobId) {
      toast({
        title: "Missing Information",
        description: "Please fill in work location and select an HBXL job",
        variant: "destructive"
      });
      return;
    }

    if (isJobStructureLoading || didJobStructureFail) {
      toast({
        title: "Job Structure Unavailable",
        description: isJobStructureLoading
          ? "Please wait for the selected job structure to finish loading."
          : "Could not load the selected job structure. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Structured jobs require at least one room and one room-scoped work item.
    if (isStructuredWordJob) {
      if (selectedLocationIds.length === 0 || roomTaskSelections.length === 0) {
        toast({
          title: "Missing Information",
          description: "Please select at least one room and one work item",
          variant: "destructive"
        });
        return;
      }
    } else {
      // For legacy CSV jobs without location records: require at least one build phase
      if (availablePhases.length > 0 && selectedPhases.length === 0) {
        toast({
          title: "No Phases Selected",
          description: "Please select at least one build phase",
          variant: "destructive"
        });
        return;
      }
    }

    try {
      if (isStructuredWordJob) {
        const response = await fetch('/api/assign-worker-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: selectedJobId,
            selections: roomTaskSelections,
            people: selectedContractors.map((key) => {
              const person = assignablePeople.find((candidate) => assignmentPersonKey(candidate) === key)!;
              return person.identity;
            }),
            startDate: startDate || new Date().toISOString().split("T")[0],
            endDate: endDate || startDate || new Date().toISOString().split("T")[0],
            specialInstructions,
            sendTelegramNotification: true,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Failed to create room assignments: ${response.status}`);
        }

        const contractorNames = selectedContractors.map(id => {
          const contractor = assignablePeople.find(candidate => assignmentPersonKey(candidate) === id);
          return contractor?.name || '';
        }).filter(Boolean).join(', ');
        toast({
          title: "Assignments Created",
          description: `${selectedTaskIds.length} work item${selectedTaskIds.length === 1 ? "" : "s"} across ${roomTaskSelections.length} room${roomTaskSelections.length === 1 ? "" : "s"} assigned to ${contractorNames}.`,
        });
        setTimeout(() => {
          window.location.href = '/job-assignments';
        }, 2000);
        return;
      }

      const assignments = [];
      
      // Create assignments for each selected contractor
      for (const contractorId of selectedContractors) {
        const contractor = assignablePeople.find(c => assignmentPersonKey(c) === contractorId);
        if (!contractor) continue;

        const assignment = {
          jobId: selectedJobId || undefined,
          contractorName: contractor.name,
          email: contractor.email || "",
          phone: contractor.phone || "0000000000",
          workLocation,
          hbxlJob: selectedHbxlJob,
          buildPhases: selectedPhases,
          locationId: undefined,
          locationName: undefined,
          locationTaskId: undefined,
          workCategory: undefined,
          taskName: undefined,
          startDate: startDate || new Date().toISOString().split("T")[0],
          endDate: endDate || startDate || new Date().toISOString().split("T")[0],
          specialInstructions: selectedContractors.length > 1 
            ? `TEAM ASSIGNMENT: Working with ${selectedContractors.length} contractors. ${specialInstructions}`.trim()
            : specialInstructions,
          status: "assigned",
          sendTelegramNotification: true,
        };

        console.log(`📋 Creating assignment for ${contractor.firstName} ${contractor.lastName}:`, assignment);

        // Save assignment to database
        const response = await fetch('/api/job-assignments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(assignment),
        });

        if (!response.ok) {
          throw new Error(`Failed to create assignment for ${contractor.firstName}: ${response.status}`);
        }

        const savedAssignment = await response.json();
        assignments.push(savedAssignment);
        console.log(`✅ Assignment saved for ${contractor.firstName} ${contractor.lastName}`);

      }

      const contractorNames = selectedContractors.map(id => {
        const c = assignablePeople.find(contractor => assignmentPersonKey(contractor) === id);
        return c?.name || '';
      }).filter(Boolean).join(', ');

      toast({
        title: "Assignments Created",
        description: selectedContractors.length > 1 
          ? `Team assignment created for ${selectedContractors.length} contractors: ${contractorNames}. Telegram notifications sent to each.`
          : `Job assigned to ${contractorNames}. Telegram notification sent.`,
      });

      // Navigate back to job assignments
      setTimeout(() => {
        window.location.href = '/job-assignments';
      }, 2000);
      
    } catch (error) {
      console.error('❌ Assignment creation failed:', error);
      const message = error instanceof Error && error.message
        ? error.message
        : "Failed to create assignment. Please try again.";
      toast({
        title: "Assignment Error",
        description: message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="hallmark-logo-mark">
            <img src="/sculpt-projects-logo.png" alt="Sculpt Projects" />
          </div>
          <div>
            <div className="text-sm font-medium">Sculpt Projects</div>
            <div className="text-xs text-slate-400">Assignment desk</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Online</span>
          <i className="fas fa-sun text-yellow-400 ml-2"></i>
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4">
            <span className="text-white font-bold text-sm">RD</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Page Title */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-yellow-400">Job Assignments</h1>
          <Button 
            onClick={() => window.location.href = '/job-assignments'}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            + Create Assignment
          </Button>
        </div>

        {/* Create New Job Assignment Form */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center mb-6">
            <i className="fas fa-user-plus text-yellow-400 mr-2"></i>
            <h3 className="text-xl font-semibold text-yellow-400">Create New Job Assignment</h3>
          </div>
          
          <div className="space-y-4">
            {/* Contractor Selection (Multiple) */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Select Contractors *
                <span className="text-slate-400 text-xs ml-2">(Can select multiple for team work)</span>
              </label>
              
              {/* Contractor Dropdown */}
              <div className="relative mb-3">
                <select
                  onChange={(e) => {
                    const contractorId = e.target.value;
                    if (contractorId && !selectedContractors.includes(contractorId)) {
                      const newSelected = [...selectedContractors, contractorId];
                      setSelectedContractors(newSelected);
                      
                      // Auto-fill contact details from first selected contractor
                      if (newSelected.length === 1) {
                        const contractor = assignablePeople.find(c => assignmentPersonKey(c) === contractorId);
                        if (contractor) {
                          setContractorName(contractor.name);
                          setEmail(contractor.email || '');
                          setPhone(contractor.phone || '');
                        }
                      } else {
                        // For multiple contractors, use combined names
                        const names = newSelected.map(id => {
                          const contractor = assignablePeople.find(c => assignmentPersonKey(c) === id);
                          return contractor?.name || '';
                        }).filter(Boolean);
                        setContractorName(names.join(', '));
                        setEmail('');
                        setPhone('');
                      }
                      
                      e.target.value = '';
                    }
                  }}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                >
                  <option value="">Choose contractors...</option>
                  {assignablePeople.map((contractor) => {
                    const personKey = assignmentPersonKey(contractor);
                    return (
                      <option
                        key={personKey}
                        value={personKey}
                        disabled={selectedContractors.includes(personKey)}
                      >
                        {contractor.name} - {contractor.trade.replaceAll("_", " ")}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Selected Contractors Display */}
              {selectedContractors.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-slate-400">Selected Contractors:</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedContractors.map((contractorId) => {
                      const contractor = assignablePeople.find(c => assignmentPersonKey(c) === contractorId);
                      if (!contractor) return null;
                      
                      return (
                        <Badge 
                          key={contractorId}
                          className="bg-blue-600 text-white px-3 py-1 flex items-center gap-2"
                        >
                          <span>{contractor.name}</span>
                          <span className="text-blue-200 text-xs">({contractor.trade.replaceAll("_", " ")})</span>
                          <button
                            onClick={() => {
                              const newSelected = selectedContractors.filter(id => id !== contractorId);
                              setSelectedContractors(newSelected);
                              
                              if (newSelected.length === 0) {
                                setContractorName('');
                                setEmail('');
                                setPhone('');
                              } else if (newSelected.length === 1) {
                                const remaining = assignablePeople.find(c => assignmentPersonKey(c) === newSelected[0]);
                                if (remaining) {
                                  setContractorName(remaining.name);
                                  setEmail(remaining.email || '');
                                  setPhone(remaining.phone || '');
                                }
                              } else {
                                const names = newSelected.map(id => {
                                  const contractor = assignablePeople.find(c => assignmentPersonKey(c) === id);
                                  return contractor?.name || '';
                                }).filter(Boolean);
                                setContractorName(names.join(', '));
                                setEmail('');
                                setPhone('');
                              }
                            }}
                            className="text-blue-200 hover:text-white ml-1"
                          >
                            ×
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                  
                  {selectedContractors.length > 1 && (
                    <div className="text-xs text-green-400 bg-green-900/20 border border-green-700 rounded p-2">
                      ✓ Team Assignment: {selectedContractors.length} contractors will work together on this job
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Contact Information (Auto-filled from contractor selection) */}
            {selectedContractors.length === 1 && (
              <>
                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">
                    Email * <span className="text-slate-400 text-xs">(Auto-filled from contractor profile)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                    placeholder="Enter email address"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">
                    Phone <span className="text-slate-400 text-xs">(Auto-filled from contractor profile)</span>
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                    placeholder="Enter phone number"
                  />
                </div>
              </>
            )}
            
            {selectedContractors.length > 1 && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                <div className="text-yellow-400 font-medium mb-2">Team Assignment Mode</div>
                <div className="text-slate-300 text-sm">
                  For team assignments with multiple contractors, notifications will be sent to each contractor individually. 
                  Contact details are managed through their individual profiles.
                </div>
              </div>
            )}

            {/* Work Location */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Work Location (Postcode) *
              </label>
              <input
                type="text"
                value={workLocation}
                onChange={(e) => setWorkLocation(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                placeholder="Enter postcode"
              />
            </div>

            {/* HBXL Job Selection */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                HBXL Job *
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => {
                  const jobId = e.target.value;
                  console.log('Job selection changed to ID:', jobId);
                  setSelectedJobId(jobId);
                  setSelectedPhases([]);
                  setSelectedLocationIds([]);
                  setSelectedTaskIds([]);
                  
                  if (jobId) {
                    const selectedJob = findAssignmentJobById(uploadedJobs, jobId);
                    if (selectedJob && selectedJob.location) {
                      const locationParts = selectedJob.location.split(', ');
                      const postcode = locationParts[locationParts.length - 1];
                      setWorkLocation(postcode);
                      console.log('✅ Auto-populated work location with postcode:', postcode);
                    }
                  } else {
                    setWorkLocation('');
                  }
                }}
                className="w-full bg-slate-700 border border-yellow-500 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
              >
                <option value="">Select HBXL job</option>
                {uploadedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {formatAssignmentJobLabel(job)}
                  </option>
                ))}
              </select>
              {uploadedJobs.length === 0 && (
                <p className="text-red-400 text-sm mt-2">
                  No jobs available. Upload CSV files or Word quotes on the Upload Job page first.
                </p>
              )}
              {uploadedJobs.length > 0 && (
                <p className="text-green-400 text-sm mt-2">
                  ✓ {uploadedJobs.length} job(s) available
                </p>
              )}
            </div>

            {isJobStructureLoading && (
              <div className="text-slate-300 text-sm">Loading job structure...</div>
            )}

            {didJobStructureFail && !isJobStructureLoading && (
              <div className="text-red-400 text-sm">Could not load job structure. Please select the job again.</div>
            )}

            {/* Location & Task Selectors for structured Word jobs. */}
            {isStructuredWordJob && (
              <div className="space-y-4 bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Operational Location & Work Item Assignment
                  </span>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                    {jobLocations.length} Room(s) available
                  </span>
                </div>

                {/* Multi-room selection */}
                <div className="space-y-2">
                  <div className="text-yellow-400 text-sm font-medium">Locations / Rooms *</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {jobLocations.map((location) => (
                      <label key={location.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-600 bg-slate-900/50 px-3 py-2 hover:border-yellow-500/60">
                        <input
                          type="checkbox"
                          checked={selectedLocationIds.includes(location.id)}
                          onChange={() => handleRoomToggle(location.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-700 text-yellow-400 focus:ring-yellow-500"
                        />
                        <span className="text-sm text-white">
                          {location.name}
                          {location.reviewStatus === "REVIEW_REQUIRED" && <span className="ml-2 text-xs text-amber-400">Needs Review</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* One independently selectable work section per selected room. */}
                {selectedRooms.map(({ location, checklist }) => {
                  const roomTaskIds = checklist.flatMap((group) => group.items.map((item) => item.id));
                  const allRoomTasksSelected = roomTaskIds.length > 0
                    && roomTaskIds.every((taskId) => selectedTaskIds.includes(taskId));
                  const selectedRoomTaskCount = roomTaskIds.filter((taskId) => selectedTaskIds.includes(taskId)).length;

                  return (
                    <section key={location.id} className="space-y-3 rounded-lg border border-slate-600 bg-slate-900/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold text-yellow-400">{location.name}</h4>
                        <span className="text-xs text-slate-400">{selectedRoomTaskCount} selected</span>
                      </div>
                      <label className="flex cursor-pointer items-center gap-3 border-b border-slate-700 pb-3 text-sm font-medium text-white">
                        <input
                          type="checkbox"
                          checked={allRoomTasksSelected}
                          disabled={roomTaskIds.length === 0}
                          onChange={() => handleSelectAllRoomTasks(location.id)}
                          className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-yellow-400 focus:ring-yellow-500"
                        />
                        Select all work in this room
                      </label>
                      {checklist.length === 0 && (
                        <p className="text-sm text-slate-400">No assignable work exists for this room.</p>
                      )}
                      {checklist.map((group) => (
                        <fieldset key={group.name} className="space-y-2">
                          {group.hasExplicitChildTasks && (
                            <legend className="text-sm font-semibold text-white">{group.name}</legend>
                          )}
                          {group.items.map((item) => (
                            (() => {
                              const conflict = assignmentConflictsByTaskId.get(item.id);
                              const isUnavailable = Boolean(conflict?.isUnavailable);

                              return (
                                <label
                                  key={item.id}
                                  className={`flex items-start gap-3 rounded-md border px-3 py-2 ${
                                    isUnavailable
                                      ? "cursor-not-allowed border-emerald-500/60 bg-emerald-950/30"
                                      : "cursor-pointer border-slate-700 bg-slate-800/70 hover:border-yellow-500/60"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedTaskIds.includes(item.id) && !isUnavailable}
                                    disabled={isUnavailable}
                                    onChange={() => handleTaskToggle(item.id)}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-700 text-yellow-400 focus:ring-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                  <span className="space-y-1 text-sm text-white">
                                    <span className="block">{item.checkboxLabel}</span>
                                    {conflict?.selectedAssigneeNames.map((name) => (
                                      <span key={`selected-${name}`} className="block text-xs font-semibold uppercase tracking-wide text-emerald-300">
                                        ✓ ALREADY ASSIGNED — {name}
                                      </span>
                                    ))}
                                    {conflict?.otherAssigneeNames.map((name) => (
                                      <span key={`other-${name}`} className="block text-xs font-semibold uppercase tracking-wide text-amber-300">
                                        ASSIGNED TO: {name}
                                      </span>
                                    ))}
                                    {!conflict?.isUnavailable && item.status === "assigned" && (
                                      <span className="block text-xs text-emerald-400">Assigned</span>
                                    )}
                                  </span>
                                </label>
                              );
                            })()
                          ))}
                        </fieldset>
                      ))}
                    </section>
                  );
                })}

              </div>
            )}

            {/* Legacy phase controls appear only after both structure queries complete. */}
            {selectedJobId && !isJobStructureLoading && !didJobStructureFail && !isStructuredWordJob && availablePhases.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-yellow-400 text-sm font-medium">
                    Build Phases * <span className="text-slate-400 text-xs">(Legacy CSV assignment mode)</span>
                  </label>
                  <div className="flex space-x-4">
                    <button
                      type="button"
                      onClick={handleSelectAllPhases}
                      className="text-yellow-400 text-sm hover:text-yellow-300"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllPhases}
                      className="text-yellow-400 text-sm hover:text-yellow-300"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {availablePhases.map((phase) => (
                    <div key={phase} className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id={phase}
                        checked={selectedPhases.includes(phase)}
                        onChange={() => handlePhaseToggle(phase)}
                        className="w-4 h-4 text-yellow-400 bg-slate-700 border-slate-600 rounded focus:ring-yellow-500"
                      />
                      <label htmlFor={phase} className="text-white text-sm">
                        {phase}
                      </label>
                    </div>
                  ))}
                </div>
                
                <div className="mt-2 text-slate-400 text-sm">
                  Selected: {selectedPhases.length} of {availablePhases.length} phases from {selectedHbxlJob}
                </div>
              </div>
            )}

            {/* Start Date */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Start Date
              </label>
              <input
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                placeholder="DD/MM/YYYY"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                End Date
              </label>
              <input
                type="text"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                placeholder="DD/MM/YYYY"
              />
            </div>

            {/* Special Instructions */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Special Instructions
              </label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={4}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                placeholder="Any special instructions for the contractor..."
              />
            </div>

            {isStructuredWordJob && selectedLocationIds.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-white">
                <span className="font-semibold">{selectedLocationIds.length}</span> room{selectedLocationIds.length === 1 ? "" : "s"}
                <span className="mx-2 text-slate-500">/</span>
                <span className="font-semibold">{selectedTaskIds.length}</span> work item{selectedTaskIds.length === 1 ? "" : "s"} selected
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-4 pt-4">
              <Button
                type="button"
                onClick={() => window.location.href = '/job-assignments'}
                variant="outline"
                className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateAssignment}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Create Assignment
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-4 text-center">
          <button 
            onClick={() => window.location.href = '/'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-home block mb-1"></i>
            <span className="text-xs">Dashboard</span>
          </button>
          <button 
            onClick={() => window.location.href = '/job-assignments'}
            className="py-3 px-4 text-yellow-400"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
        </div>
      </div>
      
      {/* Add bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}

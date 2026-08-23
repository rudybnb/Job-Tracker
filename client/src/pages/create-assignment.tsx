import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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

interface Contractor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  primaryTrade: string;
}

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
  const [selectedHbxlJob, setSelectedHbxlJob] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [uploadedJobs, setUploadedJobs] = useState<UploadedJob[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [availablePhases, setAvailablePhases] = useState<string[]>([]);
  const selectedPhaseKey = selectedPhases.join("\n");
  const { toast } = useToast();

  // Fetch approved contractors
  const { data: approvedContractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractor-applications"],
    select: (data: any[]) => 
      data
        .filter(contractor => contractor.status === 'approved')
        .map(contractor => ({
          id: contractor.id,
          firstName: contractor.firstName,
          lastName: contractor.lastName,
          email: contractor.email,
          phone: contractor.phone,
          primaryTrade: contractor.primaryTrade
        }))
  });

  // Fetch locations for selected job (additive)
  const { data: jobLocations = [] } = useQuery<JobLocation[]>({
    queryKey: ["/api/jobs", selectedJobId, "locations"],
    queryFn: async () => {
      if (!selectedJobId) return [];
      const res = await fetch(`/api/jobs/${selectedJobId}/locations`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(selectedJobId),
  });

  // Fetch tasks for selected location (additive)
  const { data: locationTasks = [] } = useQuery<JobLocationTask[]>({
    queryKey: ["/api/jobs", selectedJobId, "location-tasks", selectedLocationId],
    queryFn: async () => {
      if (!selectedJobId || !selectedLocationId) return [];
      const res = await fetch(`/api/jobs/${selectedJobId}/location-tasks?locationId=${selectedLocationId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(selectedJobId && selectedLocationId),
  });

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
    // When HBXL job is selected, load available phases from CSV data
    if (selectedHbxlJob) {
      const selectedJob = uploadedJobs.find(job => job.name === selectedHbxlJob);
      
      if (selectedJob) {
        setSelectedJobId(selectedJob.id);
        if (selectedJob.phases && selectedJob.phases.length > 0) {
          setAvailablePhases(selectedJob.phases);
        } else if (selectedJob.phaseData && typeof selectedJob.phaseData === 'object' && selectedJob.phaseData !== null) {
          const phases = Object.keys(selectedJob.phaseData);
          setAvailablePhases(phases);
        } else {
          setAvailablePhases([]);
        }
      } else {
        setSelectedJobId("");
        setAvailablePhases([]);
      }
    } else {
      setSelectedJobId("");
      setSelectedLocationId("");
      setSelectedTaskId("");
      setAvailablePhases([]);
    }
  }, [selectedHbxlJob, uploadedJobs]);

  useEffect(() => {
    const selectedJob = uploadedJobs.find(job => job.name === selectedHbxlJob);
    const dateRange = calculateSelectedPhaseDateRange(selectedJob, selectedPhases);

    if (dateRange.startDate) setStartDate(dateRange.startDate);
    if (dateRange.endDate) setEndDate(dateRange.endDate);
  }, [selectedHbxlJob, selectedPhaseKey]);

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

    if (!workLocation || !selectedHbxlJob) {
      toast({
        title: "Missing Information",
        description: "Please fill in work location and select an HBXL job",
        variant: "destructive"
      });
      return;
    }

    const hasLocations = jobLocations.length > 0;

    // For location-based jobs: require Location and Work Item
    if (hasLocations) {
      if (!selectedLocationId || !selectedTaskId) {
        toast({
          title: "Missing Information",
          description: "Please select both a Location / Room and a Specific Work Item",
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

    const selectedLoc = jobLocations.find(l => l.id === selectedLocationId);
    const isWholePackage = selectedTaskId.startsWith("package:");
    const packageCategoryName = isWholePackage ? selectedTaskId.replace(/^package:/, "") : undefined;
    const selectedTask = !isWholePackage ? locationTasks.find(t => t.id === selectedTaskId) : undefined;
    const workCategory = packageCategoryName || selectedTask?.workCategory || undefined;
    const taskName = packageCategoryName || selectedTask?.taskName || undefined;
    const locationTaskId = isWholePackage ? undefined : (selectedTaskId || undefined);

    try {
      const assignments = [];
      
      // Create assignments for each selected contractor
      for (const contractorId of selectedContractors) {
        const contractor = approvedContractors.find(c => c.id === contractorId);
        if (!contractor) continue;

        const assignment = {
          jobId: selectedJobId || undefined,
          contractorName: `${contractor.firstName} ${contractor.lastName}`,
          email: contractor.email,
          phone: contractor.phone,
          workLocation,
          hbxlJob: selectedHbxlJob,
          buildPhases: selectedPhases,
          locationId: selectedLocationId || undefined,
          locationName: selectedLoc?.name || undefined,
          locationTaskId: locationTaskId,
          workCategory: workCategory,
          taskName: taskName,
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

        // Update task/category status in location tasks
        if (selectedJobId && selectedLocationId && (locationTaskId || workCategory)) {
          try {
            await fetch('/api/assign-worker-task', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: selectedJobId,
                locationId: selectedLocationId,
                taskId: locationTaskId,
                workCategory: workCategory,
                contractorId: contractor.id,
                startDate: assignment.startDate,
                endDate: assignment.endDate,
                specialInstructions: assignment.specialInstructions,
              }),
            });
          } catch (taskErr) {
            console.warn("Could not sync location task assignment status:", taskErr);
          }
        }
      }

      const contractorNames = selectedContractors.map(id => {
        const c = approvedContractors.find(contractor => contractor.id === id);
        return c ? `${c.firstName} ${c.lastName}` : '';
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
      toast({
        title: "Assignment Error",
        description: "Failed to create assignment. Please try again.",
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
                        const contractor = approvedContractors.find(c => c.id === contractorId);
                        if (contractor) {
                          setContractorName(`${contractor.firstName} ${contractor.lastName}`);
                          setEmail(contractor.email);
                          setPhone(contractor.phone);
                        }
                      } else {
                        // For multiple contractors, use combined names
                        const names = newSelected.map(id => {
                          const contractor = approvedContractors.find(c => c.id === id);
                          return contractor ? `${contractor.firstName} ${contractor.lastName}` : '';
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
                  {approvedContractors.map((contractor) => (
                    <option 
                      key={contractor.id} 
                      value={contractor.id}
                      disabled={selectedContractors.includes(contractor.id)}
                    >
                      {contractor.firstName} {contractor.lastName} - {contractor.primaryTrade}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Contractors Display */}
              {selectedContractors.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-slate-400">Selected Contractors:</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedContractors.map((contractorId) => {
                      const contractor = approvedContractors.find(c => c.id === contractorId);
                      if (!contractor) return null;
                      
                      return (
                        <Badge 
                          key={contractorId}
                          className="bg-blue-600 text-white px-3 py-1 flex items-center gap-2"
                        >
                          <span>{contractor.firstName} {contractor.lastName}</span>
                          <span className="text-blue-200 text-xs">({contractor.primaryTrade})</span>
                          <button
                            onClick={() => {
                              const newSelected = selectedContractors.filter(id => id !== contractorId);
                              setSelectedContractors(newSelected);
                              
                              if (newSelected.length === 0) {
                                setContractorName('');
                                setEmail('');
                                setPhone('');
                              } else if (newSelected.length === 1) {
                                const remaining = approvedContractors.find(c => c.id === newSelected[0]);
                                if (remaining) {
                                  setContractorName(`${remaining.firstName} ${remaining.lastName}`);
                                  setEmail(remaining.email);
                                  setPhone(remaining.phone);
                                }
                              } else {
                                const names = newSelected.map(id => {
                                  const contractor = approvedContractors.find(c => c.id === id);
                                  return contractor ? `${contractor.firstName} ${contractor.lastName}` : '';
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
                value={selectedHbxlJob}
                onChange={(e) => {
                  const jobName = e.target.value;
                  console.log('Job selection changed to:', jobName);
                  setSelectedHbxlJob(jobName);
                  setSelectedPhases([]);
                  setSelectedLocationId("");
                  setSelectedTaskId("");
                  
                  if (jobName) {
                    const selectedJob = uploadedJobs.find(job => job.name === jobName);
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
                  <option key={job.id} value={job.name}>
                    {job.name} {job.phaseData ? `(${Object.keys(job.phaseData).length} phases)` : '(No phases)'}
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

            {/* Location & Task Selectors for Location-Based Jobs (Primary Operational Flow) */}
            {selectedJobId && jobLocations.length > 0 && (
              <div className="space-y-4 bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Operational Location & Work Item Assignment
                  </span>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                    {jobLocations.length} Room(s) available
                  </span>
                </div>

                {/* Location / Room Selection */}
                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">
                    Location / Room *
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => {
                      setSelectedLocationId(e.target.value);
                      setSelectedTaskId("");
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                  >
                    <option value="">Select Location / Room...</option>
                    {jobLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.reviewStatus === "REVIEW_REQUIRED" ? "⚠️ (Needs Review)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Work Package / Specific Task Selection */}
                {selectedLocationId && (
                  <div>
                    <label className="block text-yellow-400 text-sm font-medium mb-2">
                      Work Package / Specific Task *
                    </label>
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                    >
                      <option value="">Select Work Package or Specific Task...</option>
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
                            // Pure Work Package without child tasks (e.g. Spencer)
                            const t = tasks[0];
                            return (
                              <option key={t.id} value={t.id}>
                                📁 {catName} (Assignable Work Package) {t.status === "assigned" ? "✓ Assigned" : ""}
                              </option>
                            );
                          }

                          // Work Package with explicit child tasks (e.g. Maureen)
                          const allAssigned = tasks.every((t) => t.status === "assigned");
                          return (
                            <optgroup key={catName} label={`📂 Work Package: ${catName}`}>
                              <option value={`package:${catName}`}>
                                📦 Assign Whole Package: {catName} ({tasks.length} tasks) {allAssigned ? "✓ All Assigned" : ""}
                              </option>
                              {tasks.map((t) => (
                                <option key={t.id} value={t.id}>
                                  &nbsp;&nbsp;• {t.taskName} {t.status === "assigned" ? "(Already Assigned)" : ""}
                                </option>
                              ))}
                            </optgroup>
                          );
                        });
                      })()}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Legacy Build Phases (Fallback ONLY for jobs without Location/Task records) */}
            {selectedHbxlJob && availablePhases.length > 0 && jobLocations.length === 0 && (
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

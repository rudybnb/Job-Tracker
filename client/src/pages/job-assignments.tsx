import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface JobAssignment {
  id: string;
  contractorName: string;
  email: string;
  phone: string;
  workLocation: string;
  hbxlJob: string;
  selectedPhases: string[];
  startDate: string;
  endDate: string;
  specialInstructions: string;
  status: "pending" | "accepted" | "in_progress" | "completed";
  createdAt: string;
}

const hbxlJobs = [
  {
    id: "flat12bedroom-fitout-sg1-1eh",
    name: "Flat12Bedroom - Fitout (SG1 1EH)",
    phases: ["Foundations", "Ground Floor", "Masonry Shell", "Roof Structure", "Electrical", "Plumbing", "General Works"]
  },
  {
    id: "flat21bedroom-fitout-sg1-1eh", 
    name: "Flat21Bedroom - Fitout (SG1 1EH)",
    phases: ["Foundations", "Ground Floor", "Masonry Shell", "Roof Structure", "Electrical", "Plumbing", "General Works"]
  }
];

export default function JobAssignments() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadedJobs, setUploadedJobs] = useState<any[]>([]);
  const [contractors] = useState([
    { id: "1", name: "James Carpenter", email: "james@example.com", phone: "+44 7700 900123", specialty: "Masonry" },
    { id: "2", name: "Mike Builder", email: "mike@example.com", phone: "+44 7700 900124", specialty: "Foundations" },
    { id: "3", name: "Sarah Roofer", email: "sarah@example.com", phone: "+44 7700 900125", specialty: "Roofing" },
    { id: "4", name: "Tony Plumber", email: "tony@example.com", phone: "+44 7700 900126", specialty: "Plumbing" },
    { id: "5", name: "Lisa Electrician", email: "lisa@example.com", phone: "+44 7700 900127", specialty: "Electrical" },
    { id: "6", name: "David Groundwork", email: "david@example.com", phone: "+44 7700 900128", specialty: "Groundwork" },
    { id: "7", name: "Emma Mason", email: "emma@example.com", phone: "+44 7700 900129", specialty: "Masonry" },
    { id: "8", name: "Chris Concrete", email: "chris@example.com", phone: "+44 7700 900130", specialty: "Foundations" }
  ]);
  
  const [formData, setFormData] = useState({
    contractorId: "",
    contractorName: "",
    email: "",
    phone: "",
    workLocation: "",
    hbxlJob: "",
    selectedPhases: [] as string[],
    startDate: "",
    endDate: "",
    specialInstructions: ""
  });

  // Load uploaded jobs from localStorage (in real app, this would come from API)
  useState(() => {
    const savedJobs = localStorage.getItem('uploadedJobs');
    if (savedJobs) {
      setUploadedJobs(JSON.parse(savedJobs));
    }
  });

  const { toast } = useToast();

  const updateFormData = (field: string, value: string | string[]) => {
    setFormData(prev => ({ 
      ...prev, 
      [field]: value,
      // Reset selected phases when job changes
      ...(field === 'hbxlJob' ? { selectedPhases: [] } : {}),
      // Auto-fill contractor details when contractor selected
      ...(field === 'contractorId' ? (() => {
        const contractor = contractors.find(c => c.id === value);
        return contractor ? {
          contractorName: contractor.name,
          email: contractor.email,
          phone: contractor.phone
        } : {};
      })() : {})
    }));
  };

  const togglePhase = (phase: string) => {
    setFormData(prev => ({
      ...prev,
      selectedPhases: prev.selectedPhases.includes(phase)
        ? prev.selectedPhases.filter(p => p !== phase)
        : [...prev.selectedPhases, phase]
    }));
  };

  const selectAllPhases = () => {
    const selectedJob = uploadedJobs.find(job => job.id === formData.hbxlJob);
    if (selectedJob && selectedJob.phaseData) {
      const availablePhases = Object.keys(selectedJob.phaseData);
      setFormData(prev => ({ ...prev, selectedPhases: [...availablePhases] }));
    } else {
      const selectedHbxlJob = hbxlJobs.find(job => job.id === formData.hbxlJob);
      if (selectedHbxlJob) {
        setFormData(prev => ({ ...prev, selectedPhases: [...selectedHbxlJob.phases] }));
      }
    }
  };

  const clearAllPhases = () => {
    setFormData(prev => ({ ...prev, selectedPhases: [] }));
  };

  const handleCreateAssignment = () => {
    if (!formData.contractorId || !formData.workLocation || !formData.hbxlJob || !formData.startDate || !formData.endDate || formData.selectedPhases.length === 0) {
      toast({
        title: "Missing Information", 
        description: "Please select contractor, job, location, dates and at least one phase",
        variant: "destructive"
      });
      return;
    }

    // Generate subtasks based on selected phases and CSV data
    const selectedJob = uploadedJobs.find(job => job.id === formData.hbxlJob);
    const subtasks = formData.selectedPhases.map(phase => {
      return getSubtasksForPhase(phase, selectedJob?.phaseData);
    }).flat().filter(task => task.totalItems > 0); // Only include tasks with quantity > 0

    const newAssignment: JobAssignment & { subtasks?: any[] } = {
      id: Date.now().toString(),
      ...formData,
      subtasks: subtasks,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    setAssignments(prev => [newAssignment, ...prev]);
    setShowCreateForm(false);
    setFormData({
      contractorId: "",
      contractorName: "",
      email: "",
      phone: "",
      workLocation: "",
      hbxlJob: "",
      selectedPhases: [],
      startDate: "",
      endDate: "",
      specialInstructions: ""
    });

    toast({
      title: "Assignment Created Successfully",
      description: `${subtasks.length} subtasks from CSV data assigned to ${formData.contractorName}. Telegram notification sent.`,
    });
  };

  const getSubtasksForPhase = (phase: string, csvPhaseData?: any) => {
    // If we have CSV data, use it; otherwise use default subtasks
    if (csvPhaseData && csvPhaseData[phase]) {
      return csvPhaseData[phase]
        .filter((item: any) => item.quantity > 0) // Only include items with quantity > 0
        .map((item: any) => ({
          title: item.task,
          description: item.description,
          area: phase,
          totalItems: item.quantity,
          completedItems: 0,
          status: "not started" as const,
          code: item.code,
          unit: item.unit
        }));
    }

    // Default fallback subtasks for common phases (only used if no CSV data)
    const defaultSubtasks: Record<string, Array<{title: string, description: string, area: string, totalItems: number}>> = {
      "Masonry Shell": [
        { title: "Masonry Shell - Bricklaying Foundation", description: "Lay foundation bricks and mortar joints", area: "Foundation Area", totalItems: 50 },
        { title: "Masonry Shell - Block Work", description: "Install concrete blocks for walls", area: "Main Structure", totalItems: 120 }
      ],
      "Foundations": [
        { title: "Foundation - Reinforcement", description: "Install rebar and reinforcement", area: "Foundation Area", totalItems: 30 },
        { title: "Foundation - Formwork", description: "Set up concrete forms", area: "Foundation Area", totalItems: 20 }
      ],
      "Roof Structure": [
        { title: "Roof Structure - Timber Frame", description: "Install roof timber framework", area: "Roof Area", totalItems: 40 },
        { title: "Roof Structure - Insulation", description: "Install roof insulation", area: "Roof Area", totalItems: 30 }
      ],
      "General Works": [
        { title: "General - Site Preparation", description: "Prepare site for construction work", area: "Site", totalItems: 10 }
      ]
    };
    
    return (defaultSubtasks[phase] || []).map(task => ({
      ...task,
      completedItems: 0,
      status: "not started" as const
    }));
  };

  const filteredAssignments = assignments.filter(assignment =>
    assignment.contractorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment.hbxlJob.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment.workLocation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yellow-400">Job Assignments</h1>
        <Button 
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
        >
          <i className="fas fa-plus mr-2"></i>
          Create Assignment
        </Button>
      </div>

      <div className="p-4">
        {/* Create Assignment Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-yellow-400 mb-4">Create New Job Assignment</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Select Contractor *</label>
                  <select
                    value={formData.contractorId}
                    onChange={(e) => updateFormData("contractorId", e.target.value)}
                    className="w-full bg-slate-700 border border-yellow-600 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Choose contractor from list (8 available)</option>
                    {contractors.map((contractor) => (
                      <option key={contractor.id} value={contractor.id}>
                        {contractor.name} - {contractor.specialty}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.contractorId && (
                  <div className="bg-slate-700 rounded-lg p-3 border border-slate-600">
                    <h4 className="text-sm font-medium text-yellow-400 mb-2">Selected Contractor Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-400">Name:</span> <span className="text-white">{formData.contractorName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Email:</span> <span className="text-white">{formData.email}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Phone:</span> <span className="text-white">{formData.phone}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Specialty:</span> <span className="text-white">{contractors.find(c => c.id === formData.contractorId)?.specialty}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Work Location (Postcode) *</label>
                  <input
                    type="text"
                    placeholder="DA17 5DB"
                    value={formData.workLocation}
                    onChange={(e) => updateFormData("workLocation", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">HBXL Job *</label>
                  <select
                    value={formData.hbxlJob}
                    onChange={(e) => updateFormData("hbxlJob", e.target.value)}
                    className="w-full bg-slate-700 border border-yellow-600 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select uploaded job (2 available)</option>
                    {uploadedJobs.map(job => (
                      <option key={job.id} value={job.id}>{job.name}</option>
                    ))}
                    {hbxlJobs.map(job => (
                      <option key={job.id} value={job.id}>{job.name}</option>
                    ))}
                  </select>
                </div>

                {/* Phase Selection */}
                {formData.hbxlJob && (
                  <div>
                    <label className="block text-yellow-400 text-sm font-medium mb-3">
                      Select Phases *
                    </label>
                    
                    {/* Job Selection Display */}
                    <div className="mb-3 p-3 bg-yellow-600 text-black rounded-lg flex items-center">
                      <i className="fas fa-check mr-2"></i>
                      <span className="font-medium">
                        {hbxlJobs.find(job => job.id === formData.hbxlJob)?.name}
                      </span>
                    </div>

                    {/* Phase Checkboxes Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {hbxlJobs.find(job => job.id === formData.hbxlJob)?.phases.map(phase => (
                        <label 
                          key={phase}
                          className="flex items-center space-x-2 p-2 bg-slate-700 rounded-lg border border-slate-600 hover:bg-slate-600 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.selectedPhases.includes(phase)}
                            onChange={() => togglePhase(phase)}
                            className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                          />
                          <span className="text-white text-sm">{phase}</span>
                        </label>
                      ))}
                    </div>

                    {/* Selection Status */}
                    <div className="text-slate-400 text-sm mb-3">
                      Selected: {formData.selectedPhases.length} phases from {hbxlJobs.find(job => job.id === formData.hbxlJob)?.name}
                    </div>

                    {/* Select/Clear All Buttons */}
                    <div className="flex space-x-2">
                      <Button 
                        type="button"
                        onClick={selectAllPhases}
                        className="bg-yellow-600 hover:bg-yellow-700 text-black text-sm px-3 py-1"
                        size="sm"
                      >
                        Select All
                      </Button>
                      <Button 
                        type="button"
                        onClick={clearAllPhases}
                        className="bg-slate-600 hover:bg-slate-700 text-white text-sm px-3 py-1"
                        size="sm"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => updateFormData("startDate", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => updateFormData("endDate", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-yellow-400 text-sm font-medium mb-2">Special Instructions</label>
                  <textarea
                    placeholder="Any special instructions for the contractor..."
                    value={formData.specialInstructions}
                    onChange={(e) => updateFormData("specialInstructions", e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white h-20 resize-none"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <Button 
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateAssignment}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  Create Assignment
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Current Assignments Section */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-yellow-400">Current Assignments</h3>
            <input
              type="text"
              placeholder="Search assignments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm w-64"
            />
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-clipboard-list text-slate-500 text-4xl mb-4"></i>
              <p className="text-slate-400">
                {assignments.length === 0 
                  ? "No assignments found. Create your first assignment above."
                  : "No assignments match your search."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAssignments.map((assignment) => (
                <div key={assignment.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-white">
                      {hbxlJobs.find(job => job.id === assignment.hbxlJob)?.name || assignment.hbxlJob}
                    </h4>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      assignment.status === 'pending' ? 'bg-yellow-600 text-black' :
                      assignment.status === 'accepted' ? 'bg-blue-600 text-white' :
                      assignment.status === 'in_progress' ? 'bg-orange-600 text-white' :
                      'bg-green-600 text-white'
                    }`}>
                      {assignment.status.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-400">Contractor:</span>
                      <div className="text-white font-medium">{assignment.contractorName}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Location:</span>
                      <div className="text-white font-medium">{assignment.workLocation}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Start Date:</span>
                      <div className="text-white font-medium">{assignment.startDate}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">End Date:</span>
                      <div className="text-white font-medium">{assignment.endDate}</div>
                    </div>
                  </div>

                  {/* Selected Phases */}
                  {assignment.selectedPhases.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-600">
                      <span className="text-slate-400 text-sm">Assigned Phases:</span>
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {assignment.selectedPhases.map(phase => (
                          <div key={phase} className="bg-slate-600 rounded px-2 py-1 text-xs text-white">
                            <i className="fas fa-check text-green-400 mr-1"></i>
                            {phase}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {assignment.specialInstructions && (
                    <div className="mt-3 pt-3 border-t border-slate-600">
                      <span className="text-slate-400 text-sm">Special Instructions:</span>
                      <p className="text-white text-sm mt-1">{assignment.specialInstructions}</p>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-600 flex items-center justify-between">
                    <span className="text-slate-500 text-xs">
                      Created: {new Date(assignment.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex space-x-2">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                        <i className="fab fa-telegram-plane mr-1"></i>
                        Resend
                      </Button>
                      <Button size="sm" className="bg-slate-600 hover:bg-slate-700 text-white">
                        <i className="fas fa-edit mr-1"></i>
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            onClick={() => window.location.href = '/jobs'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button className="py-3 px-4 text-yellow-400">
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-upload block mb-1"></i>
            <span className="text-xs">Upload Job</span>
          </button>
        </div>
      </div>
      
      {/* Add bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}
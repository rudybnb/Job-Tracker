import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
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
  phaseData?: any[];
  clientInfo?: {
    name: string;
    address: string;
    postCode: string;
    projectType: string;
  };
}

export default function CreateAssignment() {
  const [contractorName, setContractorName] = useState("James");
  const [email, setEmail] = useState("james@gmail.com");
  const [phone, setPhone] = useState("07534251548");
  const [workLocation, setWorkLocation] = useState("DA17 5DB");
  const [selectedHbxlJob, setSelectedHbxlJob] = useState("");
  const [startDate, setStartDate] = useState("06/08/2025");
  const [endDate, setEndDate] = useState("13/08/2025");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [uploadedJobs, setUploadedJobs] = useState<UploadedJob[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [availablePhases, setAvailablePhases] = useState<string[]>([]);
  const { toast } = useToast();

  // Dynamic build phases will be loaded from CSV data

  useEffect(() => {
    // Load uploaded jobs from localStorage
    const savedJobs = localStorage.getItem('uploadedJobs');
    if (savedJobs) {
      const jobs = JSON.parse(savedJobs);
      setUploadedJobs(jobs);
      console.log('Loaded jobs for assignment:', jobs);
    }
  }, []);

  useEffect(() => {
    // When HBXL job is selected, load available phases from CSV data
    if (selectedHbxlJob) {
      console.log('=== PHASE EXTRACTION DEBUG ===');
      console.log('Selected HBXL Job:', selectedHbxlJob);
      console.log('All uploaded jobs:', uploadedJobs);
      
      const selectedJob = uploadedJobs.find(job => job.name === selectedHbxlJob);
      console.log('Found selected job:', selectedJob);
      
      if (selectedJob) {
        console.log('Job phase data exists:', !!selectedJob.phaseData);
        console.log('Phase data type:', typeof selectedJob.phaseData);
        console.log('Phase data content:', selectedJob.phaseData);
        
        if (selectedJob.phaseData && typeof selectedJob.phaseData === 'object' && selectedJob.phaseData !== null) {
          const phases = Object.keys(selectedJob.phaseData);
          setAvailablePhases(phases);
          console.log('✓ Extracted phases:', phases);
        } else {
          console.log('❌ Phase data invalid or missing');
          console.log('Selected job structure:', JSON.stringify(selectedJob, null, 2));
          setAvailablePhases([]);
        }
      } else {
        console.log('❌ No job found with name:', selectedHbxlJob);
        setAvailablePhases([]);
      }
      console.log('=== END DEBUG ===');
    } else {
      setAvailablePhases([]);
    }
  }, [selectedHbxlJob, uploadedJobs]);

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

  const handleCreateAssignment = () => {
    // Validate required fields
    if (!contractorName || !email || !workLocation || !selectedHbxlJob) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (selectedPhases.length === 0) {
      toast({
        title: "No Phases Selected",
        description: "Please select at least one build phase",
        variant: "destructive"
      });
      return;
    }

    // Create assignment object
    const assignment = {
      id: Date.now().toString(),
      contractorName,
      email,
      phone,
      workLocation,
      hbxlJob: selectedHbxlJob,
      buildPhases: selectedPhases,
      startDate,
      endDate,
      specialInstructions,
      status: "assigned",
      createdAt: new Date().toLocaleDateString('en-GB')
    };

    // Save assignment
    const existingAssignments = localStorage.getItem('jobAssignments');
    const assignments = existingAssignments ? JSON.parse(existingAssignments) : [];
    assignments.push(assignment);
    localStorage.setItem('jobAssignments', JSON.stringify(assignments));

    console.log('Created assignment:', assignment);

    // Simulate Telegram notification
    toast({
      title: "Assignment Created",
      description: `Job assigned to ${contractorName}. Telegram notification sent.`,
    });

    // Navigate back to job assignments
    setTimeout(() => {
      window.location.href = '/job-assignments';
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
            <span className="text-black font-bold text-sm">Pro</span>
          </div>
          <div>
            <div className="text-sm font-medium">Pro</div>
            <div className="text-xs text-slate-400">Simple Time Tracking</div>
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
            {/* Contractor Name */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Contractor Name *
              </label>
              <input
                type="text"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                placeholder="Enter contractor name"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                placeholder="Enter email address"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-yellow-400 text-sm font-medium mb-2">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                placeholder="Enter phone number"
              />
            </div>

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
                onChange={(e) => setSelectedHbxlJob(e.target.value)}
                className="w-full bg-slate-700 border border-yellow-500 rounded-lg px-4 py-3 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
              >
                <option value="">Select HBXL job</option>
                {uploadedJobs.map((job) => (
                  <option key={job.id} value={job.name}>
                    {job.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Build Phases */}
            {selectedHbxlJob && (
              <div>
                <label className="block text-yellow-400 text-sm font-medium mb-2">
                  Build Phases
                </label>
                
                <div className="mb-4">
                  <div className="flex space-x-4">
                    <button
                      onClick={handleSelectAllPhases}
                      className="text-yellow-400 text-sm hover:text-yellow-300"
                    >
                      Select All
                    </button>
                    <button
                      onClick={handleClearAllPhases}
                      className="text-yellow-400 text-sm hover:text-yellow-300"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {availablePhases.length > 0 ? (
                    availablePhases.map((phase) => (
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
                    ))
                  ) : (
                    <div className="col-span-2 text-slate-400 text-sm text-center py-4">
                      Loading phases from CSV data...
                    </div>
                  )}
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
                onClick={() => window.location.href = '/job-assignments'}
                variant="outline"
                className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                Cancel
              </Button>
              <Button
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
            onClick={() => window.location.href = '/admin-task-monitor'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
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
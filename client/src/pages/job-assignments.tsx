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

export default function JobAssignments() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadedJobs, setUploadedJobs] = useState<any[]>([]);
  const { toast } = useToast();

  // Load uploaded jobs from localStorage on component mount
  useEffect(() => {
    const savedJobs = localStorage.getItem('uploadedJobs');
    if (savedJobs) {
      const jobs = JSON.parse(savedJobs);
      setUploadedJobs(jobs);
      console.log('Loaded uploaded jobs:', jobs);
    }
  }, []);

  const handleCreateAssignment = () => {
    // Check if there are uploaded jobs available
    const savedJobs = localStorage.getItem('uploadedJobs');
    const processedCSVs = localStorage.getItem('processedCSVs');
    
    if (savedJobs && JSON.parse(savedJobs).length > 0) {
      // Navigate to a job assignment creation page or show modal
      toast({
        title: "Create Assignment",
        description: `${JSON.parse(savedJobs).length} uploaded jobs available for assignment`,
      });
      // Could navigate to a specific assignment creation page here
    } else if (processedCSVs && JSON.parse(processedCSVs).length > 0) {
      toast({
        title: "Jobs Need Creation",
        description: "Upload data found. Please create jobs first in Upload page",
        variant: "destructive"
      });
    } else {
      toast({
        title: "No Data Available",
        description: "Please upload CSV files and create jobs first",
        variant: "destructive"
      });
    }
  };

  const filteredAssignments = assignments.filter(assignment =>
    assignment?.contractorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment?.hbxlJob?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment?.workLocation?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            onClick={() => window.location.href = '/create-assignment'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center"
          >
            <i className="fas fa-plus mr-2"></i>
            Create Assignment
          </Button>
        </div>

        {/* Current Assignments Section */}
        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-xl font-semibold text-yellow-400">Current Assignments</h2>
          </div>
          
          <div className="p-4">
            {/* Search Box */}
            <div className="mb-6">
              <input
                type="text"
                placeholder="Search assignments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
              />
            </div>

            {/* Show available jobs for assignment or empty state */}
            {uploadedJobs.length > 0 ? (
              <div className="space-y-4">
                <div className="text-sm text-green-400 mb-4">
                  {uploadedJobs.length} uploaded job(s) available for assignment
                </div>
                
                {uploadedJobs.map((job) => (
                  <div key={job.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-white font-medium">{job.name}</h4>
                        <p className="text-slate-400 text-sm">{job.location}</p>
                        <p className="text-slate-500 text-xs">Uploaded: {job.uploadedAt}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          job.status === 'approved' ? 'bg-green-900 text-green-300' : 
                          'bg-yellow-900 text-yellow-300'
                        }`}>
                          {job.status}
                        </span>
                        <button 
                          onClick={() => toast({ 
                            title: "Assign Job", 
                            description: `Assigning ${job.name} to contractor` 
                          })}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-slate-400 text-lg mb-2">
                  No jobs available for assignment.
                </div>
                <div className="text-slate-500 text-sm">
                  Upload CSV files and create jobs first.
                </div>
              </div>
            )}
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
          <button className="py-3 px-4 text-yellow-400">
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
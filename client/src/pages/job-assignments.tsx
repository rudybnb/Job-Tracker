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
  const { toast } = useToast();

  // Load actual job assignments (jobs assigned to contractors) from localStorage
  useEffect(() => {
    const savedAssignments = localStorage.getItem('jobAssignments');
    if (savedAssignments) {
      const assignmentData = JSON.parse(savedAssignments);
      setAssignments(assignmentData);
      console.log('Loaded job assignments:', assignmentData);
    }
  }, []);

  const handleDeleteAssignment = (index: number) => {
    const updatedAssignments = assignments.filter((_, i) => i !== index);
    setAssignments(updatedAssignments);
    localStorage.setItem('jobAssignments', JSON.stringify(updatedAssignments));
    toast({
      title: "Assignment Deleted",
      description: "Job assignment has been removed successfully.",
    });
  };

  // Filter assignments based on search term
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

            {/* Assignment Cards - Show only actual assignments to contractors */}
            {filteredAssignments && filteredAssignments.length > 0 ? (
              <div className="space-y-4">
                {filteredAssignments.map((assignment: any, index: number) => (
                  <div 
                    key={index}
                    className="bg-slate-700 rounded-lg p-4 border border-slate-600"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                          <i className="fas fa-briefcase text-white text-lg"></i>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            {assignment.hbxlJob || 'Job Assignment'}
                          </h3>
                          <p className="text-sm text-slate-400">
                            Assigned to: {assignment.contractorName || 'Unknown'}
                          </p>
                          <p className="text-sm text-slate-400">
                            Location: {assignment.workLocation || 'No location specified'}
                          </p>
                          {assignment.buildPhases && Array.isArray(assignment.buildPhases) && assignment.buildPhases.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-slate-500">Build Phases:</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {assignment.buildPhases.map((phase: string, idx: number) => (
                                  <span 
                                    key={idx}
                                    className="bg-blue-600 text-white text-xs px-2 py-1 rounded"
                                  >
                                    {phase}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex items-center space-x-2">
                        <div>
                          <div className="text-sm text-slate-400">Phases</div>
                          <div className="text-blue-400 font-medium">
                            {assignment.buildPhases && Array.isArray(assignment.buildPhases) 
                              ? `${assignment.buildPhases.length} phases`
                              : '0 phases'
                            }
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-400">Status</div>
                          <div className="text-green-400 font-medium">Assigned</div>
                        </div>
                        <button
                          onClick={() => handleDeleteAssignment(index)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete Assignment"
                        >
                          <i className="fas fa-trash text-sm"></i>
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-slate-400">Start Date</div>
                        <div className="text-white">{assignment.startDate || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">End Date</div>
                        <div className="text-white">{assignment.endDate || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Build Phases</div>
                        <div className="text-white">
                          {assignment.buildPhases && Array.isArray(assignment.buildPhases) 
                            ? `${assignment.buildPhases.length} phases`
                            : '0 phases'
                          }
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Contact</div>
                        <div className="text-white">{assignment.contractorEmail || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-slate-400 text-lg mb-2">
                  No job assignments found.
                </div>
                <div className="text-slate-500 text-sm">
                  Use "Create Assignment" to assign jobs to contractors.
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
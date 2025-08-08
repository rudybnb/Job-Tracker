import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ContractorAssignment {
  id: string;
  contractorName: string;
  location: string;
  title: string;
  phases: string;
  startDate: string;
  dueDate: string;
  status: string;
  createdAt: string;
}

export default function Jobs() {
  // Get contractor assignments from database
  const { data: assignments = [], isLoading } = useQuery<ContractorAssignment[]>({
    queryKey: ['/api/contractor-assignments/James'],
    enabled: true,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading assignments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Direct Job Assignments</h1>
            <p className="text-slate-400 text-sm">Jobs are assigned to you directly</p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {assignments.length === 0 ? (
          /* Empty State */
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
            <div className="w-24 h-24 mx-auto mb-6 text-slate-500">
              <i className="fas fa-briefcase text-6xl"></i>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Assignments</h3>
            <p className="text-slate-400 mb-6">You don't have any job assignments yet.</p>
          </div>
        ) : (
          /* Assignments List */
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                      <i className="fas fa-briefcase text-white"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-yellow-400">{assignment.title}</h3>
                      <p className="text-slate-400 text-sm">Location: {assignment.location}</p>
                      <p className="text-slate-400 text-xs">
                        {assignment.startDate} → {assignment.dueDate}
                      </p>
                    </div>
                  </div>
                  <Badge className={`text-xs px-3 py-1 ${
                    assignment.status === 'assigned' 
                      ? 'bg-yellow-500 text-black' 
                      : assignment.status === 'completed'
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-500 text-white'
                  }`}>
                    {assignment.status}
                  </Badge>
                </div>
                
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center text-slate-300">
                    <i className="fas fa-user text-slate-400 mr-2 w-4"></i>
                    <span>Assigned to: James</span>
                  </div>
                  <div className="flex items-center text-slate-300">
                    <i className="fas fa-clock text-slate-400 mr-2 w-4"></i>
                    <span>{assignment.startDate} - {assignment.dueDate}</span>
                  </div>
                  {assignment.phases && (
                    <div className="flex items-start text-slate-300">
                      <i className="fas fa-tasks text-slate-400 mr-2 w-4 mt-0.5"></i>
                      <div className="flex flex-wrap gap-1">
                        {JSON.parse(assignment.phases).map((phase: string, idx: number) => (
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
                
                <div className="flex space-x-2">
                  <Button 
                    size="sm" 
                    className="bg-yellow-600 hover:bg-yellow-700 text-black flex-1"
                    onClick={() => window.location.href = '/task-progress'}
                  >
                    Continue Work
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-red-600 hover:bg-red-700 text-white px-4"
                  >
                    <i className="fas fa-exclamation-triangle mr-1"></i>
                    Report Issue
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-3 text-center">
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
            onClick={() => window.location.href = '/more'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-ellipsis-h block mb-1"></i>
            <span className="text-xs">More</span>
          </button>
        </div>
      </div>
      
      {/* Add bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AssignmentDetails {
  id: string;
  title: string;
  description: string | null;
  location: string;
  status: string;
  contractorName: string;
  contractorId: string;
  phases: string;
  startDate: string;
  dueDate: string;
  notes: string | null;
  telegramNotified: string;
  createdAt: string;
}

interface TaskProgress {
  phase: string;
  completed: boolean;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export default function AssignmentDetails() {
  const params = useParams();
  const assignmentId = params.id;

  // Get assignment details
  const { data: assignment, isLoading } = useQuery<AssignmentDetails>({
    queryKey: [`/api/job-assignments/${assignmentId}`],
    enabled: !!assignmentId,
  });

  // Mock progress data for now - this would come from database
  const taskProgress: TaskProgress[] = assignment?.phases ? 
    JSON.parse(assignment.phases).map((phase: string) => ({
      phase,
      completed: false,
      startTime: undefined,
      endTime: undefined,
      notes: ''
    })) : [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading assignment details...</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Assignment Not Found</h1>
          <p className="text-slate-400 mb-4">The assignment you're looking for doesn't exist.</p>
          <Button onClick={() => window.location.href = '/job-assignments'}>
            Back to Assignments
          </Button>
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
            <button 
              onClick={() => window.location.href = '/job-assignments'}
              className="text-slate-400 hover:text-white mb-2"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Back to Assignments
            </button>
            <h1 className="text-xl font-bold text-white mb-1">{assignment.title}</h1>
            <p className="text-slate-400 text-sm">Assignment Progress Tracking</p>
          </div>
          <Badge className={`${
            assignment.status === 'assigned' 
              ? 'bg-yellow-500 text-black' 
              : assignment.status === 'completed'
              ? 'bg-green-500 text-white'
              : 'bg-slate-500 text-white'
          }`}>
            {assignment.status}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Assignment Overview */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-yellow-400 mb-4">Assignment Overview</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs text-slate-400">Contractor</div>
              <div className="text-white">{assignment.contractorName}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Location</div>
              <div className="text-white">{assignment.location}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Start Date</div>
              <div className="text-white">{assignment.startDate}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Due Date</div>
              <div className="text-white">{assignment.dueDate}</div>
            </div>
          </div>

          {assignment.description && (
            <div className="mb-4">
              <div className="text-xs text-slate-400">Description</div>
              <div className="text-white">{assignment.description}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400">Telegram Notification</div>
              <div className="text-white">
                {assignment.telegramNotified === 'true' ? (
                  <span className="text-green-400">✓ Sent</span>
                ) : (
                  <span className="text-red-400">Not sent</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Created</div>
              <div className="text-white">{new Date(assignment.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* Progress Tracking */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-yellow-400">Build Phases Progress</h2>
            <div className="text-sm text-slate-400">
              {taskProgress.filter(task => task.completed).length} of {taskProgress.length} completed
            </div>
          </div>

          <div className="space-y-3">
            {taskProgress.map((task, index) => (
              <div key={index} className="bg-slate-700 rounded-lg p-3 border border-slate-600">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      task.completed 
                        ? 'bg-green-600 text-white' 
                        : 'bg-slate-600 text-slate-400'
                    }`}>
                      {task.completed ? (
                        <i className="fas fa-check text-xs"></i>
                      ) : (
                        <span className="text-xs">{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{task.phase}</h3>
                      {task.startTime && (
                        <p className="text-xs text-slate-400">
                          Started: {new Date(task.startTime).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className={`text-xs ${
                    task.completed 
                      ? 'bg-green-600 text-white' 
                      : 'bg-slate-600 text-slate-300'
                  }`}>
                    {task.completed ? 'Completed' : 'Pending'}
                  </Badge>
                </div>

                {task.endTime && (
                  <div className="text-xs text-slate-400 ml-9">
                    Completed: {new Date(task.endTime).toLocaleString()}
                  </div>
                )}

                {task.notes && (
                  <div className="ml-9 mt-2">
                    <div className="text-xs text-slate-400">Notes:</div>
                    <div className="text-sm text-slate-300">{task.notes}</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-600">
            <div className="flex space-x-3">
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                onClick={() => window.location.href = `/task-progress?assignment=${assignment.id}`}
              >
                <i className="fas fa-play mr-2"></i>
                Start/Continue Work
              </Button>
              <Button 
                className="bg-slate-600 hover:bg-slate-700 text-white px-4"
                onClick={() => window.location.href = `/assignment-edit/${assignment.id}`}
              >
                <i className="fas fa-edit mr-2"></i>
                Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Notes Section */}
        {assignment.notes && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h2 className="text-lg font-semibold text-yellow-400 mb-3">Assignment Notes</h2>
            <div className="text-slate-300">{assignment.notes}</div>
          </div>
        )}
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
            <i className="fas fa-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-upload block mb-1"></i>
            <span className="text-xs">Upload</span>
          </button>
        </div>
      </div>
      
      {/* Add bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}
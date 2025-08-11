import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Clock, User, Phone, Briefcase } from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";

interface AssignmentDetails {
  id: string;
  contractorName: string;
  email: string;
  phone: string;
  workLocation: string;
  hbxlJob: string;
  buildPhases: string[];
  startDate: string;
  endDate: string;
  specialInstructions: string;
  status: string;
  sendTelegramNotification: boolean;
  latitude: string;
  longitude: string;
  createdAt: string;
  updatedAt: string;
}

interface ContractorReport {
  id: string;
  contractorName: string;
  assignmentId: string;
  reportText: string;
  submitTime: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

// Sub-Tasks Progress Component
function SubTasksProgress({ assignment }: { assignment: AssignmentDetails }) {
  const [jobTasks, setJobTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNoteModal, setShowNoteModal] = useState<string | null>(null);
  const [taskNote, setTaskNote] = useState("");
  const [taskProgress, setTaskProgress] = useState<{[key: string]: number}>({});
  
  // Check if current user is admin
  const userRole = localStorage.getItem('userRole');
  const currentUser = localStorage.getItem('currentUser');
  const isAdmin = userRole === 'admin';
  console.log('🔐 SubTasks Admin check - userRole:', userRole, 'currentUser:', currentUser, 'isAdmin:', isAdmin);

  const markTaskComplete = (taskId: string) => {
    setTaskProgress(prev => ({
      ...prev,
      [taskId]: 100
    }));
    console.log(`✓ Task ${taskId} marked as 100% complete by contractor`);
  };

  const approveTask = (taskId: string) => {
    console.log(`✓ Task ${taskId} approved by admin`);
    alert('Task approved! This functionality will be expanded with database integration.');
  };

  useEffect(() => {
    const fetchJobTasks = async () => {
      try {
        console.log('📋 Extracting ONLY authentic CSV task data...');
        const response = await fetch('/api/uploaded-jobs');
        const jobs = await response.json();
        
        console.log('🔍 Available jobs:', jobs.map((j: any) => ({
          id: j.id,
          title: j.name,
          uploadId: j.uploadId,
          phaseDataValue: j.phaseData,
          phaseTaskDataValue: j.phaseTaskData,
          hasPhaseData: !!j.phaseData,
          hasTaskData: !!j.phaseTaskData
        })));
        
        console.log('🔍 Assignment hbxlJob for matching:', assignment.hbxlJob);

        // Find matching job by title/name
        const matchingJob = jobs.find((job: any) => 
          job.name && (
            job.name.toLowerCase().includes(assignment.hbxlJob?.toLowerCase() || '') ||
            assignment.hbxlJob?.toLowerCase().includes(job.name.toLowerCase()) ||
            job.name === assignment.hbxlJob
          )
        );

        console.log('🎯 Selected job:', matchingJob ? {
          id: matchingJob.id,
          title: matchingJob.name,
          hasPhaseData: !!matchingJob.phaseData,
          hasTaskData: !!matchingJob.phaseTaskData
        } : 'No matching job found');

        // Try both phaseData and phaseTaskData fields
        const taskDataSource = matchingJob?.phaseData || matchingJob?.phaseTaskData;
        if (taskDataSource) {
          console.log('✅ Returning authentic CSV data only - no assumptions made');
          const phaseTaskData = typeof taskDataSource === 'string' ? JSON.parse(taskDataSource) : taskDataSource;
          
          // Convert to flat task list with proper IDs
          const taskList: any[] = [];
          Object.entries(phaseTaskData).forEach(([phase, tasks]: [string, any]) => {
            if (Array.isArray(tasks)) {
              tasks.forEach((task, index) => {
                taskList.push({
                  id: `${phase}-${index}`,
                  phase,
                  description: task.description || task.task || 'Task details not available',
                  quantity: task.quantity || 1,
                  task: task.task || task.description || 'Task details not available'
                });
              });
            }
          });
          
          setJobTasks(taskList);
        } else {
          console.log('❌ No authentic task data found - showing empty state');
          setJobTasks([]);
        }
        setLoading(false);
      } catch (error) {
        console.error('❌ Error fetching job tasks:', error);
        setJobTasks([]);
        setLoading(false);
      }
    };

    fetchJobTasks();
  }, [assignment]);

  // Save quick note for task
  const saveTaskNote = async (taskId: string) => {
    if (!taskNote.trim()) return;
    
    try {
      const reportData = {
        contractorName: assignment.contractorName,
        assignmentId: assignment.id,
        reportText: `Task Note - ${taskId}: ${taskNote}`
      };
      
      await apiRequest("POST", "/api/contractor-reports", reportData);
      setTaskNote("");
      setShowNoteModal(null);
      console.log("✅ Task note saved");
    } catch (error) {
      console.error("❌ Error saving task note:", error);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h2 className="text-lg font-semibold text-yellow-400 mb-4">🔧 Sub-Tasks Progress</h2>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
        🔧 Sub-Tasks Progress
      </h2>
      
      {jobTasks.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-slate-400 text-4xl mb-4">📋</div>
          <p className="text-slate-400 text-sm">Data Missing from CSV</p>
          <p className="text-slate-500 text-xs mt-1">No task breakdown available in uploaded job data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(
            jobTasks.reduce((acc: any, task) => {
              if (!acc[task.phase]) acc[task.phase] = [];
              acc[task.phase].push(task);
              return acc;
            }, {})
          ).map(([phase, phaseTasks]: [string, any]) => {
            return (
              <div key={phase} className="border border-slate-600 rounded-lg p-3">
                <h3 className="text-white font-semibold mb-2 border-b border-slate-600 pb-1">
                  {phase} ({phaseTasks.length} tasks)
                </h3>
                <div className="space-y-1">
                  {phaseTasks.map((task: any) => {
                    const progress = taskProgress[task.id] || 0;
                    const isCompleted = progress === 100;
                    
                    return (
                      <div key={task.id} className="bg-slate-700 rounded p-2 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-white">{task.description}</div>
                          <div className="text-slate-400 text-xs">Qty: {task.quantity}</div>
                          
                          {/* Progress Bar */}
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-slate-400">Progress</span>
                              <span className={progress === 100 ? "text-green-400" : "text-yellow-400"}>
                                {progress}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-600 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full transition-all duration-300 ${
                                  progress === 100 ? 'bg-green-500' : 'bg-yellow-500'
                                }`}
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                        <Badge className={`text-xs ml-2 ${
                          isCompleted ? 'bg-green-600 text-white' : 'bg-slate-600 text-slate-300'
                        }`}>
                          {isCompleted ? 'Completed' : 'In Progress'}
                        </Badge>
                      </div>
                      
                      {/* Contractor Action - Mark Complete */}
                      {!isAdmin && !isCompleted && (
                        <div className="flex gap-2 pt-2 border-t border-slate-600">
                          <Button
                            size="sm"
                            onClick={() => markTaskComplete(task.id)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 h-6"
                          >
                            ✓ Mark Complete
                          </Button>
                        </div>
                      )}
                      
                      {/* Admin Action Buttons - Only show for 100% completed tasks */}
                      {isAdmin && isCompleted && (
                        <div className="flex gap-2 pt-2 border-t border-slate-600">
                          <Button
                            size="sm"
                            onClick={() => setShowNoteModal(task.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 h-6"
                          >
                            📝 Note
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => alert('Photo capture coming soon')}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 h-6"
                          >
                            📷 Photo
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => approveTask(task.id)}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 py-1 h-6"
                          >
                            ✓ Approve
                          </Button>
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Quick Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-600 w-96">
            <h3 className="text-yellow-400 font-semibold mb-4">Add Task Note</h3>
            <textarea
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-400 focus:border-yellow-500 resize-none"
              rows={4}
              placeholder="Enter quick note for this task..."
              value={taskNote}
              onChange={(e) => setTaskNote(e.target.value)}
            />
            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => saveTaskNote(showNoteModal)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!taskNote.trim()}
              >
                Save Note
              </Button>
              <Button
                onClick={() => {
                  setShowNoteModal(null);
                  setTaskNote("");
                }}
                className="bg-slate-600 hover:bg-slate-700 text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssignmentDetails() {
  // Try both route patterns - admin route and contractor route
  const [, adminParams] = useRoute("/assignment-details/:id");
  const [, contractorParams] = useRoute("/assignment/:id");
  const assignmentId = adminParams?.id || contractorParams?.id;

  const [reportText, setReportText] = useState("");
  const [showQuickReport, setShowQuickReport] = useState(false);

  // Fetch assignment details
  const { data: assignment, isLoading: assignmentLoading } = useQuery<AssignmentDetails>({
    queryKey: ["/api/job-assignments", assignmentId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!assignmentId,
  });

  // Create contractor report mutation
  const createReportMutation = useMutation({
    mutationFn: async (data: { contractorName: string; assignmentId: string; reportText: string }) => {
      const response = await apiRequest("POST", "/api/contractor-reports", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-reports"] });
      setReportText("");
      setShowQuickReport(false);
    },
  });

  // Check if current user is admin
  const userRole = localStorage.getItem('userRole');
  const currentUser = localStorage.getItem('currentUser');
  const isAdmin = userRole === 'admin';
  console.log('🔐 Main Admin check - userRole:', userRole, 'currentUser:', currentUser, 'isAdmin:', isAdmin);

  if (assignmentLoading) {
    return (
      <div className="min-h-screen bg-slate-900 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/2"></div>
          <div className="h-32 bg-slate-700 rounded"></div>
          <div className="h-64 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl text-white mb-2">Assignment Not Found</h1>
          <p className="text-slate-400 mb-4">The requested assignment could not be found.</p>
          <Button onClick={() => window.history.back()} className="bg-blue-600 hover:bg-blue-700">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => window.history.back()}
              size="sm"
              className="bg-slate-700 hover:bg-slate-600 text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-yellow-400">
                {assignment.hbxlJob}
              </h1>
              <p className="text-slate-400 text-sm">Assignment Details</p>
            </div>
          </div>
          <Badge className="bg-blue-600 text-white">
            {assignment.status}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Assignment Overview */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
            📋 Assignment Overview
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-blue-400" />
                <span className="text-slate-400 text-sm">Contractor:</span>
                <span className="text-white text-sm">{assignment.contractorName}</span>
              </div>
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-green-400" />
                <span className="text-slate-400 text-sm">Location:</span>
                <span className="text-white text-sm">{assignment.workLocation}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-slate-400 text-sm">Start Date:</span>
                <span className="text-white text-sm">{assignment.startDate}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-purple-400" />
                <span className="text-slate-400 text-sm">Status:</span>
                <Badge className="bg-blue-600 text-white text-xs">
                  {assignment.status}
                </Badge>
              </div>
              {assignment.contactName && (
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-orange-400" />
                  <span className="text-slate-400 text-sm">Contact:</span>
                  <span className="text-white text-sm">{assignment.contactName}</span>
                </div>
              )}
              {assignment.contactPhone && (
                <div className="flex items-center space-x-2">
                  <Phone className="w-4 h-4 text-green-400" />
                  <span className="text-slate-400 text-sm">Phone:</span>
                  <span className="text-white text-sm">{assignment.contactPhone}</span>
                </div>
              )}
            </div>
          </div>
          
          {assignment.description && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <h3 className="text-white font-medium mb-2">Description</h3>
              <p className="text-slate-300 text-sm">{assignment.description}</p>
            </div>
          )}
        </div>

        {/* Sub-Tasks Progress */}
        <SubTasksProgress assignment={assignment} />

        {/* Contractor Quick Report (Contractors Only) */}
        {!isAdmin && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
              📝 Quick Report
            </h2>
            
            {!showQuickReport ? (
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-4">
                  Need to report an issue or update?
                </p>
                <Button 
                  onClick={() => setShowQuickReport(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Send Quick Report
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <textarea
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-none"
                  rows={4}
                  placeholder="Describe any issues, progress updates, or questions..."
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />
                
                <div className="flex space-x-3">
                  <Button 
                    onClick={() => {
                      if (reportText.trim() && assignment) {
                        createReportMutation.mutate({
                          contractorName: assignment.contractorName,
                          assignmentId: assignment.id,
                          reportText: reportText.trim()
                        });
                      }
                    }}
                    disabled={!reportText.trim() || createReportMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white flex-1"
                  >
                    {createReportMutation.isPending ? "Sending..." : "Send Report"}
                  </Button>
                  <Button 
                    onClick={() => {
                      setShowQuickReport(false);
                      setReportText("");
                    }}
                    className="bg-slate-600 hover:bg-slate-500 text-white"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Simplified Admin Reporting System */}
        {isAdmin && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
              📝 Admin Task Reporting
            </h2>
            
            <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="text-blue-400 text-xl">💡</div>
                <div>
                  <h3 className="text-blue-300 font-semibold mb-2">New Task-Based Reporting</h3>
                  <p className="text-blue-200 text-sm mb-2">
                    Use the task-level buttons above to add quick notes and photos for each specific task.
                  </p>
                  <ul className="text-blue-200 text-xs space-y-1">
                    <li>• 📝 Note button: Add quick observations per task</li>
                    <li>• 📷 Photo button: Capture evidence per task (coming soon)</li>
                    <li>• More efficient than complex forms</li>
                  </ul>
                </div>
              </div>
            </div>
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
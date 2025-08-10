import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
// Data integrity handled at API level

interface ProgressTask {
  id: string;
  title: string;
  description: string;
  area: string;
  totalItems: number;
  completedItems: number;
  status: "not started" | "in progress" | "completed";
}

export default function TaskProgress() {
  // Get contractor assignments (since we have assignments for James)
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["/api/contractor-assignments/James"],
  });

  // Get the first (active) assignment
  const activeAssignment = (assignments as any[])[0];
  
  // Update current project based on assignment data
  const [currentProject, setCurrentProject] = useState("Loading...");

  // Update project title when assignment is loaded
  useEffect(() => {
    if (activeAssignment) {
      setCurrentProject(`${activeAssignment.hbxlJob} - ${activeAssignment.workLocation}`);
    } else {
      setCurrentProject("No Active Assignment");
    }
  }, [activeAssignment]);
  // Initialize tasks as empty - will be populated from actual job assignment data
  const [tasks, setTasks] = useState<ProgressTask[]>([]);

  // Clear any old static task data when component loads  
  useEffect(() => {
    // Clear old static task data from localStorage
    const keysToRemove = ['task_progress_default', 'task_progress_DA17 5DB'];
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Clear old task data - integrity enforced at API level
    console.log('🧹 Cleared stale task data');
  }, []);

  // Load saved progress and update tasks when assignment is loaded
  useEffect(() => {
    if (!activeAssignment || !activeAssignment.buildPhases) return;
    
    const loadTasksFromCSV = async () => {
      const storageKey = `task_progress_${activeAssignment.id}`;
      const savedProgress = localStorage.getItem(storageKey);
      
      // Fetch the actual CSV job data to get real task items
      let newTasks: ProgressTask[] = [];
      
      try {
        // Get the uploaded jobs data that contains CSV task items
        const jobsResponse = await fetch('/api/uploaded-jobs');
        const uploadedJobs = await jobsResponse.json();
        
        // Find the job that matches this assignment
        const matchingJob = uploadedJobs.find((job: any) => 
          job.name === activeAssignment.hbxlJob || 
          job.name.includes(activeAssignment.hbxlJob.split(' - ')[0])
        );
        
        if (matchingJob && matchingJob.phaseTaskDataValue) {
          let taskId = 1;
          
          // Parse the correct phase task data 
          const phaseData = JSON.parse(matchingJob.phaseTaskDataValue);
          
          // Create tasks from real CSV data for each assigned phase - Column G contains quantities
          activeAssignment.buildPhases.forEach((phase: string) => {
            if (phaseData[phase]) {
              // Use actual CSV items for this phase with Column G quantities
              phaseData[phase].forEach((item: any) => {
                // Extract quantity from Column G - this is what contractors track with +/- buttons
                const quantityFromColumnG = parseInt(item.quantity) || 1;
                
                newTasks.push({
                  id: `${phase}-${taskId++}`, // Phase-specific ID to prevent cross-contamination
                  title: item.description || item.task || `${phase} Task`,
                  description: item.description || item.task || '',
                  area: phase,
                  totalItems: quantityFromColumnG, // Column G quantity - key for progress tracking
                  completedItems: 0,
                  status: "not started" as const
                });
              });
            } else {
              // If no CSV data for this phase, create a basic task
              newTasks.push({
                id: `${phase}-${taskId++}`, // Phase-specific ID
                title: phase,
                description: `Complete ${phase} work`,
                area: phase,
                totalItems: 1,
                completedItems: 0,
                status: "not started" as const
              });
            }
          });
        } else {
          // Fallback: create basic tasks if no CSV data found
          let taskId = 1;
          activeAssignment.buildPhases.forEach((phase: string) => {
            newTasks.push({
              id: (taskId++).toString(),
              title: phase,
              description: `Complete ${phase} work`,
              area: phase,
              totalItems: 1,
              completedItems: 0,
              status: "not started" as const
            });
          });
        }
      } catch (error) {
        console.error('Failed to fetch CSV job data:', error);
        // Fallback: create basic tasks
        let taskId = 1;
        activeAssignment.buildPhases.forEach((phase: string) => {
          newTasks.push({
            id: (taskId++).toString(),
            title: phase,
            description: `Complete ${phase} work`,
            area: phase,
            totalItems: 1,
            completedItems: 0,
            status: "not started" as const
          });
        });
      }
      
      // If we have saved progress for this job, restore it
      if (savedProgress) {
        try {
          const savedTasks = JSON.parse(savedProgress) as ProgressTask[];
          // Merge saved progress with current tasks
          newTasks = newTasks.map(task => {
            const savedTask = savedTasks.find(saved => saved.id === task.id || saved.title === task.title);
            return savedTask ? { ...task, completedItems: savedTask.completedItems, status: savedTask.status } : task;
          });
        } catch (error) {
          console.error('Failed to load saved progress:', error);
        }
      }
      
      // If we have saved progress for this job, restore it
      if (savedProgress) {
        try {
          const savedTasks = JSON.parse(savedProgress) as ProgressTask[];
          // Merge saved progress with current tasks
          newTasks = newTasks.map(task => {
            const savedTask = savedTasks.find(saved => saved.id === task.id || saved.title === task.title);
            return savedTask ? { ...task, completedItems: savedTask.completedItems, status: savedTask.status } : task;
          });
        } catch (error) {
          console.error('Failed to load saved progress:', error);
        }
      }
      
      setTasks(newTasks);
    };
    
    loadTasksFromCSV();
  }, [activeAssignment]);
  
  // Save progress whenever tasks change
  useEffect(() => {
    if (tasks.length > 0 && activeAssignment) {
      const storageKey = `task_progress_${activeAssignment.id}`;
      localStorage.setItem(storageKey, JSON.stringify(tasks));
    }
  }, [tasks, activeAssignment]);
  
  const [contractorDropdownOpen, setContractorDropdownOpen] = useState(false);
  const { toast } = useToast();

  const getTotalCompleted = () => tasks.reduce((sum, task) => sum + task.completedItems, 0);
  const getTotalItems = () => tasks.reduce((sum, task) => sum + task.totalItems, 0);
  const getOverallProgress = () => {
    const total = getTotalItems();
    return total > 0 ? Math.round((getTotalCompleted() / total) * 100) : 0;
  };

  const updateTaskProgress = (taskId: string, increment: number) => {
    const updatedTasks = tasks.map(task => {
      if (task.id === taskId) {
        const newCompletedItems = Math.max(0, Math.min(task.totalItems, task.completedItems + increment));
        const newStatus = newCompletedItems === 0 ? "not started" : 
                        newCompletedItems === task.totalItems ? "completed" : 
                        "in progress";
        
        return {
          ...task,
          completedItems: newCompletedItems,
          status: newStatus as "not started" | "in progress" | "completed"
        };
      }
      return task;
    });
    
    setTasks(updatedTasks);
    
    // Save progress to localStorage with assignment-specific key
    const storageKey = `task_progress_${activeAssignment?.id || 'default'}`;
    localStorage.setItem(storageKey, JSON.stringify(updatedTasks));
    
    // CRITICAL FIX: Only calculate progress for the current assignment, not affecting other phases
    const progressForCurrentTasks = updatedTasks.filter(task => 
      activeAssignment?.buildPhases.includes(task.area)
    );
    
    // CRITICAL: Trigger progress monitoring for 50% inspection notifications
    if (activeAssignment) {
      // Calculate progress only for current assignment tasks
      const totalForAssignment = progressForCurrentTasks.reduce((sum, task) => sum + task.totalItems, 0);
      const completedForAssignment = progressForCurrentTasks.reduce((sum, task) => sum + task.completedItems, 0);
      const assignmentProgress = totalForAssignment > 0 ? Math.round((completedForAssignment / totalForAssignment) * 100) : 0;
      
      console.log(`🔍 Task progress updated for ${activeAssignment.hbxlJob}: ${assignmentProgress}%`);
      
      // Check for inspection triggers at 50% and 100% milestones
      if (assignmentProgress >= 50) {
        console.log(`🚨 Triggering inspection check for ${assignmentProgress}% completion`);
        fetch(`/api/trigger-progress-check/${activeAssignment.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).then(response => {
          if (response.ok) {
            console.log(`✅ Progress monitoring triggered successfully for ${assignmentProgress}%`);
          } else {
            console.error(`❌ Progress monitoring failed: ${response.status}`);
          }
        }).catch(error => console.error('❌ Progress monitoring failed:', error));
      }
    }
    
    toast({
      title: "Progress Updated",
      description: `Task progress ${increment > 0 ? 'increased' : 'decreased'}`,
    });
  };

  const handleMenuAction = (action: string) => {
    setContractorDropdownOpen(false);
    toast({
      title: action,
      description: `Opening ${action} interface...`,
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
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
          <div className="relative">
            <button 
              onClick={() => setContractorDropdownOpen(!contractorDropdownOpen)}
              className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4 hover:bg-yellow-700 transition-colors"
            >
              <span className="text-white font-bold text-sm">JC</span>
            </button>
            
            {contractorDropdownOpen && (
              <div className="absolute right-0 top-10 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-50">
                <div className="px-4 py-3 border-b border-slate-600">
                  <div className="text-yellow-400 font-semibold">James Carpenter</div>
                  <div className="text-slate-400 text-sm">james@contractor.com</div>
                  <div className="flex items-center mt-2">
                    <i className="fas fa-hard-hat text-yellow-400 mr-2"></i>
                    <span className="text-yellow-400 text-sm">Contractor</span>
                  </div>
                </div>
                
                <div className="py-2">
                  <button 
                    onClick={() => handleMenuAction("Switch Account")}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-user-circle mr-3 text-slate-400"></i>
                    Switch Account
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Report Issue")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-exclamation-triangle mr-3 text-yellow-400"></i>
                    Report Issue
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Documents")}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-file-alt mr-3 text-slate-400"></i>
                    Documents
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Help & Support")}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-question-circle mr-3 text-slate-400"></i>
                    Help & Support
                  </button>
                  
                  <div className="border-t border-slate-600 mt-2 pt-2">
                    <button 
                      onClick={() => window.location.href = '/login'}
                      className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 flex items-center"
                    >
                      <i className="fas fa-sign-out-alt mr-3 text-red-400"></i>
                      Sign Out & Switch Account
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4">
        {/* Page Title */}
        <h1 className="text-2xl font-bold text-yellow-400 mb-2">Task Progress</h1>
        
        {/* Project Info */}
        <div className="mb-4">
          <div className="text-slate-400 text-sm">Project</div>
          <div className="text-white font-medium">{currentProject}</div>
          <div className="text-slate-400 text-sm mt-1">Category</div>
        </div>

        {/* Overall Progress Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-yellow-400">Overall Progress</h3>
            <Badge variant="outline" className="border-yellow-600 text-yellow-400">
              {getTotalCompleted()} of {getTotalItems()} completed
            </Badge>
          </div>
          
          <div className="w-full bg-slate-700 rounded-full h-3 mb-2">
            <div 
              className="bg-yellow-500 h-3 rounded-full transition-all duration-300"
              style={{ width: `${getOverallProgress()}%` }}
            ></div>
          </div>
          
          <div className="text-slate-400 text-sm">
            {getOverallProgress()}% complete
          </div>
        </div>

        {/* Task Cards */}
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-slate-500 rounded-full mr-3 mt-1"></div>
                  <div>
                    <h4 className="text-yellow-400 font-semibold">{task.title}</h4>
                    <div className="text-slate-400 text-sm mt-1">{task.area}</div>
                  </div>
                </div>
                <Badge 
                  variant="outline" 
                  className="border-slate-500 text-slate-400"
                >
                  {task.status}
                </Badge>
              </div>
              
              <p className="text-slate-300 text-sm mb-3">{task.description}</p>
              
              <div className="text-orange-400 text-sm mb-4">
                • {task.totalItems} items left to complete
              </div>
              
              {/* Progress Section */}
              <div className="flex items-center justify-between mb-4">
                <button 
                  onClick={() => updateTaskProgress(task.id, -1)}
                  disabled={task.completedItems <= 0}
                  className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  −
                </button>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">
                    {task.completedItems} / {task.totalItems}
                  </div>
                  <div className="text-slate-400 text-sm">completed</div>
                  <div className="text-orange-400 text-sm">
                    {task.totalItems - task.completedItems} remaining
                  </div>
                </div>
                
                <button 
                  onClick={() => updateTaskProgress(task.id, 1)}
                  disabled={task.completedItems >= task.totalItems}
                  className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-yellow-400 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  +
                </button>
                
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    {task.totalItems > 0 ? Math.round((task.completedItems / task.totalItems) * 100) : 0}%
                  </div>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                className="w-full border-yellow-600 text-yellow-400 hover:bg-yellow-600 hover:text-black"
              >
                Show Details
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="flex justify-around py-2">
          <button 
            onClick={() => window.location.href = '/'}
            className="flex flex-col items-center py-2 px-4 text-yellow-400"
          >
            <i className="fas fa-home text-xl mb-1"></i>
            <span className="text-xs">Dashboard</span>
          </button>
          <button 
            onClick={() => window.location.href = '/jobs'}
            className="flex flex-col items-center py-2 px-4 text-yellow-400"
          >
            <i className="fas fa-briefcase text-xl mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button className="flex flex-col items-center py-2 px-4 text-slate-400">
            <i className="fas fa-ellipsis-h text-xl mb-1"></i>
            <span className="text-xs">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
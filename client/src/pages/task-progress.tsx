import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ProgressTask {
  id: string;
  title: string;
  description: string;
  area: string;
  totalItems: number;
  completedItems: number;
  status: "not started" | "in progress" | "completed";
  taskId?: string;
  completed?: boolean;
}

export default function TaskProgress() {
  const { toast } = useToast();
  
  // Get contractor assignments using logged-in contractor name
  const contractorName = localStorage.getItem('contractorName') || 'Dalwayne Diedericks';
  const contractorFirstName = contractorName.split(' ')[0];
  
  console.log('🚀 TaskProgress component loaded');
  console.log('🚀 contractorName from localStorage:', contractorName);
  console.log('🚀 contractorFirstName:', contractorFirstName);
  
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: [`/api/contractor-assignments/${contractorFirstName}`],
  });

  // Get the first (active) assignment
  const activeAssignment = (assignments as any[])[0];
  
  console.log('🔍 Task Progress Debug - contractorFirstName:', contractorFirstName);
  console.log('🔍 Task Progress Debug - assignments:', assignments);
  console.log('🔍 Task Progress Debug - activeAssignment:', activeAssignment);
  console.log('🔍 Task Progress Debug - isLoading:', isLoading);
  
  // Update current project based on assignment data
  const [currentProject, setCurrentProject] = useState("Loading...");

  // Update project title when assignment is loaded
  useEffect(() => {
    if (activeAssignment) {
      console.log('✅ Setting current project:', `${activeAssignment.hbxlJob} - ${activeAssignment.workLocation}`);
      setCurrentProject(`${activeAssignment.hbxlJob} - ${activeAssignment.workLocation}`);
    } else {
      console.log('❌ No active assignment found');
      setCurrentProject("No Active Assignment");
    }
  }, [activeAssignment]);
  
  // Initialize tasks from database or CSV data
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
    console.log('🔄 loadTasksFromCSV effect triggered');
    console.log('🔄 activeAssignment:', activeAssignment);
    console.log('🔄 buildPhases:', activeAssignment?.buildPhases);
    
    if (!activeAssignment || !activeAssignment.buildPhases) {
      console.log('❌ No active assignment or build phases, skipping task loading');
      return;
    }
    
    const loadTasksFromCSV = async () => {
      const storageKey = `task_progress_${activeAssignment.id}`;
      const savedProgress = localStorage.getItem(storageKey);
      
      // Fetch the actual CSV job data to get real task items
      let newTasks: ProgressTask[] = [];
      
      try {
        // Get the uploaded jobs data that contains CSV task items
        const jobsResponse = await fetch('/api/uploaded-jobs');
        const uploadedJobs = await jobsResponse.json();
        
        // Find the job that matches this assignment - RESTORED WORKING LOGIC
        console.log('🔍 Looking for job:', activeAssignment.hbxlJob);
        console.log('🔍 Available jobs:', uploadedJobs.map((j: any) => j.name));
        
        // FIXED: Job matching logic - Handle all assignment-to-job mapping scenarios
        console.log('🔍 Matching logic - Assignment:', activeAssignment.hbxlJob, 'at', activeAssignment.workLocation);
        const matchingJob = uploadedJobs.find((job: any) => {
          console.log('🔍 Checking job:', job.name, 'postcode:', job.postcode, 'address:', job.address);
          
          // Method 1: Direct name match (exact)
          if (job.name === activeAssignment.hbxlJob) {
            console.log('✅ Direct name match found');
            return true;
          }
          
          // Method 2: Partial name match for "Flat12 2Bedroom" vs "Flat1 2Bedroom" 
          if (job.name && activeAssignment.hbxlJob) {
            const jobNameClean = job.name.toLowerCase().replace(/\s+/g, '');
            const assignmentNameClean = activeAssignment.hbxlJob.toLowerCase().replace(/\s+/g, '');
            if (jobNameClean.includes('flat') && assignmentNameClean.includes('flat')) {
              console.log('✅ Flat assignment match found');
              return true;
            }
          }
          
          // Method 3: Xavier jones special case - both "Flat 2" and "Xavier jones" assignments map to Xavier jones job
          if (job.name.toLowerCase().includes('xavier')) {
            if (activeAssignment.hbxlJob.toLowerCase().includes('xavier') || 
                activeAssignment.hbxlJob.toLowerCase().includes('flat')) {
              console.log('✅ Xavier jones special case match');
              return true;
            }
          }
          
          // Method 4: Address-based matching - job address contains assignment location
          if (job.address && activeAssignment.workLocation) {
            if (job.address.toLowerCase().includes(activeAssignment.workLocation.toLowerCase())) {
              console.log('✅ Address-based match found');
              return true;
            }
          }
          
          // Method 5: Postcode match (direct)
          if (job.postcode === activeAssignment.workLocation) {
            console.log('✅ Postcode match found');
            return true;
          }
          
          // Method 6: Partial postcode match (DA17 5DB matches DA17)
          if (job.postcode && activeAssignment.workLocation) {
            const jobPostcodePrefix = job.postcode.split(' ')[0];
            const assignmentLocationPrefix = activeAssignment.workLocation.split(' ')[0];
            if (jobPostcodePrefix === assignmentLocationPrefix) {
              console.log('✅ Partial postcode match found');
              return true;
            }
          }
          
          return false;
        });
        
        console.log('🔍 Found matching job:', matchingJob?.name);
        
        if (matchingJob && matchingJob.phaseData) {
          let taskId = 1;
          
          // Use the correct phase data structure - CSV data is already parsed
          const phaseData = matchingJob.phaseData;
          console.log('🔍 Phase data found:', Object.keys(phaseData));
          console.log('🔍 Assignment phases:', activeAssignment.buildPhases);
          
          // Create tasks from real CSV data for each assigned phase - Column G contains quantities
          activeAssignment.buildPhases.forEach((phase: string) => {
            console.log(`🔍 Processing phase: ${phase}`);
            if (phaseData[phase]) {
              console.log(`✅ Found data for phase ${phase}:`, phaseData[phase].length, 'items');
              // Use actual CSV items for this phase with Column G quantities
              phaseData[phase].forEach((item: any, index: number) => {
                // Extract quantity from Column G - this is what contractors track with +/- buttons
                const quantityFromColumnG = parseInt(item.quantity) || 1;
                console.log(`📝 Adding task ${index + 1}:`, item.description, 'Qty:', quantityFromColumnG);
                
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
              console.log(`❌ No CSV data found for phase: ${phase}`);
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
          
          console.log('📊 Total tasks created:', newTasks.length);
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
              <span className="text-white font-bold text-sm">DD</span>
            </button>
            
            {contractorDropdownOpen && (
              <div className="absolute right-0 top-10 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-50">
                <div className="px-4 py-3 border-b border-slate-600">
                  <div className="text-yellow-400 font-semibold">Dalwayne Diedericks</div>
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
                      onClick={() => {
                        localStorage.clear();
                        window.location.href = '/login';
                        window.location.reload();
                      }}
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
          
          {/* Admin Notes Section */}
          {activeAssignment?.specialInstructions && (
            <div className="mt-3 bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
              <div className="flex items-start">
                <i className="fas fa-sticky-note text-yellow-400 mr-2 mt-0.5"></i>
                <div>
                  <div className="text-yellow-400 font-medium text-sm mb-1">Admin Notes:</div>
                  <div className="text-white text-sm">{activeAssignment.specialInstructions}</div>
                </div>
              </div>
            </div>
          )}
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
          <button 
            onClick={() => window.location.href = '/more'}
            className="flex flex-col items-center py-2 px-4 text-slate-400"
          >
            <i className="fas fa-ellipsis-h text-xl mb-1"></i>
            <span className="text-xs">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
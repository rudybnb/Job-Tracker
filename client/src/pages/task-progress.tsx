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
}

export default function TaskProgress() {
  // Get job details from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get('jobId');
  const locationFromUrl = urlParams.get('location');
  
  // Fetch job details from API
  const { data: jobDetails, isLoading } = useQuery({
    queryKey: [`/api/job-assignments/${jobId}`],
    enabled: !!jobId,
  });
  
  // Update current project based on job details or URL
  const [currentProject, setCurrentProject] = useState(() => {
    if (locationFromUrl) {
      return `Job Assignment - ${locationFromUrl}`;
    } else {
      return "Promise - Renovation, ME5 9GX";
    }
  });

  // Update project title when job details are loaded
  useEffect(() => {
    if (jobDetails) {
      setCurrentProject(`${jobDetails.title} - ${jobDetails.location}`);
    }
  }, [jobDetails]);
  // Initialize tasks based on location from URL
  const [tasks, setTasks] = useState<ProgressTask[]>(() => {
    return locationFromUrl && locationFromUrl.includes('DA17 5DB') ? [
      {
        id: "1",
        title: "External Works - Garden Layout",
        description: "Design and layout garden areas",
        area: "Garden Area",
        totalItems: 80,
        completedItems: 0,
        status: "not started" as const
      },
      {
        id: "2", 
        title: "External Works - Landscaping",
        description: "Complete landscaping work", 
        area: "Landscaping",
        totalItems: 120,
        completedItems: 0,
        status: "not started" as const
      }
    ] : [
      {
        id: "1",
        title: "Masonry Shell - Bricklaying Foundation",
        description: "Lay foundation bricks and mortar joints (50 No)",
        area: "Foundation Area",
        totalItems: 50,
        completedItems: 0,
        status: "not started" as const
      },
      {
        id: "2", 
        title: "Masonry Shell - Block Work",
        description: "Install concrete blocks for walls (120 No)",
        area: "Main Structure", 
        totalItems: 120,
        completedItems: 0,
        status: "not started" as const
      }
    ];
  });

  // Update tasks when job details are loaded
  useEffect(() => {
    if (jobDetails && jobDetails.phases) {
      const phases = JSON.parse(jobDetails.phases);
      const newTasks = phases.map((phase: string, index: number) => ({
        id: (index + 1).toString(),
        title: phase,
        description: `Complete ${phase} work`,
        area: jobDetails.location,
        totalItems: 100, // Default to 100% progress
        completedItems: 0,
        status: "not started" as const
      }));
      setTasks(newTasks);
    }
  }, [jobDetails]);
  
  const [contractorDropdownOpen, setContractorDropdownOpen] = useState(false);
  const { toast } = useToast();

  const getTotalCompleted = () => tasks.reduce((sum, task) => sum + task.completedItems, 0);
  const getTotalItems = () => tasks.reduce((sum, task) => sum + task.totalItems, 0);
  const getOverallProgress = () => {
    const total = getTotalItems();
    return total > 0 ? Math.round((getTotalCompleted() / total) * 100) : 0;
  };

  const updateTaskProgress = (taskId: string, increment: number) => {
    setTasks(currentTasks => 
      currentTasks.map(task => {
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
      })
    );
    
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
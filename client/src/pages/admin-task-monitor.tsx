import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ContractorTask {
  id: string;
  contractorName: string;
  projectName: string;
  taskTitle: string;
  taskDescription: string;
  area: string;
  totalItems: number;
  completedItems: number;
  status: "not started" | "in progress" | "completed";
  assignedDate: string;
  timeSpent: string;
}

export default function AdminTaskMonitor() {
  const [tasks] = useState<ContractorTask[]>([
    {
      id: "1",
      contractorName: "James Carpenter",
      projectName: "Unknown, SG1 1EH",
      taskTitle: "Masonry Shell - Bricklaying Foundation",
      taskDescription: "Lay foundation bricks and mortar joints",
      area: "Foundation Area",
      totalItems: 50,
      completedItems: 0,
      status: "not started",
      assignedDate: "06/08/2025",
      timeSpent: "0h 00m"
    },
    {
      id: "2",
      contractorName: "James Carpenter", 
      projectName: "Unknown, SG1 1EH",
      taskTitle: "Masonry Shell - Block Work",
      taskDescription: "Install concrete blocks for walls",
      area: "Main Structure",
      totalItems: 120,
      completedItems: 0,
      status: "not started",
      assignedDate: "06/08/2025",
      timeSpent: "0h 00m"
    }
  ]);

  const { toast } = useToast();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-600 text-white';
      case 'in progress': return 'bg-yellow-600 text-black';
      default: return 'bg-slate-600 text-white';
    }
  };

  const getProgressPercentage = (completed: number, total: number) => {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const handleViewDetails = (taskId: string) => {
    toast({
      title: "Task Details",
      description: "Opening detailed task monitoring view...",
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
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4">
            <span className="text-white font-bold text-sm">RD</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-yellow-400">Admin Task Monitor</h1>
            <p className="text-slate-400 text-sm">Monitor contractor progress and time tracking</p>
          </div>
          <Button 
            onClick={() => window.location.href = '/job-assignments'}
            className="bg-yellow-600 hover:bg-yellow-700 text-black"
          >
            <i className="fas fa-plus mr-2"></i>
            Create New Assignment
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">{tasks.length}</div>
                <div className="text-slate-400 text-sm">Active Tasks</div>
              </div>
              <i className="fas fa-tasks text-yellow-400 text-2xl"></i>
            </div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">
                  {tasks.filter(t => t.status === 'in progress').length}
                </div>
                <div className="text-slate-400 text-sm">In Progress</div>
              </div>
              <i className="fas fa-clock text-blue-400 text-2xl"></i>
            </div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">
                  {tasks.filter(t => t.status === 'completed').length}
                </div>
                <div className="text-slate-400 text-sm">Completed</div>
              </div>
              <i className="fas fa-check-circle text-green-400 text-2xl"></i>
            </div>
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-yellow-400">{task.taskTitle}</h3>
                  <p className="text-slate-400 text-sm">{task.projectName} • {task.area}</p>
                  <p className="text-slate-300 text-sm mt-1">{task.taskDescription}</p>
                </div>
                <Badge className={getStatusColor(task.status)}>
                  {task.status}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-slate-400 text-xs">Contractor</div>
                  <div className="text-white font-medium">{task.contractorName}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Progress</div>
                  <div className="text-white font-medium">
                    {task.completedItems} / {task.totalItems} items
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Assigned Date</div>
                  <div className="text-white font-medium">{task.assignedDate}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Time Spent</div>
                  <div className="text-white font-medium">{task.timeSpent}</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Progress</span>
                  <span className="text-white">{getProgressPercentage(task.completedItems, task.totalItems)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${getProgressPercentage(task.completedItems, task.totalItems)}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="text-slate-400 text-sm">
                  {task.totalItems - task.completedItems} items remaining
                </div>
                <Button 
                  onClick={() => handleViewDetails(task.id)}
                  variant="outline"
                  size="sm"
                  className="border-yellow-600 text-yellow-400 hover:bg-yellow-600 hover:text-black"
                >
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>

        {tasks.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <i className="fas fa-tasks text-slate-500 text-4xl"></i>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Active Tasks</h3>
            <p className="text-slate-400 text-sm mb-4">
              No contractor tasks are currently active. Create job assignments to get started.
            </p>
            <Button 
              onClick={() => window.location.href = '/job-assignments'}
              className="bg-yellow-600 hover:bg-yellow-700 text-black"
            >
              Create First Assignment
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="flex justify-around py-2">
          <button 
            onClick={() => window.location.href = '/'}
            className="flex flex-col items-center py-2 px-4 text-slate-400"
          >
            <i className="fas fa-home text-xl mb-1"></i>
            <span className="text-xs">Dashboard</span>
          </button>
          <button 
            onClick={() => window.location.href = '/job-assignments'}
            className="flex flex-col items-center py-2 px-4 text-slate-400"
          >
            <i className="fas fa-briefcase text-xl mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin'}
            className="flex flex-col items-center py-2 px-4 text-yellow-400"
          >
            <i className="fas fa-chart-bar text-xl mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
            className="flex flex-col items-center py-2 px-4 text-slate-400"
          >
            <i className="fas fa-upload text-xl mb-1"></i>
            <span className="text-xs">Upload</span>
          </button>
        </div>
      </div>
    </div>
  );
}
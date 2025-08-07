import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface JobAssignment {
  id: string;
  title: string;
  contractor: string;
  location: string;
  status: "pending" | "accepted" | "in_progress" | "completed";
  deadline: string;
  priority: "low" | "medium" | "high";
  telegramSent: boolean;
  createdAt: string;
}

export default function Jobs() {
  const { toast } = useToast();
  
  // Load real job assignments from localStorage (created from CSV uploads)
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);

  // Load job assignments on component mount
  useEffect(() => {
    const savedAssignments = localStorage.getItem('jobAssignments');
    if (savedAssignments) {
      const assignmentData = JSON.parse(savedAssignments);
      setAssignments(assignmentData);
    }
  }, []);

  const handleDeleteAssignment = (id: string) => {
    const updatedAssignments = assignments.filter(assignment => assignment.id !== id);
    setAssignments(updatedAssignments);
    localStorage.setItem('jobAssignments', JSON.stringify(updatedAssignments));
    toast({
      title: "Assignment Deleted", 
      description: "Job assignment has been removed successfully.",
    });
  };

  const handleCreateJob = () => {
    toast({
      title: "Create Job Assignment",
      description: "Opening job creation form...",
    });
    // Would open job creation modal or form
  };

  const handleCreateFirstJob = () => {
    toast({
      title: "No CSV Data Found",
      description: "Upload CSV files first to create jobs for assignment",
      variant: "destructive"
    });
    // Redirect to upload page
    window.location.href = '/upload';
  };

  const getStatusBadge = (status: JobAssignment["status"]) => {
    const styles = {
      pending: "bg-yellow-600 text-white",
      accepted: "bg-blue-600 text-white", 
      in_progress: "bg-orange-600 text-white",
      completed: "bg-green-600 text-white"
    };
    
    return (
      <Badge className={styles[status]}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: JobAssignment["priority"]) => {
    const styles = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-red-100 text-red-800"
    };
    
    return (
      <Badge className={styles[priority]}>
        {priority.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Direct Job Assignments</h1>
            <p className="text-slate-400 text-sm">Create and assign jobs directly to contractors</p>
          </div>
          <Button 
            onClick={handleCreateJob}
            className="bg-orange-600 hover:bg-orange-700 text-white flex items-center"
          >
            <i className="fas fa-plus mr-2"></i>
            Create & Assign Job
          </Button>
        </div>
      </div>

      <div className="p-4">
        {assignments.length === 0 ? (
          /* Empty State */
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
            <div className="w-24 h-24 mx-auto mb-6 text-slate-500">
              <i className="fas fa-briefcase text-6xl"></i>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Assignments Created</h3>
            <p className="text-slate-400 mb-6">Create your first job assignment to get started.</p>
            <Button 
              onClick={handleCreateFirstJob}
              className="bg-orange-600 hover:bg-orange-700 text-white flex items-center mx-auto"
            >
              <i className="fas fa-plus mr-2"></i>
              Create First Job
            </Button>
          </div>
        ) : (
          /* Assignments List */
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-semibold text-white">{assignment.title}</h3>
                    {getStatusBadge(assignment.status)}
                    {getPriorityBadge(assignment.priority)}
                  </div>
                  <div className="flex items-center space-x-2">
                    {assignment.telegramSent && (
                      <Badge className="bg-blue-600 text-white">
                        <i className="fab fa-telegram-plane mr-1"></i>
                        Sent
                      </Badge>
                    )}
                    <Button 
                      size="sm" 
                      className="bg-red-600 hover:bg-red-700 text-white p-2"
                      onClick={() => handleDeleteAssignment(assignment.id)}
                      title="Delete Assignment"
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Contractor:</span>
                    <div className="text-white font-medium">{assignment.contractor}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Location:</span>
                    <div className="text-white font-medium">{assignment.location}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Deadline:</span>
                    <div className="text-white font-medium">{assignment.deadline}</div>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                  <span className="text-slate-500 text-xs">
                    Created: {new Date(assignment.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex space-x-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                      <i className="fas fa-check mr-1"></i>
                      Approve
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => handleDeleteAssignment(assignment.id)}
                    >
                      <i className="fas fa-trash mr-1"></i>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
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
          <button className="py-3 px-4 text-yellow-400">
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin'}
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
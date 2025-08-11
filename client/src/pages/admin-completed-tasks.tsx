import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, User, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CompletedTask {
  id: string;
  description: string;
  quantity: number;
  phase: string;
  assignmentId?: string;
  contractorName?: string;
  completedAt?: string;
}

export default function AdminCompletedTasks() {
  const { toast } = useToast();
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([]);
  const [showNoteModal, setShowNoteModal] = useState<string | null>(null);
  const [taskNote, setTaskNote] = useState("");

  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/job-assignments"],
  });

  const { data: uploadedJobs = [] } = useQuery({
    queryKey: ["/api/uploaded-jobs"],
  });

  const { data: completedTasksData = [] } = useQuery({
    queryKey: ["/api/completed-tasks"],
  });

  useEffect(() => {
    // Convert database completed tasks to display format
    const tasksData: CompletedTask[] = completedTasksData.map((task: any) => ({
      id: task.taskId,
      description: task.taskDescription,
      quantity: 1,
      phase: task.phase,
      assignmentId: task.assignmentId,
      contractorName: task.contractorName,
      completedAt: task.completedAt
    }));
    
    setCompletedTasks(tasksData);
    console.log(`📊 Loaded ${tasksData.length} completed tasks from database`);
  }, [completedTasksData]);

  const approveTask = (taskId: string) => {
    toast({
      title: "Task Approved",
      description: `Task ${taskId} has been approved by admin.`,
    });
    console.log(`✅ Admin approved task: ${taskId}`);
  };

  const saveTaskNote = (taskId: string) => {
    if (!taskNote.trim()) return;
    
    // Save note to localStorage for this demo
    const existingNotes = JSON.parse(localStorage.getItem('taskNotes') || '{}');
    existingNotes[taskId] = {
      note: taskNote,
      timestamp: new Date().toISOString(),
      admin: 'Earl Johnson'
    };
    localStorage.setItem('taskNotes', JSON.stringify(existingNotes));
    
    toast({
      title: "Note Saved",
      description: "Task note has been saved successfully.",
    });
    
    setShowNoteModal(null);
    setTaskNote("");
    console.log(`📝 Admin note saved for task: ${taskId}`);
  };

  return (
    <div className="min-h-screen bg-slate-800 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-amber-400">Completed Tasks Inspection</h1>
          <Badge className="bg-green-600 text-white">
            {completedTasks.length} tasks ready for inspection
          </Badge>
        </div>

        {completedTasks.length === 0 ? (
          <Card className="bg-slate-700 border-slate-600">
            <CardContent className="p-8 text-center">
              <Clock className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">No Completed Tasks</h3>
              <p className="text-slate-400">
                Tasks marked as 100% complete by contractors will appear here for admin inspection.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completedTasks.map((task) => (
              <Card key={task.id} className="bg-slate-700 border-slate-600">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-sm font-semibold">
                      {task.description}
                    </CardTitle>
                    <Badge className="bg-green-600 text-white text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      100% Complete
                    </Badge>
                  </div>
                  <CardDescription className="text-slate-400 text-xs">
                    Phase: {task.phase} • Qty: {task.quantity}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <User className="h-3 w-3" />
                    {task.contractorName}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setShowNoteModal(task.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 h-6 flex-1"
                    >
                      📝 Note
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => alert('Photo capture coming soon')}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 h-6 flex-1"
                    >
                      📷 Photo
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveTask(task.id)}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 py-1 h-6 flex-1"
                    >
                      ✓ Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Note Modal */}
        {showNoteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-600 w-96">
              <h3 className="text-yellow-400 font-semibold mb-4">Add Admin Note</h3>
              <textarea
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-400 focus:border-yellow-500 resize-none"
                rows={4}
                placeholder="Enter admin inspection note..."
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
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-slate-700 rounded-lg border border-slate-600">
          <h3 className="text-amber-400 font-semibold mb-2">Inspection Workflow</h3>
          <p className="text-slate-300 text-sm">
            1. Contractors mark tasks as complete (100%) in their assignment details
          </p>
          <p className="text-slate-300 text-sm">
            2. Completed tasks appear here for admin inspection and approval
          </p>
          <p className="text-slate-300 text-sm">
            3. Admin can add notes, photos, and approve completed work
          </p>
        </div>
      </div>
    </div>
  );
}
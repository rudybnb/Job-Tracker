import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

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
  specialInstructions: string | null;
  status: string;
  sendTelegramNotification: boolean;
  latitude: string | null;
  longitude: string | null;
  createdAt: string;
  updatedAt: string;
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
  const queryClient = useQueryClient();
  const [reportText, setReportText] = useState("");
  const [showQuickReport, setShowQuickReport] = useState(false);
  
  // Admin inspection form state
  const [adminInspection, setAdminInspection] = useState({
    progressComments: '',
    workQualityRating: '',
    weatherConditions: '',
    safetyNotes: '',
    materialsIssues: '',
    nextActions: ''
  });
  
  // Admin inspection submission
  const handleAdminInspectionSubmit = async () => {
    try {
      const inspectionData = {
        assignmentId: assignmentId,
        inspectorName: "Admin",
        inspectionType: "site_inspection",
        workQualityRating: adminInspection.workQualityRating,
        weatherConditions: adminInspection.weatherConditions,
        progressComments: adminInspection.progressComments,
        safetyNotes: adminInspection.safetyNotes,
        materialsIssues: adminInspection.materialsIssues,
        nextActions: adminInspection.nextActions,
        photoUrls: [],
        status: "completed"
      };
      
      const response = await apiRequest("POST", "/api/admin-inspections", inspectionData);
      const result = await response.json();
      
      // Create contractor report based on admin findings
      if (adminInspection.materialsIssues || adminInspection.nextActions) {
        const contractorReportData = {
          contractorName: assignment?.contractorName || '',
          assignmentId: assignmentId || '',
          reportText: `Admin Inspection Findings: ${adminInspection.materialsIssues ? 'Materials: ' + adminInspection.materialsIssues + '. ' : ''}${adminInspection.nextActions ? 'Actions Required: ' + adminInspection.nextActions : ''}`
        };
        
        await apiRequest("POST", "/api/contractor-reports", contractorReportData);
      }
      
      // Reset form and show success
      setAdminInspection({
        progressComments: '',
        workQualityRating: '',
        weatherConditions: '',
        safetyNotes: '',
        materialsIssues: '',
        nextActions: ''
      });
      
      alert("Inspection submitted successfully and contractor notified!");
      
    } catch (error) {
      console.error("Error submitting admin inspection:", error);
      alert("Failed to submit inspection. Please try again.");
    }
  };

  // Get assignment details
  const { data: assignment, isLoading } = useQuery<AssignmentDetails>({
    queryKey: [`/api/job-assignments/${assignmentId}`],
    enabled: !!assignmentId,
  });

  // Quick Report mutation
  const createReportMutation = useMutation({
    mutationFn: async (reportData: { contractorName: string; assignmentId: string; reportText: string }) => {
      console.log("📝 Submitting Quick Report:", reportData);
      const response = await apiRequest("POST", "/api/contractor-reports", reportData);
      const result = await response.json();
      console.log("✅ Quick Report submitted successfully:", result);
      return result;
    },
    onSuccess: () => {
      console.log("✅ Quick Report mutation successful");
      setReportText("");
      setShowQuickReport(false);
      // Refresh reports if needed
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-reports"] });
    },
    onError: (error) => {
      console.error("❌ Quick Report failed:", error);
    },
  });

  // Mock progress data for now - this would come from database
  const taskProgress: TaskProgress[] = assignment?.buildPhases ? 
    assignment.buildPhases.map((phase: string) => ({
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
            <h1 className="text-xl font-bold text-white mb-1">{assignment.hbxlJob}</h1>
            <p className="text-slate-400 text-sm">Admin Site Reporting & Progress Monitoring</p>
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
              <div className="text-white">{assignment.workLocation}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Start Date</div>
              <div className="text-white">{assignment.startDate}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Due Date</div>
              <div className="text-white">{assignment.endDate}</div>
            </div>
          </div>

          {assignment.specialInstructions && (
            <div className="mb-4">
              <div className="text-xs text-slate-400">Special Instructions</div>
              <div className="text-white">{assignment.specialInstructions}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400">Telegram Notification</div>
              <div className="text-white">
                {assignment.sendTelegramNotification ? (
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

        {/* Build Phases Status */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-yellow-400 mb-4">Build Phases Overview</h2>
          <div className="space-y-3">
            {assignment.buildPhases && Array.isArray(assignment.buildPhases) && assignment.buildPhases.map((phase: string, index: number) => (
              <div key={index} className="bg-slate-700 rounded-lg p-3 border border-slate-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-slate-600 text-slate-400 rounded-full flex items-center justify-center">
                      <span className="text-xs">{index + 1}</span>
                    </div>
                    <span className="text-white font-medium">{phase}</span>
                  </div>
                  <Badge className="bg-slate-600 text-slate-300 text-xs">
                    Assigned
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Report Section */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
            📝 Quick Report
          </h2>
          
          <p className="text-slate-400 text-sm mb-4">
            Report any materials missing from site or request clarification - keep it simple!
          </p>

          {!showQuickReport ? (
            <Button 
              onClick={() => setShowQuickReport(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full"
            >
              📝 Quick Report
            </Button>
          ) : (
            <div className="space-y-4">
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-none"
                rows={3}
                placeholder="What materials are missing or what clarification do you need?"
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

        {/* Admin Site Inspection Form */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
            📷 Admin Site Inspection
          </h2>
          
          <div className="space-y-4">
            {/* Photo Upload Section */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Site Photos
              </label>
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-slate-500 transition-colors">
                <div className="space-y-3">
                  <div className="text-slate-400 text-3xl">📷</div>
                  <div>
                    <p className="text-slate-400">Upload photos from site visit</p>
                    <p className="text-xs text-slate-500">Support: JPG, PNG, HEIC. Max 10MB per photo</p>
                  </div>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    Add Photos
                  </Button>
                </div>
              </div>
            </div>

            {/* Progress Assessment */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Progress Comments
              </label>
              <textarea
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-none"
                rows={4}
                placeholder="Enter detailed observations about work progress, quality, and any issues..."
                value={adminInspection.progressComments}
                onChange={(e) => setAdminInspection({...adminInspection, progressComments: e.target.value})}
              />
            </div>

            {/* Quality Assessment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Work Quality Rating
                </label>
                <select 
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500"
                  value={adminInspection.workQualityRating}
                  onChange={(e) => setAdminInspection({...adminInspection, workQualityRating: e.target.value})}
                >
                  <option value="">Rate quality...</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Satisfactory">Satisfactory</option>
                  <option value="Needs Improvement">Needs Improvement</option>
                  <option value="Unsatisfactory">Unsatisfactory</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Weather Conditions
                </label>
                <select 
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500"
                  value={adminInspection.weatherConditions}
                  onChange={(e) => setAdminInspection({...adminInspection, weatherConditions: e.target.value})}
                >
                  <option value="">Select weather...</option>
                  <option value="Clear/Sunny">Clear/Sunny</option>
                  <option value="Cloudy">Cloudy</option>
                  <option value="Light Rain">Light Rain</option>
                  <option value="Heavy Rain">Heavy Rain</option>
                  <option value="Snow">Snow</option>
                  <option value="Windy">Windy</option>
                </select>
              </div>
            </div>

            {/* Safety & Compliance */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Safety & Compliance Notes
              </label>
              <textarea
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-none"
                rows={3}
                placeholder="Note any safety concerns, compliance issues, or recommendations..."
                value={adminInspection.safetyNotes}
                onChange={(e) => setAdminInspection({...adminInspection, safetyNotes: e.target.value})}
              />
            </div>

            {/* Materials & Issues */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Materials & Issues
              </label>
              <textarea
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-none"
                rows={3}
                placeholder="List any missing materials, delivery issues, or equipment problems..."
                value={adminInspection.materialsIssues}
                onChange={(e) => setAdminInspection({...adminInspection, materialsIssues: e.target.value})}
              />
            </div>

            {/* Next Actions */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Next Actions Required
              </label>
              <textarea
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 resize-none"
                rows={2}
                placeholder="Specify any follow-up actions, deliveries, or corrections needed..."
                value={adminInspection.nextActions}
                onChange={(e) => setAdminInspection({...adminInspection, nextActions: e.target.value})}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <Button className="bg-green-600 hover:bg-green-700 text-white flex-1">
                Save Inspection Report
              </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                onClick={handleAdminInspectionSubmit}
              >
                Submit & Notify Contractor
              </Button>
            </div>
          </div>
        </div>

        {/* Previous Admin Reports */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
            📋 Previous Site Inspections
          </h2>
          <p className="text-slate-400 text-sm">
            Previous admin inspection reports will appear here with photos and detailed assessments.
          </p>
          
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <i className="fas fa-file-alt text-slate-500 text-3xl"></i>
            </div>
            <p className="text-slate-400 text-sm">No previous reports submitted yet</p>
            <p className="text-slate-500 text-xs mt-1">Reports will appear here after site visits</p>
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
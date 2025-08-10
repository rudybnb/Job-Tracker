import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ContractorAssignment {
  id: string;
  contractorName: string;
  workLocation: string;
  hbxlJob: string;
  buildPhases: string[];
  startDate: string;
  endDate: string;
  status: string;
  specialInstructions?: string;
}

interface ContractorReport {
  id: string;
  assignmentId: string;
  contractorName: string;
  reportType: string;
  materialsClarification: string;
  additionalNotes: string;
  urgencyLevel: string;
  photoUrls: string[];
  status: string;
  createdAt: string;
}

export default function Reports() {
  const [selectedAssignment, setSelectedAssignment] = useState<string>("");
  const [reportData, setReportData] = useState({
    reportType: "materials_request",
    materialsClarification: "",
    additionalNotes: "",
    urgencyLevel: "normal"
  });
  const [showReportForm, setShowReportForm] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get contractor assignments
  const contractorName = localStorage.getItem('contractorName') || 'Dalwayne Diedericks';
  const contractorFirstName = contractorName.split(' ')[0];
  
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<ContractorAssignment[]>({
    queryKey: [`/api/contractor-assignments/${contractorFirstName}`],
  });

  // Get contractor reports
  const { data: reports = [], isLoading: reportsLoading } = useQuery<ContractorReport[]>({
    queryKey: ['/api/contractor-reports'],
  });

  // Create report mutation
  const createReportMutation = useMutation({
    mutationFn: async (reportData: any) => {
      const response = await apiRequest('POST', '/api/contractor-reports', reportData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Report Submitted",
        description: "Your report has been sent to the admin team.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contractor-reports'] });
      setShowReportForm(false);
      setReportData({
        reportType: "materials_request",
        materialsClarification: "",
        additionalNotes: "",
        urgencyLevel: "normal"
      });
      setSelectedAssignment("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to submit report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmitReport = () => {
    if (!selectedAssignment) {
      toast({
        title: "Error",
        description: "Please select an assignment.",
        variant: "destructive",
      });
      return;
    }

    if (!reportData.materialsClarification.trim() && !reportData.additionalNotes.trim()) {
      toast({
        title: "Error", 
        description: "Please provide details about your report.",
        variant: "destructive",
      });
      return;
    }

    const selectedAssignmentData = assignments.find(a => a.id === selectedAssignment);
    
    createReportMutation.mutate({
      assignmentId: selectedAssignment,
      contractorName: contractorName,
      reportType: reportData.reportType,
      materialsClarification: reportData.materialsClarification,
      additionalNotes: reportData.additionalNotes,
      urgencyLevel: reportData.urgencyLevel,
      photoUrls: [],
      status: "submitted"
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'submitted': return 'bg-blue-500';
      case 'in_review': return 'bg-yellow-500';
      case 'resolved': return 'bg-green-500';
      case 'rejected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency.toLowerCase()) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-gray-500';
      default: return 'bg-blue-500';
    }
  };

  if (assignmentsLoading) {
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
            <h1 className="text-xl font-bold text-white mb-1">Quick Reports</h1>
            <p className="text-slate-400 text-sm">Submit materials requests and job clarifications</p>
          </div>
          <Button 
            onClick={() => setShowReportForm(!showReportForm)}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {showReportForm ? "Cancel" : "New Report"}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* New Report Form */}
        {showReportForm && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
              📝 Submit Quick Report
            </h2>

            <div className="space-y-4">
              {/* Assignment Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select Assignment
                </label>
                <select 
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500"
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value)}
                >
                  <option value="">Choose assignment...</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.hbxlJob} - {assignment.workLocation}
                    </option>
                  ))}
                </select>
              </div>

              {/* Report Type */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Report Type
                </label>
                <select 
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500"
                  value={reportData.reportType}
                  onChange={(e) => setReportData({...reportData, reportType: e.target.value})}
                >
                  <option value="materials_request">Materials Request</option>
                  <option value="job_clarification">Job Clarification</option>
                  <option value="technical_issue">Technical Issue</option>
                  <option value="safety_concern">Safety Concern</option>
                  <option value="progress_update">Progress Update</option>
                </select>
              </div>

              {/* Materials/Issue Details */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Details
                </label>
                <textarea
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-400 focus:border-yellow-500 resize-none"
                  rows={4}
                  placeholder="Describe what materials you need or what clarification is required..."
                  value={reportData.materialsClarification}
                  onChange={(e) => setReportData({...reportData, materialsClarification: e.target.value})}
                />
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-yellow-500 resize-none"
                  rows={2}
                  placeholder="Any additional context or information..."
                  value={reportData.additionalNotes}
                  onChange={(e) => setReportData({...reportData, additionalNotes: e.target.value})}
                />
              </div>

              {/* Urgency Level */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Priority Level
                </label>
                <select 
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500"
                  value={reportData.urgencyLevel}
                  onChange={(e) => setReportData({...reportData, urgencyLevel: e.target.value})}
                >
                  <option value="low">Low - Can wait until next week</option>
                  <option value="normal">Normal - Within 2-3 days</option>
                  <option value="high">High - Need within 24 hours</option>
                  <option value="urgent">Urgent - Need immediately</option>
                </select>
              </div>

              {/* Submit Button */}
              <Button 
                onClick={handleSubmitReport}
                disabled={createReportMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {createReportMutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </div>
          </div>
        )}

        {/* Reports History */}
        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-yellow-400">Report History</h2>
          </div>

          {reportsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto mb-2"></div>
              <p className="text-slate-400">Loading reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-slate-500 text-4xl mb-3">📝</div>
              <p className="text-slate-400 mb-2">No reports submitted yet</p>
              <p className="text-slate-500 text-sm">Click "New Report" to submit your first report</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {reports.map((report) => (
                <div key={report.id} className="p-4 hover:bg-slate-750">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <Badge className={`${getStatusColor(report.status)} text-white`}>
                        {report.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <Badge className={`${getUrgencyColor(report.urgencyLevel)} text-white`}>
                        {report.urgencyLevel.toUpperCase()}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <h3 className="font-medium text-white mb-1">
                    {report.reportType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h3>
                  
                  <p className="text-slate-300 text-sm mb-2 line-clamp-2">
                    {report.materialsClarification}
                  </p>
                  
                  {report.additionalNotes && (
                    <p className="text-slate-400 text-xs">
                      Notes: {report.additionalNotes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-4 text-center">
          <button 
            onClick={() => window.location.href = '/'}
            className="py-3 px-2 text-slate-400 hover:text-white"
          >
            <i className="fas fa-home block mb-1"></i>
            <span className="text-xs">Dashboard</span>
          </button>
          <button 
            onClick={() => window.location.href = '/jobs'}
            className="py-3 px-2 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button className="py-3 px-2 text-yellow-400">
            <i className="fas fa-clipboard-list block mb-1"></i>
            <span className="text-xs">Reports</span>
          </button>
          <button 
            onClick={() => window.location.href = '/more'}
            className="py-3 px-2 text-slate-400 hover:text-white"
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import UploadCsv from "@/components/upload-csv";
import { FileText, Clock, CheckCircle, XCircle, AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

interface CsvUpload {
  id: string;
  filename: string;
  status: "processing" | "processed" | "failed";
  jobsCount: string;
  createdAt: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "processed":
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "processing":
      return <Clock className="h-5 w-5 text-yellow-600" />;
    default:
      return <AlertCircle className="h-5 w-5 text-gray-600" />;
  }
}

function getStatusText(status: string) {
  switch (status) {
    case "processed":
      return "Completed";
    case "failed":
      return "Failed";
    case "processing":
      return "Processing";
    default:
      return "Unknown";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "processed":
      return "text-green-700 bg-green-100";
    case "failed":
      return "text-red-700 bg-red-100";
    case "processing":
      return "text-yellow-700 bg-yellow-100";
    default:
      return "text-gray-700 bg-gray-100";
  }
}

export default function UploadJob() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: uploads = [] } = useQuery<CsvUpload[]>({
    queryKey: ['/api/csv-uploads'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const response = await apiRequest('DELETE', `/api/csv-uploads/${uploadId}`);
      if (!response.ok) {
        throw new Error('Failed to delete upload record');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Upload Deleted",
        description: "CSV upload record has been successfully deleted",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/csv-uploads'] });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete upload",
        variant: "destructive",
      });
    },
  });

  const handleDeleteUpload = (uploadId: string, filename: string) => {
    if (confirm(`Are you sure you want to delete the upload record for "${filename}"? This action cannot be undone.`)) {
      deleteMutation.mutate(uploadId);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-slate-900">Upload Job Files</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => window.location.href = '/'}
                className="text-slate-600 hover:text-slate-900"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div>
            <UploadCsv />
          </div>

          {/* Upload History */}
          <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Uploads</h3>
            
            {uploads.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                <p className="text-slate-500">No uploads yet</p>
                <p className="text-sm text-slate-400 mt-1">
                  Upload your first CSV file to get started
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {uploads.slice().reverse().map((upload) => (
                  <div
                    key={upload.id}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <div className="flex items-center space-x-3">
                      <FileText className="h-8 w-8 text-slate-400" />
                      <div>
                        <div className="font-medium text-slate-900">
                          {upload.filename}
                        </div>
                        <div className="text-sm text-slate-500">
                          {upload.jobsCount} job(s) created
                        </div>
                        <div className="text-xs text-slate-400">
                          {new Date(upload.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(upload.status)}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            upload.status
                          )}`}
                        >
                          {getStatusText(upload.status)}
                        </span>
                      </div>
                      <Button
                        onClick={() => handleDeleteUpload(upload.id, upload.filename)}
                        disabled={deleteMutation.isPending}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 h-8 w-8"
                        title="Delete upload record"
                      >
                        {deleteMutation.isPending ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="text-lg font-medium text-blue-900 mb-3">CSV File Format Requirements</h4>
          <div className="text-sm text-blue-800 space-y-2">
            <p><strong>Header Information (First 4 lines):</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Name,&lt;Job Name&gt;</li>
              <li>Address,&lt;Job Address&gt;</li>
              <li>Post code,&lt;Postcode&gt;</li>
              <li>Project Type,&lt;Project Type&gt;</li>
            </ul>
            <p className="mt-3"><strong>Data Section:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Must include columns: Order Date, Build Phase, etc.</li>
              <li>Build Phase column contains the job phases</li>
              <li>System will extract unique phases automatically</li>
            </ul>
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
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin-task-monitor'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
          <button className="py-3 px-4 text-yellow-400">
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
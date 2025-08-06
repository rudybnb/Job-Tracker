import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { CsvUpload } from "@shared/schema";

export default function UploadCsv() {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recentUploads } = useQuery<CsvUpload[]>({
    queryKey: ['/api/csv-uploads'],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      
      const response = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "CSV Upload Successful",
        description: `Created ${data.jobsCreated} jobs from ${data.upload.filename}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/csv-uploads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const formatDate = (dateString?: string | Date | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed': return 'bg-emerald-100 text-emerald-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed': return 'fas fa-check-circle text-emerald-600';
      case 'processing': return 'fas fa-spinner fa-spin text-blue-600';
      case 'failed': return 'fas fa-exclamation-circle text-red-600';
      default: return 'fas fa-file-csv text-slate-600';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900">Upload Jobs</h3>
        <i className="fas fa-upload text-primary-600"></i>
      </div>
      
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragging 
            ? 'border-primary-400 bg-primary-50' 
            : 'border-slate-300 hover:border-primary-400'
        } ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <div className="mx-auto w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center">
            {uploadMutation.isPending ? (
              <i className="fas fa-spinner fa-spin text-primary-600 text-xl"></i>
            ) : (
              <i className="fas fa-file-csv text-primary-600 text-xl"></i>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">Upload CSV File</p>
            <p className="text-xs text-slate-500 mt-1">Drag and drop or click to browse</p>
          </div>
          <div>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
              id="csv-upload"
              disabled={uploadMutation.isPending}
            />
            <Button 
              asChild
              className="bg-primary-600 text-white hover:bg-primary-700"
              disabled={uploadMutation.isPending}
            >
              <label htmlFor="csv-upload" className="cursor-pointer">
                {uploadMutation.isPending ? 'Uploading...' : 'Choose File'}
              </label>
            </Button>
          </div>
          <p className="text-xs text-slate-400">Supports .csv files up to 10MB</p>
        </div>
      </div>

      {/* Recent Uploads */}
      <div className="mt-6">
        <h4 className="text-sm font-medium text-slate-900 mb-3">Recent Uploads</h4>
        <div className="space-y-3">
          {recentUploads && recentUploads.length > 0 ? (
            recentUploads.slice(0, 3).map((upload) => (
              <div key={upload.id} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                <i className={getStatusIcon(upload.status)}></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{upload.filename}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(upload.uploadedAt)} • {upload.jobsCount} jobs
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(upload.status)}`}>
                  {upload.status.charAt(0).toUpperCase() + upload.status.slice(1)}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-sm text-slate-500">
              No uploads yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

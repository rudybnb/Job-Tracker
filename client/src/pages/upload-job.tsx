import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface UploadedJob {
  id: string;
  name: string;
  location: string;
  price: string;
  status: "approved" | "pending" | "rejected";
  dataType: "CSV Data" | "PDF Data";
  uploadedAt: string;
}

export default function UploadJob() {
  const [hbxlFile, setHbxlFile] = useState<File | null>(null);
  const [phaseFiles, setPhaseFiles] = useState<FileList | null>(null);
  const [jobReference, setJobReference] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mock uploaded jobs data
  const [uploadedJobs, setUploadedJobs] = useState<UploadedJob[]>([
    {
      id: "1",
      name: "Flat12Bedroom",
      location: "Fitout • SG1 1EH • £0",
      price: "£0",
      status: "approved",
      dataType: "CSV Data",
      uploadedAt: "06/08/2025"
    },
    {
      id: "2", 
      name: "Flat21Bedroom",
      location: "Fitout • SG1 1EH • £0",
      price: "£0",
      status: "approved",
      dataType: "CSV Data",
      uploadedAt: "06/08/2025"
    }
  ]);

  const handleHbxlFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setHbxlFile(e.target.files[0]);
    }
  };

  const handlePhaseFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhaseFiles(e.target.files);
    }
  };

  const handleUploadHbxl = () => {
    if (!hbxlFile) {
      toast({
        title: "No file selected",
        description: "Please select an HBXL file to upload",
        variant: "destructive"
      });
      return;
    }

    // Simulate upload
    toast({
      title: "File uploaded successfully",
      description: `${hbxlFile.name} has been processed`,
    });
    setHbxlFile(null);
  };

  const handleApproveJob = (jobId: string) => {
    setUploadedJobs(prev => 
      prev.map(job => 
        job.id === jobId 
          ? { ...job, status: "approved" as const }
          : job
      )
    );
    toast({
      title: "Job approved",
      description: "Job has been approved for assignment creation",
    });
  };

  const handleDeleteJob = (jobId: string) => {
    setUploadedJobs(prev => prev.filter(job => job.id !== jobId));
    toast({
      title: "Job deleted",
      description: "Job has been removed",
    });
  };

  const clearAllJobs = () => {
    setUploadedJobs([]);
    toast({
      title: "All jobs cleared",
      description: "All uploaded jobs have been removed",
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

      <div className="p-4">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-yellow-400 mb-2">HBXL Job Upload & Approval</h1>
          <p className="text-slate-400">Upload HBXL work scheduler files, detect project details, and approve jobs to go live</p>
          <Button 
            onClick={clearAllJobs}
            className="mt-2 bg-red-600 hover:bg-red-700 text-white text-sm"
          >
            Clear All Jobs
          </Button>
        </div>

        {/* Upload HBXL Work Scheduler Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4">
          <div className="flex items-center mb-4">
            <i className="fas fa-upload text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Upload HBXL Work Scheduler</h3>
          </div>
          
          <p className="text-slate-400 text-sm mb-4">
            Upload HBXL CSV or Excel files to automatically detect job information
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-yellow-400 mb-2">
              Select HBXL Work Scheduler File
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleHbxlFileUpload}
                className="hidden"
                id="hbxl-upload"
              />
              <label 
                htmlFor="hbxl-upload"
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg cursor-pointer border border-slate-600"
              >
                Choose file
              </label>
              <span className="text-slate-400">
                {hbxlFile ? hbxlFile.name : "No file chosen"}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-2">
              Supported formats: CSV, Excel (.xlsx, .xls)
            </p>
          </div>

          {hbxlFile && (
            <Button 
              onClick={handleUploadHbxl}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Upload and Process
            </Button>
          )}
        </div>

        {/* Phase Tracking Documents Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4">
          <div className="flex items-center mb-4">
            <i className="fas fa-file-alt text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Phase Tracking Documents</h3>
          </div>

          {/* Job Reference Input */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Enter job reference or leave blank"
              value={jobReference}
              onChange={(e) => setJobReference(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400"
            />
            <p className="text-slate-500 text-xs mt-1">
              Optional: Enter a job reference to link these documents to a specific job
            </p>
          </div>

          {/* File Upload Section */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-yellow-400 mb-2">
              Select Phase Tracking Files
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="file"
                accept=".pdf,.jpg,.png,.webp"
                multiple
                onChange={handlePhaseFileUpload}
                className="hidden"
                id="phase-upload"
              />
              <label 
                htmlFor="phase-upload"
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg cursor-pointer border border-slate-600"
              >
                Choose files
              </label>
              <span className="text-slate-400">
                {phaseFiles ? `${phaseFiles.length} file(s) selected` : "No file chosen"}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-2">
              Supported formats: PDF, JPG, PNG, WebP (multiple files allowed)
            </p>
          </div>
        </div>

        {/* Uploaded Jobs Section */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-yellow-400">Uploaded Jobs</h3>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            Review and approve jobs to make them available for assignment creation
          </p>

          <div className="space-y-3">
            {uploadedJobs.length > 0 ? uploadedJobs.map((job) => (
              <div key={job.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-yellow-400 mb-1">{job.name}</h4>
                    <p className="text-slate-300 text-sm mb-2">{job.location}</p>
                    <div className="flex items-center space-x-3">
                      <Badge 
                        className={job.status === 'approved' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-black'}
                      >
                        {job.status === 'approved' ? 'Approved' : 'Pending'}
                      </Badge>
                      <Badge className="bg-blue-600 text-white">
                        <i className="fas fa-check mr-1"></i>
                        {job.dataType}
                      </Badge>
                    </div>
                    <p className="text-slate-500 text-xs mt-2">
                      Uploaded: {job.uploadedAt}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {job.status !== 'approved' && (
                      <Button
                        onClick={() => handleApproveJob(job.id)}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm"
                      >
                        Approve
                      </Button>
                    )}
                    <Button
                      onClick={() => handleDeleteJob(job.id)}
                      className="bg-red-600 hover:bg-red-700 text-white p-2"
                      size="sm"
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-slate-400">
                No uploaded jobs yet
              </div>
            )}
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
            onClick={() => window.location.href = '/jobs'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button className="py-3 px-4 text-slate-400 hover:text-white">
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
          </button>
          <button className="py-3 px-4 text-yellow-400">
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
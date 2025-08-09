import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ContextualTooltip from "./contextual-tooltip";
import { useWorkflowHelp, WORKFLOW_CONFIGS } from "@/hooks/use-workflow-help";

interface CsvUpload {
  id: string;
  filename: string;
  status: "processing" | "processed" | "failed";
  jobsCount: string;
  createdAt: string;
}

interface UploadResponse {
  upload: CsvUpload;
  jobsCreated: number;
}

interface CSVPreviewData {
  headers: string[];
  rows: string[][];
  jobPreview: Array<{
    name: string;
    address: string;
    projectType: string;
    buildPhases: string[];
  }>;
}

export default function UploadCsv() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CSVPreviewData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Initialize workflow help for CSV upload process
  const workflowHelp = useWorkflowHelp(WORKFLOW_CONFIGS.csvUpload);

  const uploadMutation = useMutation<UploadResponse, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      
      const response = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Upload failed with status ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Mark workflow steps as completed
      workflowHelp.markStepCompleted('file-selection');
      workflowHelp.markStepCompleted('file-validation');
      workflowHelp.markStepCompleted('data-processing');
      workflowHelp.markStepCompleted('job-creation');
      
      toast({
        title: "CSV Upload Successful",
        description: `Created ${data.jobsCreated} job(s) from ${data.upload.filename}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/csv-uploads'] });
      
      // Clear all form data after successful upload
      handleClearData();
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };





  const validateFile = (file: File): boolean => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return false;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: "File Too Large",
        description: "File size must be less than 10MB",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const parseCSVPreview = async (file: File): Promise<CSVPreviewData | null> => {
    try {
      const csvContent = await file.text();
      const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
      
      if (lines.length < 4) {
        throw new Error('CSV must contain Name, Address, Post code, and Project Type headers');
      }

      // Extract header information (first 4 lines) - following your specific CSV format
      let jobName = "Data Missing from CSV";
      let jobAddress = "Data Missing from CSV";
      let jobPostcode = "Data Missing from CSV";
      let jobType = "Data Missing from CSV";
      let phases: string[] = [];

      // Parse header lines (Name,value format)
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        if (line.startsWith('Name,')) {
          jobName = line.split(',')[1]?.trim() || "Data Missing from CSV";
        } else if (line.startsWith('Address,')) {
          jobAddress = line.split(',')[1]?.trim() || "Data Missing from CSV";
        } else if (line.startsWith('Post code,')) {
          jobPostcode = line.split(',')[1]?.trim()?.toUpperCase() || "Data Missing from CSV";
        } else if (line.startsWith('Project Type,')) {
          jobType = line.split(',')[1]?.trim() || "Data Missing from CSV";
        }
      }

      // Parse data section for build phases
      const dataHeaderIndex = lines.findIndex(line => 
        line.includes('Order Date') && line.includes('Build Phase')
      );
      
      if (dataHeaderIndex >= 0) {
        const headers = lines[dataHeaderIndex].split(',').map(h => h.trim());
        const phaseColumnIndex = headers.indexOf('Build Phase');
        
        if (phaseColumnIndex >= 0) {
          for (let i = dataHeaderIndex + 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const phase = values[phaseColumnIndex];
            if (phase && phase !== '' && !phases.includes(phase)) {
              phases.push(phase);
            }
          }
        }
      }

      console.log('🎯 Authentic CSV Data Extracted:', { 
        jobName, 
        jobAddress: `"${jobAddress}"`, // Show exact address with quotes
        jobPostcode: `"${jobPostcode}"`, 
        jobType, 
        phases 
      });

      // Create raw data preview (first 5 lines)
      const mockRawData = {
        headers: ['Name', 'Address', 'Post code', 'Project Type'],
        rows: [[jobName, jobAddress, jobPostcode, jobType]]
      };

      const realJobPreview = [{
        name: jobName,
        address: jobPostcode,
        projectType: jobType,
        buildPhases: phases.length > 0 ? phases : ["Data Missing from CSV"]
      }];

      return { 
        headers: mockRawData.headers, 
        rows: mockRawData.rows, 
        jobPreview: realJobPreview 
      };
    } catch (error) {
      toast({
        title: "CSV Parse Error",
        description: error instanceof Error ? error.message : "Failed to parse CSV file",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        const preview = await parseCSVPreview(file);
        setCsvPreview(preview);
        if (preview) {
          setShowPreview(true);
          workflowHelp.markStepCompleted('file-selection');
          workflowHelp.markStepCompleted('file-validation');
        }
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        const preview = await parseCSVPreview(file);
        setCsvPreview(preview);
        if (preview) {
          setShowPreview(true);
          workflowHelp.markStepCompleted('file-selection');
          workflowHelp.markStepCompleted('file-validation');
        }
      }
    }
  };

  const handleClearData = () => {
    setSelectedFile(null);
    setCsvPreview(null);
    setShowPreview(false);
    // Clear the file input
    const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    toast({
      title: "Data Cleared",
      description: "Selected file and preview data have been cleared",
    });
  };

  const handleCancelPreview = () => {
    setShowPreview(false);
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <h3 className="text-lg font-semibold text-slate-900">Upload Job CSV File</h3>
          <ContextualTooltip
            id="csv-upload-header"
            title="CSV Upload Process"
            content="Upload CSV files containing job data. The system validates format and creates jobs automatically. Only authentic CSV data is used - no assumptions made."
            type="info"
            placement="right"
          >
            <div className="text-blue-500 cursor-help">
              <AlertCircle className="h-4 w-4" />
            </div>
          </ContextualTooltip>
        </div>
        <p className="text-sm text-slate-600">
          Upload CSV files to create new jobs. File format: Name, Address, Project Type, Build Phase data.
        </p>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? "border-blue-400 bg-blue-50"
            : "border-slate-300 hover:border-slate-400"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
          id="csv-upload"
          disabled={uploadMutation.isPending}
        />
        
        {!selectedFile ? (
          <>
            <Upload className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <ContextualTooltip
              id="file-selection-area"
              title="File Selection"
              content="Select a CSV file with required headers: Name, Address, Post code, Project Type, and Build Phase. Files must be under 10MB and contain authentic job data."
              type="help"
              placement="top"
            >
              <label
                htmlFor="csv-upload"
                className="cursor-pointer text-blue-600 hover:text-blue-500 font-medium"
              >
                Click to upload
              </label>
            </ContextualTooltip>
            <span className="text-slate-500"> or drag and drop</span>
            <p className="text-sm text-slate-500 mt-2">CSV files only, up to 10MB</p>
          </>
        ) : (
          <div className="flex items-center justify-center space-x-3">
            <FileText className="h-8 w-8 text-green-600" />
            <span className="text-slate-900 font-medium">{selectedFile.name}</span>
            <ContextualTooltip
              id="clear-file-button"
              title="Clear Selected File"
              content="Remove the selected file and clear all data. You can then select a different file."
              type="warning"
              placement="top"
            >
              <button
                onClick={handleClearData}
                className="flex items-center space-x-1 px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                disabled={uploadMutation.isPending}
              >
                <i className="fas fa-times text-sm"></i>
                <span className="text-xs">Clear</span>
              </button>
            </ContextualTooltip>
          </div>
        )}
      </div>

      {selectedFile && !showPreview && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-slate-600">
            <FileText className="h-4 w-4" />
            <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
          </div>
          
          <ContextualTooltip
            id="preview-button"
            title="Preview CSV Data"
            content="Click to preview the jobs that will be created from your CSV file. You can review all data before approving the upload."
            type="info"
            placement="left"
          >
            <Button
              onClick={() => setShowPreview(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Preview Jobs
            </Button>
          </ContextualTooltip>
        </div>
      )}

      {uploadMutation.error && (
        <div className="mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{uploadMutation.error.message}</span>
        </div>
      )}

      {/* Detailed CSV Preview Modal */}
      {showPreview && csvPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-yellow-600 text-white p-4 text-center">
              <h3 className="text-lg font-semibold">Upload & Detect Job Info</h3>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {/* Dynamic Job Preview - Show actual CSV data */}
              {csvPreview.jobPreview.length > 0 && (
                <div className="mb-6">
                  {/* Detected Job Information Header */}
                  <div className="bg-slate-100 rounded-t-lg p-3">
                    <h4 className="text-slate-700 font-semibold">
                      Detected Job Information ({csvPreview.jobPreview.length} job{csvPreview.jobPreview.length > 1 ? 's' : ''})
                    </h4>
                  </div>

                  {/* Show first job details for preview */}
                  <div className="bg-white border border-slate-200 rounded-b-lg p-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📄</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Name: </span>
                          <span className="text-slate-700">{csvPreview.jobPreview[0].name}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📍</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Postcode: </span>
                          <span className="text-slate-700">{csvPreview.jobPreview[0].address}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📋</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Project Type: </span>
                          <span className="text-slate-700">{csvPreview.jobPreview[0].projectType}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📍</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Address: </span>
                          <span className="text-slate-700">{csvPreview.rawData.rows[0]?.[1] || 'Data Missing from CSV'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Work Phases Section */}
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h5 className="text-blue-800 font-semibold mb-2">
                        Extracted HBXL Work Phases ({csvPreview.jobPreview[0].buildPhases.length})
                      </h5>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {csvPreview.jobPreview[0].buildPhases.map((phase, phaseIndex) => (
                          <span key={phaseIndex} className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm">
                            {phase}
                          </span>
                        ))}
                      </div>
                      <p className="text-blue-700 text-sm">
                        These real work phases will be available for time tracking once the job is approved and goes live.
                      </p>
                    </div>

                    {/* Additional jobs indicator */}
                    {csvPreview.jobPreview.length > 1 && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                        <p className="text-blue-800 text-sm font-medium">
                          + {csvPreview.jobPreview.length - 1} more job{csvPreview.jobPreview.length > 2 ? 's' : ''} will be created from this CSV
                        </p>
                        <p className="text-blue-600 text-xs mt-1">
                          All jobs will be saved to the database and persist after system reboot
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-slate-200 flex space-x-4">
              <Button 
                onClick={handleCancelPreview}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  setShowPreview(false);
                  handleUpload();
                }}
                disabled={uploadMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white flex-1"
              >
                {uploadMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Creating Jobs...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve & Create Jobs
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
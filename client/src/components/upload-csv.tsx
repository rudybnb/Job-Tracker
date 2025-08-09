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
      setSelectedFile(null);
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
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV must have headers and at least one data row');
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1, 6).map(line => // Preview first 5 rows
        line.split(',').map(cell => cell.trim().replace(/"/g, ''))
      );

      // Create job preview based on actual CSV structure
      const jobPreview = rows.map(row => {
        const name = row[0] || 'Unknown';
        const address = row[1] || 'Unknown Address';
        const projectType = row[2] || 'Unknown Project';
        
        // Extract build phases from remaining columns
        const buildPhases = row.slice(3).filter(phase => phase && phase.trim());
        
        return {
          name,
          address,
          projectType,
          buildPhases: buildPhases.length > 0 ? buildPhases : ['No phases specified']
        };
      });

      return { headers, rows, jobPreview };
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
          <div className="flex items-center justify-center space-x-2">
            <FileText className="h-8 w-8 text-green-600" />
            <span className="text-slate-900 font-medium">{selectedFile.name}</span>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-red-500 hover:text-red-700"
              disabled={uploadMutation.isPending}
            >
              ×
            </button>
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

      {/* CSV Preview Modal */}
      {showPreview && csvPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">CSV Preview - {selectedFile?.name}</h3>
                <button 
                  onClick={handleCancelPreview}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                Preview of jobs that will be created from your CSV file. Check the data before proceeding.
              </p>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Raw CSV Preview */}
              <div className="mb-6">
                <h4 className="text-md font-medium text-slate-900 mb-3">Raw CSV Data</h4>
                <div className="bg-slate-50 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                  <div className="font-bold text-blue-600 mb-2">
                    {csvPreview.headers.join(' | ')}
                  </div>
                  {csvPreview.rows.map((row, index) => (
                    <div key={index} className="text-slate-700 border-t border-slate-200 pt-1">
                      {row.join(' | ')}
                    </div>
                  ))}
                  {csvPreview.rows.length === 5 && (
                    <div className="text-slate-500 italic mt-2">... and more rows</div>
                  )}
                </div>
              </div>

              {/* Job Preview */}
              <div>
                <h4 className="text-md font-medium text-slate-900 mb-3">Jobs to be Created</h4>
                <div className="space-y-4">
                  {csvPreview.jobPreview.map((job, index) => (
                    <div key={index} className="border border-slate-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="font-medium text-slate-900">{job.name}</div>
                          <div className="text-sm text-slate-600">{job.address}</div>
                          <div className="text-sm text-blue-600 font-medium">{job.projectType}</div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-700 font-medium mb-1">Build Phases:</div>
                          {job.buildPhases.map((phase, phaseIndex) => (
                            <div key={phaseIndex} className="text-sm text-slate-600">• {phase}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                This will create {csvPreview.jobPreview.length} job(s) with authentic CSV data
              </div>
              <div className="flex space-x-3">
                <Button 
                  onClick={handleCancelPreview}
                  variant="outline"
                  className="border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <ContextualTooltip
                  id="approve-upload-button"
                  title="Approve CSV Upload"
                  content="Click to proceed with creating jobs from the previewed CSV data. This will process all rows and create job entries with GPS coordinates."
                  type="success"
                  placement="top"
                >
                  <Button 
                    onClick={() => {
                      setShowPreview(false);
                      handleUpload();
                    }}
                    disabled={uploadMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
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
                </ContextualTooltip>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
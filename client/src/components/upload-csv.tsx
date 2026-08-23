import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ContextualTooltip from "./contextual-tooltip";
import { useWorkflowHelp, WORKFLOW_CONFIGS } from "@/hooks/use-workflow-help";
import * as XLSX from "xlsx";
import {
  acceptedJobUploadColumns,
  parseJobUploadCsv,
  suggestJobNameFromSource,
  validateProjectMetadata,
  type JobUploadParseResult,
  type ProjectMetadata,
  type UploadValidationIssue,
} from "@shared/job-upload-import";

interface CsvUpload {
  id: string;
  filename: string;
  status: "processing" | "processed" | "failed";
  jobsCount: string;
  uploadedAt?: string | null;
  createdAt?: string | null;
}

interface UploadResponse {
  upload: CsvUpload;
  jobsCreated: number;
  rowsProcessed: number;
  tasksProcessed: number;
  skippedRows: number;
  duplicate: boolean;
  importFingerprint: string;
  validation: JobUploadParseResult;
}

interface CSVPreviewData {
  headers: string[];
  rows: string[][];
  rawData: {
    headers: string[];
    rows: string[][];
  };
  jobPreview: Array<{
    name: string;
    address: string;
    postcode: string;
    projectType: string;
    buildPhases: string[];
  }>;
  validation: JobUploadParseResult;
}

class UploadRequestError extends Error {
  validation?: JobUploadParseResult;

  constructor(message: string, validation?: JobUploadParseResult) {
    super(message);
    this.validation = validation;
  }
}

export default function UploadCsv() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CSVPreviewData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<UploadResponse | null>(null);
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata>({
    clientName: "",
    projectSiteName: "",
    address: "",
    postcode: "",
    projectType: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Initialize workflow help for CSV upload process
  const workflowHelp = useWorkflowHelp(WORKFLOW_CONFIGS.csvUpload);

  const metadataErrors = validateProjectMetadata(projectMetadata);
  const canApproveUpload = !!selectedFile && !!csvPreview?.validation.valid && metadataErrors.length === 0;

  const uploadMutation = useMutation<UploadResponse, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      formData.append('projectMetadata', JSON.stringify(projectMetadata));
      
      const response = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new UploadRequestError(errorJson.error || `Upload failed with status ${response.status}`, errorJson.validation);
        } catch (parseError) {
          if (parseError instanceof UploadRequestError) throw parseError;
          throw new UploadRequestError(errorText || `Upload failed with status ${response.status}`);
        }
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
        title: "File Upload Successful",
        description: `Created ${data.jobsCreated} job(s), processed ${data.tasksProcessed} task row(s), skipped ${data.skippedRows}.`,
      });
      setLastImportSummary(data);
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/csv-uploads'] });
      
      setSelectedFile(null);
      setCsvPreview(null);
      setShowPreview(false);
      const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
      if (error instanceof UploadRequestError && error.validation) {
        const rows = error.validation.jobPreview.map((job) => [
          projectMetadata.clientName,
          projectMetadata.projectSiteName,
          projectMetadata.address,
          projectMetadata.postcode,
          projectMetadata.projectType,
          job.buildPhases.join(", "),
        ]);
        setCsvPreview({
          headers: ['Client Name', 'Project / Site Name', 'Address', 'Postcode', 'Project Type', 'Build Phases'],
          rows,
          rawData: { headers: ['Client Name', 'Project / Site Name', 'Address', 'Postcode', 'Project Type', 'Build Phases'], rows },
          jobPreview: error.validation.jobPreview,
          validation: error.validation,
        });
        setShowPreview(true);
      }
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
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
      toast({
        title: "Invalid File Type",
        description: "Please select a CSV file (.csv) or Excel file (.xlsx)",
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
      const csvContent = file.name.toLowerCase().endsWith('.xlsx')
        ? await readExcelAsCsv(file)
        : await file.text();
      const validation = parseJobUploadCsv(csvContent);
      const suggestedJobName = suggestJobNameFromSource(file.name);
      setProjectMetadata((current) => ({
        ...current,
        projectSiteName: validation.jobPreview[0]?.name || suggestedJobName,
      }));

      // Create raw data preview
      const rawData = {
        headers: ['Name', 'Address', 'Postcode', 'Project Type', 'Build Phases'],
        rows: validation.jobPreview.map((job) => [
          job.name,
          job.address,
          job.postcode,
          job.projectType,
          job.buildPhases.join(', '),
        ])
      };

      return { 
        headers: rawData.headers, 
        rows: rawData.rows,
        rawData: rawData,
        jobPreview: validation.jobPreview,
        validation,
      };
    } catch (error) {
      toast({
        title: "File Parse Error",
        description: error instanceof Error ? error.message : "Failed to parse file",
        variant: "destructive",
      });
      return null;
    }
  };

  const readExcelAsCsv = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Excel workbook does not contain any sheets');
      const worksheet = workbook.Sheets[sheetName];
      setProjectMetadata((current) => ({
        ...current,
        projectSiteName: suggestJobNameFromSource(sheetName || file.name),
      }));
      return XLSX.utils.sheet_to_csv(worksheet);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setLastImportSummary(null);
        setProjectMetadata({ clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" });
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
        setLastImportSummary(null);
        setProjectMetadata({ clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" });
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
    setLastImportSummary(null);
    setProjectMetadata({ clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" });
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
    if (canApproveUpload && selectedFile) {
      uploadMutation.mutate(selectedFile);
    } else {
      toast({
        title: "Validation Required",
        description: "Fix the listed upload validation errors before creating jobs.",
        variant: "destructive",
      });
    }
  };

  const updateProjectMetadata = (field: keyof ProjectMetadata, value: string) => {
    setProjectMetadata((current) => ({
      ...current,
      [field]: field === "postcode" ? value.toUpperCase() : value,
    }));
  };

  const issueForField = (issues: UploadValidationIssue[], field: keyof ProjectMetadata) => {
    const labelByField: Record<keyof ProjectMetadata, string> = {
      clientName: "Client Name",
      projectSiteName: "Project / Site Name",
      address: "Address",
      postcode: "Postcode",
      projectType: "Project Type",
    };
    return issues.find((issue) => issue.field === labelByField[field]);
  };

  const resourcePreview = (() => {
    if (!csvPreview?.validation.jobs[0]?.phaseTaskData) return [];
    try {
      const parsed = JSON.parse(csvPreview.validation.jobs[0].phaseTaskData) as {
        phases?: Record<string, Array<{ task?: string; description?: string; resourceType?: string; quantity?: number; supplier?: string }>>;
      };
      return Object.entries(parsed.phases ?? {})
        .flatMap(([phase, tasks]) => tasks.map((task) => ({ phase, ...task })))
        .slice(0, 8);
    } catch {
      return [];
    }
  })();

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <h3 className="text-lg font-semibold text-amber-400">Upload Job CSV File</h3>
          <ContextualTooltip
            id="csv-upload-header"
            title="CSV Upload Process"
            content="Upload CSV files containing job data. The system validates format and creates jobs automatically. Only authentic CSV data is used - no assumptions made."
            type="info"
            placement="right"
          >
            <div className="text-amber-500 cursor-help">
              <AlertCircle className="h-4 w-4" />
            </div>
          </ContextualTooltip>
        </div>
        <p className="text-sm text-slate-400">
          Upload HBXL Smart Schedule CSV/XLSX files. Project address details are entered during approval.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Accepted columns include: {acceptedJobUploadColumns.slice(0, 10).join(', ')}.
        </p>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? "border-amber-400 bg-amber-900/10"
            : "border-slate-600 hover:border-slate-500"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileSelect}
          className="hidden"
          id="csv-upload"
          disabled={uploadMutation.isPending}
        />
        
        {!selectedFile ? (
          <>
            <Upload className="mx-auto h-12 w-12 text-slate-500 mb-4" />
            <ContextualTooltip
              id="file-selection-area"
              title="File Selection"
              content="Select a CSV or Excel file with required headers: Name, Address, Post code, Project Type, and Build Phase. Files must be under 10MB and contain authentic job data."
              type="help"
              placement="top"
            >
              <label
                htmlFor="csv-upload"
                className="cursor-pointer text-amber-500 hover:text-amber-400 font-medium"
              >
                Click to upload
              </label>
            </ContextualTooltip>
            <span className="text-slate-400"> or drag and drop</span>
            <p className="text-sm text-slate-500 mt-2">CSV or Excel files, up to 10MB</p>
          </>
        ) : (
          <div className="flex items-center justify-center space-x-3">
            <FileText className="h-8 w-8 text-green-500" />
            <span className="text-slate-200 font-medium">{selectedFile.name}</span>
            <ContextualTooltip
              id="clear-file-button"
              title="Clear Selected File"
              content="Remove the selected file and clear all data. You can then select a different file."
              type="warning"
              placement="top"
            >
              <button
                onClick={handleClearData}
                className="flex items-center space-x-1 px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
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
          <div className="flex items-center space-x-2 text-sm text-slate-400">
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
              className="bg-amber-600 hover:bg-amber-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Preview Jobs
            </Button>
          </ContextualTooltip>
        </div>
      )}

      {uploadMutation.error && (
        <div className="mt-4 flex items-center space-x-2 text-red-400 bg-red-900/20 border border-red-700/30 p-3 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{uploadMutation.error.message}</span>
        </div>
      )}

      {lastImportSummary && (
        <div className="mt-4 text-sm text-green-200 bg-green-900/20 border border-green-700/30 p-3 rounded-lg">
          <div className="font-semibold text-green-300">Import complete</div>
          <div>
            {lastImportSummary.jobsCreated} job(s) created · {lastImportSummary.tasksProcessed} task row(s) processed · {lastImportSummary.skippedRows} skipped · duplicate retry: {lastImportSummary.duplicate ? 'blocked' : 'clear'}
          </div>
          <div className="text-xs text-green-300/80 mt-1">
            Upload reference: {lastImportSummary.upload.id}
          </div>
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
              <div className={`mb-4 rounded-lg border p-3 ${csvPreview.validation.valid ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <div className="font-semibold">
                  {csvPreview.validation.valid ? 'Validation passed' : 'Validation failed - no jobs can be created yet'}
                </div>
                <div className="text-sm mt-1">
                  Format: {csvPreview.validation.format} · Schedule rows: {csvPreview.validation.stats.taskRows} · Phases: {csvPreview.validation.stats.phases} · Malformed rows: {csvPreview.validation.stats.malformedRows}
                </div>
                {csvPreview.validation.errors.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm list-disc pl-5">
                    {csvPreview.validation.errors.map((issue, index) => (
                      <li key={index}>
                        {issue.line ? `Line ${issue.line}: ` : ''}{issue.field ? `${issue.field} - ` : ''}{issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={`mb-4 rounded-lg border p-4 ${metadataErrors.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="text-slate-800 font-semibold mb-1">Required Project Information</div>
                <p className="text-slate-600 text-sm mb-4">
                  HBXL schedule exports do not include these project fields. Confirm or edit them before creating jobs.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([
                    ["clientName", "Client Name"],
                    ["projectSiteName", "Project / Site Name"],
                    ["address", "Address"],
                    ["postcode", "Postcode"],
                    ["projectType", "Project Type"],
                  ] as Array<[keyof ProjectMetadata, string]>).map(([field, label]) => {
                    const issue = issueForField(metadataErrors, field);
                    return (
                      <label key={field} className="block text-sm font-medium text-slate-700">
                        {label}
                        <input
                          value={projectMetadata[field]}
                          onChange={(event) => updateProjectMetadata(field, event.target.value)}
                          className={`mt-1 w-full rounded-md border px-3 py-2 text-slate-900 ${issue ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                          placeholder={field === 'projectSiteName' ? 'e.g. Spencer House' : ''}
                        />
                        {issue && <span className="mt-1 block text-xs text-red-700">{issue.message}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Job Preview - Show actual CSV data */}
              {csvPreview.jobPreview.length > 0 && (
                <div className="mb-6">
                  {/* Detected Job Information Header */}
                  <div className="bg-slate-100 rounded-t-lg p-3">
                    <h4 className="text-slate-700 font-semibold">
                      Extracted HBXL Schedule Preview
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
                          <span className="text-yellow-600 font-medium">Client Name: </span>
                          <span className="text-slate-700">{projectMetadata.clientName || 'Required before approval'}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📄</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Project / Site: </span>
                          <span className="text-slate-700">{projectMetadata.projectSiteName || 'Required before approval'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📍</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Postcode: </span>
                          <span className="text-slate-700">{projectMetadata.postcode || 'Required before approval'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📋</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Project Type: </span>
                          <span className="text-slate-700">{projectMetadata.projectType || 'Required before approval'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs">📍</span>
                        </div>
                        <div>
                          <span className="text-yellow-600 font-medium">Address: </span>
                          <span className="text-slate-700">{projectMetadata.address || 'Required before approval'}</span>
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
                      {resourcePreview.length > 0 && (
                        <div className="mt-4 border-t border-blue-200 pt-3">
                          <div className="text-blue-900 font-semibold text-sm mb-2">Extracted resource/task examples</div>
                          <div className="space-y-2">
                            {resourcePreview.map((resource, index) => (
                              <div key={index} className="rounded-md bg-white/80 border border-blue-100 p-2 text-sm text-slate-700">
                                <div className="font-medium text-slate-800">{resource.phase}: {resource.task || resource.description}</div>
                                <div className="text-xs text-slate-500">
                                  {resource.resourceType || 'Resource'} · Qty {resource.quantity ?? 0} · {resource.supplier || 'Supplier not specified'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional jobs indicator */}
                    {csvPreview.jobPreview.length > 1 && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                        <p className="text-blue-800 text-sm font-medium">
                          + {csvPreview.jobPreview.length - 1} more job{csvPreview.jobPreview.length > 2 ? 's' : ''} will be created from this CSV
                        </p>
                        <p className="text-blue-600 text-xs mt-1">
                          All extracted schedule data will be saved only after required project information is complete.
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
                  if (canApproveUpload) {
                    setShowPreview(false);
                    handleUpload();
                  }
                }}
                disabled={uploadMutation.isPending || !canApproveUpload}
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
                    {canApproveUpload ? 'Approve & Create Jobs' : 'Complete Required Fields'}
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

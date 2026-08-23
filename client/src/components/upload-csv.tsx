import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, AlertCircle, CheckCircle2, AlertTriangle, Edit3, Check, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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

interface WordQuoteTask {
  name: string;
  description?: string;
  sourceReference?: string;
}

interface WordQuoteCategory {
  name: string;
  tasks: WordQuoteTask[];
}

interface WordQuoteLocation {
  name: string;
  normalizedName: string;
  reviewStatus: "CONFIRMED" | "REVIEW_REQUIRED";
  reviewReason?: string;
  suggestedMapping?: string;
  categories: WordQuoteCategory[];
}

interface WordQuotePreviewData {
  metadata: {
    clientName: string;
    projectSiteName: string;
    address: string;
    postcode: string;
    projectType: string;
    quoteReference: string;
    quoteDate: string;
    totalQuotePrice: number | null;
    formattedTotalPrice: string;
  };
  locations: WordQuoteLocation[];
  stats: {
    locationCount: number;
    categoryCount: number;
    taskCount: number;
    flaggedLocationCount: number;
  };
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
  const [fileType, setFileType] = useState<"csv" | "docx">("csv");
  const [csvPreview, setCsvPreview] = useState<CSVPreviewData | null>(null);
  const [wordPreview, setWordPreview] = useState<WordQuotePreviewData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editingLocationIndex, setEditingLocationIndex] = useState<number | null>(null);
  const [editedLocationName, setEditedLocationName] = useState("");
  const [lastImportSummary, setLastImportSummary] = useState<UploadResponse | null>(null);
  const [wordImportSuccess, setWordImportSuccess] = useState<{
    jobTitle: string;
    locationsCount: number;
    tasksCount: number;
    quotedAmount: string;
  } | null>(null);

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
  const canApproveUpload = !!selectedFile && (
    (fileType === "csv" && !!csvPreview?.validation.valid && metadataErrors.length === 0) ||
    (fileType === "docx" && !!wordPreview && wordPreview.locations.length > 0)
  );

  // CSV Upload Mutation
  const uploadCsvMutation = useMutation<UploadResponse, Error, File>({
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

  // Word Quote Upload Mutation
  const uploadWordMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('quoteFile', file);
      if (wordPreview) {
        formData.append('clientName', wordPreview.metadata.clientName);
        formData.append('projectSiteName', wordPreview.metadata.projectSiteName);
        formData.append('address', wordPreview.metadata.address);
        formData.append('postcode', wordPreview.metadata.postcode);
        formData.append('projectType', wordPreview.metadata.projectType);
      }
      
      const response = await fetch('/api/upload-word-quote', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorJson.error || 'Failed to import Word quote');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "HBXL Word Quote Imported Successfully",
        description: `Created "${data.job?.title}" with ${data.locationsCount} rooms and ${data.tasksCount} operational work items.`,
      });
      setWordImportSuccess({
        jobTitle: data.job?.title || "Imported Job",
        locationsCount: data.locationsCount || 0,
        tasksCount: data.tasksCount || 0,
        quotedAmount: data.job?.quotedAmount || "N/A",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/csv-uploads'] });

      setSelectedFile(null);
      setWordPreview(null);
      setShowPreview(false);
      const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    },
    onError: (error: Error) => {
      toast({
        title: "Word Quote Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isPending = uploadCsvMutation.isPending || uploadWordMutation.isPending;

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
    const isCsvOrExcel = fileName.endsWith('.csv') || fileName.endsWith('.xlsx');
    const isDocx = fileName.endsWith('.docx');

    if (!isCsvOrExcel && !isDocx) {
      toast({
        title: "Invalid File Type",
        description: "Please select an HBXL CSV (.csv), Excel (.xlsx), or HBXL Word Quote (.docx) file.",
        variant: "destructive",
      });
      return false;
    }
    
    if (file.size > 25 * 1024 * 1024) { // 25MB limit
      toast({
        title: "File Too Large",
        description: "File size must be less than 25MB",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const parseWordPreview = async (file: File): Promise<WordQuotePreviewData | null> => {
    try {
      const formData = new FormData();
      formData.append('quoteFile', file);
      const res = await fetch('/api/upload-word-quote?preview=true', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ error: 'Failed to parse Word quote' }));
        throw new Error(errorJson.error || 'Failed to parse Word quote');
      }
      const data = await res.json();
      return {
        metadata: data.metadata,
        locations: data.locations,
        stats: data.stats,
      };
    } catch (error) {
      toast({
        title: "Word Quote Parse Error",
        description: error instanceof Error ? error.message : "Failed to parse Word document",
        variant: "destructive",
      });
      return null;
    }
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

  const processSelectedFile = async (file: File) => {
    if (!validateFile(file)) return;

    setSelectedFile(file);
    setLastImportSummary(null);
    setWordImportSuccess(null);

    if (file.name.toLowerCase().endsWith('.docx')) {
      setFileType("docx");
      const preview = await parseWordPreview(file);
      if (preview) {
        setWordPreview(preview);
        setShowPreview(true);
        workflowHelp.markStepCompleted('file-selection');
        workflowHelp.markStepCompleted('file-validation');
      }
    } else {
      setFileType("csv");
      setProjectMetadata({ clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" });
      const preview = await parseCSVPreview(file);
      setCsvPreview(preview);
      if (preview) {
        setShowPreview(true);
        workflowHelp.markStepCompleted('file-selection');
        workflowHelp.markStepCompleted('file-validation');
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleClearData = () => {
    setSelectedFile(null);
    setCsvPreview(null);
    setWordPreview(null);
    setShowPreview(false);
    setLastImportSummary(null);
    setWordImportSuccess(null);
    setProjectMetadata({ clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" });
    const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    toast({
      title: "Data Cleared",
      description: "Selected file and preview data have been cleared",
    });
  };

  const handleCancelPreview = () => {
    setShowPreview(false);
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    if (fileType === "docx") {
      uploadWordMutation.mutate(selectedFile);
    } else {
      if (canApproveUpload) {
        uploadCsvMutation.mutate(selectedFile);
      } else {
        toast({
          title: "Validation Required",
          description: "Fix the listed upload validation errors before creating jobs.",
          variant: "destructive",
        });
      }
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

  const handleRenameLocation = (index: number) => {
    if (!wordPreview) return;
    const newName = editedLocationName.trim();
    if (!newName) return;

    const updatedLocations = [...wordPreview.locations];
    updatedLocations[index] = {
      ...updatedLocations[index],
      name: newName,
      normalizedName: newName.toLowerCase(),
      reviewStatus: "CONFIRMED",
      reviewReason: undefined,
    };

    setWordPreview({
      ...wordPreview,
      locations: updatedLocations,
      stats: {
        ...wordPreview.stats,
        flaggedLocationCount: updatedLocations.filter((l) => l.reviewStatus === "REVIEW_REQUIRED").length,
      },
    });

    setEditingLocationIndex(null);
    setEditedLocationName("");
    toast({
      title: "Location Renamed",
      description: `Location updated to "${newName}" and marked confirmed.`,
    });
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <h3 className="text-lg font-semibold text-amber-400">Upload Job Files</h3>
          <ContextualTooltip
            id="csv-upload-header"
            title="Job File Upload"
            content="Upload HBXL Smart Schedule (CSV/XLSX) or HBXL Quote (DOCX) files. Smart Schedule imports build phases, while Word Quote imports Room/Task hierarchy for worker assignment."
            type="info"
            placement="right"
          >
            <div className="text-amber-500 cursor-help">
              <AlertCircle className="h-4 w-4" />
            </div>
          </ContextualTooltip>
        </div>
        <p className="text-sm text-slate-400">
          Upload <strong>HBXL Smart Schedule (.csv / .xlsx)</strong> or <strong>HBXL Word Quote (.docx)</strong> files.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="inline-flex items-center gap-1 text-xs bg-slate-700/80 text-slate-300 px-2 py-1 rounded">
            <FileSpreadsheet className="h-3.5 w-3.5 text-blue-400" />
            Smart Schedule CSV/XLSX (Phases & Timelines)
          </span>
          <span className="inline-flex items-center gap-1 text-xs bg-slate-700/80 text-slate-300 px-2 py-1 rounded">
            <FileText className="h-3.5 w-3.5 text-amber-400" />
            Word Quote DOCX (Rooms & Work Items)
          </span>
        </div>
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
          accept=".csv,.xlsx,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileSelect}
          className="hidden"
          id="csv-upload"
          disabled={isPending}
        />
        
        {!selectedFile ? (
          <>
            <Upload className="mx-auto h-12 w-12 text-slate-500 mb-4" />
            <ContextualTooltip
              id="file-selection-area"
              title="File Selection"
              content="Select an HBXL Schedule (.csv, .xlsx) or HBXL Quote (.docx). Word quote files automatically extract Room and Task structures."
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
            <p className="text-sm text-slate-500 mt-2">HBXL CSV, XLSX, or DOCX Quote files up to 25MB</p>
          </>
        ) : (
          <div className="flex items-center justify-center space-x-3">
            {fileType === "docx" ? (
              <FileText className="h-8 w-8 text-amber-400" />
            ) : (
              <FileSpreadsheet className="h-8 w-8 text-green-500" />
            )}
            <span className="text-slate-200 font-medium">{selectedFile.name}</span>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
              {fileType === "docx" ? "HBXL Quote DOCX" : "Smart Schedule CSV/XLSX"}
            </span>
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
                disabled={isPending}
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
          
          <Button
            onClick={() => setShowPreview(true)}
            className="bg-amber-600 hover:bg-amber-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {fileType === "docx" ? "Review Quote Rooms & Tasks" : "Preview Jobs"}
          </Button>
        </div>
      )}

      {uploadCsvMutation.error && (
        <div className="mt-4 flex items-center space-x-2 text-red-400 bg-red-900/20 border border-red-700/30 p-3 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{uploadCsvMutation.error.message}</span>
        </div>
      )}

      {uploadWordMutation.error && (
        <div className="mt-4 flex items-center space-x-2 text-red-400 bg-red-900/20 border border-red-700/30 p-3 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{uploadWordMutation.error.message}</span>
        </div>
      )}

      {lastImportSummary && (
        <div className="mt-4 text-sm text-green-200 bg-green-900/20 border border-green-700/30 p-3 rounded-lg">
          <div className="font-semibold text-green-300">Smart Schedule Import Complete</div>
          <div>
            {lastImportSummary.jobsCreated} job(s) created · {lastImportSummary.tasksProcessed} task row(s) processed · {lastImportSummary.skippedRows} skipped.
          </div>
          <div className="text-xs text-green-300/80 mt-1">
            Upload reference: {lastImportSummary.upload.id}
          </div>
        </div>
      )}

      {wordImportSuccess && (
        <div className="mt-4 text-sm text-green-200 bg-green-900/20 border border-green-700/30 p-4 rounded-lg">
          <div className="font-semibold text-green-300 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            HBXL Word Quote Import Complete: {wordImportSuccess.jobTitle}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-800/80 p-2 rounded">
              <span className="text-slate-400 block">Rooms / Locations:</span>
              <strong className="text-white text-sm">{wordImportSuccess.locationsCount}</strong>
            </div>
            <div className="bg-slate-800/80 p-2 rounded">
              <span className="text-slate-400 block">Work Items / Tasks:</span>
              <strong className="text-white text-sm">{wordImportSuccess.tasksCount}</strong>
            </div>
            <div className="bg-slate-800/80 p-2 rounded">
              <span className="text-slate-400 block">Client Quote Value:</span>
              <strong className="text-amber-400 text-sm">{wordImportSuccess.quotedAmount}</strong>
            </div>
          </div>
          <p className="text-xs text-slate-300 mt-2">
            Operational work structure is ready for worker assignment in Job Assignments.
          </p>
        </div>
      )}

      {/* HBXL Word Quote Preview Modal */}
      {showPreview && fileType === "docx" && wordPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col text-slate-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-4 px-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">HBXL Word Quote Review</h3>
                <p className="text-xs text-amber-100">Operational room and task structure extracted for worker allocation</p>
              </div>
              {wordPreview.metadata.formattedTotalPrice && (
                <div className="text-right bg-amber-800/60 px-3 py-1.5 rounded-lg border border-amber-500/30">
                  <span className="text-xs text-amber-200 block">Quote Total</span>
                  <strong className="text-base font-bold text-white">{wordPreview.metadata.formattedTotalPrice}</strong>
                </div>
              )}
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Project & Client Metadata */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">Quote Information</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Project / Site</span>
                    <strong className="text-slate-200">{wordPreview.metadata.projectSiteName || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Client</span>
                    <strong className="text-slate-200">{wordPreview.metadata.clientName || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Address</span>
                    <span className="text-slate-300 truncate block">{wordPreview.metadata.address || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Postcode</span>
                    <span className="text-slate-300">{wordPreview.metadata.postcode || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Review Alerts Banner if any location needs review */}
              {wordPreview.stats.flaggedLocationCount > 0 && (
                <div className="bg-amber-950/40 border border-amber-600/50 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-semibold text-amber-300 text-sm">
                      {wordPreview.stats.flaggedLocationCount} Location(s) Need Admin Review
                    </h5>
                    <p className="text-xs text-slate-300 mt-1">
                      Generic location headings or spelling variants (e.g. &quot;Dining Room&quot; vs &quot;Dinning Room&quot;) are flagged below. You can rename or map them now before creating operational tasks.
                    </p>
                  </div>
                </div>
              )}

              {/* Extracted Locations & Work Categories */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <span>Extracted Rooms & Work Structure</span>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                      {wordPreview.locations.length} Locations · {wordPreview.stats.taskCount} Work Items
                    </span>
                  </h4>
                </div>

                <div className="space-y-3">
                  {wordPreview.locations.map((loc, locIndex) => {
                    const isFlagged = loc.reviewStatus === "REVIEW_REQUIRED";
                    const isEditing = editingLocationIndex === locIndex;

                    return (
                      <div
                        key={locIndex}
                        className={`rounded-lg border p-4 transition-colors ${
                          isFlagged
                            ? "bg-amber-950/20 border-amber-700/60"
                            : "bg-slate-800/60 border-slate-700"
                        }`}
                      >
                        {/* Location Title & Review Status */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editedLocationName}
                                  onChange={(e) => setEditedLocationName(e.target.value)}
                                  className="bg-slate-900 border border-amber-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleRenameLocation(locIndex)}
                                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                                >
                                  <Check className="h-3.5 w-3.5 inline mr-1" />
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingLocationIndex(null)}
                                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <strong className="text-base text-slate-100">{loc.name}</strong>
                                <button
                                  onClick={() => {
                                    setEditingLocationIndex(locIndex);
                                    setEditedLocationName(loc.name);
                                  }}
                                  className="text-slate-400 hover:text-amber-400 text-xs p-1"
                                  title="Rename location"
                                >
                                  <Edit3 className="h-3.5 w-3.5 inline" />
                                </button>
                              </>
                            )}
                          </div>

                          {/* Badge */}
                          {isFlagged ? (
                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Location needs review
                            </Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-300 border border-green-500/40 text-xs flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Confirmed
                            </Badge>
                          )}
                        </div>

                        {/* Review Reason */}
                        {isFlagged && loc.reviewReason && (
                          <div className="text-xs text-amber-300/90 mb-3 bg-amber-900/30 p-2 rounded border border-amber-800/40">
                            <strong>Review Reason:</strong> {loc.reviewReason}
                          </div>
                        )}

                        {/* Categories and Tasks */}
                        <div className="space-y-2 mt-2">
                          {loc.categories.map((cat, catIndex) => (
                            <div key={catIndex} className="bg-slate-900/70 border border-slate-700/60 rounded p-2.5">
                              <span className="text-xs font-semibold text-amber-400 block mb-1.5">
                                → {cat.name}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {cat.tasks.map((task, taskIndex) => (
                                  <span
                                    key={taskIndex}
                                    className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
                                  >
                                    {task.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 px-6 border-t border-slate-800 bg-slate-950/80 flex space-x-4">
              <Button 
                onClick={handleCancelPreview}
                variant="outline"
                className="flex-1 bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpload}
                disabled={isPending || !canApproveUpload}
                className="bg-amber-600 hover:bg-amber-700 text-white flex-1 font-semibold"
              >
                {uploadWordMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Importing Word Quote...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve & Import Word Quote
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed CSV Preview Modal (Existing CSV logic unchanged) */}
      {showPreview && fileType === "csv" && csvPreview && (
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
                disabled={isPending || !canApproveUpload}
                className="bg-green-600 hover:bg-green-700 text-white flex-1"
              >
                {uploadCsvMutation.isPending ? (
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

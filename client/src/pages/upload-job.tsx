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
  const [uploadedJobs, setUploadedJobs] = useState<UploadedJob[]>(() => {
    const saved = localStorage.getItem('uploadedJobs');
    return saved ? JSON.parse(saved) : [];
  });
  const [processedCSVs, setProcessedCSVs] = useState<any[]>(() => {
    const saved = localStorage.getItem('processedCSVs');
    return saved ? JSON.parse(saved) : [];
  });
  const [showCreateJobForm, setShowCreateJobForm] = useState<string | null>(null);

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
        description: "Please select an HBXL CSV file to upload",
        variant: "destructive"
      });
      return;
    }

    // Parse CSV file to extract phase data and quantities
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvContent = e.target?.result as string;
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      // Extract client info from CSV header area (first few rows)
      let clientInfo = {
        name: '',
        address: '',
        postCode: '',
        projectType: ''
      };

      let dataStartRow = 0;
      
      // Extract client info from Column B rows 1-4 (where Column A has reference labels)
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const row = lines[i];
        const parts = row.split(',').map(p => p.trim().replace(/"/g, ''));
        
        // Column A is reference, Column B is the value we want
        const reference = parts[0]?.toLowerCase() || '';
        const value = parts[1] || '';
        
        if (reference.includes('name')) {
          clientInfo.name = value;
        } else if (reference.includes('address')) {
          clientInfo.address = value;
        } else if (reference.includes('post code') || reference.includes('postcode')) {
          clientInfo.postCode = value;
        } else if (reference.includes('project type') || reference.includes('projecttype')) {
          clientInfo.projectType = value;
        } else if (reference.includes('code') && value.includes('item')) {
          // Found the data header row (Code, Item Description, etc.)
          dataStartRow = i;
          break;
        }
      }
      
      // Parse header to find column indices
      const headers = lines[dataStartRow].split(',').map(h => h.trim().replace(/"/g, ''));
      const codeIndex = headers.findIndex(h => h.toLowerCase().includes('code'));
      const descIndex = headers.findIndex(h => h.toLowerCase().includes('description') || h.toLowerCase().includes('item'));
      const unitIndex = headers.findIndex(h => h.toLowerCase().includes('unit'));
      const quantityIndex = headers.findIndex(h => h.toLowerCase().includes('quantity'));
      
      // Extract phase data from CSV based on the structure from your image
      const phaseData: Record<string, Array<{task: string, quantity: number, description: string, unit: string, code: string}>> = {};
      
      for (let i = dataStartRow + 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
        if (row.length >= 4) {
          const code = row[codeIndex] || '';
          const description = row[descIndex] || '';
          const unit = row[unitIndex] || '';
          const quantity = parseFloat(row[quantityIndex]) || 0;
          
          // Determine phase from code or description
          let phase = '';
          if (code.startsWith('MS') || description.toLowerCase().includes('masonry') || description.toLowerCase().includes('brick')) {
            phase = 'Masonry Shell';
          } else if (code.startsWith('FD') || description.toLowerCase().includes('foundation') || description.toLowerCase().includes('footing')) {
            phase = 'Foundations';
          } else if (code.startsWith('RF') || description.toLowerCase().includes('roof')) {
            phase = 'Roof Structure';
          } else if (code.startsWith('GF') || description.toLowerCase().includes('ground floor') || description.toLowerCase().includes('floor')) {
            phase = 'Ground Floor';
          } else if (description.toLowerCase().includes('electrical')) {
            phase = 'Electrical';
          } else if (description.toLowerCase().includes('plumbing')) {
            phase = 'Plumbing';
          } else {
            phase = 'General Works';
          }
          
          // Only include tasks with quantity > 0
          if (quantity > 0 && description) {
            if (!phaseData[phase]) {
              phaseData[phase] = [];
            }
            phaseData[phase].push({ 
              task: description, 
              quantity: Math.ceil(quantity), // Round up for task counting
              description: `${description} (${quantity} ${unit})`,
              unit: unit,
              code: code
            });
          }
        }
      }

      // Store processed CSV data for job creation
      const processedCSV = {
        id: Date.now().toString(),
        fileName: hbxlFile.name,
        phaseData: phaseData,
        clientInfo: clientInfo,
        uploadedAt: new Date().toLocaleDateString('en-GB'),
        status: "processed" as const
      };

      const updatedCSVs = [...processedCSVs, processedCSV];
      setProcessedCSVs(updatedCSVs);
      localStorage.setItem('processedCSVs', JSON.stringify(updatedCSVs));

      toast({
        title: "CSV Processed Successfully", 
        description: `${hbxlFile.name} analyzed with ${Object.keys(phaseData).length} phases detected: ${Object.keys(phaseData).join(', ')}. Click 'Create Job' to make it available for assignment.`,
      });
    };
    
    reader.readAsText(hbxlFile);
    setHbxlFile(null);
  };

  const handleCreateJob = (csvId: string, jobName: string, location: string) => {
    try {
      console.log('=== handleCreateJob START ===');
      console.log('handleCreateJob called with:', { csvId, jobName, location });
      console.log('Current processedCSVs:', processedCSVs);
      console.log('Current uploadedJobs:', uploadedJobs);
      
      const csvData = processedCSVs.find(csv => csv.id === csvId);
      console.log('Found csvData:', csvData);
      
      if (!csvData) {
        console.error('CSV data not found for ID:', csvId);
        alert('Error: CSV data not found. Please try uploading again.');
        return;
      }

      const newJob: UploadedJob & { phaseData?: any } = {
        id: Date.now().toString(),
        name: jobName,
        location: location,
        price: "£0",
        status: "approved",
        dataType: "CSV Data", 
        uploadedAt: new Date().toLocaleDateString('en-GB'),
        phaseData: csvData.phaseData
      };

      console.log('Created newJob:', newJob);

      const updatedJobs = [...uploadedJobs, newJob];
      console.log('About to set updatedJobs:', updatedJobs);
      
      setUploadedJobs(updatedJobs);
      
      // Store in localStorage for job assignments page
      localStorage.setItem('uploadedJobs', JSON.stringify(updatedJobs));
      console.log('Stored in localStorage:', JSON.parse(localStorage.getItem('uploadedJobs') || '[]'));
      
      // Keep CSV for multiple job creation - don't remove
      setShowCreateJobForm(null);
      
      console.log('=== handleCreateJob SUCCESS ===');
      alert(`Success: ${jobName} created and ready for contractor assignment`);
      
    } catch (error) {
      console.error('=== handleCreateJob ERROR ===', error);
      alert(`Error creating job: ${error}`);
    }
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
    const updatedJobs = uploadedJobs.filter(job => job.id !== jobId);
    setUploadedJobs(updatedJobs);
    localStorage.setItem('uploadedJobs', JSON.stringify(updatedJobs));
    toast({
      title: "Job deleted",
      description: "Job has been removed",
    });
  };

  const handleDeleteUpload = (csvId: string) => {
    const updatedCSVs = processedCSVs.filter(csv => csv.id !== csvId);
    setProcessedCSVs(updatedCSVs);
    localStorage.setItem('processedCSVs', JSON.stringify(updatedCSVs));
    toast({
      title: "Upload Deleted",
      description: "CSV upload has been removed. You can no longer create jobs from this data.",
    });
  };

  const clearAllJobs = () => {
    setUploadedJobs([]);
    localStorage.setItem('uploadedJobs', JSON.stringify([]));
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
            <h3 className="text-lg font-semibold text-yellow-400">Upload HBXL Work Scheduler & Create Job</h3>
          </div>
          
          <p className="text-slate-400 text-sm mb-4">
            Upload HBXL CSV files with client information (Name, Address, Post Code, Project Type) in rows 1-4. The system will detect phases and tasks automatically.
          </p>
          
          <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 mb-4">
            <h4 className="text-blue-400 font-medium mb-2">CSV Format Requirements:</h4>
            <div className="text-sm text-slate-300 space-y-1">
              <p>• Row 1: Name, [Client/Property Name]</p>
              <p>• Row 2: Address, [Location]</p>
              <p>• Row 3: Post Code, [Post Code]</p>
              <p>• Row 4: Project Type, [Job Type]</p>
              <p>• Row 6+: Task data (Code, Item Description, Unit, Quantity, etc.)</p>
            </div>
          </div>

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
                className="bg-yellow-600 hover:bg-yellow-700 text-black px-4 py-2 rounded-lg cursor-pointer border border-yellow-500 font-semibold"
              >
                <i className="fas fa-file-upload mr-2"></i>
                Choose CSV File
              </label>
              <span className="text-slate-400">
                {hbxlFile ? hbxlFile.name : "Select sample_job.csv or your own CSV file"}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-2">
              Supported formats: CSV, Excel (.xlsx, .xls)
            </p>
          </div>

          {hbxlFile && (
            <Button 
              onClick={handleUploadHbxl}
              className="bg-green-600 hover:bg-green-700 text-white w-full"
            >
              <i className="fas fa-upload mr-2"></i>
              Upload and Create Job
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

        {/* Processed CSVs - Ready for Job Creation */}
        {processedCSVs.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
              <i className="fas fa-cog mr-2"></i>
              CSV Uploads - Create Multiple Jobs
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Create multiple jobs from the same upload. Delete upload only when the entire project is complete.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {processedCSVs.map((csv) => (
                <div key={csv.id} className="bg-slate-700 p-4 rounded-lg border border-slate-600">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-white">{csv.fileName}</h4>
                    <Badge className="bg-yellow-600 text-black">Processed</Badge>
                  </div>
                  <p className="text-slate-400 text-sm mb-2">
                    {Object.keys(csv.phaseData).length} phases detected
                  </p>
                  <p className="text-slate-400 text-sm mb-1">
                    Phases: {Object.keys(csv.phaseData).slice(0, 3).join(', ')}{Object.keys(csv.phaseData).length > 3 ? '...' : ''}
                  </p>
                  <p className="text-green-400 text-xs mb-3">
                    <i className="fas fa-info-circle mr-1"></i>
                    Upload kept for multiple job creation
                  </p>
                  <div className="space-y-2">
                    <Button
                      onClick={() => setShowCreateJobForm(csv.id)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      Create Job
                    </Button>
                    <Button
                      onClick={() => {
                        console.log('Quick create job clicked for CSV:', csv.id);
                        const defaultJobName = csv.clientInfo?.projectType || 'Quick Job';
                        const defaultLocation = `${csv.clientInfo?.name || 'Unknown'} • ${csv.clientInfo?.address || 'Unknown'} • ${csv.clientInfo?.postCode || 'Unknown'}`;
                        handleCreateJob(csv.id, defaultJobName, defaultLocation);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm"
                    >
                      <i className="fas fa-bolt mr-2"></i>
                      Quick Create Job
                    </Button>
                    <Button
                      onClick={() => handleDeleteUpload(csv.id)}
                      className="w-full bg-red-600 hover:bg-red-700 text-white text-sm"
                    >
                      <i className="fas fa-trash mr-2"></i>
                      Delete Upload
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Job Modal */}
        {showCreateJobForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-yellow-400">Create New Job</h3>
                <Button 
                  type="button"
                  onClick={() => setShowCreateJobForm(null)}
                  className="bg-slate-600 hover:bg-slate-700 p-2"
                >
                  <i className="fas fa-times"></i>
                </Button>
              </div>
              
              {(() => {
                const csv = processedCSVs.find(c => c.id === showCreateJobForm);
                const clientInfo = csv?.clientInfo || {};
                return (
                  <>
                    {/* Client Info Preview */}
                    <div className="bg-slate-700 rounded-lg p-3 mb-4">
                      <h4 className="text-yellow-400 font-medium mb-2">CSV Client Information:</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-400">Name:</span>
                          <span className="text-white ml-2">{clientInfo.name || 'Not found'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Project Type:</span>
                          <span className="text-white ml-2">{clientInfo.projectType || 'Not found'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Address:</span>
                          <span className="text-white ml-2">{clientInfo.address || 'Not found'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Post Code:</span>
                          <span className="text-white ml-2">{clientInfo.postCode || 'Not found'}</span>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={(e) => {
                      e.preventDefault();
                      console.log('Form submission triggered');
                      console.log('showCreateJobForm:', showCreateJobForm);
                      
                      const form = e.currentTarget;
                      const formData = new FormData(form);
                      const projectType = formData.get('projectType') as string;
                      const clientName = formData.get('clientName') as string;
                      const address = formData.get('address') as string;
                      const postCode = formData.get('postCode') as string;
                      
                      console.log('Form data extracted:', { projectType, clientName, address, postCode });
                      
                      if (!projectType?.trim() || !clientName?.trim() || !address?.trim() || !postCode?.trim()) {
                        console.log('Validation failed - missing fields');
                        toast({
                          title: "Missing Information",
                          description: "Please fill in all required fields",
                          variant: "destructive"
                        });
                        return;
                      }
                      
                      console.log('Calling handleCreateJob...');
                      try {
                        handleCreateJob(showCreateJobForm!, projectType, `${clientName} • ${address} • ${postCode}`);
                        console.log('handleCreateJob completed');
                      } catch (error) {
                        console.error('Error in handleCreateJob:', error);
                        toast({
                          title: "Error Creating Job",
                          description: "There was an error creating the job. Please try again.",
                          variant: "destructive"
                        });
                      }
                    }}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-yellow-400 text-sm font-medium mb-2">Job Name / Project Type *</label>
                          <input
                            name="projectType"
                            type="text"
                            defaultValue={clientInfo.projectType || ''}
                            placeholder="e.g. Fitout, Refurbishment, New Build"
                            required
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-yellow-400 text-sm font-medium mb-2">Client / Property Name *</label>
                          <input
                            name="clientName"
                            type="text"
                            defaultValue={clientInfo.name || ''}
                            placeholder="e.g. Flat 2, John Smith, HBXL Construction"
                            required
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-yellow-400 text-sm font-medium mb-2">Address / Location *</label>
                          <input
                            name="address"
                            type="text"
                            defaultValue={clientInfo.address || ''}
                            placeholder="e.g. Stevenage, High Street, London"
                            required
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-yellow-400 text-sm font-medium mb-2">Post Code *</label>
                          <input
                            name="postCode"
                            type="text"
                            defaultValue={clientInfo.postCode || ''}
                            placeholder="e.g. SG1 1EH"
                            required
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                        
                        <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-3">
                          <p className="text-green-400 text-sm">
                            <i className="fas fa-info-circle mr-2"></i>
                            This job will be created with {Object.keys(csv?.phaseData || {}).length} phases from the CSV data and made available for contractor assignment.
                          </p>
                        </div>

                        <div className="flex space-x-3 pt-2">
                          <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3">
                            <i className="fas fa-check mr-2"></i>
                            Create Job
                          </Button>
                          <Button 
                            type="button"
                            onClick={() => setShowCreateJobForm(null)}
                            className="flex-1 bg-slate-600 hover:bg-slate-700 text-white py-3"
                          >
                            <i className="fas fa-times mr-2"></i>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </form>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Created Jobs Section */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-yellow-400">Created Jobs - Ready for Assignment</h3>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            Jobs created from CSV data, ready for contractor assignment
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
          <button 
            onClick={() => window.location.href = '/admin'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
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
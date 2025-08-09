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
    const file = e.target.files?.[0];
    console.log('=== FILE UPLOAD TRIGGERED ===');
    console.log('File selected:', file?.name);
    if (file) {
      setHbxlFile(file);
      console.log('✓ File set in state:', file.name);
    } else {
      console.log('❌ No file selected');
    }
  };

  const handlePhaseFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhaseFiles(e.target.files);
    }
  };

  const handleUploadHbxl = () => {
    console.log('=== UPLOAD BUTTON CLICKED ===');
    console.log('Current hbxlFile:', hbxlFile);
    
    if (!hbxlFile) {
      console.log('❌ No file to upload');
      toast({
        title: "No file selected",
        description: "Please select an HBXL CSV file to upload",
        variant: "destructive"
      });
      return;
    }
    
    console.log('✓ Starting CSV processing for:', hbxlFile.name);

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
        projectType: 'Renovation' // Default to renovation, will be determined from phases
      };
      
      // For schedule format CSVs, try to extract client info from filename
      if (hbxlFile.name.includes('Flat')) {
        // Handle both "Flat 15" and "Flat15" patterns
        const flatMatch = hbxlFile.name.match(/Flat\s*(\d+)/i);
        if (flatMatch) {
          const flatNumber = flatMatch[1];
          clientInfo.name = `Flat ${flatNumber}`;
          clientInfo.address = 'Stevenage'; // Default from user's data
          clientInfo.postCode = 'SG1 1EH'; // Default from user's data
          console.log(`✓ Extracted from filename: ${clientInfo.name}`);
        }
      }

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
      
      // Parse header to find column indices - flexible approach for different CSV formats
      const headers = lines[dataStartRow].split(',').map(h => h.trim().replace(/"/g, ''));
      
      // Try to find standard columns first
      let codeIndex = headers.findIndex(h => h.toLowerCase().includes('code'));
      let descIndex = headers.findIndex(h => h.toLowerCase().includes('description') || h.toLowerCase().includes('item'));
      const unitIndex = headers.findIndex(h => h.toLowerCase().includes('unit'));
      let quantityIndex = headers.findIndex(h => h.toLowerCase().includes('quantity'));
      const rateIndex = headers.findIndex(h => h.toLowerCase().includes('rate') || h.toLowerCase().includes('price'));
      const totalIndex = headers.findIndex(h => h.toLowerCase().includes('total') || h.toLowerCase().includes('amount'));
      
      // RULE 3: CSV Data Supremacy - Find the authentic "Build Phase" column
      const buildPhaseIndex = headers.findIndex(h => h.toLowerCase().includes('build phase'));
      
      // For schedule-style CSVs without code columns, use different approach
      let categoryIndex = -1, typeIndex = -1, subcategoryIndex = -1;
      if (codeIndex === -1) {
        // Look for category-based structure common in construction schedules
        categoryIndex = headers.findIndex((h, idx) => 
          h.toLowerCase().includes('category') || 
          h.toLowerCase().includes('work') ||
          idx === 2 // Often 3rd column in schedule CSVs
        );
        typeIndex = headers.findIndex((h, idx) => 
          h.toLowerCase().includes('type') ||
          idx === 3 // Often 4th column
        );
        subcategoryIndex = headers.findIndex((h, idx) => 
          h.toLowerCase().includes('subcategory') ||
          idx === 4 // Often 5th column
        );
        
        // Use description as the main item description
        if (descIndex === -1) {
          descIndex = headers.findIndex((h, idx) => 
            idx === 5 || // Often 6th column
            h.toLowerCase().includes('description') ||
            h.toLowerCase().includes('item')
          );
        }
        
        // Quantity is often the last column in schedule CSVs
        if (quantityIndex === -1) {
          quantityIndex = headers.length - 1;
        }
      }
      
      console.log('=== CSV PROCESSING DEBUG ===');
      console.log('Raw CSV content (first 300 chars):', csvContent.substring(0, 300));
      console.log('File lines:', lines.length);
      console.log('Client info extracted:', clientInfo);
      console.log('Data starts at row:', dataStartRow);
      console.log('Headers found:', headers);
      console.log('Column indices:');
      console.log('  Code:', codeIndex, 'Description:', descIndex, 'Unit:', unitIndex);
      console.log('  Quantity:', quantityIndex, 'Rate:', rateIndex, 'Total:', totalIndex);
      console.log('  Build Phase:', buildPhaseIndex, 'Category:', categoryIndex, 'Type:', typeIndex, 'Subcategory:', subcategoryIndex);
      
      // Enhanced schedule format detection
      const firstDataRow = lines[dataStartRow + 1]?.split(',')[0] || '';
      const hasDatePattern = firstDataRow.match(/^\d{2}\/\d{2}\/\d{4}$/);
      const isScheduleFormat = (codeIndex === -1 && categoryIndex !== -1) || 
                               (headers.length >= 7 && hasDatePattern) ||
                               lines[0]?.split(',')[0]?.match(/^\d{2}\/\d{2}\/\d{4}$/);
      
      console.log('=== SCHEDULE FORMAT DETECTION ===');
      console.log('CSV Format detected:', isScheduleFormat ? 'Schedule-based' : 'Code-based');
      console.log('Detection factors:', {
        noCodeColumn: codeIndex === -1,
        hasCategoryColumn: categoryIndex !== -1,
        headerLength: headers.length,
        firstDataCell: firstDataRow,
        hasDatePattern: !!hasDatePattern,
        firstLineStartsWithDate: !!lines[0]?.split(',')[0]?.match(/^\d{2}\/\d{2}\/\d{4}$/)
      });
      console.log('Headers:', headers);
      console.log('First few lines:');
      lines.slice(0, 5).forEach((line, i) => {
        console.log(`  Line ${i}: ${line.substring(0, 100)}`);
      });

      // Create structured data format that's easy to read and use
      const structuredData = {
        metadata: {
          fileName: hbxlFile.name,
          processedDate: new Date().toISOString(),
          totalRows: lines.length,
          dataRows: 0,
          phasesDetected: 0
        },
        clientInfo: clientInfo,
        phases: {} as Record<string, {
          tasks: Array<{
            id: string;
            code: string;
            description: string;
            unit: string;
            quantity: number;
            rate: number;
            total: number;
            originalRow: number;
          }>;
          summary: {
            taskCount: number;
            totalQuantity: number;
            totalValue: number;
          }
        }>,
        originalData: lines
      };

      // Enhanced phase detection mapping
      const phaseMapping = {
        'MS': 'Masonry Shell',
        'FD': 'Foundation Work', 
        'RF': 'Roof Structure',
        'GF': 'Ground Floor',
        'EL': 'Electrical Work',
        'PL': 'Plumbing',
        'KI': 'Kitchen Fitout',
        'BA': 'Bathroom Installation',
        'FL': 'Flooring Installation',
        'PA': 'Painting & Decoration',
        'TI': 'Tiling Work',
        'CA': 'Carpentry',
        'IN': 'Insulation',
        'HE': 'Heating System',
        'WI': 'Windows & Doors',
        'RO': 'Roofing',
        'DR': 'Drainage',
        'LA': 'Landscaping'
      };
      
      // Process each data row with enhanced phase detection
      console.log('=== PROCESSING DATA ROWS ===');
      for (let i = dataStartRow + 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
        console.log(`Row ${i}: "${lines[i]}" -> Parsed:`, row);
        
        let canProcess = false;
        let code = '', description = '', unit = 'Nr', quantity = 0, rate = 0, total = 0;
        
        if (isScheduleFormat) {
          // Schedule format: use category + subcategory as phase, description from description column
          // Handle both positional and header-based column detection
          const category = categoryIndex >= 0 ? row[categoryIndex] : row[2] || '';
          const type = typeIndex >= 0 ? row[typeIndex] : row[3] || '';
          const subcategory = subcategoryIndex >= 0 ? row[subcategoryIndex] : row[4] || '';
          description = descIndex >= 0 ? row[descIndex] : row[5] || '';
          quantity = parseFloat(quantityIndex >= 0 ? row[quantityIndex] : row[6]) || 0;
          
          // Generate a pseudo-code for consistency
          code = `${category.substring(0,2).toUpperCase()}${subcategory.substring(0,3).toUpperCase()}`;
          
          canProcess = !!(category && description && row.length >= 6);
          console.log(`  Schedule format: Category="${category}", Type="${type}", Subcategory="${subcategory}", Desc="${description}", Quantity="${quantity}"`);
        } else {
          // Traditional code format
          code = row[codeIndex] || '';
          description = row[descIndex] || '';
          unit = row[unitIndex] || 'Nr';
          quantity = parseFloat(row[quantityIndex]) || 0;
          rate = parseFloat(row[rateIndex]) || 0;
          total = parseFloat(row[totalIndex]) || 0;
          
          canProcess = !!(row.length >= 2 && code && description);
          console.log(`  Code format: Code="${code}", Desc="${description}"`);
        }
        
        console.log(`  Can process: ${canProcess}, Quantity: ${quantity}`);
        
        if (canProcess) {
          console.log(`  ✓ Processing: Code="${code}", Desc="${description}"`);
          structuredData.metadata.dataRows++;
          
          // RULE 3: CSV DATA SUPREMACY - Extract phases EXACTLY from "Build Phase" column
          let phase = null; // No default - only use authentic CSV data
          
          // First priority: Use authentic "Build Phase" column data if it exists
          if (buildPhaseIndex !== -1 && row[buildPhaseIndex]) {
            phase = row[buildPhaseIndex].trim();
            console.log(`✓ Using authentic Build Phase column: "${phase}"`);
          }
          else if (isScheduleFormat) {
            // For schedule format, use the category directly as the phase (CSV authentic data)
            const category = row[categoryIndex] || '';
            if (category) {
              phase = category;
            }
          }
          
          // Skip rows with no valid phase data - follow CSV Data Supremacy
          if (!phase) {
            console.log(`⚠️ No phase data found for row, skipping: "${description}"`);
            continue;
          }

          console.log(`Row ${i}: Code="${code}", Desc="${description}" -> Phase="${phase}"`);
          
          // Create or update phase
          if (!structuredData.phases[phase]) {
            structuredData.phases[phase] = {
              tasks: [],
              summary: {
                taskCount: 0,
                totalQuantity: 0,
                totalValue: 0
              }
            };
            structuredData.metadata.phasesDetected++;
          }
          
          // Add task to phase
          const task = {
            id: `${phase.replace(/\s+/g, '_').toLowerCase()}_${code.toLowerCase()}`,
            code: code,
            description: description,
            unit: unit,
            quantity: quantity,
            rate: rate,
            total: total,
            originalRow: i
          };
          
          structuredData.phases[phase].tasks.push(task);
          structuredData.phases[phase].summary.taskCount++;
          structuredData.phases[phase].summary.totalQuantity += quantity;
          structuredData.phases[phase].summary.totalValue += total;
        }
      }
      
      console.log('=== CSV PROCESSING COMPLETE ===');
      console.log('Phases detected:', structuredData.metadata.phasesDetected);
      console.log('Phases data:', Object.keys(structuredData.phases));
      console.log('Full structured data:', structuredData);

      // Update metadata
      structuredData.metadata.phasesDetected = Object.keys(structuredData.phases).length;
      
      // Determine project type based on detected phases
      const detectedPhases = Object.keys(structuredData.phases);
      const determineProjectType = (phases: string[]) => {
        const phaseList = phases.map(p => p.toLowerCase());
        
        // Count different types of work
        const foundationWork = phaseList.some(p => p.includes('foundation') || p.includes('ground floor'));
        const structuralWork = phaseList.some(p => p.includes('structural') || p.includes('masonry') || p.includes('roof'));
        const fittingWork = phaseList.some(p => p.includes('fitting') || p.includes('kitchen') || p.includes('bathroom'));
        const decorativeWork = phaseList.some(p => p.includes('painting') || p.includes('decorat') || p.includes('flooring'));
        
        // Determine project type based on work scope
        if (foundationWork && structuralWork) {
          return 'New Build';
        } else if (structuralWork && fittingWork) {
          return 'Extension';
        } else if (fittingWork && decorativeWork && !structuralWork) {
          return 'Renovation';
        } else if (fittingWork && !decorativeWork) {
          return 'Fitout';
        } else {
          return 'Renovation'; // Default for smaller projects
        }
      };
      
      // Set the determined project type
      clientInfo.projectType = determineProjectType(detectedPhases);
      console.log(`✓ Project type determined as: ${clientInfo.projectType} based on phases:`, detectedPhases);
      
      // Convert to old format for compatibility
      const phaseData: Record<string, Array<{task: string, quantity: number, description: string, unit: string, code: string}>> = {};
      
      Object.entries(structuredData.phases).forEach(([phaseName, phaseInfo]) => {
        phaseData[phaseName] = phaseInfo.tasks.map(task => ({
          task: task.description,
          quantity: task.quantity,
          description: `${task.description} (${task.quantity} ${task.unit})`,
          unit: task.unit,
          code: task.code
        }));
      });
      
      console.log('✓ Enhanced CSV Processing Complete:', {
        phases: Object.keys(structuredData.phases),
        totalTasks: structuredData.metadata.dataRows,
        phaseSummary: Object.entries(structuredData.phases).map(([name, info]) => ({
          phase: name,
          taskCount: info.summary.taskCount,
          totalValue: info.summary.totalValue
        }))
      });

      console.log('✓ Final Processed Data:', { 
        clientInfo, 
        phaseData,
        phaseCount: Object.keys(phaseData).length,
        phasesFound: Object.keys(phaseData),
        taskCounts: Object.entries(phaseData).map(([phase, tasks]) => ({ phase, count: tasks.length }))
      });

      // Store processed CSV data for job creation
      const processedCSV = {
        id: Date.now().toString(),
        fileName: hbxlFile.name,
        phaseData: phaseData,
        clientInfo: clientInfo,
        uploadedAt: new Date().toLocaleDateString('en-GB'),
        status: "processed" as const
      };

      console.log('Created processedCSV:', processedCSV);

      const updatedCSVs = [...processedCSVs, processedCSV];
      setProcessedCSVs(updatedCSVs);
      localStorage.setItem('processedCSVs', JSON.stringify(updatedCSVs));
      
      console.log('Updated processedCSVs:', updatedCSVs);

      const phaseCount = Object.keys(phaseData).length;
      const phaseNames = Object.keys(phaseData);
      
      toast({
        title: "CSV Processed Successfully", 
        description: `${hbxlFile.name} analyzed - ${phaseCount} phases detected: ${phaseNames.join(', ')}. Click 'Create Job' to make it available for assignment.`,
      });
      
      console.log('=== CSV PROCESSING SUMMARY ===');
      console.log('File:', hbxlFile.name);
      console.log('Phases detected:', phaseCount);
      console.log('Phase names:', phaseNames);
      console.log('Total tasks:', Object.values(phaseData).reduce((sum, tasks) => sum + tasks.length, 0));
      console.log('=== END SUMMARY ===');
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

      // Determine job type from phases for proper classification
      const phaseNames = Object.keys(csvData.phaseData);
      const jobType = csvData.clientInfo?.projectType || 'Renovation';
      
      const newJob: UploadedJob & { phaseData?: any } = {
        id: Date.now().toString(),
        name: `${csvData.clientInfo.name} - ${jobType}`, // Use client name (Flat #) as primary identifier
        location: location,
        price: "£0",
        status: "approved",
        dataType: "CSV Data", 
        uploadedAt: new Date().toLocaleDateString('en-GB'),
        phaseData: csvData.phaseData,
        jobType: jobType,
        detectedPhases: phaseNames
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
    // Clear all storage data
    setUploadedJobs([]);
    setProcessedCSVs([]);
    localStorage.removeItem('uploadedJobs');
    localStorage.removeItem('processedCSVs');
    localStorage.removeItem('createdJobs');
    localStorage.removeItem('assignments');
    
    console.log('=== ALL DATA CLEARED ===');
    console.log('Cleared uploadedJobs, processedCSVs, createdJobs, assignments');
    console.log('Ready for fresh CSV upload with enhanced processing');
    
    toast({
      title: "All data cleared",
      description: "All data removed. Now upload your CSV file again to use enhanced phase detection.",
      duration: 5000,
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
          
          <div className="mt-3 bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
            <h4 className="text-blue-400 font-medium mb-1">Enhanced CSV Processing Available!</h4>
            <p className="text-sm text-slate-300 mb-2">
              If you see "0 phases" on existing jobs, clear all data and re-upload your CSV files to use the new enhanced phase detection system.
            </p>
            <Button 
              onClick={clearAllJobs}
              className="bg-red-600 hover:bg-red-700 text-white text-sm"
            >
              Clear All & Start Fresh
            </Button>
          </div>
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
            
            {/* Simple direct file input - visible for testing */}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                console.log('=== DIRECT FILE INPUT ===');
                const file = e.target.files?.[0];
                console.log('File:', file);
                if (file) {
                  setHbxlFile(file);
                  console.log('File set:', file.name);
                }
              }}
              className="block w-full text-white bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 mb-3"
            />
            
            <div className="bg-slate-700 rounded p-2 text-xs">
              <strong>Debug Info:</strong><br/>
              Selected file: {hbxlFile ? hbxlFile.name : 'None'}<br/>
              File size: {hbxlFile ? `${hbxlFile.size} bytes` : 'N/A'}<br/>
              File type: {hbxlFile ? hbxlFile.type : 'N/A'}
            </div>
          </div>

          <Button 
            onClick={() => {
              console.log('=== PROCESS CSV BUTTON CLICKED ===');
              if (!hbxlFile) {
                console.log('No file selected');
                alert('Please select a CSV file first');
                return;
              }
              console.log('Processing file:', hbxlFile.name);
              console.log('File size:', hbxlFile.size);
              console.log('File type:', hbxlFile.type);
              handleUploadHbxl();
            }}
            className="bg-green-600 hover:bg-green-700 text-white w-full mb-3"
            disabled={!hbxlFile}
          >
            <i className="fas fa-upload mr-2"></i>
            {hbxlFile ? `Process ${hbxlFile.name}` : 'Select CSV file first'}
          </Button>
          
          {/* Test button to verify the CSV content */}
          {hbxlFile && (
            <Button 
              onClick={() => {
                console.log('=== TESTING CSV READ ===');
                const reader = new FileReader();
                reader.onload = (e) => {
                  const content = e.target?.result as string;
                  console.log('CSV Content Preview:', content.substring(0, 500));
                  console.log('CSV Lines:', content.split('\n').length);
                };
                reader.readAsText(hbxlFile);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full mb-3"
            >
              Test Read CSV
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
                      onClick={() => {
                        console.log('Create Job clicked for CSV ID:', csv.id);
                        console.log('Setting showCreateJobForm to:', csv.id);
                        setShowCreateJobForm(csv.id);
                      }}
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
                console.log('Modal rendering - CSV found:', csv);
                console.log('All processedCSVs:', processedCSVs);
                console.log('Looking for ID:', showCreateJobForm);
                
                if (!csv) {
                  return (
                    <div className="text-center p-4">
                      <p className="text-red-400 mb-4">CSV data not found. Please upload a CSV file first.</p>
                      <Button 
                        onClick={() => setShowCreateJobForm(null)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Close
                      </Button>
                    </div>
                  );
                }
                
                const clientInfo = csv.clientInfo || {};
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
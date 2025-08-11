import type { Express } from "express";
import { createServer, type Server } from "http";
import { DatabaseStorage } from "./database-storage";

const storage = new DatabaseStorage();
import { insertJobSchema, insertContractorSchema, jobAssignmentSchema, insertContractorApplicationSchema, insertWorkSessionSchema, insertAdminSettingSchema, insertJobAssignmentSchema } from "@shared/schema";
import { TelegramService } from "./telegram";
import multer from "multer";
import type { Request as ExpressRequest } from "express";

interface MulterRequest extends ExpressRequest {
  file?: Express.Multer.File;
}
import { parse } from "csv-parse";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Jobs endpoints
  app.get("/api/jobs", async (req, res) => {
    try {
      const { status, search } = req.query;
      let jobs = await storage.getJobs();
      
      if (status && status !== '') {
        jobs = jobs.filter(job => job.status === status);
      }
      
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        jobs = jobs.filter(job => 
          job.title.toLowerCase().includes(searchLower) ||
          job.location.toLowerCase().includes(searchLower) ||
          (job.contractor?.name.toLowerCase().includes(searchLower))
        );
      }
      
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.post("/api/jobs", async (req, res) => {
    try {
      const validation = insertJobSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid job data", details: validation.error.errors });
      }
      
      const job = await storage.createJob(validation.data);
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  app.put("/api/jobs/:id", async (req, res) => {
    try {
      const job = await storage.updateJob(req.params.id, req.body);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error updating job:", error);
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  // Contractors endpoints
  app.get("/api/contractors", async (req, res) => {
    try {
      const contractors = await storage.getContractors();
      res.json(contractors);
    } catch (error) {
      console.error("Error fetching contractors:", error);
      res.status(500).json({ error: "Failed to fetch contractors" });
    }
  });

  app.post("/api/contractors", async (req, res) => {
    try {
      const validation = insertContractorSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid contractor data", details: validation.error.errors });
      }
      
      const contractor = await storage.createContractor(validation.data);
      res.status(201).json(contractor);
    } catch (error) {
      console.error("Error creating contractor:", error);
      res.status(500).json({ error: "Failed to create contractor" });
    }
  });

  // Delete CSV upload record
  app.delete("/api/csv-uploads/:id", async (req, res) => {
    try {
      const uploadId = req.params.id;
      console.log("🗑️ COMPLETE CLEANUP starting for upload:", uploadId);
      
      // MANDATORY RULE 3: CSV DATA SUPREMACY - When CSV deleted, ALL job data must be removed
      // Only GPS coordinates and contractor rates should persist per user requirement
      
      // 1. Delete all jobs created from this CSV upload
      const jobs = await storage.getJobs();
      const jobsToDelete = jobs.filter(job => job.uploadId === uploadId);
      console.log(`🗑️ Found ${jobsToDelete.length} jobs to delete for upload: ${uploadId}`);
      
      for (const job of jobsToDelete) {
        console.log(`🗑️ Deleting job: ${job.id} (${job.title})`);
        await storage.deleteJob(job.id);
      }
      
      // 2. Delete ALL job assignments (contractor dashboard should be empty)
      const allAssignments = await storage.getAllJobAssignments();
      console.log(`🗑️ Found ${allAssignments.length} total assignments to check`);
      
      for (const assignment of allAssignments) {
        console.log(`🗑️ Deleting assignment: ${assignment.id} for contractor: ${assignment.contractorName}`);
        await storage.deleteJobAssignment(assignment.id);
      }
      
      // 3. Delete ALL inspection notifications (site inspections should disappear)
      await storage.deleteAllInspectionNotifications();
      console.log("🗑️ Deleted all inspection notifications");
      
      // 4. Delete ALL contractor reports related to assignments
      await storage.deleteAllContractorReports();
      console.log("🗑️ Deleted all contractor reports");
      
      // 5. Delete ALL admin inspections
      await storage.deleteAllAdminInspections();
      console.log("🗑️ Deleted all admin inspections");
      
      // 6. Finally delete the CSV upload record
      await storage.deleteCsvUpload(uploadId);
      console.log("🗑️ Deleted CSV upload record");
      
      console.log("✅ COMPLETE CLEANUP finished - Only GPS coordinates and contractor rates remain");
      res.json({ 
        success: true, 
        message: "Complete cleanup successful - all job data permanently removed",
        preserved: "GPS coordinates and contractor rates maintained"
      });
    } catch (error) {
      console.error("Error in complete cleanup:", error);
      res.status(500).json({ error: "Failed to complete cleanup" });
    }
  });

  // CSV Upload endpoint
  app.post("/api/upload-csv", upload.single('csvFile'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const csvUpload = await storage.createCsvUpload({
        filename: req.file.originalname,
        status: "processing",
        jobsCount: "0"
      });

      // Parse CSV with specific handling for your format
      const csvContent = req.file.buffer.toString();
      console.log('🔍 Raw CSV Content:', csvContent.substring(0, 500) + '...');
      
      try {
        // Manual parsing for your specific CSV format
        const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
        console.log('🔍 CSV Lines:', lines.slice(0, 10));
        
        // Extract header information (first 4 lines)
        let jobName = "Data Missing from CSV";
        let jobAddress = "Data Missing from CSV";
        let jobPostcode = "Data Missing from CSV";
        let jobType = "Data Missing from CSV";
        let phases: string[] = [];

        // LOCKED DOWN PARSING LOGIC - DO NOT CHANGE THIS EVER
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          const line = lines[i];
          if (line.startsWith('Name,') || line.startsWith('name,')) {
            // Extract everything after "Name," or "name," and remove trailing commas
            const extracted = line.substring(line.indexOf(',') + 1).replace(/,+$/, '').trim();
            jobName = extracted || "Data Missing from CSV";
          } else if (line.startsWith('Address,') || line.startsWith('Address ,')) {
            // Extract everything after first comma and remove trailing commas
            const extracted = line.substring(line.indexOf(',') + 1).replace(/,+$/, '').trim();
            jobAddress = extracted || "Data Missing from CSV";
          } else if (line.startsWith('Post code,')) {
            // Extract everything after "Post code," and remove trailing commas
            const extracted = line.substring(10).replace(/,+$/, '').trim().toUpperCase();
            jobPostcode = extracted || "Data Missing from CSV";
          } else if (line.startsWith('Project Type,')) {
            // Extract everything after "Project Type," and remove trailing commas
            const extracted = line.substring(13).replace(/,+$/, '').trim();
            jobType = extracted || "Data Missing from CSV";
          }
        }

        // Parse data section for phases AND detailed task data
        // NEW IMPROVED PARSING for cleaner CSV format
        // Look for "Build Phase" line which indicates start of data section
        let dataHeaderIndex = lines.findIndex(line => 
          line.includes('Build Phase') && (line.includes('Order Quantity') || line.split(',').length >= 3)
        );
        
        // Fallback: look for any line with "Build Phase" or similar phase indicators
        if (dataHeaderIndex === -1) {
          dataHeaderIndex = lines.findIndex(line => 
            line.includes('Build Phase') || line.includes('Phase') || 
            line.includes('Order') || line.includes('Date')
          );
        }
        
        let phaseTaskData: Record<string, Array<{description: string, quantity: number, task: string}>> = {};
        
        if (dataHeaderIndex >= 0) {
          // NEW IMPROVED PARSING: Handle the cleaner CSV structure
          // Column structure: [Empty, Phase/Task Description, Empty, Quantity]
          console.log('🎯 Using IMPROVED CSV parsing for cleaner format');
          
          let currentPhase = "";
          
          // Process lines after the "Build Phase" header
          for (let i = dataHeaderIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.trim() === '') continue;
            
            const columns = line.split(',').map(col => col.trim());
            
            // Skip lines with less than 3 columns
            if (columns.length < 3) continue;
            
            const col1 = columns[0] || ''; // Usually empty for tasks
            const col2 = columns[1] || ''; // Phase name or task description 
            const col3 = columns[2] || ''; // Task description (if col2 is phase)
            const col4 = columns[3] || '0'; // Quantity
            
            // Check if this is a phase line (col2 has phase name, col3 is empty)
            if (col2 && !col3 && col1 === '') {
              currentPhase = col2;
              if (!phases.includes(currentPhase)) {
                phases.push(currentPhase);
              }
              if (!phaseTaskData[currentPhase]) {
                phaseTaskData[currentPhase] = [];
              }
            } 
            // Check if this is a task line (col3 has task description)
            else if (col3 && currentPhase) {
              const taskDescription = col3.replace(/"/g, '').trim(); // Clean quotes
              const quantity = parseInt(col4) || 0;
              
              if (taskDescription && taskDescription !== '') {
                phaseTaskData[currentPhase].push({
                  description: taskDescription,
                  quantity: quantity,
                  task: `Install ${taskDescription.toLowerCase()}`
                });
              }
            }
          }
          
          console.log('🎯 IMPROVED parsing results:', {
            phases: phases,
            phaseTaskDataKeys: Object.keys(phaseTaskData),
            totalTasks: Object.values(phaseTaskData).reduce((sum, tasks) => sum + tasks.length, 0)
          });
        }
        
        console.log('🎯 Extracted Phase Task Data:', Object.keys(phaseTaskData).map(phase => 
          `${phase}: ${phaseTaskData[phase].length} tasks`
        ));

        console.log('🎯 CSV Data Extracted:', { jobName, jobAddress, jobPostcode, jobType, phases });

        const jobs = [{
          title: jobName,
          description: jobType,
          location: `${jobAddress}, ${jobPostcode}`,
          status: "pending" as const,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          notes: `Project Type: ${jobType}`,
          phases: phases.join(', ') || "Data Missing from CSV",
          uploadId: csvUpload.id,
          phaseTaskData: JSON.stringify(phaseTaskData)
        }];

        const createdJobs = await storage.createJobsFromCsv(jobs, csvUpload.id);
          
        await storage.updateCsvUpload(csvUpload.id, {
          status: "processed",
          jobsCount: createdJobs.length.toString()
        });

        res.json({
          upload: await storage.getCsvUploads().then(uploads => uploads.find(u => u.id === csvUpload.id)),
          jobsCreated: createdJobs.length
        });
      } catch (error) {
        console.error("Error processing CSV jobs:", error);
        await storage.updateCsvUpload(csvUpload.id, { status: "failed" });
        res.status(500).json({ error: "Failed to process CSV jobs" });
      }
    } catch (error) {
      console.error("Error uploading CSV:", error);
      res.status(500).json({ error: "Failed to upload CSV file" });
    }
  });

  // CSV Uploads endpoint
  app.get("/api/csv-uploads", async (req, res) => {
    try {
      const uploads = await storage.getCsvUploads();
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ error: "Failed to fetch uploads" });
    }
  });

  // Job Assignment endpoint
  app.post("/api/assign-job", async (req, res) => {
    try {
      const validation = jobAssignmentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid assignment data", details: validation.error.errors });
      }
      
      const job = await storage.assignJob(validation.data);
      if (!job) {
        return res.status(404).json({ error: "Job or contractor not found" });
      }
      
      res.json(job);
    } catch (error) {
      console.error("Error assigning job:", error);
      res.status(500).json({ error: "Failed to assign job" });
    }
  });

  // Get contractor's active assignments
  app.get("/api/contractor-assignments/:contractorName", async (req, res) => {
    try {
      const { contractorName } = req.params;
      console.log("🔍 Fetching assignments for contractor:", contractorName);
      
      const assignments = await storage.getContractorAssignments(contractorName);
      
      // Add GPS coordinates to assignments that don't have them OR update with current coordinates
      const updatedAssignments = assignments.map(assignment => {
        const coordinates = getPostcodeCoordinates(assignment.workLocation || '');
        if (coordinates) {
          // Always update coordinates to ensure they're current
          console.log(`📍 Setting GPS coordinates for assignment ${assignment.id} at ${assignment.workLocation}: ${coordinates.latitude}, ${coordinates.longitude}`);
          return {
            ...assignment,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
          };
        }
        return assignment;
      });
      
      console.log("📋 Found assignments:", updatedAssignments.length);
      res.json(updatedAssignments);
    } catch (error) {
      console.error("Error fetching contractor assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // Get all job assignments (for admin interface)
  app.get("/api/job-assignments", async (req, res) => {
    try {
      console.log("📋 Fetching all job assignments");
      const assignments = await storage.getJobAssignments();
      console.log("📋 Found", assignments.length, "job assignments");
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching job assignments:", error);
      res.status(500).json({ error: "Failed to fetch job assignments" });
    }
  });

  // Helper function to get GPS coordinates from UK postcode
  function getPostcodeCoordinates(postcode: string): { latitude: string; longitude: string } | null {
    // Simple postcode-to-GPS lookup for common UK postcodes
    const postcodeMap: { [key: string]: { latitude: string; longitude: string } } = {
      'DA17 5DB': { latitude: '51.4851', longitude: '0.1540' },
      'DA17': { latitude: '51.4851', longitude: '0.1540' },
      'DA7 6HJ': { latitude: '51.4851', longitude: '0.1540' }, // Xavier Jones location
      'DA7': { latitude: '51.4851', longitude: '0.1540' },
      'BR9': { latitude: '51.4612', longitude: '0.1388' },
      'SE9': { latitude: '51.4629', longitude: '0.0789' },
      'DA8': { latitude: '51.4891', longitude: '0.2245' },
      'DA1': { latitude: '51.4417', longitude: '0.2056' },
      'SG1 1EH': { latitude: '51.8721', longitude: '-0.2015' },
      'SG1': { latitude: '51.8721', longitude: '-0.2015' },
      'ME5 9GX': { latitude: '51.335996', longitude: '0.530215' }, // Dalwayne's current assignment - official UK postcode coordinates
      'ME5': { latitude: '51.335996', longitude: '0.530215' },
      // Add more as needed
    };
    
    // Try exact match first, then partial matches
    const upperPostcode = postcode.toUpperCase().trim();
    if (postcodeMap[upperPostcode]) {
      return postcodeMap[upperPostcode];
    }
    
    // Try partial matches (first part before space)
    const postcodePrefix = upperPostcode.split(' ')[0];
    if (postcodeMap[postcodePrefix]) {
      return postcodeMap[postcodePrefix];
    }
    
    return null;
  }

  app.post("/api/job-assignments", async (req, res) => {
    try {
      console.log("📋 Creating job assignment:", req.body);
      
      // Add GPS coordinates based on workLocation (postcode)
      if (req.body.workLocation) {
        const coordinates = getPostcodeCoordinates(req.body.workLocation);
        if (coordinates) {
          req.body.latitude = coordinates.latitude;
          req.body.longitude = coordinates.longitude;
          console.log(`📍 Added GPS coordinates for ${req.body.workLocation}: ${coordinates.latitude}, ${coordinates.longitude}`);
        } else {
          console.log(`⚠️ No GPS coordinates found for postcode: ${req.body.workLocation}`);
        }
      }
      
      const validatedAssignment = insertJobAssignmentSchema.parse(req.body);
      const assignment = await storage.createJobAssignment(validatedAssignment);
      
      // Send Telegram notification if requested
      if (req.body.sendTelegramNotification) {
        try {
          const telegramService = new TelegramService();
          await telegramService.sendJobAssignment({
            contractorName: req.body.contractorName,
            phone: req.body.phone,
            hbxlJob: req.body.hbxlJob,
            buildPhases: req.body.buildPhases,
            workLocation: req.body.workLocation,
            startDate: req.body.startDate
          });
          console.log('📱 Telegram notification sent for assignment');
        } catch (telegramError) {
          console.error("⚠️ Failed to send Telegram notification:", telegramError);
        }
      }
      
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating job assignment:", error);
      res.status(500).json({ error: "Failed to create job assignment" });
    }
  });

  // Get single job assignment by ID
  app.get("/api/job-assignments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log("🔍 Fetching job assignment by ID:", id);
      
      const assignment = await storage.getJobAssignment(id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      
      console.log("📋 Found assignment:", assignment.id, assignment.contractorName);
      res.json(assignment);
    } catch (error) {
      console.error("Error fetching job assignment:", error);
      res.status(500).json({ error: "Failed to fetch assignment" });
    }
  });

  // Update job assignment
  app.put("/api/job-assignments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log("📝 Updating job assignment:", id, "with:", req.body);
      
      const updated = await storage.updateJobAssignment(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      
      res.status(200).json(updated);
    } catch (error) {
      console.error("Error updating job assignment:", error);
      res.status(500).json({ error: "Failed to update job assignment" });
    }
  });

  // Delete job assignment
  app.delete("/api/job-assignments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log("🗑️ Deleting job assignment:", id);
      
      await storage.deleteJobAssignment(id);
      
      res.status(200).json({ message: "Assignment deleted successfully" });
    } catch (error) {
      console.error("Error deleting job assignment:", error);
      res.status(500).json({ error: "Failed to delete job assignment" });
    }
  });

  // Telegram webhook to handle contractor replies
  app.post("/api/telegram-webhook", async (req, res) => {
    try {
      console.log('🔔 Telegram webhook received:', JSON.stringify(req.body, null, 2));
      
      const { message } = req.body;
      
      if (!message || !message.text) {
        return res.status(200).json({ ok: true, message: "No text message" });
      }

      const contractorName = message.from?.first_name || "Unknown Contractor";
      const contractorPhone = message.contact?.phone_number;
      const messageText = message.text.toLowerCase();
      
      // Check if this is a contractor reply (not from admin)
      const isContractorReply = message.from?.id !== 7617462316; // Not Rudy's ID
      
      if (isContractorReply && (
        messageText.includes('hello') || 
        messageText.includes('hi') || 
        messageText.includes('work') || 
        messageText.includes('job') ||
        messageText.includes('ready') ||
        messageText.includes('start')
      )) {
        console.log('🎯 Contractor reply detected from:', contractorName);
        
        // Generate unique ID and send onboarding form
        const telegramService = new TelegramService();
        const result = await telegramService.sendOnboardingForm(contractorName, contractorPhone);
        
        if (result.success) {
          console.log('✅ Auto-sent onboarding form with ID:', result.contractorId);
          
          console.log('📋 Contractor Details Captured:');
          console.log('   Name:', contractorName);
          console.log('   Telegram ID:', message.from?.id);
          console.log('   Generated Contractor ID:', result.contractorId);
        }
      }
      
      res.status(200).json({ ok: true });
      
    } catch (error) {
      console.error('❌ Telegram webhook error:', error);
      res.status(200).json({ ok: true, error: String(error) });
    }
  });

  // Re-process HBXL CSV file to extract missing electrical tasks
  app.post("/api/reprocess-hbxl-csv", async (req, res) => {
    try {
      console.log('🔄 Re-processing authentic HBXL CSV file to extract missing electrical tasks...');
      
      // Since the original CSV file content isn't stored, ask user to re-upload
      // the complete HBXL file with all 21 electrical tasks
      res.status(400).json({ 
        error: "Original CSV content not stored. Please re-upload the complete 'Job 49 Flat2 1 Bedroom 1Smart Schedule Export.csv' file with all 21 electrical tasks.",
        suggestion: "Use the CSV upload interface to upload the complete HBXL file again."
      });
      
    } catch (error) {
      console.error('❌ Error re-processing HBXL CSV:', error);
      res.status(500).json({ error: 'Failed to re-process HBXL CSV file' });
    }
  });

  // Get uploaded jobs with detailed CSV task data - ENFORCING CSV DATA SUPREMACY
  app.get("/api/uploaded-jobs", async (req, res) => {
    try {
      console.log('📋 Extracting ONLY authentic CSV task data...');
      
      // Get the actual job from database with stored phase task data
      const storedJobs = await storage.getJobs();
      // Prioritize jobs with extracted task data, then fall back to the original upload
      console.log('🔍 Available jobs:', storedJobs.map(job => ({
        id: job.id,
        title: job.title,
        uploadId: job.uploadId,
        phaseTaskDataValue: job.phaseTaskData || 'NULL',
        phaseTaskDataLength: job.phaseTaskData ? job.phaseTaskData.length : 0,
        hasTaskData: !!job.phaseTaskData && job.phaseTaskData.trim() !== '{}' && job.phaseTaskData.trim() !== ''
      })));
      
      // Priority: 1) Jobs with extracted task data, 2) The authentic HBXL job
      let csvUploadJob = storedJobs.find(job => job.phaseTaskData && job.phaseTaskData.trim() !== '{}' && job.phaseTaskData.trim() !== '');
      if (!csvUploadJob) {
        // Use the authentic HBXL job "Job 49 Flat2 1 Bedroom 1Smart Schedule Export.csv"
        csvUploadJob = storedJobs.find(job => job.uploadId === 'f9126100-d429-4384-865f-55df43e9e8ec');
      }
      
      console.log('🎯 Selected job:', {
        id: csvUploadJob?.id,
        title: csvUploadJob?.title,
        hasTaskData: !!csvUploadJob?.phaseTaskData
      });
      
      if (!csvUploadJob) {
        return res.json([]);
      }
      
      // Check if we have stored phase task data in the job
      let phaseData: Record<string, Array<{description: string, quantity: number, task: string}>> = {};
      
      if (csvUploadJob.phaseTaskData) {
        try {
          phaseData = JSON.parse(csvUploadJob.phaseTaskData);
        } catch {
          console.warn('⚠️ Failed to parse stored phase task data');
        }
      }
      
      // If no stored task data, create fallback structure showing data missing
      if (Object.keys(phaseData).length === 0) {
        const phases = csvUploadJob.phases ? csvUploadJob.phases.split(', ') : [];
        phases.forEach(phase => {
          phaseData[phase] = [{
            description: "Data Missing from CSV",
            quantity: 0,
            task: "CSV task breakdown not available - upload detailed CSV file"
          }];
        });
      }
      
      const uploadedJobs = [{
        id: "flat2-job",
        name: csvUploadJob.title,
        address: csvUploadJob.location,
        postcode: "SG1 1EH",
        projectType: csvUploadJob.description,
        phases: csvUploadJob.phases ? csvUploadJob.phases.split(', ') : [],
        phaseData: phaseData,
        uploadId: csvUploadJob.uploadId
      }];
      
      console.log('✅ Returning authentic CSV data only - no assumptions made');
      res.json(uploadedJobs);
      
    } catch (error) {
      console.error('❌ Error fetching authentic CSV data:', error);
      res.status(500).json({ error: 'Failed to fetch CSV data' });
    }
  });

  // Send onboarding form to contractor
  app.post("/api/send-onboarding-form", async (req, res) => {
    try {
      const { contractorName, contractorPhone } = req.body;
      console.log('📱 Onboarding form request for:', contractorName);
      
      if (!contractorName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Contractor name is required' 
        });
      }
      
      const telegramService = new TelegramService();
      const result = await telegramService.sendOnboardingForm(contractorName, contractorPhone);
      
      if (result.success) {
        console.log('✅ Onboarding form sent successfully with ID:', result.contractorId);
        res.json({ 
          success: true, 
          message: `Onboarding form sent to ${contractorName}`,
          contractorId: result.contractorId,
          messageId: result.messageId,
          simulated: result.simulated
        });
      } else {
        console.log('⚠️ Onboarding form failed:', result.error);
        res.json({ 
          success: false, 
          message: `Failed to send onboarding form: ${result.error}`,
          error: result.error
        });
      }
      
    } catch (error) {
      console.error('❌ Onboarding form error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send onboarding form',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Send contractor hello message
  app.post("/api/send-contractor-hello", async (req, res) => {
    try {
      console.log('📱 Contractor hello message request');
      
      const telegramService = new TelegramService();
      const result = await telegramService.sendContractorHello('James Carpenter');
      
      if (result.success) {
        console.log('✅ Contractor hello message sent successfully');
        res.json({ 
          success: true, 
          message: 'Hello message sent from James Carpenter',
          messageId: result.messageId,
          simulated: result.simulated
        });
      } else {
        console.log('⚠️ Contractor hello message failed:', result.error);
        res.json({ 
          success: false, 
          message: `Failed to send hello message: ${result.error}`,
          error: result.error
        });
      }
      
    } catch (error) {
      console.error('❌ Contractor hello message error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send hello message',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Telegram notification endpoint - real implementation
  app.post("/api/send-telegram-notification", async (req, res) => {
    try {
      const { contractorName, phone, hbxlJob, buildPhases, workLocation, startDate } = req.body;
      
      console.log('📱 Telegram notification request:', {
        contractorName,
        phone,
        hbxlJob,
        buildPhases: buildPhases?.length || 0,
        workLocation,
        startDate
      });

      // Use imported TelegramService
      const telegramService = new TelegramService();
      
      // Send real Telegram notification
      const result = await telegramService.sendJobAssignment({
        contractorName,
        phone,
        hbxlJob,
        buildPhases,
        workLocation,
        startDate
      });
      
      if (result.success) {
        console.log('✅ Telegram notification sent successfully');
        res.json({ 
          success: true, 
          message: `Notification sent to ${contractorName} (${phone})`,
          details: {
            job: hbxlJob,
            phases: buildPhases,
            location: workLocation,
            startDate,
            messageId: result.messageId,
            simulated: result.simulated
          }
        });
      } else {
        console.log('⚠️ Telegram notification failed:', result.error);
        res.json({ 
          success: false, 
          message: `Failed to send notification: ${result.error}`,
          details: { error: result.error }
        });
      }
      
    } catch (error) {
      console.error('❌ Telegram notification error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send notification',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test Telegram bot connection
  app.get("/api/telegram/test", async (req, res) => {
    try {
      const telegramService = new TelegramService();
      
      const result = await telegramService.testConnection();
      res.json(result);
      
    } catch (error) {
      console.error('❌ Telegram test error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to test Telegram connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Send custom Telegram message
  app.post("/api/telegram/send-custom", async (req, res) => {
    try {
      const { chatId, message } = req.body;
      
      if (!chatId || !message) {
        return res.status(400).json({ 
          success: false, 
          error: 'chatId and message are required' 
        });
      }

      const telegramService = new TelegramService();
      const result = await telegramService.sendCustomMessage(chatId, message);
      
      res.json(result);
      
    } catch (error) {
      console.error('❌ Custom message error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send custom message',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get recent Telegram messages
  app.get("/api/telegram/recent-messages", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      
      const telegramService = new TelegramService();
      const result = await telegramService.getRecentMessages(limit);
      
      if (result.success) {
        // Filter to show messages from specific users or with relevant content
        const relevantMessages = result.messages?.filter((msg: any) => {
          const senderName = msg.from?.first_name?.toLowerCase() || '';
          const messageText = msg.text?.toLowerCase() || '';
          
          // Look for messages from Marius or containing work-related keywords
          return senderName.includes('marius') || 
                 messageText.includes('work') || 
                 messageText.includes('job') ||
                 messageText.includes('ready') ||
                 messageText.includes('hello') ||
                 messageText.includes('hi');
        }) || [];

        res.json({
          success: true,
          messages: relevantMessages,
          totalChecked: result.messages?.length || 0,
          relevantCount: relevantMessages.length
        });
      } else {
        res.json(result);
      }
      
    } catch (error) {
      console.error('❌ Error getting recent messages:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get recent messages',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get recent messages sent to the bot
  app.get("/api/telegram/messages", async (req, res) => {
    try {
      const telegramService = new TelegramService();
      const result = await telegramService.getRecentMessages();
      
      res.json(result);
      
    } catch (error) {
      console.error('❌ Error getting messages:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get messages',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Contractor login endpoint
  app.post("/api/contractor-login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }
      
      // Find contractor by username and password
      const applications = await storage.getContractorApplications();
      const contractor = applications.find(app => 
        app.username === username && 
        app.password === password &&
        app.status === "approved"
      );
      
      if (contractor) {
        // Remove sensitive data before sending response
        const { password: _, ...contractorData } = contractor;
        res.json(contractorData);
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (error) {
      console.error("Error during contractor login:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Contractor Application endpoints
  app.get("/api/contractor-applications", async (req, res) => {
    try {
      const applications = await storage.getContractorApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching contractor applications:", error);
      res.status(500).json({ error: "Failed to fetch contractor applications" });
    }
  });

  app.get("/api/contractor-applications/:id", async (req, res) => {
    try {
      const application = await storage.getContractorApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      res.json(application);
    } catch (error) {
      console.error("Error fetching contractor application:", error);
      res.status(500).json({ error: "Failed to fetch contractor application" });
    }
  });

  // Get contractor application by username
  app.get("/api/contractor-application/:username", async (req, res) => {
    try {
      const { username } = req.params;
      const application = await storage.getContractorApplicationByUsername(username);
      if (!application) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      res.json(application);
    } catch (error) {
      console.error("Error fetching contractor application:", error);
      res.status(500).json({ error: "Failed to fetch contractor data" });
    }
  });

  app.post("/api/contractor-applications", async (req, res) => {
    try {
      console.log("📋 Received contractor application submission:", req.body);
      
      // Convert boolean values from strings if needed
      const processedData = {
        ...req.body,
        hasRightToWork: req.body.hasRightToWork?.toString() || "false",
        passportPhotoUploaded: req.body.passportPhotoUploaded?.toString() || "false",
        hasPublicLiability: req.body.hasPublicLiability?.toString() || "false",
        isCisRegistered: req.body.isCisRegistered?.toString() || "false",
        hasValidCscs: req.body.hasValidCscs?.toString() || "false",
        hasOwnTools: req.body.hasOwnTools?.toString() || "false"
      };
      
      const validation = insertContractorApplicationSchema.safeParse(processedData);
      if (!validation.success) {
        console.error("❌ Validation failed:", validation.error.errors);
        return res.status(400).json({ 
          error: "Invalid application data", 
          details: validation.error.errors 
        });
      }
      
      const application = await storage.createContractorApplication(validation.data);
      
      console.log("✅ Contractor application created successfully:", application.id);
      
      // Send notification to admin (your Telegram)
      try {
        const telegramService = new TelegramService();
        const message = `🔥 **NEW CONTRACTOR APPLICATION**\n\n` +
          `👤 **${application.firstName} ${application.lastName}**\n` +
          `📧 ${application.email}\n` +
          `📱 ${application.phone}\n` +
          `🏗️ **Trade:** ${application.primaryTrade}\n` +
          `⭐ **Experience:** ${application.yearsExperience}\n` +
          `📍 ${application.city}, ${application.postcode}\n\n` +
          `🔗 **View Application:** http://localhost:5000/admin/applications/${application.id}\n\n` +
          `⏰ Submitted: ${new Date().toLocaleString()}`;
        
        await telegramService.sendCustomMessage("7617462316", message);
        console.log("📱 Admin notification sent successfully");
      } catch (telegramError) {
        console.error("⚠️ Failed to send admin notification:", telegramError);
      }
      
      res.status(201).json(application);
    } catch (error) {
      console.error("Error creating contractor application:", error);
      res.status(500).json({ error: "Failed to create contractor application" });
    }
  });

  app.patch("/api/contractor-applications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Get the original application before updating
      const originalApplication = await storage.getContractorApplication(id);
      if (!originalApplication) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      const updated = await storage.updateContractorApplication(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      // Send Telegram notification if status changed to approved or rejected
      if (updates.status && updates.status !== originalApplication.status) {
        const telegramService = new TelegramService();
        
        if (updates.status === 'approved') {
          console.log('📱 Sending approval notification for:', updated.firstName, updated.lastName);
          await telegramService.sendApprovalNotification({
            firstName: updated.firstName,
            lastName: updated.lastName,
            phone: updated.phone,
            email: updated.email,
            primaryTrade: updated.primaryTrade,
            adminPayRate: updated.adminPayRate || undefined
          });
        } else if (updates.status === 'rejected') {
          console.log('📱 Sending rejection notification for:', updated.firstName, updated.lastName);
          await telegramService.sendRejectionNotification({
            firstName: updated.firstName,
            lastName: updated.lastName,
            phone: updated.phone,
            email: updated.email,
            primaryTrade: updated.primaryTrade,
            rejectionReason: updated.adminNotes || undefined
          });
        }
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating contractor application:", error);
      res.status(500).json({ error: "Failed to update contractor application" });
    }
  });

  // Clear all applications endpoint for admin
  app.delete("/api/contractor-applications", async (req, res) => {
    try {
      (storage as any).contractorApplications.clear();
      console.log("🧹 All contractor applications cleared from memory");
      res.json({ message: "All applications cleared successfully" });
    } catch (error) {
      console.error("Error clearing applications:", error);
      res.status(500).json({ error: "Failed to clear applications" });
    }
  });

  // Work Sessions endpoints
  app.post("/api/work-sessions", async (req, res) => {
    try {
      console.log("🕐 Creating work session:", req.body);
      
      // Convert string dates to Date objects for validation
      const sessionData = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined
      };
      
      const validatedSession = insertWorkSessionSchema.parse(sessionData);
      const session = await storage.createWorkSession(validatedSession);
      res.status(201).json(session);
    } catch (error) {
      console.error("Error creating work session:", error);
      res.status(400).json({ error: "Failed to create work session" });
    }
  });

  app.get("/api/work-sessions/:contractorName", async (req, res) => {
    try {
      console.log("🕐 Fetching sessions for contractor:", req.params.contractorName);
      const sessions = await storage.getWorkSessions(req.params.contractorName);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching work sessions:", error);
      res.status(500).json({ error: "Failed to fetch work sessions" });
    }
  });

  app.get("/api/work-sessions/:contractorName/active", async (req, res) => {
    try {
      console.log("🕐 Fetching active session for:", req.params.contractorName);
      const session = await storage.getActiveWorkSession(req.params.contractorName);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ error: "No active session found" });
      }
    } catch (error) {
      console.error("Error fetching active work session:", error);
      res.status(500).json({ error: "Failed to fetch active work session" });
    }
  });

  app.put("/api/work-sessions/:id", async (req, res) => {
    try {
      console.log("🕐 Updating work session with GPS tracking:", req.params.id);
      console.log("📍 GPS Data:", { 
        startLat: req.body.startLatitude, 
        startLng: req.body.startLongitude,
        endLat: req.body.endLatitude, 
        endLng: req.body.endLongitude 
      });
      
      // Convert string dates to Date objects if provided
      const updateData = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined
      };
      
      // Calculate GPS distance if both coordinates provided
      if (updateData.startLatitude && updateData.startLongitude && 
          updateData.endLatitude && updateData.endLongitude) {
        const distance = calculateGPSDistance(
          parseFloat(updateData.startLatitude),
          parseFloat(updateData.startLongitude),
          parseFloat(updateData.endLatitude),
          parseFloat(updateData.endLongitude)
        );
        console.log(`📍 GPS Movement: ${distance.toFixed(0)}m during work session`);
      }
      
      const session = await storage.updateWorkSession(req.params.id, updateData);
      if (session) {
        console.log("✅ Work session completed with GPS tracking");
        res.json(session);
      } else {
        res.status(404).json({ error: "Work session not found" });
      }
    } catch (error) {
      console.error("Error updating work session:", error);
      res.status(400).json({ error: "Failed to update work session" });
    }
  });

  // Helper function to calculate GPS distance
  function calculateGPSDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  }

  // GPS proximity check endpoint for login validation
  app.post("/api/check-proximity", async (req, res) => {
    try {
      const { userLatitude, userLongitude, workLocation, contractorName } = req.body;
      
      console.log(`🔍 GPS Proximity Check for ${contractorName}:`);
      console.log(`📍 User Location: ${userLatitude}, ${userLongitude}`);
      console.log(`🏗️ Work Location: ${workLocation}`);
      
      // Get GPS coordinates for the work location (postcode)
      const jobSiteCoords = getPostcodeCoordinates(workLocation);
      if (!jobSiteCoords) {
        return res.status(400).json({ 
          error: "Unable to find GPS coordinates for work location",
          withinRange: false,
          distance: "Unknown"
        });
      }
      
      const jobSiteLat = parseFloat(jobSiteCoords.latitude);
      const jobSiteLon = parseFloat(jobSiteCoords.longitude);
      
      console.log(`🎯 Job Site Coordinates: ${jobSiteLat}, ${jobSiteLon}`);
      
      // Calculate distance between user and job site
      const distance = calculateGPSDistance(
        parseFloat(userLatitude),
        parseFloat(userLongitude),
        jobSiteLat,
        jobSiteLon
      );
      
      const withinRange = distance <= 100; // 100 meter proximity requirement
      
      console.log(`📏 Distance: ${distance.toFixed(0)}m - ${withinRange ? '✅ WITHIN RANGE' : '❌ TOO FAR'}`);
      
      res.json({
        withinRange,
        distance: Math.round(distance),
        allowedDistance: 100,
        workLocation,
        jobSiteCoordinates: jobSiteCoords
      });
      
    } catch (error) {
      console.error("Error in proximity check:", error);
      res.status(500).json({ 
        error: "Failed to check proximity",
        withinRange: false,
        distance: "Error"
      });
    }
  });

  // Contractor Reports endpoints
  app.post("/api/contractor-reports", async (req, res) => {
    try {
      console.log("📝 Creating contractor report:", req.body);
      const report = await storage.createContractorReport(req.body);
      res.json(report);
    } catch (error) {
      console.error("Error creating contractor report:", error);
      res.status(500).json({ error: "Failed to create report" });
    }
  });

  app.get("/api/contractor-reports", async (req, res) => {
    try {
      const reports = await storage.getContractorReports();
      res.json(reports);
    } catch (error) {
      console.error("Error fetching contractor reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // Admin Settings endpoints
  app.get("/api/admin-settings", async (req, res) => {
    try {
      console.log("⚙️ Fetching admin settings");
      const settings = await storage.getAdminSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ error: "Failed to fetch admin settings" });
    }
  });

  app.get("/api/admin-settings/:key", async (req, res) => {
    try {
      console.log("⚙️ Fetching admin setting:", req.params.key);
      const setting = await storage.getAdminSetting(req.params.key);
      if (setting) {
        res.json(setting);
      } else {
        res.status(404).json({ error: "Setting not found" });
      }
    } catch (error) {
      console.error("Error fetching admin setting:", error);
      res.status(500).json({ error: "Failed to fetch admin setting" });
    }
  });

  app.post("/api/admin-settings", async (req, res) => {
    try {
      console.log("⚙️ Creating/updating admin setting:", req.body);
      const validatedSetting = insertAdminSettingSchema.parse(req.body);
      const setting = await storage.setAdminSetting(validatedSetting);
      res.status(201).json(setting);
    } catch (error) {
      console.error("Error creating admin setting:", error);
      res.status(400).json({ error: "Failed to create admin setting" });
    }
  });

  app.put("/api/admin-settings/:key", async (req, res) => {
    try {
      console.log("⚙️ Updating admin setting:", req.params.key, req.body);
      const { value, updatedBy } = req.body;
      const setting = await storage.updateAdminSetting(req.params.key, value, updatedBy);
      if (setting) {
        res.json(setting);
      } else {
        res.status(404).json({ error: "Setting not found" });
      }
    } catch (error) {
      console.error("Error updating admin setting:", error);
      res.status(400).json({ error: "Failed to update admin setting" });
    }
  });

  // Admin Inspection endpoints
  app.post("/api/admin-inspections", async (req, res) => {
    try {
      const inspectionData = {
        assignmentId: req.body.assignmentId,
        inspectorName: req.body.inspectorName,
        inspectionType: req.body.inspectionType || "admin_inspection",
        workQualityRating: req.body.workQualityRating,
        weatherConditions: req.body.weatherConditions,
        progressComments: req.body.progressComments,
        safetyNotes: req.body.safetyNotes || "",
        materialsIssues: req.body.materialsIssues || "",
        nextActions: req.body.nextActions || "",
        photoUrls: req.body.photoUrls || [],
        status: req.body.status || "draft"
      };

      const inspection = await storage.createAdminInspection(inspectionData);
      console.log("📋 Admin inspection created successfully");
      res.status(201).json(inspection);
    } catch (error) {
      console.error("Error creating admin inspection:", error);
      res.status(500).json({ error: "Failed to create admin inspection" });
    }
  });

  app.get("/api/admin-inspections", async (req, res) => {
    try {
      const inspections = await storage.getAdminInspections();
      res.json(inspections);
    } catch (error) {
      console.error("Error fetching admin inspections:", error);
      res.status(500).json({ error: "Failed to fetch admin inspections" });
    }
  });

  app.get("/api/admin-inspections/assignment/:assignmentId", async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const inspections = await storage.getAdminInspectionsByAssignment(assignmentId);
      res.json(inspections);
    } catch (error) {
      console.error("Error fetching inspections for assignment:", error);
      res.status(500).json({ error: "Failed to fetch inspections for assignment" });
    }
  });

  // Inspection Notification endpoints
  app.get("/api/pending-inspections", async (req, res) => {
    try {
      const { ProgressMonitor } = await import("./progress-monitor");
      const progressMonitor = new ProgressMonitor();
      const pendingInspections = await progressMonitor.getPendingInspections();
      console.log("📋 Returning", pendingInspections.length, "inspections with AUTHENTIC CSV data only");
      res.json(pendingInspections);
    } catch (error) {
      console.error("Error fetching pending inspections:", error);
      res.status(500).json({ error: "Failed to fetch pending inspections" });
    }
  });

  // Trigger milestone progress check
  app.post("/api/progress-monitor/check-milestones", async (req, res) => {
    try {
      const { assignmentId } = req.body;
      
      if (!assignmentId) {
        return res.status(400).json({ error: "Assignment ID is required" });
      }

      const { ProgressMonitor } = await import("./progress-monitor");
      const progressMonitor = new ProgressMonitor();
      await progressMonitor.checkProgressMilestones(assignmentId);
      
      console.log("✅ Progress milestones checked for assignment:", assignmentId);
      res.status(200).json({ success: true, message: "Milestones checked successfully" });
    } catch (error) {
      console.error("❌ Error checking progress milestones:", error);
      res.status(500).json({ error: "Failed to check progress milestones" });
    }
  });

  // Update task progress and trigger milestone check
  app.post("/api/progress-monitor/update-task", async (req, res) => {
    try {
      const { assignmentId, taskId, completed } = req.body;
      
      if (!assignmentId || !taskId || typeof completed !== 'boolean') {
        return res.status(400).json({ error: "Assignment ID, task ID, and completion status are required" });
      }

      const { ProgressMonitor } = await import("./progress-monitor");
      const progressMonitor = new ProgressMonitor();
      await progressMonitor.updateTaskProgress(assignmentId, taskId, completed);
      
      console.log("✅ Task progress updated:", { assignmentId, taskId, completed });
      res.status(200).json({ success: true, message: "Task progress updated" });
    } catch (error) {
      console.error("❌ Error updating task progress:", error);
      res.status(500).json({ error: "Failed to update task progress" });
    }
  });

  // CRITICAL: Task progress update endpoint that triggers 50% inspection
  app.post("/api/check-progress/:assignmentId", async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const { ProgressMonitor } = await import("./progress-monitor");
      const progressMonitor = new ProgressMonitor();
      await progressMonitor.checkProgressMilestones(assignmentId);
      res.json({ success: true, message: "Progress milestones checked" });
    } catch (error) {
      console.error("Error checking progress milestones:", error);
      res.status(500).json({ error: "Failed to check progress milestones" });
    }
  });

  app.post("/api/trigger-progress-check/:assignmentId", async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const { ProgressMonitor } = await import("./progress-monitor");
      const progressMonitor = new ProgressMonitor();
      await progressMonitor.checkProgressMilestones(assignmentId);
      res.json({ success: true, message: "Progress check completed" });
    } catch (error) {
      console.error("Error triggering progress check:", error);
      res.status(500).json({ error: "Failed to trigger progress check" });
    }
  });

  // Force create inspection for testing (DEV ONLY)
  app.post("/api/force-create-inspection", async (req, res) => {
    try {
      const { assignmentId, contractorName, notificationType } = req.body;
      
      const inspection = await storage.createInspectionNotification({
        assignmentId: assignmentId || "test-assignment",
        contractorName: contractorName || "Test Contractor", 
        notificationType: notificationType || "50_percent_ready",
        notificationSent: true,
        inspectionCompleted: false
      });
      
      console.log(`🚨 FORCE CREATED inspection notification:`, inspection);
      res.json({ success: true, inspection });
    } catch (error) {
      console.error("Error force creating inspection:", error);
      res.status(500).json({ error: "Failed to create inspection" });
    }
  });

  // Alternative route name for progress checks
  app.post("/api/check-progress/:assignmentId", async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const { ProgressMonitor } = await import("./progress-monitor");
      const progressMonitor = new ProgressMonitor();
      await progressMonitor.checkProgressMilestones(assignmentId);
      res.json({ success: true, message: "Progress check completed" });
    } catch (error) {
      console.error("Error triggering progress check:", error);
      res.status(500).json({ error: "Failed to trigger progress check" });
    }
  });

  app.post("/api/complete-inspection/:notificationId", async (req, res) => {
    try {
      const { notificationId } = req.params;
      const notification = await storage.completeInspectionNotification(notificationId);
      if (notification) {
        res.json({ success: true, notification });
      } else {
        res.status(404).json({ error: "Notification not found" });
      }
    } catch (error) {
      console.error("Error completing inspection:", error);
      res.status(500).json({ error: "Failed to complete inspection" });
    }
  });

  // Demo endpoint to simulate job progress milestones for testing
  app.post("/api/demo-trigger-inspection/:assignmentId/:percentage", async (req, res) => {
    try {
      const { assignmentId, percentage } = req.params;
      const assignment = await storage.getJobAssignment(assignmentId);
      
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const progressPercentage = parseInt(percentage);
      let notificationType = "";
      
      if (progressPercentage >= 50 && progressPercentage < 100) {
        notificationType = "50_percent_ready";
      } else if (progressPercentage >= 100) {
        notificationType = "100_percent_ready";
      } else {
        return res.json({ message: "No inspection needed for this progress level" });
      }

      // Check if notification already exists
      const existing = await storage.getInspectionNotificationByAssignmentAndType(assignmentId, notificationType);
      if (existing) {
        return res.json({ message: "Inspection notification already exists", existing });
      }

      // Create inspection notification
      const notification = await storage.createInspectionNotification({
        assignmentId,
        contractorName: assignment.contractorName,
        notificationType,
        notificationSent: true,
        inspectionCompleted: false
      });

      console.log(`🚨 DEMO: ${notificationType.replace('_', ' ')} inspection triggered for ${assignment.contractorName}`);
      res.json({ 
        success: true, 
        message: `${notificationType.replace('_', ' ')} inspection notification created`,
        notification 
      });
    } catch (error) {
      console.error("Error in demo trigger:", error);
      res.status(500).json({ error: "Failed to trigger demo inspection" });
    }
  });

  // Progress update endpoint - triggers 50%/100% inspection milestones
  app.post("/api/progress-update", async (req, res) => {
    try {
      const { assignmentId, completedTasks, totalTasks, percentage } = req.body;
      
      console.log(`📊 Progress update received: ${completedTasks}/${totalTasks} tasks (${percentage}%) for assignment ${assignmentId}`);
      
      // Import and use ProgressMonitor
      const { ProgressMonitor } = await import('./progress-monitor');
      const progressMonitor = new ProgressMonitor();
      
      // Manually trigger milestone check with provided percentage
      if (percentage >= 50) {
        console.log(`🎯 50% milestone reached (${percentage}%) - triggering inspection`);
        await progressMonitor.checkProgressMilestones(assignmentId);
      }
      
      if (percentage >= 100) {
        console.log(`🎯 100% milestone reached (${percentage}%) - triggering inspection`);
        await progressMonitor.checkProgressMilestones(assignmentId);
      }
      
      res.json({ 
        success: true, 
        message: `Progress updated: ${percentage}%`,
        milestonesChecked: percentage >= 50 
      });
    } catch (error) {
      console.error("❌ Error updating progress:", error);
      res.status(500).json({ error: "Failed to update progress" });
    }
  });

  // Task Progress API endpoints
  app.get("/api/task-progress/:contractorName/:assignmentId", async (req, res) => {
    try {
      const { contractorName, assignmentId } = req.params;
      const progress = await storage.getTaskProgress(contractorName, assignmentId);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching task progress:", error);
      res.status(500).json({ error: "Failed to fetch task progress" });
    }
  });

  app.post("/api/task-progress", async (req, res) => {
    try {
      const progress = await storage.createTaskProgress(req.body);
      res.status(201).json(progress);
    } catch (error) {
      console.error("Error creating task progress:", error);
      res.status(500).json({ error: "Failed to create task progress" });
    }
  });

  app.put("/api/task-progress/:contractorName/:assignmentId/:taskId", async (req, res) => {
    try {
      const { contractorName, assignmentId, taskId } = req.params;
      const { completed } = req.body;
      
      const progress = await storage.updateTaskCompletion(contractorName, assignmentId, taskId, completed);
      
      if (!progress) {
        return res.status(404).json({ error: "Task progress not found" });
      }
      
      res.json(progress);
    } catch (error) {
      console.error("Error updating task progress:", error);
      res.status(500).json({ error: "Failed to update task progress" });
    }
  });

  // Backup endpoint for task progress (to prevent data loss on logout)
  app.post("/api/task-progress/update", async (req, res) => {
    try {
      const { contractorName, assignmentId, taskId, taskDescription, phase, completed, completedItems, totalItems } = req.body;
      
      // Try to update existing record, create if not exists
      try {
        const existing = await storage.updateTaskCompletion(contractorName, assignmentId, taskId, completed);
        if (existing) {
          console.log(`📁 Updated existing task progress backup: ${taskDescription}`);
          return res.json({ success: true, action: 'updated' });
        }
      } catch (error) {
        console.log(`📝 Creating new task progress backup: ${taskDescription}`);
      }
      
      // Create new task progress record
      const newProgress = await storage.createTaskProgress({
        contractorName,
        assignmentId,
        taskId,
        taskDescription,
        phase,
        completed
      });
      
      console.log(`✅ Task progress backed up: ${taskDescription} - ${completed ? 'completed' : 'in progress'}`);
      res.json({ success: true, action: 'created', data: newProgress });
    } catch (error) {
      console.error("Error backing up task progress:", error);
      res.status(500).json({ error: "Failed to backup task progress" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

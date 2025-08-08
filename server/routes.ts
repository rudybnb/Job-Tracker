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

      // Parse CSV
      const csvContent = req.file.buffer.toString();
      const records: any[] = [];
      
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      parser.on('data', (record) => {
        records.push(record);
      });

      parser.on('error', async (error) => {
        console.error("CSV parsing error:", error);
        await storage.updateCsvUpload(csvUpload.id, { status: "failed" });
        res.status(400).json({ error: "Failed to parse CSV file", details: error.message });
      });

      parser.on('end', async () => {
        try {
          const jobs = records.map(record => ({
            title: record.title || record.job_title || record.name || "Untitled Job",
            description: record.description || record.details || "",
            location: record.location || record.address || "Unknown Location",
            status: "pending" as const,
            dueDate: record.due_date || record.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            notes: record.notes || "",
            uploadId: csvUpload.id
          }));

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
      });

      parser.write(csvContent);
      parser.end();
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

  app.post("/api/job-assignments", async (req, res) => {
    try {
      console.log("📋 Creating job assignment:", req.body);
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
      const validatedSession = insertWorkSessionSchema.parse(req.body);
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
      console.log("🕐 Updating work session:", req.params.id, req.body);
      const session = await storage.updateWorkSession(req.params.id, req.body);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ error: "Work session not found" });
      }
    } catch (error) {
      console.error("Error updating work session:", error);
      res.status(400).json({ error: "Failed to update work session" });
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

  const httpServer = createServer(app);
  return httpServer;
}

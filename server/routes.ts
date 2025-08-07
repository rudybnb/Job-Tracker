import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertJobSchema, insertContractorSchema, jobAssignmentSchema } from "@shared/schema";
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

  // Job Assignment endpoint with Telegram notifications
  app.post("/api/assign-job", async (req, res) => {
    try {
      console.log('📋 Processing job assignment:', req.body);
      
      const validation = jobAssignmentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid assignment data", details: validation.error.errors });
      }
      
      const job = await storage.assignJob(validation.data);
      if (!job) {
        return res.status(404).json({ error: "Job or contractor not found" });
      }

      // Send Telegram notification if contractor has Telegram ID
      try {
        if (job.contractor?.telegramId) {
          const telegramService = new TelegramService();
          const phases = validation.data.selectedPhases || [];
          const dueDate = validation.data.dueDate || 'Not specified';
          
          console.log('📱 Sending Telegram notification to contractor:', job.contractor.name);
          
          const notificationSent = await telegramService.sendJobAssignmentNotification(
            job.contractor.telegramId,
            job.title,
            phases,
            dueDate,
            job.location
          );

          if (notificationSent) {
            console.log('✅ Telegram notification sent successfully');
          } else {
            console.log('⚠️ Failed to send Telegram notification');
          }
        } else {
          console.log('ℹ️ No Telegram ID for contractor, skipping notification');
        }
      } catch (telegramError) {
        console.error('❌ Telegram notification error:', telegramError);
        // Don't fail the assignment if notification fails
      }
      
      res.json(job);
    } catch (error) {
      console.error("Error assigning job:", error);
      res.status(500).json({ error: "Failed to assign job" });
    }
  });

  // Telegram test endpoint
  app.get("/api/telegram/test", async (req, res) => {
    try {
      const telegramService = new TelegramService();
      const result = await telegramService.testConnection();
      res.json(result);
    } catch (error) {
      console.error("Telegram test error:", error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Contractor onboarding with Telegram notification
  app.post("/api/contractors/onboard", async (req, res) => {
    try {
      const validation = insertContractorSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid contractor data", details: validation.error.errors });
      }
      
      const contractor = await storage.createContractor(validation.data);

      // Send welcome notification if Telegram ID provided
      if (contractor.telegramId) {
        try {
          const telegramService = new TelegramService();
          await telegramService.sendOnboardingNotification(
            contractor.telegramId,
            contractor.name,
            contractor.specialization
          );
          console.log('✅ Onboarding notification sent to:', contractor.name);
        } catch (telegramError) {
          console.error('❌ Failed to send onboarding notification:', telegramError);
        }
      }
      
      res.status(201).json(contractor);
    } catch (error) {
      console.error("Error creating contractor:", error);
      res.status(500).json({ error: "Failed to create contractor" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

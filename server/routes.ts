import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { DatabaseStorage } from "./database-storage";
import { authenticateStaffUser } from "./password-security.ts";
import { requireAdmin } from "./integration-review-route.ts";

// Session interface for type safety
interface SessionRequest extends Request {
  session: Request["session"] & {
    adminName?: string;
    contractorName?: string;
    contractorId?: string;
    [key: string]: any;
  };
}

const storage = new DatabaseStorage();
import { insertJobSchema, insertContractorSchema, jobAssignmentSchema, insertContractorApplicationSchema, insertWorkSessionSchema, insertAdminSettingSchema, insertJobAssignmentSchema, JobWithContractor, WorkSession } from "@shared/schema";
import { TelegramService } from "./telegram";
import VoiceAgent from "./voice-agent";
import multer from "multer";
import type { Request as ExpressRequest } from "express";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, client } from "./db";
import { calculateAdminWeeklyPayroll, calculateWorkerPayroll } from "./payroll-calculator.ts";
import { csvUploads, jobs as jobsTable, clients, workSessions, attendanceEvents, attendanceCorrections, jobLocations, jobLocationTasks, contractors, jobAssignments, projectSourceImports, workers } from "@shared/schema";
import { deriveCanonicalUsername, WorkerService } from "./worker-service.ts";
import { buildAssignablePeople, type AssignmentIdentity } from "./assignment-people.ts";
import { getAssignmentsOwnedByWorker, isStructuredWorkerAssignment } from "./worker-task-ownership.ts";
import { normalizeUploadCsvContent, parseJobUploadCsv, suggestJobNameFromSource, toInsertJobs, validateProjectMetadata } from "@shared/job-upload-import";
import {
  SMART_SCHEDULE_PARSER_VERSION,
  SMART_SCHEDULE_SOURCE_TYPE,
  SMART_SCHEDULE_STREAM_KEY,
  buildSmartScheduleAttachPatch,
  decideSmartScheduleMatch,
  formatWordJobCandidateLabel,
  rankSmartScheduleCandidates,
  resolveSmartScheduleImportAction,
  type WordJobCandidate,
} from "@shared/job-match";
import { parseHbxlWordQuote } from "../shared/hbxl-word-parser";
import { ensureJobLocationTables } from "./job-location-tables-core.ts";
import { buildAttendanceTimeline, getLondonDateString } from "./attendance-timeline.ts";

interface MulterRequest extends ExpressRequest {
  file?: Express.Multer.File;
}
import { parse } from "csv-parse";
import { parseEnhancedCSV } from "./enhanced-csv-parser";

const upload = multer({ storage: multer.memoryStorage() });
const workerService = new WorkerService();

function parseProjectMetadata(rawMetadata: unknown) {
  if (typeof rawMetadata !== "string") {
    return { clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" };
  }

  try {
    const parsed = JSON.parse(rawMetadata) as Record<string, unknown>;
    return {
      clientName: typeof parsed.clientName === "string" ? parsed.clientName : "",
      projectSiteName: typeof parsed.projectSiteName === "string" ? parsed.projectSiteName : "",
      address: typeof parsed.address === "string" ? parsed.address : "",
      postcode: typeof parsed.postcode === "string" ? parsed.postcode : "",
      projectType: typeof parsed.projectType === "string" ? parsed.projectType : "",
    };
  } catch {
    return { clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" };
  }
}

export interface ClientMatchResult {
  status: "MATCHED_EXISTING" | "REVIEW_REQUIRED" | "CREATE_NEW" | "MISSING";
  clientId?: string;
  clientName: string;
  existingAddress?: string | null;
  quoteAddress?: string;
  isNew: boolean;
  reviewRequired: boolean;
  matchReason?: "EXACT_NAME_AND_ADDRESS" | "DIFFERENT_ADDRESS" | "MISSING_ADDRESS_ON_FILE" | "NO_MATCH" | "NO_CLIENT_NAME";
  message: string;
}

export function evaluateClientMatch(
  quoteClientName: string,
  quoteAddress: string,
  quotePostcode: string,
  existingClients: Array<{ id: string; name: string; address?: string | null }>
): ClientMatchResult {
  const normQuoteName = (quoteClientName || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normQuoteName) {
    return {
      status: "MISSING",
      clientName: "",
      isNew: false,
      reviewRequired: true,
      matchReason: "NO_CLIENT_NAME",
      message: "Client name not found in Word quote. Please review and enter a client name.",
    };
  }

  // Exact normalized client name matching only (no fuzzy name matching)
  const matchingClients = existingClients.filter(
    (c) => (c.name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "") === normQuoteName
  );

  if (matchingClients.length === 0) {
    return {
      status: "CREATE_NEW",
      clientName: quoteClientName.trim(),
      quoteAddress: quoteAddress.trim(),
      isNew: true,
      reviewRequired: false,
      matchReason: "NO_MATCH",
      message: "Will create new client",
    };
  }

  const existingClient = matchingClients[0];
  const normQuotePc = (quotePostcode || "").toUpperCase().replace(/\s+/g, "").trim();
  const existingAddressStr = (existingClient.address || "").trim();
  
  // Extract postcode from existing address if available
  const existingPcMatch = existingAddressStr.match(/\b([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\b/i);
  const normExistingPc = existingPcMatch ? existingPcMatch[1].toUpperCase().replace(/\s+/g, "").trim() : "";

  const normQuoteAddr = (quoteAddress || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const normExistingAddr = existingAddressStr.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  // Rule A: Exact normalized client name + matching postcode/address
  const postcodesMatch = normQuotePc && normExistingPc && normQuotePc === normExistingPc;
  const addressesMatch = normQuoteAddr && normExistingAddr && (
    normQuoteAddr.includes(normExistingAddr) || normExistingAddr.includes(normQuoteAddr)
  );

  if (postcodesMatch || addressesMatch) {
    return {
      status: "MATCHED_EXISTING",
      clientId: existingClient.id,
      clientName: existingClient.name,
      existingAddress: existingClient.address,
      quoteAddress: quoteAddress.trim(),
      isNew: false,
      reviewRequired: false,
      matchReason: "EXACT_NAME_AND_ADDRESS",
      message: "Matches existing client",
    };
  }

  // Rule B: Exact normalized client name but different postcode/address
  const bothHavePostcodes = normQuotePc && normExistingPc;
  const bothHaveAddresses = normQuoteAddr && normExistingAddr;

  if ((bothHavePostcodes && normQuotePc !== normExistingPc) || (bothHaveAddresses && !addressesMatch)) {
    return {
      status: "REVIEW_REQUIRED",
      clientId: existingClient.id,
      clientName: existingClient.name,
      existingAddress: existingClient.address,
      quoteAddress: quoteAddress.trim(),
      isNew: false,
      reviewRequired: true,
      matchReason: "DIFFERENT_ADDRESS",
      message: "Possible existing client — review required",
    };
  }

  // Rule C: Exact normalized client name but existing client has no address/postcode (or quote has none)
  return {
    status: "REVIEW_REQUIRED",
    clientId: existingClient.id,
    clientName: existingClient.name,
    existingAddress: existingClient.address,
    quoteAddress: quoteAddress.trim(),
    isNew: false,
    reviewRequired: true,
    matchReason: "MISSING_ADDRESS_ON_FILE",
    message: "Possible existing client — review required",
  };
}

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

  // Delete CSV upload record (admin-only, safe cleanup of upload and its created jobs only)
  app.delete("/api/csv-uploads/:id", requireAdmin as unknown as import("express").RequestHandler, async (req, res) => {
    try {
      const uploadId = req.params.id;
      if (!uploadId) {
        return res.status(400).json({ error: "Upload ID is required" });
      }

      console.log(`🗑️ Deleting CSV upload record: ${uploadId}`);
      const success = await storage.deleteCsvUpload(uploadId);
      if (!success) {
        return res.status(404).json({ error: "CSV upload record not found" });
      }

      res.json({
        success: true,
        message: "CSV upload record removed from Recent Uploads. Live jobs remain intact.",
        id: uploadId,
      });
    } catch (error) {
      console.error("Error deleting CSV upload:", error);
      res.status(500).json({ error: "Failed to delete CSV upload" });
    }
  });

  // Structured Word job candidates for Smart Schedule attachment.
  // A structured Word job has BOTH job_locations and job_location_tasks (HBXL Word import)
  // — that EXISTS filter is the eligibility proof; row counts are deliberately not
  // selected because an older incorrect parser can produce more rows than the
  // correct final one. Enrichment facts (lineage, import dates) feed the
  // deterministic picker ranking in shared/job-match.ts.
  async function listStructuredWordJobCandidates(): Promise<Array<WordJobCandidate & {
    label: string;
    hasCurrentSourceImport: boolean;
    latestImportAt: string | null;
  }>> {
    const rows = await db
      .select({
        jobId: jobsTable.id,
        title: jobsTable.title,
        clientName: jobsTable.clientName,
        address: jobsTable.address,
        postcode: jobsTable.postcode,
        hasCurrentSourceImport: sql<boolean>`EXISTS (SELECT 1 FROM project_source_import i WHERE i.job_id = ${jobsTable.id}::text AND i.is_current_revision = true AND i.status = 'IMPORTED')`,
        latestImportAt: sql<string | null>`(
          SELECT to_char(MAX(i.imported_at), 'YYYY-MM-DD"T"HH24:MI:SSOF')
          FROM project_source_import i WHERE i.job_id = ${jobsTable.id}::text
        )`,
      })
      .from(jobsTable)
      .where(
        sql`EXISTS (SELECT 1 FROM job_locations l WHERE l.job_id = ${jobsTable.id}::text) AND EXISTS (SELECT 1 FROM job_location_tasks t WHERE t.job_id = ${jobsTable.id}::text)`,
      )
      .orderBy(jobsTable.title);

    return rows.map((row) => ({ ...row, label: formatWordJobCandidateLabel(row, rows) }));
  }

  // Extract only what genuinely came from the schedule file (no invented identity metadata).
  function summarizeSmartScheduleFile(validation: ReturnType<typeof parseJobUploadCsv>, filename: string) {
    const firstJobPreview = validation.jobPreview[0];
    const phases = Array.from(new Set(validation.jobs.flatMap((job) => job.phases)));

    let resourceRows = 0;
    const totalsByResourceType: Record<string, number> = {};
    let parsedTaskData: any = {};
    try {
      parsedTaskData = validation.jobs[0]?.phaseTaskData ? JSON.parse(validation.jobs[0].phaseTaskData) : {};
    } catch {
      parsedTaskData = {};
    }

    if (Array.isArray(parsedTaskData.resources)) {
      for (const resource of parsedTaskData.resources) {
        resourceRows++;
        const typeKey = String(resource.resourceType ?? "other").toLowerCase() || "other";
        totalsByResourceType[typeKey] = (totalsByResourceType[typeKey] ?? 0) + (Number(resource.totalCost) || 0);
      }
    }

    const financials = parsedTaskData.financials ?? null;
    const csvProjectName = firstJobPreview?.name?.trim() ? firstJobPreview.name.trim() : null;
    // Client/address/postcode are ONLY reported when genuinely present in the file.
    const csvIdentityPresent = {
      clientName: false,
      address: Boolean(firstJobPreview?.address?.trim()),
      postcode: Boolean(firstJobPreview?.postcode?.trim()),
      projectName: Boolean(csvProjectName),
      projectType: Boolean(firstJobPreview?.projectType?.trim()),
    };

    return {
      filename,
      detectedFormat: validation.format,
      isValid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      stats: validation.stats,
      phases,
      phaseCount: phases.length,
      taskRowCount: validation.stats.taskRows,
      resourceRowCount: resourceRows,
      totalsByResourceType,
      financials,
      csvIdentity: {
        projectName: csvProjectName,
        address: firstJobPreview?.address?.trim() || null,
        postcode: firstJobPreview?.postcode?.trim() || null,
        projectType: firstJobPreview?.projectType?.trim() || null,
        present: csvIdentityPresent,
      },
      filenameProjectHint: suggestJobNameFromSource(filename) || null,
    };
  }

  // Smart Schedule PREVIEW mode: parse only. No jobs are created or modified here.
  // Admin-guarded: workers/contractors/unauthenticated requests receive 401.
  app.post("/api/upload-csv/preview", requireAdmin as unknown as import("express").RequestHandler, upload.single("csvFile"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      let csvContent: string;
      if (req.file.originalname.toLowerCase().endsWith(".xlsx")) {
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        csvContent = XLSX.utils.sheet_to_csv(worksheet);
      } else {
        csvContent = req.file.buffer.toString();
      }

      const normalizedContent = normalizeUploadCsvContent(csvContent);
      const fingerprint = createHash("sha256").update(normalizedContent).digest("hex");
      const validation = parseJobUploadCsv(normalizedContent);

      const candidates: Array<WordJobCandidate & { label: string }> =
        await listStructuredWordJobCandidates();

      const summary = summarizeSmartScheduleFile(validation, req.file.originalname);
      const signals = {
        csvProjectName: summary.csvIdentity.projectName,
        filenameProjectHint: summary.filenameProjectHint,
        // Smart Schedule CSVs never carry client name; this field is always absent.
        csvClientName: null as string | null,
        csvPostcode: summary.csvIdentity.postcode,
      };
      const match = decideSmartScheduleMatch(
        { csvProjectName: signals.csvProjectName, filenameProjectHint: signals.filenameProjectHint },
        candidates,
      );
      const suggestion = rankSmartScheduleCandidates(signals, candidates);

      res.json({
        preview: true,
        ...summary,
        fingerprint,
        candidates,
        match,
        suggestion,
      });
    } catch (error) {
      console.error("Error previewing Smart Schedule:", error);
      res.status(500).json({ error: "Failed to preview Smart Schedule file" });
    }
  });

  // CSV Upload endpoint. Admin-guarded: workers/contractors/unauthenticated requests receive 401.
  app.post("/api/upload-csv", requireAdmin as unknown as import("express").RequestHandler, upload.single('csvFile'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      let csvContent: string;
      
      // Handle both Excel and CSV files
      if (req.file.originalname.toLowerCase().endsWith('.xlsx')) {
        console.log('📊 Processing Excel file:', req.file.originalname);
        // Parse Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to CSV format to maintain compatibility with existing parsing logic
        csvContent = XLSX.utils.sheet_to_csv(worksheet);
        console.log('🔄 Converted Excel to CSV format');
      } else {
        // Parse CSV with specific handling for your format
        csvContent = req.file.buffer.toString();
        console.log('📄 Processing CSV file:', req.file.originalname);
      }

      const normalizedContent = normalizeUploadCsvContent(csvContent);
      const fingerprint = createHash("sha256").update(normalizedContent).digest("hex");
      const validation = parseJobUploadCsv(normalizedContent);

      // ------------------------------------------------------------------
      // ATTACH TO EXISTING STRUCTURED WORD JOB (Word-first / schedule-second).
      // Never creates a jobs row and never touches commercial Word values:
      // updates ONLY jobs.phases / jobs.phaseTaskData on the chosen job.
      // ------------------------------------------------------------------
      const attachJobId = typeof req.body.attachJobId === "string" ? req.body.attachJobId.trim() : "";
      if (attachJobId) {
        if (!validation.valid) {
          return res.status(400).json({
            error: "Upload validation failed. Nothing was attached.",
            validation,
          });
        }

        const [targetJob] = await db
          .select({ id: jobsTable.id, title: jobsTable.title })
          .from(jobsTable)
          .where(eq(jobsTable.id, attachJobId))
          .limit(1);

        if (!targetJob) {
          return res.status(404).json({ error: "Selected job not found. No changes were made." });
        }

        const [locationCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobLocations)
          .where(eq(jobLocations.jobId, attachJobId));
        const [taskCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobLocationTasks)
          .where(eq(jobLocationTasks.jobId, attachJobId));

        if (!locationCount || !taskCount || locationCount.count === 0 || taskCount.count === 0) {
          return res.status(400).json({
            error:
              "Smart Schedules can only be attached to structured Word quote jobs (jobs with imported locations and tasks). Use the legacy CSV workflow instead.",
          });
        }

        const attachSession = (req as SessionRequest).session as
          | { adminName?: unknown; username?: unknown }
          | undefined;
        const confirmedBy = [attachSession?.adminName, attachSession?.username]
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .find((value) => value.length > 0) || "admin";

        const attachResult = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${fingerprint + attachJobId}))`);

          const priorImports = await tx
            .select({
              id: projectSourceImports.id,
              sourceHash: projectSourceImports.sourceHash,
              revisionNumber: projectSourceImports.revisionNumber,
              status: projectSourceImports.status,
            })
            .from(projectSourceImports)
            .where(
              sql`${projectSourceImports.jobId} = ${attachJobId} AND ${projectSourceImports.sourceStreamKey} = ${SMART_SCHEDULE_STREAM_KEY}`,
            )
            .orderBy(projectSourceImports.revisionNumber);

          const importAction = resolveSmartScheduleImportAction(priorImports, fingerprint);
          if (importAction.action === "DUPLICATE_NOOP") {
            return { duplicate: true as const, revisionNumber: importAction.duplicateOfRevisionNumber };
          }

          // Supersede prior IMPORTED Smart Schedule revisions for this job.
          for (const supersededId of importAction.supersedeImportIds) {
            await tx
              .update(projectSourceImports)
              .set({ status: "SUPERSEDED", isCurrentRevision: false })
              .where(eq(projectSourceImports.id, supersededId));
          }

          const summary = summarizeSmartScheduleFile(validation, req.file!.originalname);
          const [sourceImport] = await tx
            .insert(projectSourceImports)
            .values({
              jobId: attachJobId,
              sourceType: SMART_SCHEDULE_SOURCE_TYPE,
              sourceStreamKey: SMART_SCHEDULE_STREAM_KEY,
              originalFilename: req.file!.originalname,
              sourceHash: fingerprint,
              revisionNumber: importAction.revisionNumber,
              supersedesImportId: importAction.supersedesImportId,
              isCurrentRevision: true,
              parserVersion: SMART_SCHEDULE_PARSER_VERSION,
              status: "IMPORTED",
              reviewStatus: "USER_CONFIRMED",
              confirmedBy,
              confirmedAt: new Date(),
              reasonCode: null,
              reviewReason: "Admin explicitly attached this Smart Schedule to the selected structured Word job.",
              sourceMetadata: {
                detectedFormat: summary.detectedFormat,
                phases: summary.phases,
                phaseCount: summary.phaseCount,
                taskRowCount: summary.taskRowCount,
                resourceRowCount: summary.resourceRowCount,
                totalsByResourceType: summary.totalsByResourceType,
                csvIdentity: summary.csvIdentity,
                filenameProjectHint: summary.filenameProjectHint,
                note: "Operational CSV totals live here only; Word commercial values are untouched.",
              },
            })
            .returning();

          // Operational update ONLY: phases + phaseTaskData.
          const firstParsedPhases = validation.jobs[0]?.phases ?? [];
          const patch = buildSmartScheduleAttachPatch(firstParsedPhases, validation.jobs[0].phaseTaskData);
          const [updatedJob] = await tx
            .update(jobsTable)
            .set({ phases: patch.phases, phaseTaskData: patch.phaseTaskData })
            .where(eq(jobsTable.id, attachJobId))
            .returning({ id: jobsTable.id, title: jobsTable.title, phases: jobsTable.phases });

          // Recent-uploads lineage record (not linked to the job's upload_id).
          await tx.insert(csvUploads).values({
            filename: `${req.file!.originalname} → attached to ${updatedJob.title}`,
            status: "processed",
            jobsCount: "0",
          });

          return {
            duplicate: false as const,
            jobId: updatedJob.id,
            jobTitle: updatedJob.title,
            sourceImportId: sourceImport.id,
            revisionNumber: sourceImport.revisionNumber,
            supersedesImportId: sourceImport.supersedesImportId,
            phaseCount: firstParsedPhases.length,
            taskRows: validation.stats.taskRows,
          };
        });

        if (attachResult.duplicate) {
          return res.status(409).json({
            error: `Duplicate Smart Schedule blocked: this exact file content is already attached to the selected job (revision ${attachResult.revisionNumber}).`,
            duplicate: true,
            attached: false,
            jobId: attachJobId,
            existingRevisionNumber: attachResult.revisionNumber,
          });
        }

        return res.json({
          attached: true,
          uploadId: null,
          ...attachResult,
          message: `Smart Schedule attached to "${attachResult.jobTitle}". No new job was created and Word quote values are unchanged.`,
        });
      }

      const projectMetadata = parseProjectMetadata(req.body.projectMetadata);
      const metadataErrors = validateProjectMetadata(projectMetadata);

      if (!validation.valid || metadataErrors.length > 0) {
        return res.status(400).json({
          error: "Upload validation failed. No jobs were created.",
          validation: {
            ...validation,
            errors: [...validation.errors, ...metadataErrors],
          },
        });
      }

      const importResult = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${fingerprint}))`);

        const existing = await tx
          .select({ id: jobsTable.id, title: jobsTable.title, uploadId: jobsTable.uploadId })
          .from(jobsTable)
          .where(like(jobsTable.notes, `%Import Fingerprint: ${fingerprint}%`))
          .limit(1);

        if (existing.length > 0) {
          return { duplicate: true as const, existing: existing[0] };
        }

        const [csvUpload] = await tx
          .insert(csvUploads)
          .values({
            filename: req.file!.originalname,
            status: "processing",
            jobsCount: "0",
          })
          .returning();

        const insertJobs = toInsertJobs(validation.jobs, csvUpload.id, fingerprint, projectMetadata);
        const createdJobs = await tx.insert(jobsTable).values(insertJobs).returning();

        const [finalUpload] = await tx
          .update(csvUploads)
          .set({ status: "processed", jobsCount: createdJobs.length.toString() })
          .where(eq(csvUploads.id, csvUpload.id))
          .returning();

        return { duplicate: false as const, upload: finalUpload, createdJobs };
      });

      if (importResult.duplicate) {
        return res.status(409).json({
          error: "Duplicate import blocked. No jobs were created.",
          duplicate: true,
          existing: importResult.existing,
          validation,
          fingerprint,
        });
      }

      res.json({
        upload: importResult.upload,
        jobsCreated: importResult.createdJobs.length,
        rowsProcessed: validation.stats.taskRows,
        tasksProcessed: validation.stats.taskRows,
        skippedRows: 0,
        duplicate: false,
        importFingerprint: fingerprint,
        validation,
      });
    } catch (error) {
      console.error("Error uploading CSV:", error);
      res.status(500).json({ error: "Failed to upload CSV file" });
    }
  });

  // HBXL Word Quote (.docx) upload and preview endpoint
  app.post("/api/upload-word-quote", upload.single("quoteFile"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No Word quote file uploaded" });
      }

      if (!req.file.originalname.toLowerCase().endsWith(".docx")) {
        return res.status(400).json({ error: "Invalid file format. Please upload a Word document (.docx)." });
      }

      console.log("📄 Processing HBXL Word Quote document:", req.file.originalname);
      const parsed = await parseHbxlWordQuote(req.file.buffer, req.file.originalname);

      if (!parsed.valid || parsed.locations.length === 0) {
        return res.status(400).json({
          error: "Could not extract operational work structure from Word document.",
          details: parsed.errors,
          warnings: parsed.warnings,
          parsed,
        });
      }

      await ensureJobLocationTables((query, params) => db.execute(sql.raw(query)));

      // Client matching lookup with strict safety
      const clientNameToMatch = (req.body.clientName || parsed.metadata.clientName || "").trim();
      const addressToMatch = (req.body.address || parsed.metadata.address || "").trim();
      const postcodeToMatch = (req.body.postcode || parsed.metadata.postcode || "").trim();

      let clientMatch: ClientMatchResult;

      if (clientNameToMatch) {
        try {
          const existingClients = await db
            .select()
            .from(clients)
            .where(sql`LOWER(TRIM(${clients.name})) = LOWER(TRIM(${clientNameToMatch}))`);

          clientMatch = evaluateClientMatch(clientNameToMatch, addressToMatch, postcodeToMatch, existingClients);
        } catch {
          clientMatch = {
            status: "CREATE_NEW",
            clientName: clientNameToMatch,
            quoteAddress: addressToMatch,
            isNew: true,
            reviewRequired: false,
            matchReason: "NO_MATCH",
            message: "Will create new client",
          };
        }
      } else {
        clientMatch = {
          status: "MISSING",
          clientName: "",
          isNew: false,
          reviewRequired: true,
          matchReason: "NO_CLIENT_NAME",
          message: "Client name not found in Word quote. Please review and enter a client name.",
        };
      }

      // Check if preview mode requested
      const isPreview = req.query.preview === "true" || req.body.preview === "true";
      if (isPreview) {
        return res.json({
          success: true,
          preview: true,
          metadata: {
            ...parsed.metadata,
            clientMatch,
          },
          locations: parsed.locations,
          stats: parsed.stats,
        });
      }

      // Metadata overrides from form if supplied by admin, else exact parsed values (ZERO hardcoded fallback names)
      const finalClientName = (req.body.clientName !== undefined ? req.body.clientName : parsed.metadata.clientName || "").trim();
      const finalProjectSiteName = (req.body.projectSiteName !== undefined ? req.body.projectSiteName : parsed.metadata.projectSiteName || "").trim();
      const finalAddress = (req.body.address !== undefined ? req.body.address : parsed.metadata.address || "").trim();
      const finalPostcode = (req.body.postcode !== undefined ? req.body.postcode : parsed.metadata.postcode || "").trim();
      const finalProjectType = (req.body.projectType !== undefined ? req.body.projectType : parsed.metadata.projectType || "Refurbishment").trim();
      const finalQuotedAmount = req.body.quotedAmount || parsed.metadata.formattedTotalPrice || null;

      // Re-evaluate matching on final client data
      const existingClientsForImport = finalClientName ? await db
        .select()
        .from(clients)
        .where(sql`LOWER(TRIM(${clients.name})) = LOWER(TRIM(${finalClientName}))`) : [];

      const finalClientMatch = evaluateClientMatch(finalClientName, finalAddress, finalPostcode, existingClientsForImport);

      // Explicit admin choices
      const confirmClientLinkId = req.body.confirmClientLinkId ? String(req.body.confirmClientLinkId).trim() : null;
      const forceCreateNewClient = req.body.forceCreateNewClient === true || req.body.forceCreateNewClient === "true";

      // BACKEND ENFORCEMENT: When REVIEW_REQUIRED, an explicit decision is REQUIRED before importing!
      if (finalClientMatch.status === "REVIEW_REQUIRED" && !confirmClientLinkId && !forceCreateNewClient) {
        return res.status(400).json({
          error: "Please confirm whether this is the existing client or a new client before importing.",
          clientMatch: finalClientMatch,
        });
      }

      const importResult = await db.transaction(async (tx) => {
        let clientId: string | null = null;
        let createdClientRecord: any = null;

        if (finalClientName) {
          if (forceCreateNewClient) {
            // Admin explicitly requested to create a new client
            const [newClient] = await tx
              .insert(clients)
              .values({
                name: finalClientName,
                address: finalAddress || null,
                notes: `Created automatically from HBXL Word quote: ${req.file!.originalname} (explicitly created as new client by admin)`,
              })
              .returning();
            clientId = newClient.id;
            createdClientRecord = newClient;
          } else if (confirmClientLinkId) {
            // Admin explicitly confirmed linking to a specific existing client
            const [existing] = await tx
              .select()
              .from(clients)
              .where(eq(clients.id, confirmClientLinkId as any))
              .limit(1);
            if (existing) {
              clientId = existing.id;
            }
          } else if (finalClientMatch.status === "MATCHED_EXISTING" && finalClientMatch.clientId) {
            // Rule A: Exact name + matching address/postcode
            clientId = finalClientMatch.clientId;
          } else {
            // Rule D: CREATE_NEW
            const [newClient] = await tx
              .insert(clients)
              .values({
                name: finalClientName,
                address: finalAddress || null,
                notes: `Created automatically from HBXL Word quote: ${req.file!.originalname}`,
              })
              .returning();
            clientId = newClient.id;
            createdClientRecord = newClient;
          }
        }

        // Create upload record
        const [uploadRecord] = await tx
          .insert(csvUploads)
          .values({
            filename: req.file!.originalname,
            status: "processed",
            jobsCount: "1",
          })
          .returning();

        // Create job record linking to client
        const [job] = await tx
          .insert(jobsTable)
          .values({
            title: finalProjectSiteName || req.file!.originalname.replace(/\.docx$/i, ""),
            clientName: finalClientName || null,
            clientId: clientId,
            location: finalAddress || finalProjectSiteName || "TBD",
            address: finalAddress || null,
            postcode: finalPostcode || null,
            projectType: finalProjectType || null,
            quotedAmount: finalQuotedAmount,
            status: "pending",
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            uploadId: uploadRecord.id,
            notes: `Imported from HBXL Word Quote: ${req.file!.originalname}\nClient: ${finalClientName || "N/A"}\nNet: ${parsed.metadata.formattedTotalExclVat || "N/A"}\nVAT: ${parsed.metadata.formattedVatAmount || "N/A"}\nGross: ${parsed.metadata.formattedTotalIncVat || "N/A"}\nRooms Extracted: ${parsed.stats.locationCount}\nWork Items Extracted: ${parsed.stats.taskCount}`,
          })
          .returning();

        // Insert locations and tasks
        const createdLocations: any[] = [];
        let totalTasksCount = 0;

        for (const loc of parsed.locations) {
          const [createdLoc] = await tx
            .insert(jobLocations)
            .values({
              jobId: job.id,
              name: loc.name,
              normalizedName: loc.normalizedName,
              source: "HBXL_WORD",
              reviewStatus: loc.reviewStatus,
              reviewReason: loc.reviewReason,
              suggestedMapping: loc.suggestedMapping,
            })
            .returning();

          createdLocations.push(createdLoc);

          for (const cat of loc.categories) {
            if (cat.tasks.length > 0) {
              for (const task of cat.tasks) {
                await tx.insert(jobLocationTasks).values({
                  jobId: job.id,
                  locationId: createdLoc.id,
                  workCategory: cat.name,
                  taskName: task.name,
                  taskDescription: task.description || (task.resources && task.resources.length > 0 ? `Resources:\n${task.resources.map(r => `• ${r}`).join('\n')}` : undefined),
                  sourceReference: "HBXL_WORD",
                  hbxlBuildPhase: cat.hbxlBuildPhase || null,
                  status: "pending",
                });
                totalTasksCount++;
              }
            } else {
              // The category itself is the assignable work package
              const resDesc = cat.resources && cat.resources.length > 0
                ? `Resources / Specifications:\n${cat.resources.map(r => `• ${r}`).join('\n')}`
                : undefined;
              await tx.insert(jobLocationTasks).values({
                jobId: job.id,
                locationId: createdLoc.id,
                workCategory: cat.name,
                taskName: cat.name,
                taskDescription: resDesc,
                sourceReference: "HBXL_WORD",
                hbxlBuildPhase: cat.hbxlBuildPhase || null,
                status: "pending",
              });
              totalTasksCount++;
            }
          }
        }

        return {
          upload: uploadRecord,
          job,
          clientId,
          createdClientRecord,
          locations: createdLocations,
          totalTasksCount,
        };
      });

      res.json({
        success: true,
        upload: importResult.upload,
        job: importResult.job,
        clientId: importResult.clientId,
        clientCreated: !!importResult.createdClientRecord,
        locationsCount: importResult.locations.length,
        tasksCount: importResult.totalTasksCount,
        stats: parsed.stats,
        locations: importResult.locations,
      });
    } catch (error) {
      console.error("Error uploading Word quote:", error);
      res.status(500).json({ error: "Failed to process Word quote file", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get locations for a job
  app.get("/api/jobs/:jobId/locations", async (req, res) => {
    try {
      const { jobId } = req.params;
      const locations = await storage.getJobLocations(jobId);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching job locations:", error);
      res.status(500).json({ error: "Failed to fetch job locations" });
    }
  });

  // Update a job location (admin rename or confirm review status)
  app.patch("/api/jobs/:jobId/locations/:locationId", async (req, res) => {
    try {
      const { locationId } = req.params;
      const { name, reviewStatus, reviewReason, suggestedMapping } = req.body;

      const updates: any = {};
      if (name) {
        updates.name = name.trim();
        updates.normalizedName = name.trim().toLowerCase();
      }
      if (reviewStatus) updates.reviewStatus = reviewStatus;
      if (reviewReason !== undefined) updates.reviewReason = reviewReason;
      if (suggestedMapping !== undefined) updates.suggestedMapping = suggestedMapping;

      const updated = await storage.updateJobLocation(locationId, updates);
      if (!updated) {
        return res.status(404).json({ error: "Job location not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating job location:", error);
      res.status(500).json({ error: "Failed to update job location" });
    }
  });

  // Get location tasks for a job
  app.get("/api/jobs/:jobId/location-tasks", async (req, res) => {
    try {
      const { jobId } = req.params;
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const tasks = await storage.getJobLocationTasks(jobId, locationId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching job location tasks:", error);
      res.status(500).json({ error: "Failed to fetch location tasks" });
    }
  });

  app.get("/api/assignment-desk/assignable-people", async (_req, res) => {
    try {
      const [canonicalWorkers, activeWorkerRows, contractorProfiles] = await Promise.all([
        workerService.listWorkers(),
        db.select({ id: workers.id }).from(workers).where(and(
          eq(workers.isActive, true),
          eq(workers.isDeleted, false),
        )),
        db.select().from(contractors),
      ]);
      const activeWorkerIds = new Set(activeWorkerRows.map((worker) => worker.id));
      res.json(buildAssignablePeople(canonicalWorkers, activeWorkerIds, contractorProfiles));
    } catch (error) {
      console.error("Error fetching assignable people:", error);
      res.status(500).json({ error: "Failed to fetch assignable people" });
    }
  });

  // Atomically assign one or more existing room work items to one or more contractors.
  app.post("/api/assign-worker-tasks", async (req, res) => {
    const {
      jobId,
      selections: rawSelections,
      people: rawPeople,
      startDate,
      endDate,
      specialInstructions,
      sendTelegramNotification = false,
    } = req.body;
    const selections = Array.isArray(rawSelections)
      ? rawSelections.map((selection: any) => ({
          locationId: String(selection?.locationId || ""),
          taskIds: Array.from(new Set(Array.isArray(selection?.taskIds) ? selection.taskIds.map(String).filter(Boolean) : [])),
        }))
      : [];
    const locationIds = selections.map((selection) => selection.locationId);
    const taskIds = selections.flatMap((selection) => selection.taskIds);
    const parsedPeople = Array.isArray(rawPeople)
      ? rawPeople.map((person: any) => ({
          type: person?.type === "worker" || person?.type === "contractor" ? person.type : "",
          id: String(person?.id || ""),
        }))
      : [];
    const personKeys = parsedPeople.map((person) => `${person.type}:${person.id}`);

    const hasInvalidSelections = selections.length === 0
      || selections.some((selection) => !selection.locationId || selection.taskIds.length === 0)
      || new Set(locationIds).size !== locationIds.length
      || new Set(taskIds).size !== taskIds.length;
    const hasInvalidPeople = parsedPeople.length === 0
      || parsedPeople.some((person) => !person.type || !person.id)
      || new Set(personKeys).size !== personKeys.length;
    if (!jobId || hasInvalidSelections || hasInvalidPeople) {
      return res.status(400).json({
        error: "jobId, unique room/task selections, and typed worker or contractor identities are required.",
      });
    }

    try {
      const people = parsedPeople as AssignmentIdentity[];
      const workerIds = people.filter((person) => person.type === "worker").map((person) => person.id);
      const contractorIds = people.filter((person) => person.type === "contractor").map((person) => person.id);
      const canonicalWorkers = await workerService.listWorkers();
      const canonicalWorkerById = new Map(
        canonicalWorkers
          .filter((worker) => worker.isActive && workerIds.includes(worker.id))
          .map((worker) => [worker.id, worker]),
      );
      const start = startDate || new Date().toISOString().split("T")[0];
      const end = endDate || start;

      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`assignment:${jobId}`}))`);

        const [job] = await tx.select().from(jobsTable).where(eq(jobsTable.id, jobId));
        if (!job) throw Object.assign(new Error("Job not found"), { statusCode: 404 });

        const selectedLocations = await tx
          .select()
          .from(jobLocations)
          .where(and(eq(jobLocations.jobId, jobId), inArray(jobLocations.id, locationIds)));
        if (selectedLocations.length !== locationIds.length) {
          throw Object.assign(new Error("One or more rooms were not found for selected job"), { statusCode: 404 });
        }

        const selectedWorkers = workerIds.length > 0
          ? await tx.select().from(workers).where(and(
              inArray(workers.id, workerIds),
              eq(workers.isActive, true),
              eq(workers.isDeleted, false),
            ))
          : [];
        if (selectedWorkers.length !== workerIds.length || canonicalWorkerById.size !== workerIds.length) {
          throw Object.assign(new Error("One or more active workers were not found"), { statusCode: 404 });
        }

        const selectedContractors = contractorIds.length > 0
          ? await tx.select().from(contractors).where(and(
              inArray(contractors.id, contractorIds),
              inArray(contractors.status, ["available", "busy"]),
            ))
          : [];
        if (selectedContractors.length !== contractorIds.length) {
          throw Object.assign(new Error("One or more active contractors were not found"), { statusCode: 404 });
        }

        if (contractorIds.length > 0) {
          const activeWorkerRows = await tx.select({ id: workers.id }).from(workers).where(and(
            eq(workers.isActive, true),
            eq(workers.isDeleted, false),
          ));
          const assignableContractorIds = new Set(
            buildAssignablePeople(
              canonicalWorkers,
              new Set(activeWorkerRows.map((worker) => worker.id)),
              selectedContractors,
            )
              .filter((person) => person.identity.type === "contractor")
              .map((person) => person.identity.id),
          );
          if (contractorIds.some((contractorId) => !assignableContractorIds.has(contractorId))) {
            throw Object.assign(new Error("One or more contractors duplicate an active worker"), { statusCode: 409 });
          }
        }

        const selectedContractorById = new Map(selectedContractors.map((contractor) => [contractor.id, contractor]));
        const selectedPeople = people.map((identity) => {
          if (identity.type === "worker") {
            const worker = canonicalWorkerById.get(identity.id)!;
            return {
              identity,
              name: worker.fullName,
              email: worker.email || "",
              phone: worker.phone || "0000000000",
            };
          }

          const contractor = selectedContractorById.get(identity.id)!;
          return {
            identity,
            name: contractor.name,
            email: contractor.email,
            phone: "0000000000",
          };
        });

        const selectedTasks = await tx
          .select()
          .from(jobLocationTasks)
          .where(and(
            eq(jobLocationTasks.jobId, jobId),
            inArray(jobLocationTasks.locationId, locationIds),
            inArray(jobLocationTasks.id, taskIds),
          ));
        if (selectedTasks.length !== taskIds.length) {
          throw Object.assign(new Error("One or more work items do not belong to the selected job rooms"), { statusCode: 400 });
        }

        const selectedTaskById = new Map(selectedTasks.map((task) => [task.id, task]));
        if (selections.some((selection) => selection.taskIds.some(
          (taskId) => selectedTaskById.get(taskId)?.locationId !== selection.locationId,
        ))) {
          throw Object.assign(new Error("One or more work items do not belong to their selected room"), { statusCode: 400 });
        }

        const contractorNames = selectedPeople.map((person) => person.name || "Contractor");
        const selectedLocationById = new Map(selectedLocations.map((location) => [location.id, location]));
        const existingAssignments = await tx
          .select({
            contractorName: jobAssignments.contractorName,
            locationTaskId: jobAssignments.locationTaskId,
          })
          .from(jobAssignments)
          .where(and(
            eq(jobAssignments.jobId, jobId),
            inArray(jobAssignments.locationId, locationIds),
            inArray(jobAssignments.locationTaskId, taskIds),
            inArray(jobAssignments.contractorName, contractorNames),
          ));
        if (existingAssignments.length > 0) {
          throw Object.assign(new Error("One or more selected work items are already assigned to this contractor"), { statusCode: 409 });
        }

        const assignmentRows = selectedPeople.flatMap((person) => {
          const contractorName = person.name || "Contractor";
          const instructions = selectedPeople.length > 1
            ? `TEAM ASSIGNMENT: Working with ${selectedPeople.length} contractors. ${specialInstructions || ""}`.trim()
            : specialInstructions;
          return selections.flatMap((selection) => {
            const location = selectedLocationById.get(selection.locationId)!;
            return selection.taskIds.map((taskId) => {
              const task = selectedTaskById.get(taskId)!;
              return {
                jobId: job.id,
                contractorName,
                email: person.email,
                phone: person.phone,
                workLocation: location.name,
                hbxlJob: job.title,
                locationId: location.id,
                locationName: location.name,
                locationTaskId: task.id,
                workCategory: task.workCategory,
                taskName: task.taskName,
                buildPhases: [] as string[],
                startDate: start,
                endDate: end,
                specialInstructions: instructions || `Assigned to ${location.name} → ${task.workCategory} (${task.taskName})`,
                status: "assigned",
                sendTelegramNotification: Boolean(sendTelegramNotification),
              };
            });
          });
        });

        const assignments = await tx.insert(jobAssignments).values(assignmentRows).returning();
        const firstContractor = people.find((person) => person.type === "contractor");
        await tx
          .update(jobLocationTasks)
          .set({
            status: "assigned",
            assignedContractorId: firstContractor?.id || null,
            assignedContractorName: contractorNames.join(", "),
            updatedAt: new Date(),
          })
          .where(inArray(jobLocationTasks.id, taskIds));

        return { assignments, selectedPeople, selectedTasks, selectedLocations, job };
      });

      if (sendTelegramNotification) {
        const telegramService = new TelegramService();
        for (const person of result.selectedPeople) {
          try {
            await telegramService.sendJobAssignment({
              contractorName: person.name || "Contractor",
              phone: person.phone,
              hbxlJob: result.job.title,
              buildPhases: [],
              workLocation: result.selectedLocations.map((location) => location.name).join(", "),
              startDate: start,
            });
          } catch (telegramError) {
            console.error("Failed to send room assignment notification:", telegramError);
          }
        }
      }

      res.status(201).json({
        success: true,
        assignments: result.assignments,
        assignmentCount: result.assignments.length,
        taskCount: result.selectedTasks.length,
        personCount: result.selectedPeople.length,
      });
    } catch (error) {
      const statusCode = Number((error as any)?.statusCode) || 500;
      console.error("Error assigning room work items:", error);
      res.status(statusCode).json({ error: error instanceof Error ? error.message : "Failed to assign room work items" });
    }
  });

  // Assign worker to Job + Location + Task (Phase 3 assignment flow)
  // Assign worker to Job + Location + (Work Package OR Child Task)
  app.post("/api/assign-worker-task", async (req, res) => {
    try {
      const {
        jobId,
        locationId,
        taskId,
        workCategory,
        contractorId,
        startDate,
        endDate,
        specialInstructions,
        sendTelegramNotification = false,
      } = req.body;

      const isWholePackage = (!taskId || String(taskId).startsWith("package:")) && (workCategory || (taskId && String(taskId).startsWith("package:")));
      const targetCategory = (workCategory || (taskId && String(taskId).startsWith("package:") ? String(taskId).replace(/^package:/, "") : undefined))?.trim();

      if (!jobId || !locationId || (!taskId && !targetCategory) || !contractorId) {
        return res.status(400).json({
          error: "Missing required assignment fields: jobId, locationId, (taskId or workCategory), contractorId are required.",
        });
      }

      await ensureJobLocationTables((query, params) => db.execute(sql.raw(query)));

      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) return res.status(404).json({ error: "Job not found" });

      const [location] = await db.select().from(jobLocations).where(eq(jobLocations.id, locationId));
      if (!location) return res.status(404).json({ error: "Location not found" });

      const [contractor] = await db.select().from(contractors).where(eq(contractors.id, contractorId));
      if (!contractor) return res.status(404).json({ error: "Contractor not found" });

      const contractorDisplayName = contractor.name || "Contractor";
      const start = startDate || new Date().toISOString().split("T")[0];
      const end = endDate || start;

      if (isWholePackage && targetCategory) {
        // Whole Work Package Assignment: locationTaskId = null, workCategory = targetCategory, taskName = targetCategory
        const categoryTasks = await db
          .select()
          .from(jobLocationTasks)
          .where(
            and(
              eq(jobLocationTasks.jobId, jobId),
              eq(jobLocationTasks.locationId, locationId),
              eq(jobLocationTasks.workCategory, targetCategory)
            )
          );

        const [assignment] = await db
          .insert(jobAssignments)
          .values({
            jobId: job.id,
            contractorName: contractorDisplayName,
            email: contractor.email,
            phone: (contractor as any).phone || "0000000000",
            workLocation: location.name,
            hbxlJob: job.title,
            locationId: location.id,
            locationName: location.name,
            locationTaskId: null,
            workCategory: targetCategory,
            taskName: targetCategory,
            buildPhases: [],
            startDate: start,
            endDate: end,
            specialInstructions: specialInstructions || `Assigned to whole package: ${location.name} → ${targetCategory}`,
            status: "assigned",
            sendTelegramNotification: Boolean(sendTelegramNotification),
          })
          .returning();

        if (categoryTasks.length > 0) {
          await db
            .update(jobLocationTasks)
            .set({
              status: "assigned",
              assignedContractorId: contractor.id,
              assignedContractorName: contractorDisplayName,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(jobLocationTasks.jobId, jobId),
                eq(jobLocationTasks.locationId, locationId),
                eq(jobLocationTasks.workCategory, targetCategory)
              )
            );
        }

        console.log(`✅ Worker ${contractorDisplayName} assigned to whole package ${job.title} → ${location.name} → ${targetCategory}`);

        return res.json({
          success: true,
          assignment,
          tasks: categoryTasks,
          jobTitle: job.title,
          locationName: location.name,
          workCategory: targetCategory,
          taskName: targetCategory,
          contractorName: contractorDisplayName,
        });
      }

      // Explicit Child Task Assignment: locationTaskId = task.id
      const [task] = await db.select().from(jobLocationTasks).where(eq(jobLocationTasks.id, taskId));
      if (!task) return res.status(404).json({ error: "Task not found" });

      const [assignment] = await db
        .insert(jobAssignments)
        .values({
          jobId: job.id,
          contractorName: contractorDisplayName,
          email: contractor.email,
          phone: (contractor as any).phone || "0000000000",
          workLocation: location.name,
          hbxlJob: job.title,
          locationId: location.id,
          locationName: location.name,
          locationTaskId: task.id,
          workCategory: task.workCategory,
          taskName: task.taskName,
          buildPhases: [],
          startDate: start,
          endDate: end,
          specialInstructions: specialInstructions || `Assigned to ${location.name} → ${task.workCategory} (${task.taskName})`,
          status: "assigned",
          sendTelegramNotification: Boolean(sendTelegramNotification),
        })
        .returning();

      const [updatedTask] = await db
        .update(jobLocationTasks)
        .set({
          status: "assigned",
          assignedContractorId: contractor.id,
          assignedContractorName: contractorDisplayName,
          updatedAt: new Date(),
        })
        .where(eq(jobLocationTasks.id, task.id))
        .returning();

      console.log(`✅ Worker ${contractorDisplayName} assigned to ${job.title} → ${location.name} → ${task.workCategory} (${task.taskName})`);

      res.json({
        success: true,
        assignment,
        task: updatedTask,
        jobTitle: job.title,
        locationName: location.name,
        taskName: task.taskName,
        contractorName: contractorDisplayName,
      });
    } catch (error) {
      console.error("Error assigning worker to task:", error);
      res.status(500).json({ error: "Failed to assign worker to task", details: error instanceof Error ? error.message : String(error) });
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
      const visibleAssignments = assignments.filter(
        (assignment) =>
          !isStructuredWorkerAssignment(assignment)
          || (req as SessionRequest).session?.role === "admin",
      );
      const updatedAssignments = visibleAssignments.map(assignment => {
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

  async function getAuthenticatedWorker(req: SessionRequest) {
    const session = req.session;
    if (!session?.userId || session.role !== "contractor" || !session.username) return null;

    const canonicalUsername = deriveCanonicalUsername(session.username);
    const workerList = await workerService.listWorkers();
    return workerList.find(
      (worker) => worker.isActive && worker.username === canonicalUsername,
    ) || null;
  }

  async function getAuthenticatedWorkerAssignments(req: SessionRequest) {
    const authenticatedWorker = await getAuthenticatedWorker(req);
    if (!authenticatedWorker) return null;

    const [allAssignments, workerList] = await Promise.all([
      storage.getJobAssignments(),
      workerService.listWorkers(),
    ]);
    const assignments = getAssignmentsOwnedByWorker(
      allAssignments,
      authenticatedWorker,
      workerList.filter((worker) => worker.isActive),
    );
    return { authenticatedWorker, assignments };
  }

  async function blocksLegacyStructuredProgress(
    req: SessionRequest,
    assignmentId: string,
  ): Promise<boolean> {
    if (req.session?.role === "admin") return false;
    const assignments = await storage.getJobAssignments();
    const assignment = assignments.find((candidate) => candidate.id === assignmentId);
    return Boolean(assignment && isStructuredWorkerAssignment(assignment));
  }

  app.get("/api/worker-assignments", async (req, res) => {
    try {
      const owned = await getAuthenticatedWorkerAssignments(req as SessionRequest);
      if (!owned) return res.status(401).json({ error: "Authenticated worker required" });

      res.json({
        workerId: owned.authenticatedWorker.id,
        assignments: owned.assignments,
      });
    } catch (error) {
      console.error("Error fetching authenticated worker assignments:", error);
      res.status(500).json({ error: "Failed to fetch worker assignments" });
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

  // Helper function to calculate distance using Haversine formula (in kilometers)  
  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Dynamic function to find nearest assigned job site for a contractor
  async function findNearestAssignedJobSite(contractorName: string, currentLat: number, currentLng: number): Promise<{location: string, distance: number} | null> {
    console.log(`🔍 Finding nearest assigned job site for ${contractorName} at GPS ${currentLat}, ${currentLng}`);
    
    try {
      // Get all active assignments for this contractor
      const assignments = await storage.getContractorAssignments(contractorName);
      
      if (!assignments || assignments.length === 0) {
        console.log(`❌ No assignments found for contractor: ${contractorName}`);
        return null;
      }
      
      let nearestAssignment: any = null;
      let shortestDistance = Infinity;
      
      // Check all assignments to find which one the contractor is closest to
      for (const assignment of assignments) {
        if (assignment.latitude && assignment.longitude) {
          const distance = calculateDistance(
            currentLat,
            currentLng,
            parseFloat(assignment.latitude),
            parseFloat(assignment.longitude)
          );
          
          console.log(`📏 Distance to ${assignment.workLocation}: ${distance.toFixed(2)}km`);
          
          if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestAssignment = assignment;
          }
        } else {
          console.log(`⚠️  Assignment ${assignment.id} has no GPS coordinates: ${assignment.workLocation}`);
        }
      }
      
      // Only return if within reasonable proximity (3.5km like the original system)
      if (nearestAssignment && shortestDistance <= 3.5) {
        console.log(`🎯 Found nearest assigned job site: ${nearestAssignment.workLocation} (${shortestDistance.toFixed(2)}km away)`);
        return {
          location: nearestAssignment.workLocation,
          distance: shortestDistance
        };
      } else {
        console.log(`❌ No nearby assigned job sites found (closest: ${nearestAssignment?.workLocation} at ${shortestDistance.toFixed(2)}km)`);
        return null;
      }
    } catch (error) {
      console.error(`Error finding nearest job site for ${contractorName}:`, error);
      return null;
    }
  }

  // Reverse geocoding: Convert GPS coordinates to nearest postcode
  function reverseGeocode(latitude: number, longitude: number): string | null {
    const lat = parseFloat(latitude.toString());
    const lng = parseFloat(longitude.toString());
    
    console.log(`🔄 Reverse geocoding for coordinates: ${lat}, ${lng}`);
    
    // Simple postcode map for lookup
    const postcodeMap: { [key: string]: { latitude: string; longitude: string } } = {
      'DA17 5DB': { latitude: '51.491306', longitude: '0.148139' },
      'DA17': { latitude: '51.491306', longitude: '0.148139' },
      'DA7 6HJ': { latitude: '51.4851', longitude: '0.1540' },
      'DA7': { latitude: '51.4851', longitude: '0.1540' },
      'BR6 9HE': { latitude: '51.361', longitude: '0.106' },
      'BR6': { latitude: '51.361', longitude: '0.106' },
      'BR9': { latitude: '51.4612', longitude: '0.1388' },
      'SE9': { latitude: '51.4629', longitude: '0.0789' },
      'DA8': { latitude: '51.4891', longitude: '0.2245' },
      'DA1': { latitude: '51.4417', longitude: '0.2056' },
      'SG1 1EH': { latitude: '51.8721', longitude: '-0.2015' },
      'SG1 1AE': { latitude: '51.902844', longitude: '-0.201658' }, // Correct postcode
      'SG1': { latitude: '51.8721', longitude: '-0.2015' },
      'ME5 9GX': { latitude: '51.335996', longitude: '0.530215' },
      'ME5': { latitude: '51.335996', longitude: '0.530215' },
      'ME1 1AA': { latitude: '51.388000', longitude: '0.505000' },
      'ME1': { latitude: '51.388000', longitude: '0.505000' },
      'ME7 1BT': { latitude: '51.388800', longitude: '0.548900' },
      'ME7': { latitude: '51.388800', longitude: '0.548900' },
      'CT15 7PG': { latitude: '51.2544', longitude: '1.3045' },
      'CT15': { latitude: '51.2544', longitude: '1.3045' },
    };
    
    // Calculate distance to each known postcode
    let closestPostcode = null;
    let shortestDistance = Infinity;
    
    for (const [postcode, coords] of Object.entries(postcodeMap)) {
      const postcodeLatitude = parseFloat(coords.latitude);
      const postcodeLongitude = parseFloat(coords.longitude);
      
      // Calculate distance using simplified formula
      const latDiff = lat - postcodeLatitude;
      const lngDiff = lng - postcodeLongitude;
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      
      if (distance < shortestDistance) {
        shortestDistance = distance;
        closestPostcode = postcode;
      }
    }
    
    // Increased tolerance - 0.05 degrees ≈ 5km (more lenient for GPS variations)
    if (shortestDistance < 0.05 && closestPostcode) {
      console.log(`📍 Found closest postcode: ${closestPostcode} (distance: ${shortestDistance.toFixed(6)})`);
      return closestPostcode;
    }
    
    console.log(`❌ No nearby postcode found (closest: ${closestPostcode} at ${shortestDistance.toFixed(6)} degrees distance)`);
    return null;
  }

  // Helper function to get GPS coordinates from UK postcode
  function getPostcodeCoordinates(location: string): { latitude: string; longitude: string } | null {
    if (!location || typeof location !== 'string') {
      return null;
    }
    
    // Simple postcode-to-GPS lookup for common UK postcodes
    const postcodeMap: { [key: string]: { latitude: string; longitude: string } } = {
      'DA17 5DB': { latitude: '51.491306', longitude: '0.148139' },
      'DA17': { latitude: '51.491306', longitude: '0.148139' },
      'DA7 6HJ': { latitude: '51.4851', longitude: '0.1540' }, // Xavier Jones location
      'DA7': { latitude: '51.4851', longitude: '0.1540' },
      'BR6 9HE': { latitude: '51.361', longitude: '0.106' }, // Orpington site (actual location)
      'BR6': { latitude: '51.361', longitude: '0.106' },
      'BR9': { latitude: '51.4612', longitude: '0.1388' },
      'SE9': { latitude: '51.4629', longitude: '0.0789' },
      'DA8': { latitude: '51.4891', longitude: '0.2245' },
      'DA1': { latitude: '51.4417', longitude: '0.2056' },
      'SG1 1EH': { latitude: '51.8721', longitude: '-0.2015' },
      'SG1 1AE': { latitude: '51.902844', longitude: '-0.201658' }, // Correct postcode - Hamza & Dalwayne location
      'SG1': { latitude: '51.8721', longitude: '-0.2015' },
      'ME5 9GX': { latitude: '51.335996', longitude: '0.530215' }, // Chatham main site
      'ME5': { latitude: '51.335996', longitude: '0.530215' },
      'ME1 1AA': { latitude: '51.388000', longitude: '0.505000' }, // Rochester site
      'ME1': { latitude: '51.388000', longitude: '0.505000' },
      'ME7 1BT': { latitude: '51.388800', longitude: '0.548900' }, // Gillingham site
      'ME7': { latitude: '51.388800', longitude: '0.548900' },
      'CT15 7PG': { latitude: '51.2544', longitude: '1.3045' }, // Bramling site for Mohamed
      'CT15': { latitude: '51.2544', longitude: '1.3045' },
      // Add more as needed
    };
    
    // Clean and normalize location string
    let cleanLocation = location
      .replace(/["\\\n]/g, '') // Remove quotes and escape characters
      .trim()
      .toUpperCase();
    
    // Debug logging
    console.log(`🔎 GPS lookup for "${location}": cleaned to "${cleanLocation}"`);
    
    // Try to extract postcode pattern (letters followed by numbers and letters)
    const postcodePattern = /([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})/;
    const postcodeMatch = cleanLocation.match(postcodePattern);
    
    if (postcodeMatch) {
      const extractedPostcode = postcodeMatch[1].trim();
      console.log(`🎯 Extracted postcode: ${extractedPostcode}`);
      
      if (postcodeMap[extractedPostcode]) {
        console.log(`✅ Found coordinates for ${extractedPostcode}`);
        return postcodeMap[extractedPostcode];
      }
      
      // Try partial match with area code only
      const postcodePrefix = extractedPostcode.split(' ')[0];
      if (postcodeMap[postcodePrefix]) {
        console.log(`✅ Found coordinates for prefix ${postcodePrefix}`);
        return postcodeMap[postcodePrefix];
      }
    }
    
    // Fallback: try direct match with entire location string
    if (postcodeMap[cleanLocation]) {
      console.log(`✅ Found direct match for ${cleanLocation}`);
      return postcodeMap[cleanLocation];
    }
    
    console.log(`❌ No GPS coordinates found for: ${cleanLocation}`);
    return null;
  }

  // Test endpoint for reverse geocoding
  app.post("/api/test-reverse-geocode", (req, res) => {
    try {
      const { latitude, longitude } = req.body;
      const postcode = reverseGeocode(latitude, longitude);
      res.json({ latitude, longitude, detectedPostcode: postcode });
    } catch (error) {
      res.status(500).json({ error: "Reverse geocoding failed" });
    }
  });

  // Update work session location based on GPS coordinates
  app.post("/api/update-session-locations", async (req, res) => {
    try {
      const activeSessions = await storage.getAllActiveSessions();
      let updatedCount = 0;
      
      for (const session of activeSessions) {
        if (session.startLatitude && session.startLongitude) {
          const detectedPostcode = reverseGeocode(
            parseFloat(session.startLatitude), 
            parseFloat(session.startLongitude)
          );
          
          if (detectedPostcode && detectedPostcode.startsWith('SG1')) {
            // Update the session location to the correct postcode
            await storage.updateWorkSession(session.id, {
              jobSiteLocation: `Stevenage, ${detectedPostcode}`
            });
            console.log(`📍 Updated session ${session.id} location to: Stevenage, ${detectedPostcode}`);
            updatedCount++;
          }
        }
      }
      
      res.json({ message: `Updated ${updatedCount} session locations` });
    } catch (error) {
      console.error("Error updating session locations:", error);
      res.status(500).json({ error: "Failed to update locations" });
    }
  });

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
      
      // First, check staff table for admin/staff login using shared helper
      const authResult = await authenticateStaffUser(storage, username, password);
      if (authResult.success) {
        return res.json(authResult.user);
      }
      if (authResult.statusCode === 500) {
        return res.status(500).json({ error: "Internal server error" });
      }
      
      // If not found in staff, check contractor applications
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
      let startTime = req.body.startTime ? new Date(req.body.startTime) : new Date();
      
      // STANDARDIZE LOGIN TIMES: Login between 7:45-8:15 AM counts as 7:45 AM start
      const startHour = startTime.getHours();
      const startMinute = startTime.getMinutes();
      
      // Check if login is between 7:45 AM (7:45) and 8:15 AM (8:15)
      const isInStandardPeriod = (startHour === 7 && startMinute >= 45) || 
                                (startHour === 8 && startMinute <= 15);
      
      if (isInStandardPeriod) {
        // Set start time to 7:45 AM sharp for full day's pay
        const standardStartTime = new Date(startTime);
        standardStartTime.setHours(7, 45, 0, 0);
        startTime = standardStartTime;
        console.log(`🕐 STANDARD WORK TIME: Login at ${req.body.startTime} standardized to 7:45 AM for full day's pay`);
      }
      
      const sessionData = {
        ...req.body,
        startTime: startTime,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined
      };

      // Lookup proper job location instead of using raw GPS coordinates
      if (sessionData.jobSiteLocation && (sessionData.jobSiteLocation.includes('Work Site:') || sessionData.jobSiteLocation === 'Unknown Location')) {
        // Get all jobs to find the proper location
        const jobs = await storage.getJobs();
        
        // Find the active job location for this contractor
        for (const job of jobs) {
          if (job.contractorName === sessionData.contractorName && job.location) {
            console.log(`📍 Mapping GPS coordinates to job location: ${job.location}`);
            sessionData.jobSiteLocation = job.location;
            break;
          }
        }
        
        // Fallback: Use first available job location if contractor-specific job not found
        if (sessionData.jobSiteLocation.includes('Work Site:') || sessionData.jobSiteLocation === 'Unknown Location') {
          const anyJob = jobs.find(job => job.location);
          if (anyJob) {
            console.log(`📍 Using fallback job location: ${anyJob.location}`);
            sessionData.jobSiteLocation = anyJob.location;
          }
        }
      }
      
      console.log("🔍 Work session data before validation:", JSON.stringify(sessionData, null, 2));
      
      const validationResult = insertWorkSessionSchema.safeParse(sessionData);
      if (!validationResult.success) {
        console.error("❌ Work session validation failed:", validationResult.error.errors);
        return res.status(400).json({ 
          error: "Invalid work session data", 
          details: validationResult.error.errors,
          receivedData: sessionData
        });
      }
      
      const session = await storage.createWorkSession(validationResult.data);
      console.log("✅ Work session created successfully:", session.id);
      res.status(201).json(session);
    } catch (error) {
      console.error("❌ Error creating work session:", error);
      if (error instanceof Error) {
        console.error("❌ Error details:", error.message);
        console.error("❌ Error stack:", error.stack);
      }
      res.status(400).json({ error: "Failed to create work session", details: error instanceof Error ? error.message : 'Unknown error' });
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

  // Import shared location tracking
  const { updateContractorLocation, getContractorLocation } = await import('./location-tracker');

  // Update contractor's current location (real-time GPS tracking)
  app.post("/api/update-location", async (req, res) => {
    try {
      const { contractorName, latitude, longitude } = req.body;
      
      if (!contractorName || !latitude || !longitude) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Store current location using shared tracker
      updateContractorLocation(contractorName, parseFloat(latitude), parseFloat(longitude));
      
      res.json({ success: true, message: "Location updated successfully" });
      
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  // Get contractor's current location
  app.get("/api/contractor-location/:name", async (req, res) => {
    try {
      const contractorName = decodeURIComponent(req.params.name);
      const location = getContractorLocation(contractorName);
      
      if (!location) {
        return res.status(404).json({ error: "Location not found" });
      }
      
      res.json({
        contractorName,
        latitude: location.latitude,
        longitude: location.longitude,
        lastUpdate: location.lastUpdate
      });
      
    } catch (error) {
      console.error("Error getting contractor location:", error);
      res.status(500).json({ error: "Failed to get location" });
    }
  });

  // Multi-site GPS proximity check endpoint for login validation
  app.post("/api/check-proximity", async (req, res) => {
    try {
      const { userLatitude, userLongitude, contractorName } = req.body;
      
      console.log(`🔍 MULTI-SITE GPS Check for ${contractorName}:`);
      console.log(`📍 User Location: ${userLatitude}, ${userLongitude}`);
      
      // Update contractor's current location for real-time tracking
      if (contractorName && userLatitude && userLongitude) {
        updateContractorLocation(contractorName, parseFloat(userLatitude), parseFloat(userLongitude));
      }
      
      // Check proximity to ALL job sites
      const allJobs = await storage.getJobs();
      console.log(`🔍 Found ${allJobs.length} total jobs in database`);
      
      let nearestJobSite = null;
      let nearestDistance = Infinity;
      let authorizedSites = [];
      
      for (const job of allJobs) {
        if (job.location) {
          console.log(`🏗️ Checking job: ${job.title} at ${job.location}`);
          const jobSiteCoords = getPostcodeCoordinates(job.location);
          console.log(`🔎 GPS lookup for ${job.location}:`, jobSiteCoords);
          if (jobSiteCoords) {
            console.log(`📍 GPS coordinates for ${job.location}: ${jobSiteCoords.latitude}, ${jobSiteCoords.longitude}`);
            const jobSiteLat = parseFloat(jobSiteCoords.latitude);
            const jobSiteLon = parseFloat(jobSiteCoords.longitude);
            
            const distance = calculateGPSDistance(
              parseFloat(userLatitude),
              parseFloat(userLongitude),
              jobSiteLat,
              jobSiteLon
            );
            
            // Track nearest job site
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestJobSite = {
                location: job.location,
                distance: distance,
                jobTitle: job.title,
                jobId: job.id
              };
            }
            
            // Fetch site checkin config allowed radius (default 100m)
            const allowedRadius = 100;

            // Check if within site radius
            if (distance <= allowedRadius) {
              authorizedSites.push({
                location: job.location,
                distance: Math.round(distance),
                jobTitle: job.title,
                jobId: job.id
              });
            }
          }
        }
      }
      
      const withinRange = authorizedSites.length > 0;
      
      if (withinRange) {
        console.log(`✅ AUTHORIZED: ${contractorName} can clock in at ${authorizedSites.length} site(s)`);
        authorizedSites.forEach(site => {
          console.log(`   📍 ${site.location} (${site.jobTitle}) - ${site.distance}m away`);
        });
      } else {
        const nearestInfo = nearestJobSite ? 
          `${Math.round(nearestDistance)}m from ${nearestJobSite.location}` :
          'no job sites found';
        console.log(`❌ TOO FAR: ${contractorName} not within 100m of any job site - ${nearestInfo}`);
      }
      
      res.json({
        withinRange,
        authorizedSites,
        nearestJobSite,
        allowedDistance: 100,
        message: withinRange ? 
          `Access granted to ${authorizedSites.length} job site(s)` :
          `Must be within 100m of a job site to clock in`
      });
      
    } catch (error) {
      console.error("Error in multi-site proximity check:", error);
      res.status(500).json({ 
        error: "Failed to check proximity",
        withinRange: false,
        authorizedSites: []
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

  // Batch admin inspections for multiple completed tasks
  app.post("/api/admin-inspections/batch", async (req, res) => {
    try {
      const { inspections } = req.body;
      
      if (!Array.isArray(inspections)) {
        return res.status(400).json({ error: "Inspections must be an array" });
      }
      
      const createdInspections = [];
      
      for (const inspectionData of inspections) {
        const inspection = await storage.createAdminInspection({
          assignmentId: inspectionData.assignmentId,
          inspectorName: inspectionData.inspectedBy,
          inspectionType: "task_inspection", 
          workQualityRating: (inspectionData.inspectionStatus === 'approved' ? 5 : 3).toString(),
          weatherConditions: "Not specified",
          progressComments: `Task: ${inspectionData.taskName} - ${inspectionData.inspectionStatus}`,
          safetyNotes: inspectionData.notes || "",
          materialsIssues: inspectionData.inspectionStatus === 'issues' ? inspectionData.notes : "",
          nextActions: inspectionData.inspectionStatus === 'issues' ? "Address noted issues" : "Task approved",
          photoUrls: [],
          status: "completed"
        });
        
        createdInspections.push(inspection);
      }
      
      console.log(`📋 Created ${createdInspections.length} task-based admin inspections`);
      res.status(201).json(createdInspections);
    } catch (error) {
      console.error("Error creating batch admin inspections:", error);
      res.status(500).json({ error: "Failed to create batch admin inspections" });
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
      if (await blocksLegacyStructuredProgress(req as SessionRequest, assignmentId)) {
        return res.status(403).json({ error: "Use authenticated structured task progress" });
      }
      const progress = await storage.getTaskProgress(contractorName, assignmentId);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching task progress:", error);
      res.status(500).json({ error: "Failed to fetch task progress" });
    }
  });

  app.get("/api/worker-task-progress/:assignmentId", async (req, res) => {
    try {
      const owned = await getAuthenticatedWorkerAssignments(req as SessionRequest);
      if (!owned) return res.status(401).json({ error: "Authenticated worker required" });

      const assignment = owned.assignments.find(
        (candidate) => candidate.id === req.params.assignmentId,
      );
      if (!assignment || !isStructuredWorkerAssignment(assignment)) {
        return res.status(404).json({ error: "Structured assignment not found" });
      }

      const progress = await storage.getTaskProgress(
        assignment.contractorName,
        assignment.id,
      );
      res.json(progress.filter((row) => row.taskId === assignment.locationTaskId));
    } catch (error) {
      console.error("Error fetching structured worker task progress:", error);
      res.status(500).json({ error: "Failed to fetch task progress" });
    }
  });

  // Get team task progress - shows completion status from all team members
  app.get("/api/team-task-progress/:assignmentId", async (req, res) => {
    try {
      const { assignmentId } = req.params;
      if (await blocksLegacyStructuredProgress(req as SessionRequest, assignmentId)) {
        return res.status(403).json({ error: "Structured team progress is not available" });
      }
      console.log(`🤝 Fetching team task progress for assignment: ${assignmentId}`);
      
      // Get all assignments to find teammates working on the same job
      const allAssignments = await storage.getJobAssignments();
      const currentAssignment = allAssignments.find((a: any) => a.id === assignmentId);
      
      if (!currentAssignment) {
        console.log(`❌ Assignment ${assignmentId} not found`);
        return res.json([]);
      }
      
      // Find all contractors working on the same job location (teammates)
      const teamAssignments = allAssignments.filter((a: any) => 
        a.hbxlJob === currentAssignment.hbxlJob && 
        a.workLocation === currentAssignment.workLocation &&
        a.status === 'assigned'
      );
      
      console.log(`🤝 Found ${teamAssignments.length} contractors working on job: ${currentAssignment.hbxlJob} at ${currentAssignment.workLocation}`);
      
      // Get task progress from all team members
      const teamProgress: any[] = [];
      
      for (const assignment of teamAssignments) {
        const contractorProgress = await storage.getTaskProgress(assignment.contractorName, assignment.id);
        
        contractorProgress.forEach((progress: any) => {
          if (progress.completed) {
            teamProgress.push({
              ...progress,
              completedBy: assignment.contractorName,
              completedByFirstName: assignment.contractorName.split(' ')[0]
            });
          }
        });
      }
      
      console.log(`🤝 Found ${teamProgress.length} completed tasks across ${teamAssignments.length} team members`);
      res.json(teamProgress);
    } catch (error) {
      console.error("Error fetching team task progress:", error);
      res.status(500).json({ error: "Failed to fetch team task progress" });
    }
  });

  app.post("/api/task-progress", async (req, res) => {
    try {
      if (await blocksLegacyStructuredProgress(req as SessionRequest, req.body?.assignmentId)) {
        return res.status(403).json({ error: "Use authenticated structured task progress" });
      }
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
      if (await blocksLegacyStructuredProgress(req as SessionRequest, assignmentId)) {
        return res.status(403).json({ error: "Use authenticated structured task progress" });
      }
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

  // Smart backup endpoint for task progress (upsert functionality)
  app.post("/api/task-progress/update", async (req, res) => {
    try {
      const { contractorName, assignmentId, taskId, taskDescription, phase, completed } = req.body;
      if (await blocksLegacyStructuredProgress(req as SessionRequest, assignmentId)) {
        return res.status(403).json({ error: "Use authenticated structured task progress" });
      }
      
      console.log(`📝 Processing task update: ${taskId} - ${completed ? 'completed' : 'incomplete'}`);
      
      // Try to update existing record first
      try {
        const existing = await storage.updateTaskCompletion(contractorName, assignmentId, taskId, completed);
        if (existing) {
          console.log(`📁 Updated existing task: ${taskId}`);
          return res.json({ success: true, action: 'updated', data: existing });
        }
      } catch (updateError) {
        console.log(`📝 Task not found, creating new record: ${taskId}`);
      }
      
      // Create new task progress record if update failed
      try {
        // Derive taskDescription and phase from taskId if not provided
        const description = taskDescription || taskId.replace(/^phase-\d+-item-\d+-/, '').replace(/-/g, ' ');
        const phaseMatch = taskId.match(/^phase-(\d+)/);
        const derivedPhase = phase || (phaseMatch ? `Phase ${phaseMatch[1]}` : 'Unknown Phase');
        
        const newProgress = await storage.createTaskProgress({
          contractorName,
          assignmentId,
          taskId,
          taskDescription: description,
          phase: derivedPhase,
          completed: completed || false
        });
        
        console.log(`✅ Created new task progress: ${taskId} - ${completed ? 'completed' : 'in progress'}`);
        res.json({ success: true, action: 'created', data: newProgress });
      } catch (createError) {
        console.error('❌ Failed to create task progress:', createError);
        res.status(500).json({ error: "Failed to create task progress record" });
      }
    } catch (error) {
      console.error("❌ Error in task progress update:", error);
      res.status(500).json({ error: "Failed to backup task progress" });
    }
  });

  app.post("/api/worker-task-progress/:assignmentId", async (req, res) => {
    try {
      if (typeof req.body?.completed !== "boolean") {
        return res.status(400).json({ error: "Completed must be a boolean" });
      }

      const owned = await getAuthenticatedWorkerAssignments(req as SessionRequest);
      if (!owned) return res.status(401).json({ error: "Authenticated worker required" });

      const assignment = owned.assignments.find(
        (candidate) => candidate.id === req.params.assignmentId,
      );
      if (!assignment || !isStructuredWorkerAssignment(assignment)) {
        return res.status(404).json({ error: "Structured assignment not found" });
      }

      const taskId = assignment.locationTaskId!;
      let progress = await storage.updateTaskCompletion(
        assignment.contractorName,
        assignment.id,
        taskId,
        req.body.completed,
      );
      if (!progress) {
        progress = await storage.createTaskProgress({
          contractorName: assignment.contractorName,
          assignmentId: assignment.id,
          taskId,
          taskDescription: assignment.taskName || assignment.workCategory || "Assigned work",
          phase: assignment.locationName || assignment.workLocation,
          completed: req.body.completed,
        });
      }

      res.json({
        assignmentId: assignment.id,
        taskId: progress.taskId,
        completed: progress.completed,
      });
    } catch (error) {
      console.error("Error saving structured worker task progress:", error);
      res.status(500).json({ error: "Failed to save task progress" });
    }
  });

  const httpServer = createServer(app);
  
  // ===== TWILIO WEBSOCKET VOICE STREAMING =====
  
  // Session storage keyed by streamSid
  const sessions: Record<string, { 
    call_sid: string; 
    buf: number[]; 
    history: any[];
    last_transcribe: number;
  }> = {};
  
  // Create WebSocket server for Twilio audio streaming
  const wss = new WebSocketServer({ server: httpServer, path: '/twilio/stream' });
  
  wss.on('connection', async (ws: WebSocket) => {
    console.log('🎙️ Twilio WebSocket connected');
    
    let streamSid: string | null = null;
    const { mulawToPcm, resample8kTo16k, wav16kFromPcm16 } = await import('./voice-whisper');
    const { createCallSession, addToHistory, endCallSession, logEvent } = await import('./voice-sessions');
    
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        // DEBUG: Log ALL incoming events with FULL data for start event
        if (data.event === 'start') {
          console.log(`📩 ⭐ START EVENT:`, JSON.stringify(data, null, 2));
        } else {
          console.log(`📩 Twilio event: ${data.event}`, JSON.stringify(data).slice(0, 200));
        }
        
        // Log all events for debugging
        if (streamSid && sessions[streamSid]) {
          await logEvent(sessions[streamSid].call_sid, `Event: ${data.event}`);
        }
        
        switch (data.event) {
          case 'start':
            // Capture streamSid from start event
            streamSid = data.start.streamSid;
            const callSid = data.start.callSid || `call_${Date.now()}`;
            
            if (!streamSid) {
              console.log(`⚠️ No streamSid in start event`);
              break;
            }
            
            // Store session with audio buffer and timestamp
            sessions[streamSid] = { 
              call_sid: callSid, 
              buf: [], 
              history: [],
              last_transcribe: Date.now()
            };
            console.log(`[start] sid=${streamSid}`);
            
            // Create call session
            const phoneNumber = data.start?.customParameters?.From || 'unknown';
            await createCallSession(callSid, phoneNumber);
            console.log(`📞 Call started: ${callSid} from ${phoneNumber}`);
            
            break;
            
          case 'media':
            // Decode μ-law 8kHz → PCM16 16kHz and transcribe every ~1s
            if (!streamSid || !data.media?.payload) break;
            
            const session = sessions[streamSid];
            if (!session) break;
            
            try {
              // Decode base64 μ-law
              const b64 = data.media.payload;
              const mulaw = Buffer.from(b64, 'base64');
              
              // μ-law → 16-bit PCM @8k
              const pcm8k = mulawToPcm(mulaw);
              
              // Resample 8k → 16k
              const pcm16k = resample8kTo16k(pcm8k);
              
              // Add to buffer (as array of bytes)
              const arr = Array.from(pcm16k);
              session.buf.push(...arr);
              
              // Throttle: transcribe every ~1s
              const now = Date.now();
              const timeSinceLastTranscribe = now - session.last_transcribe;
              
              if (timeSinceLastTranscribe >= 1000 && session.buf.length > 32000) {
                const pcm = Buffer.from(session.buf);
                session.buf = []; // Clear buffer
                session.last_transcribe = now;
                
                // Transcribe async (don't block)
                (async () => {
                  try {
                    // Convert PCM16 → WAV
                    const wavBuffer = wav16kFromPcm16(pcm);
                    
                    // Send to Whisper
                    const { transcribeAudio } = await import('./voice-whisper');
                    const text = await transcribeAudio(wavBuffer);
                    const trimmed = text.trim();
                    
                    console.log(`📝 User said: ${JSON.stringify(trimmed)}`);
                    
                    // Generate response for meaningful text - NO callId check!
                    if (trimmed.length > 3) {
                      const callSid = session.call_sid;
                      console.log(`✅ would reply to: "${trimmed}"`);
                      
                      if (callSid) {
                        await addToHistory(callSid, { user: trimmed });
                      }
                      
                      // Get conversation history
                      const history = session.history || [];
                      
                      // Generate response
                      console.log(`🤖 Generating response...`);
                      const { getSimpleVoiceResponse } = await import('./simple-voice');
                      const response = await getSimpleVoiceResponse(trimmed, history);
                      
                      // Save response to history
                      if (callSid) {
                        await addToHistory(callSid, { assistant: response });
                      }
                      session.history.push({ user: trimmed, assistant: response });
                      
                      console.log(`✅ Response: "${response}"`);
                      console.log(`📞 Sending response back to caller...`);
                      
                      // TODO: Send audio response via Twilio
                    }
                  } catch (error: any) {
                    console.error('❌ Whisper transcription error:', error);
                    console.error(error.stack);
                  }
                })();
              }
            } catch (error: any) {
              console.error('❌ Audio decoding error:', error);
            }
            break;
            
          case 'transcription':
            // This is where we get the actual transcribed text from Twilio (if enabled)
            streamSid = streamSid || data.streamSid || data.start?.streamSid;
            if (!streamSid) break;
            
            const text = (data.transcription?.text || '').trim();
            const twilioSession = sessions[streamSid];
            const hasCallSid = !!twilioSession?.call_sid;
            
            console.log(`[transcript] len=${text.length} sid=${streamSid} text="${text}" has_call_sid=${hasCallSid}`);
            
            // Generate response for meaningful text - NO callId check!
            if (text.length > 3) {
              const callSid = twilioSession?.call_sid;
              console.log(`📝 User said: "${text}" (stream=${streamSid}, call=${callSid})`);
              
              // Quick sanity test first
              console.log(`✅ would reply to: "${text}"`);
              
              // Generate response async (don't block)
              (async () => {
                try {
                  if (callSid) {
                    await addToHistory(callSid, { user: text });
                  }
                  
                  // Get conversation history
                  const history = twilioSession?.history || [];
                  
                  // Generate response
                  console.log(`🤖 Generating response...`);
                  const { getSimpleVoiceResponse } = await import('./simple-voice');
                  const response = await getSimpleVoiceResponse(text, history);
                  
                  // Save response to history
                  if (callSid) {
                    await addToHistory(callSid, { assistant: response });
                  }
                  twilioSession?.history.push({ user: text, assistant: response });
                  
                  console.log(`✅ Response: "${response}"`);
                  console.log(`📞 Sending response back to caller...`);
                  
                  // TODO: Send audio response via Twilio
                } catch (error: any) {
                  console.error('❌ generate_and_stream_reply error:', error);
                  console.error(error.stack);
                }
              })();
            } else {
              console.log(`(ignored short chunk: '${text}')`);
            }
            break;
            
          case 'stop':
            // Call ended
            if (streamSid && sessions[streamSid]) {
              const callSid = sessions[streamSid].call_sid;
              await endCallSession(callSid);
              console.log(`📞 Call ended: ${callSid}`);
              delete sessions[streamSid];
            }
            break;
            
          default:
            if (streamSid && sessions[streamSid]) {
              await logEvent(sessions[streamSid].call_sid, `Unknown event: ${data.event}`);
            }
        }
      } catch (error: any) {
        console.error('❌ WebSocket message error:', error.message);
      }
    });
    
    ws.on('close', async () => {
      console.log('📞 WebSocket closed');
      if (streamSid && sessions[streamSid]) {
        await endCallSession(sessions[streamSid].call_sid);
        delete sessions[streamSid];
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  });
  
  // Call-scoped memory to track conversation history
  const VOICE_SESSIONS: Record<string, { history: Array<{ role: string; content: string }> }> = {};
  
  function getVoiceSession(callSid: string) {
    if (!VOICE_SESSIONS[callSid]) {
      VOICE_SESSIONS[callSid] = { history: [] };
    }
    return VOICE_SESSIONS[callSid];
  }
  
  // Twilio voice webhook - called when call begins
  app.post('/voice/connect', async (req, res) => {
    console.log('📞 Twilio voice connect webhook received');
    
    // Check if this is the first call (no SpeechResult means first call)
    const isFirstCall = !req.body.SpeechResult;
    
    if (isFirstCall) {
      // First call: Generate natural ElevenLabs greeting
      const greeting = "Hi Rudy how can I Help";
      const crypto = (await import('crypto')).default;
      const fs = (await import('fs/promises')).default;
      const path = (await import('path')).default;
      
      const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
      const ELEVEN_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
      
      const audioDir = path.join(process.cwd(), 'audio');
      await fs.mkdir(audioDir, { recursive: true });
      
      const hash = crypto.createHash('sha1').update(greeting).digest('hex').slice(0, 16);
      const mp3Path = path.join(audioDir, `${hash}.mp3`);
      
      let audioExists = false;
      try {
        await fs.access(mp3Path);
        audioExists = true;
      } catch {}
      
      if (!audioExists) {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVEN_API_KEY || '',
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: greeting,
              model_id: 'eleven_multilingual_v2',
              optimize_streaming_latency: 3,
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0,
                use_speaker_boost: true
              }
            })
          }
        );
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(mp3Path, audioBuffer);
      }
      
      const domain = process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
      const protocol = process.env.REPLIT_DEV_DOMAIN ? 'https' : 'http';
      const audioUrl = `${protocol}://${domain}/audio/${hash}.mp3`;
      
      // Play natural greeting, then gather
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="0.4"/>
  <Play>${audioUrl}</Play>
  <Gather input="speech" language="en-ZA" speechTimeout="auto" action="/voice/handle" method="POST"/>
</Response>`;
      
      console.log(`📤 First call - playing ElevenLabs greeting`);
      res.type('text/xml').send(twiml);
    } else {
      // Loop back - silent gather
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="en-ZA" speechTimeout="auto" action="/voice/handle" method="POST"/>
</Response>`;
      
      console.log(`📤 Loop - silent gather`);
      res.type('text/xml').send(twiml);
    }
  });
  
  // Handle speech input from Gather
  app.post('/voice/handle', async (req, res) => {
    try {
      console.log('🎤 /voice/handle called');
      console.log('📋 Request body:', JSON.stringify(req.body));
      
      const callSid = req.body.CallSid || 'unknown';
      const text = (req.body.SpeechResult || '').trim();
      const confidence = parseFloat(req.body.Confidence || '0');
      console.log('📞 CallSid:', callSid);
      console.log('📝 User said:', text);
      console.log('🎯 Confidence:', confidence);
      
      if (!text || text.length < 2) {
        // No speech detected, loop back
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I didn't hear anything. Try again.</Say>
  <Redirect method="POST">/voice/connect</Redirect>
</Response>`;
        return res.type('text/xml').send(twiml);
      }
      
      // If confidence is too low, ask to repeat (only for very low confidence)
      if (confidence < 0.3) {
        console.log('⚠️ Very low confidence, asking to repeat');
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, I didn't catch that. Could you repeat?</Say>
  <Gather input="speech" language="en-ZA" speechTimeout="auto" action="/voice/handle" method="POST"/>
</Response>`;
        return res.type('text/xml').send(twiml);
      }
      
      // Get call session for conversation memory
      const session = getVoiceSession(callSid);
      
      // Add user message to history
      session.history.push({ role: 'user', content: text });
      console.log('💭 Session history length:', session.history.length);
      
      // Try to get app-specific data first
      const { getVoiceAssistantData } = await import('./voice-data-helper');
      const appData = await getVoiceAssistantData(text, storage);
      
      let reply: string;
      
      // Always use ChatGPT to format responses naturally with conversation context
      console.log('🤖 Using ChatGPT with conversation history...');
      const openai = (await import('openai')).default;
      const client = new openai({ apiKey: process.env.OPENAI_API_KEY });
      
      let systemPrompt = 'You are a helpful voice assistant for Rudy. Be friendly and conversational. Reply in 1–2 short sentences. Use natural language - say "pounds" not "£". Use contractions and natural pauses (commas, ellipses). No long lists. Remember the conversation context.';
      let messages: Array<any> = [
        { role: 'system', content: systemPrompt },
        ...session.history
      ];
      
      if (appData) {
        // Found app-specific data - append it to the last user message
        console.log('📊 App data found:', appData);
        const lastUserMsg = messages[messages.length - 1];
        lastUserMsg.content = `${lastUserMsg.content}\n\n[Database answer: ${appData}]`;
      }
      
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 90,
        temperature: 0.7
      });
      
      let gptReply = completion.choices[0].message.content?.trim() || 'I understand.';
      
      // Keep turns short - split and use first 2 sentences only
      const parts = gptReply.replace(/\?/g, '?\n').replace(/\./g, '.\n').split('\n')
        .map(p => p.trim()).filter(p => p.length > 0);
      reply = parts.slice(0, 2).join(' ');
      // Add micro-pauses for natural speech
      const speechify = (t: string) => {
        t = t.replace(/\?/g, '?…').replace(/!/g, '!…'); // tiny pause after punctuation
        if (t.length > 120 && !t.includes(',')) {
          t = t.replace(/ and /g, ', and '); // add natural pauses
        }
        return t;
      };
      reply = speechify(reply);
      
      // Add assistant reply to conversation history
      session.history.push({ role: 'assistant', content: reply });
      
      console.log('✅ Final reply:', reply);
      
      // Generate ElevenLabs TTS
      console.log('🎙️ Generating speech...');
      const crypto = await import('crypto');
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
      const ELEVEN_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George voice (professional male)
      
      // Create audio directory if it doesn't exist
      const audioDir = path.join(process.cwd(), 'audio');
      await fs.mkdir(audioDir, { recursive: true });
      
      // Hash the reply to cache audio files
      const hash = crypto.createHash('sha1').update(reply).digest('hex').slice(0, 16);
      const mp3Path = path.join(audioDir, `${hash}.mp3`);
      
      // Check if audio file already exists
      let audioExists = false;
      try {
        await fs.access(mp3Path);
        audioExists = true;
        console.log('📦 Using cached audio');
      } catch {
        // File doesn't exist, generate it
      }
      
      if (!audioExists) {
        console.log('🎙️ Calling ElevenLabs API...');
        const fetch = (await import('node-fetch')).default;
        
        try {
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': ELEVEN_API_KEY || '',
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                text: reply,
                model_id: 'eleven_multilingual_v2',
                optimize_streaming_latency: 3,
                voice_settings: {
                  stability: 0.12,
                  similarity_boost: 0.95,
                  style: 0.45,
                  use_speaker_boost: true
                }
              })
            }
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ ElevenLabs API error:', response.status, errorText);
            throw new Error(`ElevenLabs API error: ${response.statusText}`);
          }
          
          const audioBuffer = Buffer.from(await response.arrayBuffer());
          await fs.writeFile(mp3Path, audioBuffer);
          console.log('💾 Saved audio to cache');
        } catch (elevenError: any) {
          console.error('❌ ElevenLabs failed, using Twilio Say:', elevenError.message);
          // Fallback to Twilio's built-in voice
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Brian">${reply}</Say>
  <Redirect method="POST">/voice/connect</Redirect>
</Response>`;
          return res.type('text/xml').send(twiml);
        }
      }
      
      // Build public URL
      const domain = process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
      const protocol = process.env.REPLIT_DEV_DOMAIN ? 'https' : 'http';
      const audioUrl = `${protocol}://${domain}/audio/${hash}.mp3`;
      
      console.log('🔊 Playing audio:', audioUrl);
      
      // Prevent first syllable clipping with 0.4s pause
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="0.4"/>
  <Play>${audioUrl}</Play>
  <Gather input="speech" language="en-ZA" speechTimeout="auto" action="/voice/handle" method="POST"/>
</Response>`;
      
      res.type('text/xml').send(twiml);
      
    } catch (error: any) {
      console.error('❌ Error in voice handler:', error);
      console.error(error.stack);
      
      // Fallback TwiML
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, I encountered an error. Please try again.</Say>
  <Redirect method="POST">/voice/connect</Redirect>
</Response>`;
      
      res.type('text/xml').send(twiml);
    }
  });
  
  // Admin batch inspection submission endpoint
  app.post("/api/admin-inspections/batch", async (req, res) => {
    try {
      const { inspections } = req.body;
      console.log("📋 Processing batch inspection submission:", inspections?.length || 0, "tasks");
      
      if (!inspections || !Array.isArray(inspections)) {
        return res.status(400).json({ error: "Invalid inspections data" });
      }
      
      const results = [];
      for (const inspection of inspections) {
        const result = await storage.createTaskInspectionResult(inspection);
        results.push(result);
      }
      
      console.log("✅ Created", results.length, "task inspection results");
      res.json({ success: true, results });
    } catch (error) {
      console.error("Error creating batch inspections:", error);
      res.status(500).json({ error: "Failed to create inspections" });
    }
  });

  // Get task inspection results for contractor (issues that need attention)
  app.get("/api/task-inspection-results/:contractorName", async (req, res) => {
    try {
      const { contractorName } = req.params;
      console.log("📋 Fetching task inspection results for contractor:", contractorName);
      
      // Get admin inspections that are task-based and contain issues/feedback for this contractor
      const adminInspections = await storage.getAdminInspectionsForContractor(contractorName);
      
      // Transform admin inspection data to match the task inspection format
      // Only show issues that haven't been marked as fixed by contractor
      const taskInspectionResults = adminInspections
        .filter(inspection => 
          inspection.inspectionType === 'task_inspection' && 
          (inspection.progressComments?.includes('issues') || 
           inspection.safetyNotes || 
           inspection.materialsIssues) &&
          inspection.status !== 'contractor_fixed' && // Exclude already fixed issues
          inspection.status !== 'approved' // Exclude admin-approved issues to prevent infinite loop
        )
        .map(inspection => {
          // Extract task info from progress comments
          const taskMatch = inspection.progressComments?.match(/Task: (.+?) - (approved|issues)/);
          const taskName = taskMatch ? taskMatch[1] : 'Unknown Task';
          const status = taskMatch ? taskMatch[2] : 'pending';
          
          return {
            id: inspection.id,
            assignmentId: inspection.assignmentId,
            contractorName: contractorName,
            taskId: `inspection-${inspection.id}`,
            phase: 'Inspection',
            taskName: taskName,
            inspectionStatus: status,
            notes: [
              inspection.safetyNotes, 
              inspection.materialsIssues, 
              inspection.nextActions
            ].filter(Boolean).join(' | '),
            photos: inspection.photoUrls || [],
            inspectedBy: inspection.inspectorName,
            inspectedAt: inspection.createdAt,
            contractorViewed: true, // Admin inspections are immediately visible
            contractorViewedAt: inspection.createdAt
          };
        });
      
      console.log("📋 Retrieved", taskInspectionResults.length, "task inspection results for", contractorName);
      res.json(taskInspectionResults);
    } catch (error) {
      console.error("Error fetching task inspection results:", error);
      res.status(500).json({ error: "Failed to fetch inspection results" });
    }
  });

  // Contractor marks inspection issue as resolved
  app.post("/api/task-inspection-results/:inspectionId/mark-done", async (req, res) => {
    try {
      const { inspectionId } = req.params;
      const { contractorName, fixNotes } = req.body;
      
      console.log("✅ Contractor marking inspection as done:", { inspectionId, contractorName });
      
      // Update the admin inspection with contractor resolution
      const updatedInspection = await storage.markInspectionResolvedByContractor(
        inspectionId, 
        contractorName, 
        fixNotes
      );
      
      if (!updatedInspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }
      
      res.json({ 
        success: true, 
        message: "Issue marked as resolved. Waiting for admin approval.",
        inspection: updatedInspection
      });
    } catch (error) {
      console.error("Error marking inspection as resolved:", error);
      res.status(500).json({ error: "Failed to mark inspection as resolved" });
    }
  });

  // Get contractor-fixed inspections for admin to review
  app.get("/api/contractor-fixed-inspections", async (req, res) => {
    try {
      console.log("📋 Fetching contractor-fixed inspections for admin review");
      
      // Get all admin inspections that have been marked as fixed by contractors
      const fixedInspections = await storage.getContractorFixedInspections();
      
      res.json(fixedInspections);
    } catch (error) {
      console.error("Error fetching contractor-fixed inspections:", error);
      res.status(500).json({ error: "Failed to fetch contractor-fixed inspections" });
    }
  });

  // Admin approves contractor fix
  app.post("/api/contractor-fixed-inspections/:inspectionId/approve", async (req, res) => {
    try {
      const { inspectionId } = req.params;
      const { adminName } = req.body;
      
      console.log("✅ Admin approving contractor fix:", { inspectionId, adminName });
      
      const approvedInspection = await storage.approveContractorFix(inspectionId, adminName);
      
      if (!approvedInspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }
      
      res.json({ 
        success: true, 
        message: "Contractor fix approved successfully",
        inspection: approvedInspection
      });
    } catch (error) {
      console.error("Error approving contractor fix:", error);
      res.status(500).json({ error: "Failed to approve contractor fix" });
    }
  });

  // Real-time clock monitoring endpoints for admin dashboard
  
  // Get active work sessions (currently clocked in contractors) + site-checkin sessions with full Today Timeline
  app.get("/api/admin/active-sessions", async (req, res) => {
    try {
      console.log("📊 Fetching active work sessions for admin monitoring");
      const now = new Date();
      
      // Fetch all work sessions from authoritative work_sessions table
      const allWorkSessions = await db
        .select()
        .from(workSessions)
        .orderBy(sql`start_time DESC`);

      // Fetch attendance events to reconstruct multi-break history
      let allAttendanceEvents: any[] = [];
      try {
        allAttendanceEvents = await db.select().from(attendanceEvents).orderBy(sql`timestamp ASC`);
      } catch {
        allAttendanceEvents = [];
      }
      const eventsBySession = new Map<string, any[]>();
      allAttendanceEvents.forEach((evt) => {
        if (!eventsBySession.has(evt.workSessionId)) {
          eventsBySession.set(evt.workSessionId, []);
        }
        eventsBySession.get(evt.workSessionId)!.push(evt);
      });
      
      // Group sessions by contractor name
      const sessionsByContractor = new Map<string, any[]>();
      
      allWorkSessions.forEach(session => {
        if (!session.contractorName) return;
        let cleanName = session.contractorName.trim();
        if (cleanName === 'Dalwayne Bailey') {
          cleanName = 'Dalwayne Diedericks';
        }
        
        if (!sessionsByContractor.has(cleanName)) {
          sessionsByContractor.set(cleanName, []);
        }
        sessionsByContractor.get(cleanName)!.push({
          ...session,
          contractorName: cleanName,
          events: eventsBySession.get(session.id) ?? [],
        });
      });
      
      // Process each contractor with authoritative attendance timeline
      const sessionsWithDuration = await Promise.all(
        Array.from(sessionsByContractor.entries()).map(async ([cleanName, contractorSessions]) => {
          const latestSession = contractorSessions[0]; // latest by start_time DESC
          const timeline = buildAttendanceTimeline(contractorSessions, cleanName, now);
          const latestTimelineSess = timeline.sessions.length > 0 ? timeline.sessions[timeline.sessions.length - 1] : null;
          
          const startTime = latestSession.startTime ? new Date(latestSession.startTime) : now;
          const isActive = timeline.isCurrentlyClockedIn;
          const displayStatus = timeline.currentStatus;
          const sessionStatus = displayStatus === 'ON BREAK' ? 'on_break' : (isActive ? 'clocked_in' : 'checked_out');
          
          // Detect current location by finding nearest assigned job site (DYNAMIC SYSTEM)
          let detectedLocation = latestSession.jobSiteLocation;
          if (latestSession.startLatitude && latestSession.startLongitude) {
            const nearestSite = await findNearestAssignedJobSite(
              cleanName,
              parseFloat(latestSession.startLatitude), 
              parseFloat(latestSession.startLongitude)
            );
            if (nearestSite) {
              detectedLocation = nearestSite.location;
            }
          }
          
          const checkedInAt = latestTimelineSess?.clockInTime ? new Date(latestTimelineSess.clockInTime).toLocaleTimeString('en-GB', {
            timeZone: 'Europe/London',
            hour: '2-digit',
            minute: '2-digit'
          }) : (startTime ? startTime.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : null);

          const breakOutAt = latestTimelineSess?.breakStartTime ? new Date(latestTimelineSess.breakStartTime).toLocaleTimeString('en-GB', {
            timeZone: 'Europe/London',
            hour: '2-digit',
            minute: '2-digit'
          }) : null;

          const breakReturnAt = latestTimelineSess?.breakEndTime ? new Date(latestTimelineSess.breakEndTime).toLocaleTimeString('en-GB', {
            timeZone: 'Europe/London',
            hour: '2-digit',
            minute: '2-digit'
          }) : null;

          const checkedOutAt = latestTimelineSess?.clockOutTime ? new Date(latestTimelineSess.clockOutTime).toLocaleTimeString('en-GB', {
            timeZone: 'Europe/London',
            hour: '2-digit',
            minute: '2-digit'
          }) : (latestSession.endTime && !isActive ? new Date(latestSession.endTime).toLocaleTimeString('en-GB', {
            timeZone: 'Europe/London',
            hour: '2-digit',
            minute: '2-digit'
          }) : null);
          
          const totalHoursNum = timeline.totalWorkedHours;
          const hoursInt = Math.floor(totalHoursNum);
          const minutesInt = Math.round((totalHoursNum - hoursInt) * 60);
          
          return {
            ...latestSession,
            contractorName: cleanName,
            jobSiteLocation: detectedLocation,
            duration: `${hoursInt}h ${minutesInt}m`,
            durationMs: timeline.totalWorkedSeconds * 1000,
            isActive,
            status: sessionStatus,
            displayStatus,
            workingHours: hoursInt,
            workingMinutes: minutesInt,
            startedAt: checkedInAt || 'Unknown',
            clockInTime: latestTimelineSess?.clockInTime ?? (startTime ? startTime.toISOString() : null),
            breakOutTime: latestTimelineSess?.breakStartTime ?? null,
            breakReturnTime: latestTimelineSess?.breakEndTime ?? null,
            clockOutTime: latestTimelineSess?.clockOutTime ?? (latestSession.endTime ? new Date(latestSession.endTime).toISOString() : null),
            breakOutAt,
            breakReturnAt,
            checkedOutAt,
            todayTimeline: timeline,
            totalDailyWorkedSeconds: timeline.totalWorkedSeconds,
            totalDailyWorkedHours: timeline.totalWorkedHours,
            totalDailyBreakSeconds: timeline.totalBreakSeconds,
            attendanceFlag: timeline.attendanceFlag,
            locationSignalLost: latestTimelineSess?.locationSignalLost ?? false,
          };
        })
      );
      
      console.log(`📈 Found ${sessionsWithDuration.length} contractor attendance records (active + today's)`);
      res.json(sessionsWithDuration);
    } catch (error) {
      console.error("Error fetching active sessions:", error);
      res.status(500).json({ error: "Failed to fetch active sessions" });
    }
  });

  // Admin Review & Correction of Attendance
  app.post("/api/admin/attendance-corrections", async (req, res) => {
    try {
      const {
        workSessionId,
        clockInTime,
        breakStartTime,
        breakEndTime,
        clockOutTime,
        status: requestedStatus,
        reason,
        adminUser: bodyAdminUser,
      } = req.body;

      if (!workSessionId) {
        return res.status(400).json({ error: "workSessionId is required." });
      }
      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "A correction reason is required for audit history." });
      }

      const [session] = await db
        .select()
        .from(workSessions)
        .where(eq(workSessions.id, workSessionId))
        .limit(1);

      if (!session) {
        return res.status(404).json({ error: "Work session not found." });
      }

      // Fetch existing events
      const existingEvents = await db
        .select()
        .from(attendanceEvents)
        .where(eq(attendanceEvents.workSessionId, workSessionId))
        .orderBy(sql`timestamp ASC`);

      // Record old state snapshot for audit
      const oldValues = {
        startTime: session.startTime ? new Date(session.startTime).toISOString() : null,
        endTime: session.endTime ? new Date(session.endTime).toISOString() : null,
        status: session.status,
        totalHours: session.totalHours,
        attendanceFlag: session.attendanceFlag,
        events: existingEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          timestamp: new Date(e.timestamp).toISOString(),
          source: e.source,
        })),
      };

      // Parse dates
      const clockInDate = clockInTime ? new Date(clockInTime) : (session.startTime ? new Date(session.startTime) : new Date());
      const breakStartDate = breakStartTime ? new Date(breakStartTime) : null;
      const breakEndDate = breakEndTime ? new Date(breakEndTime) : null;
      const clockOutDate = clockOutTime ? new Date(clockOutTime) : null;

      if (Number.isNaN(clockInDate.getTime())) {
        return res.status(400).json({ error: "Invalid Clock In timestamp." });
      }
      if (breakStartDate && Number.isNaN(breakStartDate.getTime())) {
        return res.status(400).json({ error: "Invalid Break Start timestamp." });
      }
      if (breakEndDate && Number.isNaN(breakEndDate.getTime())) {
        return res.status(400).json({ error: "Invalid Break End timestamp." });
      }
      if (clockOutDate && Number.isNaN(clockOutDate.getTime())) {
        return res.status(400).json({ error: "Invalid Clock Out timestamp." });
      }

      // Logical order validations
      if (clockOutDate && clockOutDate.getTime() < clockInDate.getTime()) {
        return res.status(400).json({ error: "Clock Out time cannot be before Clock In time." });
      }
      if (breakStartDate && breakStartDate.getTime() < clockInDate.getTime()) {
        return res.status(400).json({ error: "Break Start cannot be before Clock In time." });
      }
      if (breakEndDate && breakStartDate && breakEndDate.getTime() < breakStartDate.getTime()) {
        return res.status(400).json({ error: "Break Return cannot be before Break Start time." });
      }
      if (clockOutDate && breakEndDate && clockOutDate.getTime() < breakEndDate.getTime()) {
        return res.status(400).json({ error: "Clock Out cannot be before Break Return time." });
      }

      // Determine new status
      let finalStatus = requestedStatus;
      if (!finalStatus) {
        if (clockOutDate) {
          finalStatus = "completed";
        } else if (breakStartDate && !breakEndDate) {
          finalStatus = "on_break";
        } else {
          finalStatus = "active";
        }
      }

      // Calculate total worked hours
      let breakDurationMs = 0;
      if (breakStartDate && breakEndDate) {
        breakDurationMs = Math.max(0, breakEndDate.getTime() - breakStartDate.getTime());
      }
      let calculatedHours: string | null = null;
      if (clockOutDate) {
        const grossMs = Math.max(0, clockOutDate.getTime() - clockInDate.getTime());
        const netMs = Math.max(0, grossMs - breakDurationMs);
        calculatedHours = (netMs / (1000 * 60 * 60)).toFixed(2);
      }

      const adminUser = bodyAdminUser || (req as any).session?.adminName || "Admin";

      const newValues = {
        startTime: clockInDate.toISOString(),
        breakStartTime: breakStartDate ? breakStartDate.toISOString() : null,
        breakEndTime: breakEndDate ? breakEndDate.toISOString() : null,
        endTime: clockOutDate ? clockOutDate.toISOString() : null,
        status: finalStatus,
        totalHours: calculatedHours,
        attendanceFlag: "ADMIN_CORRECTED",
        adminUser,
        reason: reason.trim(),
      };

      // Perform update and audit recording
      const correctionId = randomUUID();
      await db.insert(attendanceCorrections).values({
        id: correctionId,
        workSessionId,
        contractorName: session.contractorName,
        oldValues: JSON.stringify(oldValues),
        newValues: JSON.stringify(newValues),
        adminUser,
        reason: reason.trim(),
        createdAt: new Date(),
      });

      // Update work session with effective corrected values
      await db
        .update(workSessions)
        .set({
          startTime: clockInDate,
          endTime: clockOutDate,
          breakStartTime: breakStartDate,
          breakEndTime: breakEndDate,
          status: finalStatus,
          totalHours: calculatedHours,
          attendanceFlag: "ADMIN_CORRECTED",
        })
        .where(eq(workSessions.id, workSessionId));

      // Append ADMIN_CORRECTION audit event (original worker events are NEVER deleted or overwritten)
      await db.insert(attendanceEvents).values({
        id: randomUUID(),
        workSessionId,
        eventType: "ADMIN_CORRECTION",
        timestamp: new Date(),
        jobId: session.jobId,
        siteName: session.jobSiteLocation,
        source: "admin",
        createdAt: new Date(),
      });

      // If clockOutDate was supplied and no CLOCK_OUT event existed, append an admin-source CLOCK_OUT event
      const hasExistingClockOut = existingEvents.some((e) => e.eventType === "CLOCK_OUT");
      if (clockOutDate && !hasExistingClockOut) {
        await db.insert(attendanceEvents).values({
          id: randomUUID(),
          workSessionId,
          eventType: "CLOCK_OUT",
          timestamp: clockOutDate,
          jobId: session.jobId,
          siteName: session.jobSiteLocation,
          source: "admin",
          createdAt: new Date(),
        });
      }

      console.log(`✅ Admin ${adminUser} corrected attendance for session ${workSessionId} (${session.contractorName}): ${reason}`);

      return res.status(200).json({
        success: true,
        correctionId,
        workSessionId,
        newValues,
      });
    } catch (error: any) {
      console.error("Error saving attendance correction:", error);
      return res.status(500).json({ error: error?.message || "Failed to save attendance correction." });
    }
  });

  // Get audit corrections for a session
  app.get("/api/admin/attendance-corrections/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const corrections = await db
        .select()
        .from(attendanceCorrections)
        .where(eq(attendanceCorrections.workSessionId, sessionId))
        .orderBy(sql`created_at DESC`);
      res.json(corrections);
    } catch (error: any) {
      console.error("Error fetching attendance corrections:", error);
      res.status(500).json({ error: "Failed to fetch corrections." });
    }
  });

  // Get all work sessions for today with daily hours calculation
  app.get("/api/admin/today-sessions", async (req, res) => {
    try {
      console.log("📊 Fetching today's work sessions for admin monitoring");
      const now = new Date();
      
      const allSessions = await db
        .select()
        .from(workSessions)
        .orderBy(sql`start_time DESC`);
      
      const sessionsByContractor = new Map<string, typeof allSessions>();
      
      allSessions.forEach(session => {
        if (!session.contractorName) return;
        let cleanName = session.contractorName.trim();
        if (cleanName === 'Dalwayne Bailey') cleanName = 'Dalwayne Diedericks';
        if (!sessionsByContractor.has(cleanName)) {
          sessionsByContractor.set(cleanName, []);
        }
        sessionsByContractor.get(cleanName)!.push({
          ...session,
          contractorName: cleanName
        });
      });
      
      const dailySummary = Array.from(sessionsByContractor.entries())
        .map(([contractorName, contractorSessions]) => {
          const timeline = buildAttendanceTimeline(contractorSessions, contractorName, now);
          if (timeline.sessions.length === 0) return null;
          
          return {
            contractorName,
            sessions: timeline.sessions,
            totalDailyHours: timeline.totalWorkedHours.toFixed(2),
            totalDailyWorkedSeconds: timeline.totalWorkedSeconds,
            totalDailyBreakSeconds: timeline.totalBreakSeconds,
            activeSession: timeline.sessions.find(s => s.status === 'active') || null,
            timeline
          };
        })
        .filter(Boolean);
      
      const todayTotalSessions = dailySummary.reduce((acc, c: any) => acc + (c?.sessions?.length || 0), 0);
      
      res.json({
        dailySummary,
        totalSessions: todayTotalSessions,
        totalContractors: dailySummary.length
      });
    } catch (error) {
      console.error("Error fetching today's sessions:", error);
      res.status(500).json({ error: "Failed to fetch today's sessions" });
    }
  });

  // Get time tracking data with earnings calculations for admin (Unified Engine)
  app.get("/api/admin/time-tracking", async (req, res) => {
    try {
      const weekEnding = req.query.weekEnding as string;
      if (!weekEnding) {
        return res.status(400).json({ error: "weekEnding parameter required" });
      }

      console.log(`📊 Fetching unified admin payroll data for week ending: ${weekEnding}`);
      const report = await calculateAdminWeeklyPayroll(client, weekEnding);
      res.json(report);
    } catch (error: any) {
      console.error("Error fetching admin payroll data:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch payroll data" });
    }
  });

  // Get weekly earnings data for logged-in worker (Unified Engine)
  app.get("/api/payroll/worker-weekly", async (req, res) => {
    try {
      const contractor = (req.query.contractor as string) || (req as SessionRequest).session?.contractorName || "";
      const weekEnding = (req.query.weekEnding as string) || "";

      if (!contractor || !weekEnding) {
        return res.status(400).json({ error: "contractor and weekEnding query parameters required" });
      }

      console.log(`💼 Fetching unified worker payroll for: ${contractor}, week ending: ${weekEnding}`);
      const summary = await calculateWorkerPayroll(client, contractor, weekEnding);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching worker payroll data:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch worker payroll data" });
    }
  });

  // Export functionality disabled - endpoint returns error
  app.get("/api/admin/time-tracking/export", async (req, res) => {
    res.status(404).json({ error: "Export functionality has been disabled" });
  });

  // Project Cashflow API endpoint - MANDATORY RULE: AUTHENTIC DATA ONLY
  app.get("/api/project-cashflow", async (req, res) => {
    try {
      console.log("💰 Fetching project cashflow data - AUTHENTIC DATA ONLY");
      
      // MANDATORY: Use ONLY authentic database sources and CSV uploads
      // Following Rule 2: DATA INTEGRITY - All data must come from authentic database sources
      // Following Rule 3: CSV DATA SUPREMACY - Only information in uploaded files must be used
      
      // Check authentication context - only show data for current admin
      const currentAdmin = (req as SessionRequest).session?.adminName;
      const currentContractor = (req as SessionRequest).session?.contractorName;
      
      console.log("🔐 Auth context - Admin:", currentAdmin, "Contractor:", currentContractor);
      
      // MANDATORY RULE: Account-specific data isolation
      if (currentContractor && currentContractor.toLowerCase().includes("earl")) {
        // Earl's contractor account - should only see his assigned work
        console.log("🔒 Earl's contractor account - filtering for Earl-specific data only");
        res.json({
          projects: [],
          totalRevenue: 0,
          totalCosts: 0,
          netProfit: 0,
          projectCount: 0,
          message: "No projects assigned to Earl Johnson. Contact admin for job assignments."
        });
        return;
      }
      
      // Admin account or other contractors continue with full processing
      if (!currentAdmin && !currentContractor) {
        console.log("❌ No valid authentication - returning empty data");
        res.json({
          projects: [],
          totalRevenue: 0,
          totalCosts: 0,
          netProfit: 0,
          projectCount: 0,
          message: "Authentication Required - Please log in to view cashflow data"
        });
        return;
      }
      
      // Check for authentic job data in database
      const jobs = await storage.getJobs();
      const workSessions = await storage.getWorkSessions();
      
      if (jobs.length === 0) {
        console.log("📊 No authentic job data found in database");
        res.json({
          projects: [],
          totalRevenue: 0,
          totalCosts: 0,
          netProfit: 0,
          projectCount: 0,
          message: "Data Missing from Database - No authentic project cashflow data available. Upload real job data via CSV."
        });
        return;
      }
      
      // Filter data by account context - MANDATORY RULE: Account-specific data only
      let filteredJobs = jobs;
      let filteredWorkSessions = workSessions;
      
      if (currentContractor) {
        // Contractor view: Only show jobs assigned to this contractor
        filteredJobs = jobs.filter(job => job.contractor?.name === currentContractor);
        filteredWorkSessions = workSessions.filter(session => session.contractorName === currentContractor);
        console.log(`🔒 Contractor view: ${filteredJobs.length} jobs, ${filteredWorkSessions.length} sessions for ${currentContractor}`);
      } else if (currentAdmin) {
        // Admin view: Show all data (admin has full access)
        console.log(`🔒 Admin view: ${filteredJobs.length} jobs, ${filteredWorkSessions.length} sessions for admin ${currentAdmin}`);
      }
      
      // Process authentic job data from database
      const projects = filteredJobs.map(job => {
        // Calculate contractor earnings from authentic work sessions
        const jobWorkSessions = filteredWorkSessions.filter(session => 
          session.contractorName === job.contractor?.name && 
          session.jobSiteLocation && job.location && 
          session.jobSiteLocation.toLowerCase().includes(job.location.toLowerCase())
        );
        
        const totalHours = jobWorkSessions.reduce((sum, session) => {
          const hours = typeof session.totalHours === 'string' ? parseFloat(session.totalHours) : (session.totalHours || 0);
          return sum + hours;
        }, 0);
        const contractorEarnings = Math.round(totalHours * 18); // £18/hour from authentic rate
        
        return {
          id: job.id,
          projectName: `${job.title} - ${job.location}`,
          startDate: job.startDate || new Date().toISOString().split('T')[0],
          completionDate: job.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          totalBudget: Math.round(contractorEarnings * 1.3), // 30% markup
          labourCosts: contractorEarnings,
          materialCosts: 0, // Material costs not tracked in current system
          actualSpend: contractorEarnings,
          contractorEarnings: contractorEarnings,
          profitMargin: Math.round(contractorEarnings * 0.3), // 30% profit margin
          status: job.status,
          authenticWorkSessions: jobWorkSessions.length,
          totalAuthenticHours: totalHours
        };
      });
      
      const totalRevenue = projects.reduce((sum, p) => sum + p.totalBudget, 0);
      const totalCosts = projects.reduce((sum, p) => sum + p.actualSpend, 0);
      const netProfit = totalRevenue - totalCosts;
      
      console.log(`📊 Processed ${projects.length} authentic projects from database`);
      
      res.json({
        projects: projects,
        totalRevenue: totalRevenue,
        totalCosts: totalCosts,
        netProfit: netProfit,
        projectCount: projects.length,
        message: "Authentic project data loaded from database",
        dataSource: `Database - ${jobs.length} jobs, ${workSessions.length} work sessions`
      });
      
    } catch (error) {
      console.error("Error fetching project cashflow:", error);
      res.status(500).json({ error: "Failed to fetch project cashflow data" });
    }
  });

  // Enhanced Weekly Cash Flow Tracking System - MANDATORY RULE: AUTHENTIC DATA ONLY
  
  // Project Master Management
  app.get("/api/weekly-cashflow/projects", async (req, res) => {
    try {
      console.log("📋 API: Fetching project masters for weekly cash flow tracking");
      
      // Authentication check - MANDATORY RULE
      const currentAdmin = (req as SessionRequest).session?.adminName;
      
      if (!currentAdmin) {
        console.log("❌ Unauthorized access to weekly cash flow data");
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }
      
      const projects = await storage.getProjectMasters();
      console.log(`✅ Retrieved ${projects.length} project masters`);
      
      res.json({ projects, message: "Authentic project data loaded" });
    } catch (error) {
      console.error("Error fetching project masters:", error);
      res.status(500).json({ error: "Failed to fetch project masters" });
    }
  });

  app.post("/api/weekly-cashflow/projects", async (req, res) => {
    try {
      console.log("🆕 API: Creating new project master");
      
      const currentAdmin = (req as SessionRequest).session?.adminName;
      
      if (!currentAdmin) {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }

      const projectData = {
        ...req.body,
        createdBy: currentAdmin,
        status: "active"
      };

      const project = await storage.createProjectMaster(projectData);
      console.log(`✅ Created project master: ${project.projectName}`);
      
      res.json({ project, message: "Project created successfully" });
    } catch (error) {
      console.error("Error creating project master:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Weekly Cash Flow Data Management
  app.get("/api/weekly-cashflow/weeks", async (req, res) => {
    try {
      console.log("📊 API: Fetching weekly cashflow data");
      
      const currentAdmin = (req as SessionRequest).session?.adminName;
      
      if (!currentAdmin) {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }

      const projectId = req.query.projectId as string;
      const weeklyData = await storage.getProjectCashflowWeekly(projectId);
      
      // Enhance with calculated labour costs from authentic work sessions
      for (let week of weeklyData) {
        if (week.weekStartDate && week.weekEndDate && week.projectId) {
          const calculatedLabourCost = await storage.calculateWeeklyLabourCosts(
            week.projectId, 
            week.weekStartDate, 
            week.weekEndDate
          );
          
          // Update actual labour cost with authentic calculation
          week.actualLabourCostCalculated = calculatedLabourCost.toFixed(2);
          
          // Calculate variance
          const forecastedLabour = parseFloat(week.forecastedLabourCost) || 0;
          week.labourVarianceCalculated = (calculatedLabourCost - forecastedLabour).toFixed(2);
        }
      }
      
      console.log(`✅ Retrieved ${weeklyData.length} weekly cashflow records`);
      res.json({ weeklyData, message: "Authentic weekly data with calculated labour costs" });
    } catch (error) {
      console.error("Error fetching weekly cashflow:", error);
      res.status(500).json({ error: "Failed to fetch weekly cashflow data" });
    }
  });

  app.post("/api/weekly-cashflow/weeks", async (req, res) => {
    try {
      console.log("💰 API: Creating weekly cashflow forecast");
      
      const currentAdmin = (req as SessionRequest).session?.adminName;
      
      if (!currentAdmin) {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }

      const weeklyData = {
        ...req.body,
        dataValidated: false,
        validatedBy: null,
        labourDataSource: "work_sessions", // MANDATORY: Only authentic source
      };

      // Auto-calculate actual labour costs from authentic work sessions
      if (weeklyData.projectId && weeklyData.weekStartDate && weeklyData.weekEndDate) {
        const actualLabourCost = await storage.calculateWeeklyLabourCosts(
          weeklyData.projectId,
          weeklyData.weekStartDate,
          weeklyData.weekEndDate
        );
        
        weeklyData.actualLabourCost = actualLabourCost.toFixed(2);
        weeklyData.labourVariance = (actualLabourCost - (parseFloat(weeklyData.forecastedLabourCost) || 0)).toFixed(2);
        
        console.log(`📊 Calculated actual labour cost: £${actualLabourCost.toFixed(2)}`);
      }

      const cashflow = await storage.createProjectCashflowWeekly(weeklyData);
      console.log(`✅ Created weekly cashflow: ${cashflow.projectName} - ${cashflow.weekStartDate}`);
      
      res.json({ cashflow, message: "Weekly forecast created with authentic labour calculations" });
    } catch (error) {
      console.error("Error creating weekly cashflow:", error);
      res.status(500).json({ error: "Failed to create weekly cashflow" });
    }
  });

  // Material Purchases Management  
  app.get("/api/weekly-cashflow/materials", async (req, res) => {
    try {
      console.log("🛒 API: Fetching material purchases");
      
      const currentAdmin = (req as SessionRequest).session?.adminName;
      
      if (!currentAdmin) {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }

      const projectId = req.query.projectId as string;
      const weekStart = req.query.weekStart as string;
      
      const materials = await storage.getMaterialPurchases(projectId, weekStart);
      console.log(`✅ Retrieved ${materials.length} material purchase records`);
      
      res.json({ materials, message: "Authentic material purchase data loaded" });
    } catch (error) {
      console.error("Error fetching material purchases:", error);
      res.status(500).json({ error: "Failed to fetch material purchases" });
    }
  });

  app.post("/api/weekly-cashflow/materials", async (req, res) => {
    try {
      console.log("🛒 API: Creating material purchase record");
      
      const currentAdmin = (req as SessionRequest).session?.adminName;
      
      if (!currentAdmin) {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }

      const materialData = {
        ...req.body,
        uploadedBy: currentAdmin,
        dataSource: req.body.dataSource || "manual_entry"
      };

      const material = await storage.createMaterialPurchase(materialData);
      console.log(`✅ Created material purchase: ${material.supplierName} - £${material.totalCost}`);
      
      res.json({ material, message: "Material purchase recorded successfully" });
    } catch (error) {
      console.error("Error creating material purchase:", error);
      res.status(500).json({ error: "Failed to create material purchase" });
    }
  });

  // Weekly Dashboard Data - Comprehensive Analytics
  app.get("/api/weekly-cashflow/dashboard", async (req, res) => {
    try {
      console.log("📈 API: Generating weekly cash flow dashboard data");
      
      const currentAdmin = (req as SessionRequest).session?.adminName;
      
      if (!currentAdmin) {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }

      const projectId = req.query.projectId as string;
      
      // Fetch all related data
      const [projects, weeklyData, materials] = await Promise.all([
        storage.getProjectMasters(),
        storage.getProjectCashflowWeekly(projectId),
        storage.getMaterialPurchases(projectId)
      ]);

      // Calculate dashboard metrics
      let totalForecastedSpend = 0;
      let totalActualSpend = 0;
      let totalLabourVariance = 0;
      let totalMaterialVariance = 0;

      // Process weekly data with authentic calculations
      for (let week of weeklyData) {
        // Calculate authentic labour costs
        if (week.weekStartDate && week.weekEndDate && week.projectId) {
          const calculatedLabourCost = await storage.calculateWeeklyLabourCosts(
            week.projectId,
            week.weekStartDate, 
            week.weekEndDate
          );
          
          week.actualLabourCostCalculated = calculatedLabourCost;
          totalActualSpend += calculatedLabourCost;
          
          const forecastedLabour = parseFloat(week.forecastedLabourCost) || 0;
          totalForecastedSpend += forecastedLabour;
          totalLabourVariance += (calculatedLabourCost - forecastedLabour);
        }

        // Add material costs
        const materialCost = parseFloat(week.actualMaterialCost) || 0;
        const forecastedMaterialCost = parseFloat(week.forecastedMaterialCost) || 0;
        totalActualSpend += materialCost;
        totalForecastedSpend += forecastedMaterialCost;
        totalMaterialVariance += (materialCost - forecastedMaterialCost);
      }

      // Calculate project progress based on authentic data
      const currentProject = projects.find(p => p.id === projectId);
      const projectProgress = currentProject ? parseFloat(currentProject.completionPercent) || 0 : 0;
      const budgetUsed = currentProject ? (totalActualSpend / parseFloat(currentProject.totalBudget)) * 100 : 0;

      const dashboardData = {
        summary: {
          totalProjects: projects.length,
          activeProjects: projects.filter(p => p.status === 'active').length,
          totalForecastedSpend: totalForecastedSpend.toFixed(2),
          totalActualSpend: totalActualSpend.toFixed(2),
          totalVariance: (totalActualSpend - totalForecastedSpend).toFixed(2),
          labourVariance: totalLabourVariance.toFixed(2),
          materialVariance: totalMaterialVariance.toFixed(2),
          projectProgress: projectProgress.toFixed(1),
          budgetUsed: budgetUsed.toFixed(1)
        },
        projects,
        weeklyData,
        materials: materials.slice(0, 10), // Recent materials only
        authenticity: {
          dataSource: "database_work_sessions",
          calculationMethod: "authentic_pay_rates",
          lastUpdated: new Date().toISOString(),
          complianceLevel: "mandatory_rules_enforced"
        }
      };

      console.log(`✅ Dashboard data generated - ${projects.length} projects, ${weeklyData.length} weeks`);
      res.json(dashboardData);
      
    } catch (error) {
      console.error("Error generating dashboard data:", error);
      res.status(500).json({ error: "Failed to generate dashboard data" });
    }
  });

  // Contractor earnings endpoint for MORE page verification (Unified Engine)
  app.get("/api/contractor-earnings/:contractorName", async (req, res) => {
    try {
      const contractorName = decodeURIComponent(req.params.contractorName);
      const weekEndingParam = req.query.weekEnding as string;

      let weekEnding = weekEndingParam;
      if (!weekEnding) {
        const now = new Date();
        const currentDay = now.getDay();
        const daysToFriday = currentDay <= 5 ? (5 - currentDay) : (7 - currentDay + 5);
        const weekEndingFriday = new Date(now.getTime() + (daysToFriday * 24 * 60 * 60 * 1000));
        weekEnding = weekEndingFriday.toISOString().split("T")[0];
      }

      console.log(`💰 Getting unified earnings for contractor: ${contractorName}, week ending: ${weekEnding}`);
      const summary = await calculateWorkerPayroll(client, contractorName, weekEnding);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching contractor earnings:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch contractor earnings" });
    }
  });

  // Initialize Voice Agent
  const voiceAgent = new VoiceAgent(storage);

  // Voice Agent endpoints for Twilio webhooks
  // Direct webhook endpoint matching user's Twilio configuration
  app.post("/webhook/voice-a", async (req, res) => {
    try {
      const { From, Digits, SpeechResult } = req.body;
      console.log(`🎙️ INCOMING CALL via /webhook/voice-a from ${From}, Digits: ${Digits}, Body: ${JSON.stringify(req.body, null, 2)}`);
      
      const twimlResponse = await voiceAgent.processVoiceCommand(From, Digits, SpeechResult);
      console.log(`📤 Sending TwiML response:`, twimlResponse);
      
      res.type('text/xml');
      res.send(twimlResponse);
    } catch (error) {
      console.error("Voice webhook error:", error);
      res.type('text/xml');
      res.send('<Response><Say>Sorry, there was an error. Please try again later.</Say></Response>');
    }
  });

  // Test endpoint to verify webhook is reachable
  app.get("/webhook/voice-a", (req, res) => {
    console.log("🧪 Voice webhook GET test - endpoint is reachable");
    res.send("Voice webhook endpoint is working!");
  });

  app.post("/api/voice/incoming", async (req, res) => {
    try {
      const { From, Digits, SpeechResult } = req.body;
      console.log(`🎙️ Incoming voice call from ${From}, Digits: ${Digits}`);
      
      const twimlResponse = await voiceAgent.processVoiceCommand(From, Digits, SpeechResult);
      
      res.type('text/xml');
      res.send(twimlResponse);
    } catch (error) {
      console.error("Voice incoming call error:", error);
      res.status(500).send('<Response><Say>Sorry, there was an error. Please try again later.</Say></Response>');
    }
  });

  // Handle DTMF input from voice calls
  app.post("/api/voice/handle-input", async (req, res) => {
    try {
      const { From, Digits } = req.body;
      console.log(`🎙️ DTMF input from ${From}: ${Digits}`);
      
      const twimlResponse = await voiceAgent.processVoiceCommand(From, Digits);
      
      res.type('text/xml');
      res.send(twimlResponse);
    } catch (error) {
      console.error("Voice input handling error:", error);
      res.status(500).send('<Response><Say>Sorry, there was an error processing your input.</Say></Response>');
    }
  });

  // Admin endpoint to initiate voice calls
  app.post("/api/voice/call-contractor", async (req, res) => {
    try {
      const { contractorName, phoneNumber, message, type } = req.body;
      
      if (!contractorName || !phoneNumber || !message) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      let result;
      if (type === 'emergency') {
        result = await voiceAgent.sendEmergencyAlert(contractorName, message);
      } else {
        result = await voiceAgent.callContractor(phoneNumber, message);
      }

      res.json(result);
    } catch (error) {
      console.error("Voice call initiation error:", error);
      res.status(500).json({ error: "Failed to initiate voice call" });
    }
  });

  // Endpoint to send job assignment notifications
  app.post("/api/voice/notify-assignment", async (req, res) => {
    try {
      const { contractorName, jobDetails } = req.body;
      
      if (!contractorName || !jobDetails) {
        return res.status(400).json({ error: "Missing contractor name or job details" });
      }

      const result = await voiceAgent.notifyJobAssignment(contractorName, jobDetails);
      res.json(result);
    } catch (error) {
      console.error("Voice assignment notification error:", error);
      res.status(500).json({ error: "Failed to send job assignment notification" });
    }
  });

  // Voice-based clock in/out endpoint
  app.post("/api/voice/clock-action", async (req, res) => {
    try {
      const { contractorName, action, location } = req.body;
      
      if (!contractorName || !action) {
        return res.status(400).json({ error: "Missing contractor name or action" });
      }

      const result = await voiceAgent.handleClockAction(contractorName, action, location);
      res.json(result);
    } catch (error) {
      console.error("Voice clock action error:", error);
      res.status(500).json({ error: "Failed to process clock action" });
    }
  });

  // Get contractor info via voice
  app.post("/api/voice/contractor-info", async (req, res) => {
    try {
      const { contractorName, infoType } = req.body;
      
      if (!contractorName || !infoType) {
        return res.status(400).json({ error: "Missing contractor name or info type" });
      }

      let result;
      switch (infoType) {
        case 'assignment':
          result = await voiceAgent.getAssignmentInfo(contractorName);
          break;
        case 'earnings':
          result = await voiceAgent.getEarningsInfo(contractorName);
          break;
        default:
          result = { success: false, message: 'Invalid information type requested' };
      }

      res.json(result);
    } catch (error) {
      console.error("Voice contractor info error:", error);
      res.status(500).json({ error: "Failed to get contractor information" });
    }
  });

  // ElevenLabs webhook endpoint for Twilio personalization
  // Phone number normalization helper
  const normalizePhoneNumber = (phone: string): string => {
    // Remove all non-digits and spaces
    let normalized = phone.replace(/[^\d]/g, '');
    
    // Add +44 prefix if it starts with 0 (UK numbers)
    if (normalized.startsWith('0')) {
      normalized = '44' + normalized.substring(1);
    }
    
    // Add + prefix if not present
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    
    return normalized;
  };

  // Webhook authentication helper
  const verifyWebhookAuth = (req: any): boolean => {
    // For demo purposes, we'll use a simple header check
    // In production, use proper HMAC signature verification
    const authHeader = req.headers['x-webhook-secret'];
    return authHeader === 'elevenlabs-voice-webhook-2025' || process.env.NODE_ENV === 'development';
  };

  app.post('/webhook/elevenlabs-twilio', async (req, res) => {
    try {
      // Redact PII from logs
      const logSafeBody = { 
        ...req.body, 
        caller_id: req.body.caller_id ? `${req.body.caller_id.substring(0, 4)}****` : 'unknown' 
      };
      console.log('🎙️ ElevenLabs webhook received:', logSafeBody);
      
      // Basic auth check
      if (!verifyWebhookAuth(req)) {
        console.log('❌ Unauthorized webhook request');
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { caller_id, agent_id, called_number, call_sid } = req.body;
      
      if (!caller_id) {
        return res.status(400).json({ error: 'Missing caller_id' });
      }
      
      // Normalize phone number for lookup
      const normalizedPhone = normalizePhoneNumber(caller_id);
      
      // Look up contractor by phone number (using normalized number)
      const contractor = await storage.getContractorByPhone(normalizedPhone);
      
      if (!contractor) {
        // Unknown caller - provide generic response
        return res.json({
          "type": "conversation_initiation_client_data",
          "dynamic_variables": {
            "caller_name": "Unknown Caller",
            "contractor_status": "unregistered",
            "phone_number": caller_id
          },
          "conversation_config_override": {
            "agent": {
              "first_message": "Hello! I don't recognize this phone number. Are you a registered contractor? Please contact your administrator to set up voice access.",
              "prompt": {
                "prompt": "You are a construction company voice assistant. The caller is not a registered contractor. Politely inform them they need to contact their administrator to set up voice access. Do not provide any work-related information."
              }
            }
          }
        });
      }
      
      // Create full contractor name
      const contractorFullName = `${contractor.firstName} ${contractor.lastName}`;
      
      // Get contractor's current work session, assignments, and pay rate
      const [activeSession, assignments, payRate] = await Promise.all([
        storage.getActiveWorkSessions().then(sessions => sessions.find(s => s.contractorName === contractorFullName) || null),
        storage.getContractorAssignments(contractorFullName),
        storage.getContractorPayRate(contractorFullName)
      ]);
      
      // Calculate today's earnings
      const todayEarnings = activeSession ? 
        ((new Date().getTime() - new Date(activeSession.startTime).getTime()) / (1000 * 60 * 60)) * payRate : 0;
      
      // Prepare dynamic variables with contractor data
      const dynamicVariables = {
        "contractor_name": contractorFullName,
        "phone_number": caller_id,
        "current_status": activeSession ? "clocked_in" : "clocked_out",
        "clock_in_time": activeSession ? activeSession.startTime : null,
        "current_location": activeSession ? activeSession.jobSiteLocation : null,
        "todays_earnings": `£${todayEarnings.toFixed(2)}`,
        "todays_hours": (todayEarnings / payRate).toFixed(2),
        "pay_rate": `£${payRate.toFixed(2)}`,
        "assignment_count": assignments.length,
        "next_assignment": assignments.length > 0 ? assignments[0].hbxlJob : "No assignments",
        "next_location": assignments.length > 0 ? assignments[0].workLocation : "No location"
      };
      
      // Create personalized prompt
      const personalizedPrompt = `You are a construction company voice assistant speaking with ${contractorFullName}. 

Current Information:
- Status: ${activeSession ? 'Currently clocked in' : 'Currently clocked out'}
- Today's Earnings: ${dynamicVariables.todays_earnings}
- Today's Hours: ${dynamicVariables.todays_hours}
- Pay Rate: ${dynamicVariables.pay_rate}
- Assignments: ${assignments.length} active

Available Actions:
1. Clock In/Out: You can process clock in and clock out requests
2. Check Assignments: Provide current job assignments and locations
3. Check Earnings: Tell them today's earnings and hours worked
4. General Help: Answer questions about work schedule and policies

Be friendly, professional, and efficient. Use natural conversation - don't make them press numbers or follow menus.`;

      const response = {
        "type": "conversation_initiation_client_data",
        "dynamic_variables": dynamicVariables,
        "conversation_config_override": {
          "agent": {
            "first_message": `Hello ${contractorFullName}! I can help you with clocking in or out, checking your assignments, or reviewing your earnings. What would you like to do?`,
            "prompt": {
              "prompt": personalizedPrompt
            },
            "language": "en"
          }
        }
      };
      
      console.log('🎙️ Sending ElevenLabs response for', contractorFullName, dynamicVariables);
      res.json(response);
      
    } catch (error) {
      console.error('❌ ElevenLabs webhook error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        "type": "conversation_initiation_client_data",
        "dynamic_variables": {
          "error": "system_error"
        },
        "conversation_config_override": {
          "agent": {
            "first_message": "I'm sorry, there's a technical issue. Please try again later or contact your administrator."
          }
        }
      });
    }
  });

  // ElevenLabs voice action endpoints
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    console.log('🏥 Health check received');
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      url: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'unknown'
    });
  });

  // ===== ELEVENLABS TTS ENDPOINTS =====
  
  // Generate TTS audio from text
  app.post('/api/tts/generate', async (req, res) => {
    try {
      const { text, voiceId } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text parameter is required' });
      }

      const { generateTTSAudio } = await import('./voice-tts');
      const audioUrl = await generateTTSAudio(text, voiceId);
      
      console.log(`✅ TTS audio generated: ${audioUrl}`);
      
      res.json({ 
        success: true,
        audioUrl,
        text: text.slice(0, 50) + (text.length > 50 ? '...' : '')
      });
      
    } catch (error: any) {
      console.error('❌ TTS generation error:', error);
      res.status(500).json({ 
        error: 'Failed to generate TTS audio',
        message: error.message 
      });
    }
  });

  // Test TTS endpoint - generates simple greeting
  app.get('/api/tts/test', async (req, res) => {
    try {
      const testText = "Hello! This is a test of the ElevenLabs text to speech system. The audio generation is working perfectly.";
      
      const { generateTTSAudio } = await import('./voice-tts');
      const audioUrl = await generateTTSAudio(testText);
      
      console.log(`✅ TTS test successful: ${audioUrl}`);
      
      res.json({ 
        success: true,
        audioUrl,
        message: 'TTS test successful! Click the URL to hear the audio.',
        testText
      });
      
    } catch (error: any) {
      console.error('❌ TTS test error:', error);
      res.status(500).json({ 
        error: 'TTS test failed',
        message: error.message 
      });
    }
  });

  // Get available voices
  app.get('/api/tts/voices', async (req, res) => {
    const { ELEVEN_VOICES } = await import('./voice-tts');
    res.json({ 
      voices: ELEVEN_VOICES,
      default: 'GEORGE'
    });
  });

  // Test OpenAI GPT integration (OLD - slow)
  app.post('/api/ai/test', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message parameter is required' });
      }

      const { getGPTResponse } = await import('./voice-ai');
      const startTime = Date.now();
      const response = await getGPTResponse(message, []);
      const duration = Date.now() - startTime;
      
      console.log(`✅ GPT test (OLD MODE) - Input: "${message.slice(0, 50)}..." | Output: "${response.slice(0, 50)}..." | Time: ${duration}ms`);
      
      res.json({ 
        success: true,
        mode: 'non-streaming (slow)',
        input: message,
        response,
        responseTime: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('❌ GPT test error:', error);
      res.status(500).json({ 
        error: 'Failed to get GPT response',
        message: error.message 
      });
    }
  });

  // Test STREAMING GPT (NEW - fast!)
  app.post('/api/ai/test-streaming', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message parameter is required' });
      }

      const { getGPTStreamingResponse } = await import('./voice-streaming');
      
      const startTime = Date.now();
      let firstChunkTime = 0;
      let chunks: string[] = [];
      
      const response = await getGPTStreamingResponse(
        message,
        [],
        (chunk: string) => {
          if (firstChunkTime === 0) {
            firstChunkTime = Date.now() - startTime;
            console.log(`⚡ FIRST CHUNK in ${firstChunkTime}ms!`);
          }
          chunks.push(chunk);
        }
      );
      
      const totalTime = Date.now() - startTime;
      
      console.log(`✅ GPT streaming - First: ${firstChunkTime}ms | Total: ${totalTime}ms | Chunks: ${chunks.length}`);
      
      res.json({ 
        success: true,
        mode: 'streaming (FAST!)',
        input: message,
        response,
        firstChunkTime: `${firstChunkTime}ms`,
        totalTime: `${totalTime}ms`,
        speedup: `${Math.round((totalTime - firstChunkTime) / totalTime * 100)}% faster perception`,
        chunks: chunks.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('❌ GPT streaming test error:', error);
      res.status(500).json({ 
        error: 'Failed to get streaming GPT response',
        message: error.message 
      });
    }
  });

  // SUPER SIMPLE webhook for ElevenLabs (no auth, no validation)
  app.all('/test', (req, res) => {
    console.log(`🧪 SIMPLE TEST endpoint called: ${req.method}`);
    console.log('📝 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    
    if (req.method === 'GET') {
      res.status(200).send('TEST: ElevenLabs webhook is working!');
    } else {
      res.status(200).json({ 
        success: true,
        message: "Test successful!",
        speech: "The webhook is working perfectly!"
      });
    }
  });

  // Test endpoint to verify reachability
  app.get('/api/elevenlabs-actions', (req, res) => {
    console.log('✅ ElevenLabs webhook GET test received');
    res.status(200).send('ElevenLabs webhook endpoint is reachable');
  });
  
  app.options('/api/elevenlabs-actions', (req, res) => {
    console.log('✅ ElevenLabs webhook OPTIONS received');
    res.sendStatus(204);
  });
  
  app.post('/api/elevenlabs-actions', async (req, res) => {
    try {
      // Log incoming request for debugging
      console.log('🎙️ ElevenLabs action webhook received');
      console.log('🔍 Full request body:', JSON.stringify(req.body, null, 2));
      
      // Basic auth check - but don't fail the call, just log
      if (!verifyWebhookAuth(req)) {
        console.log('❌ Unauthorized request, but continuing for testing...');
      }
      
      // Extract parameters with flexible field names for ElevenLabs compatibility
      const { 
        caller_id, 
        phone_number, 
        action, 
        agent_id, 
        call_sid,
        conversation_id,
        tool_name 
      } = req.body;
      
      // Use caller_id or phone_number as fallback
      const phoneNumber = caller_id || phone_number;
      const actionType = action || tool_name;
      
      if (!phoneNumber || !actionType) {
        console.log('❌ Missing required parameters:', { 
          phoneNumber: !!phoneNumber, 
          actionType: !!actionType,
          available_fields: Object.keys(req.body) 
        });
        // Return success but with error message to prevent call drop
        return res.status(200).json({ 
          success: false,
          message: "Missing required parameters",
          speech: "I'm having trouble processing that request. Please try again."
        });
      }
      
      // Normalize phone number for lookup
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      
      // ADMIN-ONLY MESSAGING: Only allow Rudy's admin phone number for now
      const adminPhoneNumbers = ['+447534251548', '07534251548'];
      const isAdmin = adminPhoneNumbers.includes(phoneNumber) || adminPhoneNumbers.includes(normalizedPhone);
      
      if (!isAdmin) {
        return res.status(200).json({
          success: false,
          message: "Messaging is currently restricted to admin users only.",
          speech: "I'm sorry, messaging features are currently restricted to admin users only. Please contact your administrator if you need assistance."
        });
      }
      
      console.log('✅ Admin access confirmed for:', phoneNumber);
      
      // Admin-only mode - no contractor lookup needed
      const contractorFullName = 'Admin (Rudy)';
      
      // Create idempotency key from call details for duplicate protection
      const idempotencyKey = `${call_sid || conversation_id || 'unknown'}-${actionType}`;
      
      // For testing: simple in-memory store (use Redis/DB in production)
      const processedActions = new Map<string, any>();
      
      // Check for duplicate action
      if (processedActions.has(idempotencyKey)) {
        console.log('🔄 Returning cached result for duplicate action:', idempotencyKey);
        return res.json(processedActions.get(idempotencyKey));
      }
      
      // Handle different voice actions - Contractor, Admin, AND PA actions
      let result: any;
      
      // Determine if this is a contractor, admin, or PA action
      const contractorActions = ['clock_in', 'clock_out', 'get_status', 'get_assignments'];
      const adminActions = ['get_workforce_status', 'assign_job', 'get_today_sessions', 'monitor_contractors', 'workforce_summary', 'fix_earnings', 'adjust_earnings', 'correct_earnings', 'update_pay_rate', 'change_pay_rate'];
      const paActions = ['get_availability', 'set_reminder', 'summarize_day', 'schedule_meeting', 'send_email', 'reply_email', 'email_contractor', 'send_sms', 'text_contractor', 'sms_notification', 'send_telegram', 'telegram_message', 'telegram_contractor'];
      
      const actionLower = actionType.toLowerCase();
      const isContractorAction = contractorActions.includes(actionLower);
      const isAdminAction = adminActions.includes(actionLower);
      const isPAAction = paActions.includes(actionLower);
      
      console.log(`🎯 Action type: ${actionLower} - Contractor: ${isContractorAction}, Admin: ${isAdminAction}, PA: ${isPAAction}`);
      
      switch (actionLower) {
        // ===== CONTRACTOR ACTIONS =====
        case 'clock_in':
          try {
            // Check if already clocked in
            const activeSessions = await storage.getActiveWorkSessions();
            const contractorActiveSessions = activeSessions.filter(s => s.contractorName === contractorFullName);
            if (contractorActiveSessions.length > 0) {
              result = {
                success: false,
                message: `You're already clocked in since ${new Date(contractorActiveSessions[0].startTime).toLocaleTimeString('en-GB')}.`,
                speech: `You're already clocked in since ${new Date(contractorActiveSessions[0].startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
              };
            } else {
              // Get contractor's assignment location
              const assignments = await storage.getContractorAssignments(contractorFullName);
              const location = assignments.length > 0 ? assignments[0].workLocation : 'Voice Check-in';
              
              // Create work session
              const session = await storage.createWorkSession({
                contractorName: contractorFullName,
                jobSiteLocation: location,
                startTime: new Date(),
                status: 'active'
              });
              
              result = {
                success: true,
                message: `Successfully clocked in at ${location} at ${new Date().toLocaleTimeString('en-GB')}.`,
                speech: `You're now clocked in at ${location}. Have a productive day!`,
                data: { sessionId: session.id, location }
              };
            }
          } catch (error) {
            console.error('Clock in error:', error);
            result = {
              success: false,
              message: 'Failed to clock in due to technical error.',
              speech: 'Sorry, there was a technical issue clocking you in. Please try again.'
            };
          }
          break;
          
        case 'clock_out':
          try {
            const activeSessions = await storage.getActiveWorkSessions();
            const contractorActiveSessions = activeSessions.filter(s => s.contractorName === contractorFullName);
            if (contractorActiveSessions.length === 0) {
              result = {
                success: false,
                message: "You don't have any active sessions to clock out from.",
                speech: "You're not currently clocked in, so there's nothing to clock out from."
              };
            } else {
              const session = contractorActiveSessions[0];
              const endTime = new Date();
              const duration = (endTime.getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60);
              
              await storage.updateWorkSession(session.id, {
                endTime,
                status: 'completed'
              });
              
              // Calculate earnings
              const payRate = await storage.getContractorPayRate(contractorFullName);
              const earnings = duration * payRate;
              
              result = {
                success: true,
                message: `Clocked out at ${endTime.toLocaleTimeString('en-GB')}. Worked ${duration.toFixed(2)} hours, earned £${earnings.toFixed(2)}.`,
                speech: `You're now clocked out. You worked ${duration.toFixed(1)} hours today and earned £${earnings.toFixed(2)}. Great work!`,
                data: { sessionId: session.id, duration: duration.toFixed(2), earnings: earnings.toFixed(2) }
              };
            }
          } catch (error) {
            console.error('Clock out error:', error);
            result = {
              success: false,
              message: 'Failed to clock out due to technical error.',
              speech: 'Sorry, there was a technical issue clocking you out. Please try again.'
            };
          }
          break;
          
        case 'get_status':
          try {
            // Enhanced status with comprehensive Job Tracker data
            const [activeSessions, assignments, payRate] = await Promise.all([
              storage.getActiveWorkSessions().then(sessions => sessions.filter(s => s.contractorName === contractorFullName)),
              storage.getContractorAssignments(contractorFullName),
              storage.getContractorPayRate(contractorFullName)
            ]);
            
            if (activeSessions.length > 0) {
              const session = activeSessions[0];
              const duration = (new Date().getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60);
              const currentEarnings = duration * payRate;
              const totalEarningsToday = currentEarnings;
              
              // Get GPS proximity status if available
              let locationStatus = "on-site";
              try {
                // This would check GPS proximity if tracking is active
                locationStatus = session.status === "active" ? "on-site" : "away";
              } catch (e) {
                // GPS tracking may not be available
              }
              
              result = {
                success: true,
                message: `Status: Clocked in at ${session.jobSiteLocation} since ${new Date(session.startTime).toLocaleTimeString('en-GB')}. Current session: ${duration.toFixed(1)}h. Today's total: £${totalEarningsToday.toFixed(2)}. Location: ${locationStatus}.`,
                speech: `You're currently clocked in at ${session.jobSiteLocation}. You started at ${new Date(session.startTime).toLocaleTimeString('en-GB')} and have worked ${duration.toFixed(1)} hours in this session. Your total earnings today are £${totalEarningsToday.toFixed(2)}. You have ${assignments.length} active assignments.`,
                data: {
                  status: 'clocked_in',
                  location: session.jobSiteLocation,
                  sessionStartTime: session.startTime,
                  sessionHours: duration,
                  todayEarnings: totalEarningsToday,
                  payRate: payRate,
                  assignments: assignments.length,
                  locationStatus: locationStatus
                }
              };
            } else {
              const totalEarningsToday = 0;
              const nextAssignment = assignments.length > 0 ? assignments[0] : null;
              
              result = {
                success: true,
                message: `Status: Clocked out. Today's earnings: £${totalEarningsToday.toFixed(2)} (Rate: £${payRate}/h). ${assignments.length} assignments pending.`,
                speech: nextAssignment ? 
                  `You're currently clocked out. Today you've earned £${totalEarningsToday.toFixed(2)}. Your next assignment is ${nextAssignment.hbxlJob} at ${nextAssignment.workLocation}.` :
                  `You're currently clocked out. Today you've earned £${totalEarningsToday.toFixed(2)} at £${payRate} per hour. You have ${assignments.length} assignments available.`,
                data: {
                  status: 'clocked_out',
                  todayEarnings: totalEarningsToday,
                  payRate: payRate,
                  assignments: assignments.length,
                  nextAssignment: nextAssignment
                }
              };
            }
          } catch (error) {
            console.error('Get status error:', error);
            result = {
              success: false,
              message: 'Failed to get status due to technical error.',
              speech: 'Sorry, there was a technical issue getting your status.'
            };
          }
          break;
          
        case 'get_assignments':
          try {
            // Get comprehensive assignment data from Job Tracker
            const assignments = await storage.getContractorAssignments(contractorFullName);
            const activeSessions = await storage.getActiveWorkSessions().then(sessions => sessions.filter(s => s.contractorName === contractorFullName));
            
            if (assignments.length === 0) {
              result = {
                success: true,
                message: 'No active assignments.',
                speech: activeSessions.length > 0 ? 
                  'You currently have no active assignments, but you are clocked in. Please contact your supervisor for work allocation.' :
                  'You currently have no active assignments. Contact your supervisor for new work.'
              };
            } else {
              const assignment = assignments[0]; // Primary assignment
              const isCurrentlyWorking = activeSessions.length > 0;
              const currentLocation = isCurrentlyWorking ? activeSessions[0].jobSiteLocation : null;
              
              // Check if currently working on the assigned job
              const workingOnAssignment = currentLocation && 
                (currentLocation.includes(assignment.workLocation) || assignment.workLocation.includes(currentLocation));
              
              let speechMessage;
              if (isCurrentlyWorking && workingOnAssignment) {
                speechMessage = `Perfect! You're currently working on your assigned project: ${assignment.hbxlJob} at ${assignment.workLocation}. The deadline is ${assignment.endDate}.`;
              } else if (isCurrentlyWorking && !workingOnAssignment) {
                speechMessage = `You're currently clocked in at ${currentLocation}, but your main assignment is ${assignment.hbxlJob} at ${assignment.workLocation}, ending ${assignment.endDate}.`;
              } else {
                speechMessage = `Your main assignment is ${assignment.hbxlJob} at ${assignment.workLocation}. The project runs from ${assignment.startDate} to ${assignment.endDate}. ${assignments.length > 1 ? `You also have ${assignments.length - 1} additional assignments.` : ''}`;
              }
              
              result = {
                success: true,
                message: `Assignment: ${assignment.hbxlJob} at ${assignment.workLocation} (${assignment.startDate} - ${assignment.endDate}). Total assignments: ${assignments.length}. Currently ${isCurrentlyWorking ? 'working' : 'not clocked in'}.`,
                speech: speechMessage,
                data: {
                  primaryAssignment: assignment,
                  totalAssignments: assignments.length,
                  currentlyWorking: isCurrentlyWorking,
                  currentLocation: currentLocation,
                  workingOnAssignment: workingOnAssignment,
                  allAssignments: assignments
                }
              };
            }
          } catch (error) {
            console.error('Get assignments error:', error);
            result = {
              success: false,
              message: 'Failed to get assignments due to technical error.',
              speech: 'Sorry, there was a technical issue getting your assignments.'
            };
          }
          break;
          
        // ===== B'ELANNA BUSINESS PA ACTIONS =====
        case 'get_availability':
          try {
            // Check real calendar availability
            const today = new Date().toISOString().split('T')[0];
            const currentHour = new Date().getHours();
            const checkTime = `${currentHour + 1}:00`; // Next hour
            const durationMinutes = 60;
            
            const available = await storage.checkAvailability(today, checkTime, durationMinutes);
            const todayEvents = await storage.getDayEvents(today);
            
            let speechMessage;
            if (available) {
              speechMessage = todayEvents.length === 0 ? 
                "Your schedule is completely clear today. Perfect time for new meetings or appointments." :
                `You're available at ${checkTime} today, though you have ${todayEvents.length} other appointments scheduled.`;
            } else {
              speechMessage = `You're busy at ${checkTime} today. You currently have ${todayEvents.length} items scheduled.`;
            }
            
            result = {
              success: true,
              message: `Availability: ${available ? 'Available' : 'Busy'} at ${checkTime} today (${todayEvents.length} total events)`,
              speech: speechMessage,
              data: { available, date: today, time: checkTime, duration: durationMinutes, totalEvents: todayEvents.length }
            };
          } catch (error) {
            console.error('Get availability error:', error);
            result = {
              success: false,
              message: 'Failed to check availability due to technical error.',
              speech: 'Sorry, there was a technical issue checking your calendar availability.'
            };
          }
          break;

        case 'set_reminder':
          try {
            // This would normally parse the voice request for reminder details
            // For demonstration, creating a sample reminder
            const reminderTitle = "Follow up on important task";
            const reminderDate = new Date().toISOString().split('T')[0]; // Today
            const reminderTime = "15:00";
            
            const calendarEvent = await storage.createCalendarEvent({
              title: reminderTitle,
              description: "Voice-created reminder",
              eventDate: reminderDate,
              eventTime: reminderTime,
              durationMinutes: "15",
              eventType: "reminder"
            });
            
            result = {
              success: true,
              message: `Reminder set: "${reminderTitle}" for ${reminderDate} at ${reminderTime}`,
              speech: `I've set a reminder for "${reminderTitle}" today at ${reminderTime}. I'll make sure you don't forget!`,
              data: { eventId: calendarEvent.id, title: reminderTitle, date: reminderDate, time: reminderTime }
            };
          } catch (error) {
            console.error('Set reminder error:', error);
            result = {
              success: false,
              message: 'Failed to set reminder due to technical error.',
              speech: 'Sorry, there was a technical issue setting your reminder.'
            };
          }
          break;

        case 'summarize_day':
          try {
            const today = new Date().toISOString().split('T')[0];
            const todayEvents = await storage.getDayEvents(today);
            
            if (todayEvents.length === 0) {
              result = {
                success: true,
                message: `No events scheduled for today (${today})`,
                speech: "Your schedule is clear today. You have no meetings or reminders planned."
              };
            } else {
              const eventSummary = todayEvents.map(event => 
                `${event.title} at ${event.eventTime}`
              ).join(', ');
              
              result = {
                success: true,
                message: `Today's schedule (${today}): ${eventSummary}`,
                speech: `You have ${todayEvents.length} items on your schedule today: ${eventSummary}`,
                data: { date: today, eventCount: todayEvents.length, events: todayEvents }
              };
            }
          } catch (error) {
            console.error('Summarize day error:', error);
            result = {
              success: false,
              message: 'Failed to get day summary due to technical error.',
              speech: 'Sorry, there was a technical issue getting your schedule summary.'
            };
          }
          break;

        case 'schedule_meeting':
          try {
            // This would normally parse meeting details from voice
            // For demonstration, creating a sample meeting
            const meetingTitle = "Business discussion";
            const meetingDate = new Date().toISOString().split('T')[0]; // Today
            const meetingTime = "16:00";
            
            const meeting = await storage.createMeeting({
              title: meetingTitle,
              description: "Voice-scheduled meeting",
              meetingDate: meetingDate,
              meetingTime: meetingTime,
              durationMinutes: "60",
              participants: "[]", // Empty for now
              organizerEmail: "founder@brudys.com", // Default organizer
              meetingType: "business"
            });
            
            result = {
              success: true,
              message: `Meeting scheduled: "${meetingTitle}" for ${meetingDate} at ${meetingTime}`,
              speech: `I've scheduled "${meetingTitle}" for today at ${meetingTime}. The meeting is set for one hour.`,
              data: { meetingId: meeting.id, title: meetingTitle, date: meetingDate, time: meetingTime }
            };
          } catch (error) {
            console.error('Schedule meeting error:', error);
            result = {
              success: false,
              message: 'Failed to schedule meeting due to technical error.',
              speech: 'Sorry, there was a technical issue scheduling your meeting.'
            };
          }
          break;

        case 'send_email':
        case 'reply_email':
        case 'email_contractor':
          try {
            // Import email service
            const { sendContractorEmail, getContractorEmail } = await import('./email-service');
            
            // For demonstration, send a test email to Dalwayne about earnings
            const contractorEmail = await getContractorEmail("Dalwayne Diedericks");
            if (contractorEmail) {
              const emailResult = await sendContractorEmail({
                contractorName: "Dalwayne Diedericks",
                contractorEmail: contractorEmail,
                subject: "Earnings Update from ERdesignandbuild",
                message: "Your latest earnings report is ready for review. Current week total: £195.60. Please check your Job Tracker dashboard for detailed breakdown.",
                priority: 'normal'
              });
              
              result = {
                success: emailResult.success,
                message: emailResult.success ? 
                  `Email sent successfully to ${contractorEmail}${emailResult.messageId ? ` (ID: ${emailResult.messageId})` : ''}` :
                  `Failed to send email: ${emailResult.error}`,
                speech: emailResult.success ?
                  "I've successfully sent an earnings update email to Dalwayne. The email includes current earnings information and instructions to check the Job Tracker dashboard." :
                  `Sorry, I couldn't send the email. ${emailResult.error}`,
                data: {
                  emailSent: emailResult.success,
                  recipient: contractorEmail,
                  messageId: emailResult.messageId,
                  subject: "Earnings Update from ERdesignandbuild"
                }
              };
            } else {
              result = {
                success: false,
                message: "No email address found for contractor",
                speech: "I couldn't find an email address for the contractor. Please update their contact information."
              };
            }
          } catch (error) {
            console.error('Email service error:', error);
            result = {
              success: false,
              message: 'Failed to access email service due to technical error.',
              speech: 'Sorry, there was a technical issue with the email service.'
            };
          }
          break;
          
        case 'send_sms':
        case 'text_contractor':
        case 'sms_notification':
          try {
            // Import SMS service
            const { sendContractorSMS, getContractorPhone } = await import('./sms-service');
            
            // For demonstration, send a test SMS to Dalwayne about earnings  
            const contractorPhone = await getContractorPhone("Dalwayne Diedericks");
            if (contractorPhone) {
              const smsResult = await sendContractorSMS({
                contractorName: "Dalwayne Diedericks",
                contractorPhone: contractorPhone,
                message: "Your earnings report is ready: £195.60 for current week. Check Job Tracker dashboard for details.",
                priority: 'normal'
              });
              
              result = {
                success: smsResult.success,
                message: smsResult.success ? 
                  `SMS sent successfully to ${contractorPhone}${smsResult.messageId ? ` (ID: ${smsResult.messageId})` : ''}` :
                  `Failed to send SMS: ${smsResult.error}`,
                speech: smsResult.success ?
                  "I've successfully sent an earnings update text message to Dalwayne. The SMS includes current earnings information." :
                  `Sorry, I couldn't send the text message. ${smsResult.error}`,
                data: {
                  smsSent: smsResult.success,
                  recipient: contractorPhone,
                  messageId: smsResult.messageId,
                  contractor: "Dalwayne Diedericks"
                }
              };
            } else {
              result = {
                success: false,
                message: "No phone number found for contractor",
                speech: "I couldn't find a phone number for the contractor. Please update their contact information."
              };
            }
          } catch (error) {
            console.error('SMS service error:', error);
            result = {
              success: false,
              message: 'Failed to access SMS service due to technical error.',
              speech: 'Sorry, there was a technical issue with the SMS service.'
            };
          }
          break;
          
        case 'send_telegram':
        case 'telegram_message':
        case 'telegram_contractor':
          try {
            // Import Telegram service
            const { TelegramService } = await import('./telegram');
            const telegramService = new TelegramService();
            
            // Map contractor names to their Telegram chat IDs (based on existing mapping)
            let chatId = '7617462316'; // Default to Rudy
            let contractorName = 'Unknown';
            
            // Try to identify contractor from caller_id or use Dalwayne as default for testing
            if (caller_id === '+447984591436') {
              contractorName = 'Dalwayne Diedericks';
              chatId = '8016744652';
            } else if (caller_id === '+447828696116') {
              contractorName = 'Marius Andronache';
              chatId = '8006717361';
            } else if (caller_id === '+447534251548') {
              contractorName = 'Rudy';
              chatId = '7617462316';
            } else {
              // Default to Dalwayne for testing
              contractorName = 'Dalwayne Diedericks';
              chatId = '8016744652';
            }
            
            const message = `Hi ${contractorName}! 👋\n\nYour earnings report is ready for review. Check your dashboard for the latest details.\n\n💰 Recent activity:\n• Weekly hours tracked\n• Pay calculations updated\n• CIS deductions applied\n\nLogin to your Job Tracker dashboard for full breakdown.\n\n- ERdesignandbuild Team`;
            
            const telegramResult = await telegramService.sendCustomMessage(chatId, message);
            
            result = {
              success: telegramResult.success,
              message: telegramResult.success ? 
                `Telegram message sent successfully to ${contractorName}${telegramResult.messageId ? ` (ID: ${telegramResult.messageId})` : ''}` :
                `Failed to send Telegram message: ${telegramResult.error}`,
              speech: telegramResult.success ?
                `I've successfully sent a Telegram message to ${contractorName} about their earnings report. The message includes information about their weekly hours and pay calculations.` :
                `Sorry, I couldn't send the Telegram message. ${telegramResult.error}`,
              data: {
                telegramSent: telegramResult.success,
                chatId: chatId,
                contractor: contractorName,
                messageId: telegramResult.messageId,
                recipient: contractorName
              }
            };
          } catch (error) {
            console.error('Telegram service error:', error);
            result = {
              success: false,
              message: 'Failed to access Telegram service due to technical error.',
              speech: 'Sorry, there was a technical issue with the Telegram service.'
            };
          }
          break;
          
          
        // ===== ADMIN ACTIONS =====
        case 'get_workforce_status':
        case 'monitor_contractors':
        case 'workforce_summary':
          try {
            // Get active work sessions (currently clocked in contractors) 
            const activeSessions = await storage.getActiveWorkSessions();
            const todaySessions = await storage.getTodayWorkSessions();
            
            if (activeSessions.length === 0) {
              result = {
                success: true,
                message: "No contractors are currently clocked in.",
                speech: "Currently, no contractors are clocked in. All workers are off-duty.",
                data: { activeCount: 0, todayTotal: todaySessions.length }
              };
            } else {
              const statusList = activeSessions.map(session => {
                const duration = (new Date().getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60);
                return `${session.contractorName} at ${session.jobSiteLocation} (${duration.toFixed(1)}h)`;
              }).join(', ');
              
              result = {
                success: true,
                message: `${activeSessions.length} contractors currently working: ${statusList}`,
                speech: `Currently ${activeSessions.length} contractors are clocked in: ${statusList}. Today we've had ${todaySessions.length} total work sessions.`,
                data: { 
                  activeCount: activeSessions.length, 
                  todayTotal: todaySessions.length,
                  activeSessions: activeSessions,
                  details: statusList
                }
              };
            }
          } catch (error) {
            console.error('Get workforce status error:', error);
            result = {
              success: false,
              message: 'Failed to get workforce status due to technical error.',
              speech: 'Sorry, there was a technical issue getting the workforce status.'
            };
          }
          break;
          
        case 'get_today_sessions':
          try {
            const todaySessions = await storage.getTodayWorkSessions();
            
            if (todaySessions.length === 0) {
              result = {
                success: true,
                message: "No work sessions today.",
                speech: "There have been no work sessions recorded today."
              };
            } else {
              // Group sessions by contractor
              const sessionsByContractor = todaySessions.reduce((acc: any, session: any) => {
                if (!acc[session.contractorName]) {
                  acc[session.contractorName] = [];
                }
                acc[session.contractorName].push(session);
                return acc;
              }, {});
              
              const summaryText = Object.entries(sessionsByContractor).map(([contractor, sessions]: [string, any]) => {
                const totalHours = sessions.reduce((sum: number, session: any) => {
                  const start = new Date(session.startTime);
                  const end = session.endTime ? new Date(session.endTime) : new Date();
                  return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                }, 0);
                return `${contractor}: ${totalHours.toFixed(1)} hours (${sessions.length} sessions)`;
              }).join(', ');
              
              result = {
                success: true,
                message: `Today's work sessions: ${summaryText}`,
                speech: `Today we have ${todaySessions.length} work sessions. ${summaryText}`,
                data: { 
                  totalSessions: todaySessions.length,
                  contractorCount: Object.keys(sessionsByContractor).length,
                  sessionsByContractor: sessionsByContractor,
                  summary: summaryText
                }
              };
            }
          } catch (error) {
            console.error('Get today sessions error:', error);
            result = {
              success: false,
              message: 'Failed to get today\'s sessions due to technical error.',
              speech: 'Sorry, there was a technical issue getting today\'s work sessions.'
            };
          }
          break;
          
        case 'assign_job':
          try {
            // For voice-based job assignment, we'd normally parse details from speech
            // For demonstration, providing guidance on assignment process
            result = {
              success: true,
              message: "Job assignment feature available. Please specify contractor name, job details, and location.",
              speech: "I can help assign jobs to contractors. Please tell me the contractor's name, job description, location, and deadline for the assignment.",
              data: { 
                availableContractors: ["Marius Andronache", "Dalwayne Diedericks", "Earl", "SAID tiss"],
                assignmentFields: ["contractor", "jobDescription", "location", "deadline"]
              }
            };
          } catch (error) {
            console.error('Assign job error:', error);
            result = {
              success: false,
              message: 'Failed to process job assignment due to technical error.',
              speech: 'Sorry, there was a technical issue with the job assignment feature.'
            };
          }
          break;
          
        case 'fix_earnings':
        case 'adjust_earnings':
        case 'correct_earnings':
          try {
            // Get all contractors and their current earnings for review
            const allActiveSessions = await storage.getActiveWorkSessions();
            const todaySessions = await storage.getTodayWorkSessions();
            
            // Calculate current earnings overview
            const contractorEarnings = new Map();
            
            for (const session of todaySessions) {
              const payRate = await storage.getContractorPayRate(session.contractorName);
              let sessionHours = 0;
              
              if (session.endTime) {
                // Completed session
                sessionHours = (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60);
              } else {
                // Active session
                sessionHours = (new Date().getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60);
              }
              
              const earnings = sessionHours * payRate;
              
              if (!contractorEarnings.has(session.contractorName)) {
                contractorEarnings.set(session.contractorName, {
                  totalHours: 0,
                  totalEarnings: 0,
                  sessions: 0,
                  payRate: payRate
                });
              }
              
              const data = contractorEarnings.get(session.contractorName);
              data.totalHours += sessionHours;
              data.totalEarnings += earnings;
              data.sessions += 1;
            }
            
            const earningsData = Array.from(contractorEarnings.entries()).map(([name, data]) => 
              `${name}: £${data.totalEarnings.toFixed(2)} (${data.totalHours.toFixed(1)}h @ £${data.payRate}/h)`
            );
            
            result = {
              success: true,
              message: `Current earnings overview: ${earningsData.join(', ')}`,
              speech: `Here's today's earnings overview: ${earningsData.join(', ')}. To adjust specific earnings, please specify the contractor name and the correction needed.`,
              data: {
                contractorEarnings: Object.fromEntries(contractorEarnings),
                totalContractors: contractorEarnings.size,
                totalSessions: todaySessions.length,
                activeSessions: allActiveSessions.length,
                availableActions: [
                  "Specify contractor: 'Fix Marius earnings'",
                  "Add bonus: 'Add £50 bonus to Dalwayne'", 
                  "Correct hours: 'Correct Dalwayne to 8 hours'",
                  "Adjust rate: 'Change Earl rate to £20 per hour'"
                ]
              }
            };
          } catch (error) {
            console.error('Fix earnings error:', error);
            result = {
              success: false,
              message: 'Failed to process earnings adjustment due to technical error.',
              speech: 'Sorry, there was a technical issue with the earnings adjustment feature.'
            };
          }
          break;
          
        case 'update_pay_rate':
        case 'change_pay_rate':
          try {
            // This would normally parse contractor name and new rate from voice
            // For demonstration, showing available contractors and current rates
            const contractors = ["Marius Andronache", "Dalwayne Diedericks", "Earl", "SAID tiss"];
            const currentRates = await Promise.all(
              contractors.map(async name => {
                const rate = await storage.getContractorPayRate(name);
                return `${name}: £${rate}/hour`;
              })
            );
            
            result = {
              success: true,
              message: `Current pay rates: ${currentRates.join(', ')}`,
              speech: `Current pay rates are: ${currentRates.join(', ')}. To update a rate, please specify the contractor name and new hourly rate.`,
              data: {
                contractors: contractors,
                currentRates: currentRates,
                updateInstructions: "Say: 'Change Marius rate to £30 per hour' or 'Update Dalwayne to £20'"
              }
            };
          } catch (error) {
            console.error('Update pay rate error:', error);
            result = {
              success: false,
              message: 'Failed to process pay rate update due to technical error.',
              speech: 'Sorry, there was a technical issue with the pay rate update feature.'
            };
          }
          break;
          
        default:
          // Enhanced help message for contractor, admin, and PA actions
          const availableActions = [
            "Contractor actions: clock in, clock out, check status, get assignments",
            "Admin actions: get workforce status, monitor contractors, get today sessions, assign job, fix earnings, update pay rate",
            "Business PA actions: check availability, set reminder, schedule meeting, send email, reply email, send SMS"
          ];
          
          result = {
            success: false,
            message: `Unknown action: ${action}. Available actions: ${availableActions.join('; ')}`,
            speech: `I don't understand "${action}". I can help with contractor time tracking, admin workforce monitoring, or business PA tasks like scheduling and email. What would you like to do?`
          };
      }
      
      // Store result for idempotency (cache successful operations)
      if (result && (result.success !== false || action === 'get_status' || action === 'get_assignments')) {
        processedActions.set(idempotencyKey, result);
      }
      
      // Redact contractor name from logs for privacy
      console.log('🎙️ Voice action result for contractor', contractorFullName.substring(0, 5) + '****', action, 
        { success: result.success, hasData: !!result.data });
      res.json(result);
      
    } catch (error) {
      console.error('❌ ElevenLabs action webhook error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        speech: 'Sorry, there was a technical issue. Please try again later.'
      });
    }
  });

  return httpServer;
}

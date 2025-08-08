import { type Contractor, type InsertContractor, type Job, type InsertJob, type CsvUpload, type InsertCsvUpload, type JobWithContractor, type JobAssignment, type ContractorApplication, type InsertContractorApplication } from "@shared/schema";
import { contractors, jobs, csvUploads, contractorApplications } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  constructor() {
    console.log('✅ DatabaseStorage initialized with persistent PostgreSQL');
  }

  // Contractors
  async getContractors(): Promise<Contractor[]> {
    return await db.select().from(contractors);
  }

  async getContractor(id: string): Promise<Contractor | undefined> {
    const result = await db.select().from(contractors).where(eq(contractors.id, id));
    return result[0];
  }

  async createContractor(insertContractor: InsertContractor): Promise<Contractor> {
    const result = await db.insert(contractors).values(insertContractor).returning();
    return result[0];
  }

  async updateContractor(id: string, updates: Partial<Contractor>): Promise<Contractor | undefined> {
    const result = await db.update(contractors)
      .set(updates)
      .where(eq(contractors.id, id))
      .returning();
    return result[0];
  }

  // Jobs
  async getJobs(): Promise<JobWithContractor[]> {
    const result = await db.select({
      id: jobs.id,
      title: jobs.title,
      description: jobs.description,
      location: jobs.location,
      status: jobs.status,
      contractorId: jobs.contractorId,
      dueDate: jobs.dueDate,
      notes: jobs.notes,
      uploadId: jobs.uploadId,
      contractor: contractors
    })
    .from(jobs)
    .leftJoin(contractors, eq(jobs.contractorId, contractors.id));

    return result.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      status: row.status,
      contractorId: row.contractorId,
      dueDate: row.dueDate,
      notes: row.notes,
      uploadId: row.uploadId,
      contractor: row.contractor || undefined
    }));
  }

  async getJob(id: string): Promise<JobWithContractor | undefined> {
    const result = await db.select({
      id: jobs.id,
      title: jobs.title,
      description: jobs.description,
      location: jobs.location,
      status: jobs.status,
      contractorId: jobs.contractorId,
      dueDate: jobs.dueDate,
      notes: jobs.notes,
      uploadId: jobs.uploadId,
      contractor: contractors
    })
    .from(jobs)
    .leftJoin(contractors, eq(jobs.contractorId, contractors.id))
    .where(eq(jobs.id, id));

    if (!result[0]) return undefined;

    const row = result[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      status: row.status,
      contractorId: row.contractorId,
      dueDate: row.dueDate,
      notes: row.notes,
      uploadId: row.uploadId,
      contractor: row.contractor || undefined
    };
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const result = await db.insert(jobs).values(insertJob).returning();
    return result[0];
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const result = await db.update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();
    return result[0];
  }

  async createJobsFromCsv(jobsData: InsertJob[], uploadId: string): Promise<Job[]> {
    const jobsWithUploadId = jobsData.map(job => ({ ...job, uploadId }));
    const result = await db.insert(jobs).values(jobsWithUploadId).returning();
    return result;
  }

  // CSV Uploads
  async getCsvUploads(): Promise<CsvUpload[]> {
    return await db.select().from(csvUploads).orderBy(desc(csvUploads.uploadedAt));
  }

  async createCsvUpload(insertUpload: InsertCsvUpload): Promise<CsvUpload> {
    const result = await db.insert(csvUploads).values(insertUpload).returning();
    return result[0];
  }

  async updateCsvUpload(id: string, updates: Partial<CsvUpload>): Promise<CsvUpload | undefined> {
    const result = await db.update(csvUploads)
      .set(updates)
      .where(eq(csvUploads.id, id))
      .returning();
    return result[0];
  }

  async assignJob(assignment: JobAssignment): Promise<Job | undefined> {
    const job = await this.getJob(assignment.jobId);
    const contractor = await this.getContractor(assignment.contractorId);
    
    if (!job || !contractor) return undefined;
    
    const updatedJob = await this.updateJob(assignment.jobId, {
      contractorId: assignment.contractorId,
      status: "assigned",
      dueDate: assignment.dueDate,
      notes: assignment.notes
    });
    
    // Update contractor's active jobs count
    const currentActiveJobs = parseInt(contractor.activeJobs) + 1;
    await this.updateContractor(assignment.contractorId, {
      activeJobs: currentActiveJobs.toString(),
      status: currentActiveJobs >= 3 ? "busy" : "available"
    });
    
    return updatedJob;
  }

  // Contractor Applications - PERSISTENT DATABASE STORAGE
  async getContractorApplications(): Promise<ContractorApplication[]> {
    console.log('🔍 Fetching applications from persistent database...');
    const applications = await db.select().from(contractorApplications).orderBy(desc(contractorApplications.submittedAt));
    console.log(`📋 Found ${applications.length} applications in database`);
    return applications;
  }

  async getContractorApplication(id: string): Promise<ContractorApplication | undefined> {
    const result = await db.select().from(contractorApplications).where(eq(contractorApplications.id, id));
    return result[0];
  }

  async createContractorApplication(insertApplication: InsertContractorApplication): Promise<ContractorApplication> {
    console.log('💾 Saving application to persistent database:', insertApplication.firstName, insertApplication.lastName);
    const result = await db.insert(contractorApplications).values(insertApplication).returning();
    console.log('✅ Application permanently saved with ID:', result[0].id);
    return result[0];
  }

  async updateContractorApplication(id: string, updates: Partial<ContractorApplication>): Promise<ContractorApplication | undefined> {
    const result = await db.update(contractorApplications)
      .set(updates)
      .where(eq(contractorApplications.id, id))
      .returning();
    return result[0];
  }

  async getStats(): Promise<{ totalJobs: number; pendingJobs: number; completedJobs: number; activeContractors: number; }> {
    const jobsData = await db.select().from(jobs);
    const contractorsData = await db.select().from(contractors);
    
    return {
      totalJobs: jobsData.length,
      pendingJobs: jobsData.filter(job => job.status === "pending").length,
      completedJobs: jobsData.filter(job => job.status === "completed").length,
      activeContractors: contractorsData.filter(contractor => contractor.status === "available" || contractor.status === "busy").length
    };
  }

  // Job Assignments for Contractors
  async getContractorAssignments(contractorName: string): Promise<Job[]> {
    console.log("🔍 DatabaseStorage: Getting assignments for", contractorName);
    
    const result = await db.select().from(jobs).where(eq(jobs.contractorName, contractorName));
    
    console.log("📋 DatabaseStorage: Found", result.length, "assignments");
    return result;
  }

  async createJobAssignment(assignmentData: any): Promise<Job> {
    console.log("📋 DatabaseStorage: Creating job assignment", assignmentData);
    
    // Convert postcode to GPS coordinates using a lookup for UK postcodes
    let latitude = null;
    let longitude = null;
    
    if (assignmentData.workLocation) {
      const postcode = assignmentData.workLocation.toUpperCase();
      // ME5 9GX - Gillingham, Kent (Promise project location)
      if (postcode.includes('ME5 9GX')) {
        latitude = "51.3886";
        longitude = "0.5419";
      }
      // DA17 5DB - Belvedere, London (different job site)
      else if (postcode.includes('DA17 5DB')) {
        latitude = "51.4914";
        longitude = "0.1557";
      }
      // Add more real postcodes as jobs are created
    }
    
    const jobData = {
      title: assignmentData.hbxlJob || "Job Assignment",
      description: assignmentData.specialInstructions || "",
      location: assignmentData.workLocation || "", // Use the actual work location from form
      contractorName: assignmentData.contractorName,
      startDate: assignmentData.startDate,
      dueDate: assignmentData.endDate,
      status: "assigned" as const,
      phases: assignmentData.buildPhases ? JSON.stringify(assignmentData.buildPhases) : null,
      telegramNotified: assignmentData.sendTelegramNotification ? "true" : "false",
      latitude: latitude,
      longitude: longitude,
    };

    const result = await db.insert(jobs).values(jobData).returning();
    console.log("✅ DatabaseStorage: Job assignment created with ID", result[0].id);
    
    return result[0];
  }
}
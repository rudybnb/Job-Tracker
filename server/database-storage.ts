import { 
  type Contractor, 
  type InsertContractor, 
  type Job, 
  type InsertJob, 
  type CsvUpload, 
  type InsertCsvUpload, 
  type JobWithContractor, 
  type JobAssignment, 
  type ContractorApplication, 
  type InsertContractorApplication,
  type WorkSession,
  type InsertWorkSession,
  type AdminSetting,
  type InsertAdminSetting,
  type JobAssignmentRecord,
  type InsertJobAssignment
} from "@shared/schema";
import { contractors, jobs, csvUploads, contractorApplications, workSessions, adminSettings, jobAssignments } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Contractors
  getContractors(): Promise<Contractor[]>;
  getContractor(id: string): Promise<Contractor | undefined>;
  createContractor(contractor: InsertContractor): Promise<Contractor>;
  updateContractor(id: string, contractor: Partial<Contractor>): Promise<Contractor | undefined>;
  
  // Jobs
  getJobs(): Promise<JobWithContractor[]>;
  getJob(id: string): Promise<JobWithContractor | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, job: Partial<Job>): Promise<Job | undefined>;
  createJobsFromCsv(jobs: InsertJob[], uploadId: string): Promise<Job[]>;
  
  // CSV Uploads
  getCsvUploads(): Promise<CsvUpload[]>;
  createCsvUpload(upload: InsertCsvUpload): Promise<CsvUpload>;
  updateCsvUpload(id: string, upload: Partial<CsvUpload>): Promise<CsvUpload | undefined>;
  
  // Job Assignment
  assignJob(assignment: JobAssignment): Promise<Job | undefined>;
  createJobAssignment(assignment: InsertJobAssignment): Promise<JobAssignmentRecord>;
  getJobAssignments(): Promise<JobAssignmentRecord[]>;
  deleteJobAssignment(id: string): Promise<boolean>;
  
  // Contractor Applications
  getContractorApplications(): Promise<ContractorApplication[]>;
  getContractorApplication(id: string): Promise<ContractorApplication | undefined>;
  createContractorApplication(application: InsertContractorApplication): Promise<ContractorApplication>;
  updateContractorApplication(id: string, application: Partial<ContractorApplication>): Promise<ContractorApplication | undefined>;
  
  // Work Sessions
  getWorkSessions(contractorName?: string): Promise<WorkSession[]>;
  getActiveWorkSession(contractorName: string): Promise<WorkSession | undefined>;
  createWorkSession(session: InsertWorkSession): Promise<WorkSession>;
  updateWorkSession(id: string, session: Partial<WorkSession>): Promise<WorkSession | undefined>;
  
  // Admin Settings
  getAdminSettings(): Promise<AdminSetting[]>;
  getAdminSetting(key: string): Promise<AdminSetting | undefined>;
  setAdminSetting(setting: InsertAdminSetting): Promise<AdminSetting>;
  updateAdminSetting(key: string, value: string, updatedBy: string): Promise<AdminSetting | undefined>;
  
  // Stats
  getStats(): Promise<{
    totalJobs: number;
    pendingJobs: number;
    completedJobs: number;
    activeContractors: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    console.log('✅ DatabaseStorage initialized with persistent PostgreSQL');
  }

  // Contractors
  async getContractors(): Promise<Contractor[]> {
    return db.select().from(contractors);
  }

  async getContractor(id: string): Promise<Contractor | undefined> {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.id, id));
    return contractor;
  }

  async createContractor(insertContractor: InsertContractor): Promise<Contractor> {
    const [contractor] = await db.insert(contractors).values(insertContractor).returning();
    return contractor;
  }

  async updateContractor(id: string, updates: Partial<Contractor>): Promise<Contractor | undefined> {
    const [contractor] = await db
      .update(contractors)
      .set(updates)
      .where(eq(contractors.id, id))
      .returning();
    return contractor;
  }

  // Jobs
  async getJobs(): Promise<JobWithContractor[]> {
    const jobsWithContractors = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        description: jobs.description,
        location: jobs.location,
        status: jobs.status,
        contractorId: jobs.contractorId,
        contractorName: jobs.contractorName,
        dueDate: jobs.dueDate,
        startDate: jobs.startDate,
        notes: jobs.notes,
        uploadId: jobs.uploadId,
        phases: jobs.phases,
        telegramNotified: jobs.telegramNotified,
        latitude: jobs.latitude,
        longitude: jobs.longitude,
        contractor: contractors
      })
      .from(jobs)
      .leftJoin(contractors, eq(jobs.contractorId, contractors.id));

    return jobsWithContractors.map(row => ({
      ...row,
      contractor: row.contractor || undefined
    }));
  }

  async getJob(id: string): Promise<JobWithContractor | undefined> {
    const [job] = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        description: jobs.description,
        location: jobs.location,
        status: jobs.status,
        contractorId: jobs.contractorId,
        contractorName: jobs.contractorName,
        dueDate: jobs.dueDate,
        startDate: jobs.startDate,
        notes: jobs.notes,
        uploadId: jobs.uploadId,
        phases: jobs.phases,
        telegramNotified: jobs.telegramNotified,
        latitude: jobs.latitude,
        longitude: jobs.longitude,
        contractor: contractors
      })
      .from(jobs)
      .leftJoin(contractors, eq(jobs.contractorId, contractors.id))
      .where(eq(jobs.id, id));
    
    if (!job) return undefined;
    
    return {
      ...job,
      contractor: job.contractor || undefined
    };
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(insertJob).returning();
    return job;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const [job] = await db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();
    return job;
  }

  async createJobsFromCsv(jobsData: InsertJob[], uploadId: string): Promise<Job[]> {
    const createdJobs = await db.insert(jobs).values(jobsData).returning();
    return createdJobs;
  }

  // CSV Uploads
  async getCsvUploads(): Promise<CsvUpload[]> {
    return db.select().from(csvUploads);
  }

  async createCsvUpload(insertUpload: InsertCsvUpload): Promise<CsvUpload> {
    const [upload] = await db.insert(csvUploads).values(insertUpload).returning();
    return upload;
  }

  async updateCsvUpload(id: string, updates: Partial<CsvUpload>): Promise<CsvUpload | undefined> {
    const [upload] = await db
      .update(csvUploads)
      .set(updates)
      .where(eq(csvUploads.id, id))
      .returning();
    return upload;
  }

  // Job Assignment
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

  async createJobAssignment(assignment: InsertJobAssignment): Promise<JobAssignmentRecord> {
    const [created] = await db.insert(jobAssignments).values(assignment).returning();
    console.log("✅ Job assignment created in database:", created);
    return created;
  }

  async getJobAssignments(): Promise<JobAssignmentRecord[]> {
    const assignments = await db.select().from(jobAssignments).orderBy(desc(jobAssignments.createdAt));
    console.log("📋 Retrieved job assignments:", assignments.length);
    return assignments;
  }

  async deleteJobAssignment(id: string): Promise<boolean> {
    const result = await db.delete(jobAssignments).where(eq(jobAssignments.id, id));
    console.log("🗑️ Deleted job assignment:", id, "Affected rows:", result.rowCount);
    return result.rowCount > 0;
  }

  // Contractor Applications
  async getContractorApplications(): Promise<ContractorApplication[]> {
    return db.select().from(contractorApplications).orderBy(desc(contractorApplications.submittedAt));
  }

  async getContractorApplication(id: string): Promise<ContractorApplication | undefined> {
    const [application] = await db.select().from(contractorApplications).where(eq(contractorApplications.id, id));
    return application;
  }

  async createContractorApplication(insertApplication: InsertContractorApplication): Promise<ContractorApplication> {
    const [application] = await db.insert(contractorApplications).values(insertApplication).returning();
    return application;
  }

  async updateContractorApplication(id: string, updates: Partial<ContractorApplication>): Promise<ContractorApplication | undefined> {
    const [application] = await db
      .update(contractorApplications)
      .set(updates)
      .where(eq(contractorApplications.id, id))
      .returning();
    return application;
  }

  // Work Sessions
  async getWorkSessions(contractorName?: string): Promise<WorkSession[]> {
    if (contractorName) {
      return db.select().from(workSessions)
        .where(eq(workSessions.contractorName, contractorName))
        .orderBy(desc(workSessions.createdAt));
    }
    return db.select().from(workSessions).orderBy(desc(workSessions.createdAt));
  }

  async getActiveWorkSession(contractorName: string): Promise<WorkSession | undefined> {
    const [session] = await db.select().from(workSessions)
      .where(
        and(
          eq(workSessions.contractorName, contractorName),
          eq(workSessions.status, "active")
        )
      );
    return session;
  }

  async createWorkSession(insertSession: InsertWorkSession): Promise<WorkSession> {
    const [session] = await db.insert(workSessions).values(insertSession).returning();
    return session;
  }

  async updateWorkSession(id: string, updates: Partial<WorkSession>): Promise<WorkSession | undefined> {
    const [session] = await db
      .update(workSessions)
      .set(updates)
      .where(eq(workSessions.id, id))
      .returning();
    return session;
  }

  // Admin Settings Methods
  async getAdminSettings(): Promise<AdminSetting[]> {
    const settings = await db.select().from(adminSettings);
    console.log("⚙️ Retrieved admin settings:", settings.length);
    return settings;
  }

  async getAdminSetting(key: string): Promise<AdminSetting | undefined> {
    const [setting] = await db.select().from(adminSettings).where(eq(adminSettings.settingKey, key));
    console.log("⚙️ Retrieved admin setting:", key, setting?.settingValue);
    return setting;
  }

  async setAdminSetting(setting: InsertAdminSetting): Promise<AdminSetting> {
    // Check if setting already exists
    const existing = await this.getAdminSetting(setting.settingKey);
    
    if (existing) {
      // Update existing setting
      const [updated] = await db
        .update(adminSettings)
        .set({
          settingValue: setting.settingValue,
          updatedBy: setting.updatedBy,
          updatedAt: new Date()
        })
        .where(eq(adminSettings.settingKey, setting.settingKey))
        .returning();
      console.log("⚙️ Updated admin setting:", setting.settingKey);
      return updated;
    } else {
      // Create new setting
      const [created] = await db
        .insert(adminSettings)
        .values(setting)
        .returning();
      console.log("⚙️ Created admin setting:", setting.settingKey);
      return created;
    }
  }

  async updateAdminSetting(key: string, value: string, updatedBy: string): Promise<AdminSetting | undefined> {
    const [updated] = await db
      .update(adminSettings)
      .set({
        settingValue: value,
        updatedBy: updatedBy,
        updatedAt: new Date()
      })
      .where(eq(adminSettings.settingKey, key))
      .returning();
    
    console.log("⚙️ Updated admin setting:", key, "to:", value);
    return updated;
  }

  // Stats
  async getStats(): Promise<{
    totalJobs: number;
    pendingJobs: number;
    completedJobs: number;
    activeContractors: number;
  }> {
    const allJobs = await db.select().from(jobs);
    const allContractors = await db.select().from(contractors);
    
    return {
      totalJobs: allJobs.length,
      pendingJobs: allJobs.filter(job => job.status === "pending").length,
      completedJobs: allJobs.filter(job => job.status === "completed").length,
      activeContractors: allContractors.filter(contractor => 
        contractor.status === "available" || contractor.status === "busy"
      ).length
    };
  }
}

export const storage = new DatabaseStorage();
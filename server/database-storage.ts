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
  type InsertJobAssignment,
  type ContractorReport,
  type InsertContractorReport,
  type AdminInspection,
  type InsertAdminInspection,
  type InspectionNotification,
  type InsertInspectionNotification
} from "@shared/schema";
import { contractors, jobs, csvUploads, contractorApplications, workSessions, adminSettings, jobAssignments, contractorReports, adminInspections, inspectionNotifications } from "@shared/schema";
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
  deleteCsvUpload(id: string): Promise<boolean>;
  
  // Job Assignment
  assignJob(assignment: JobAssignment): Promise<Job | undefined>;
  createJobAssignment(assignment: InsertJobAssignment): Promise<JobAssignmentRecord>;
  getJobAssignments(): Promise<JobAssignmentRecord[]>;
  getJobAssignment(id: string): Promise<JobAssignmentRecord | undefined>;
  getContractorAssignments(contractorName: string): Promise<JobAssignmentRecord[]>;
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
  
  // Contractor Reports
  createContractorReport(report: InsertContractorReport): Promise<ContractorReport>;
  getContractorReports(): Promise<ContractorReport[]>;
  
  // Admin Inspections
  createAdminInspection(inspection: InsertAdminInspection): Promise<AdminInspection>;
  getAdminInspections(): Promise<AdminInspection[]>;
  getAdminInspectionsByAssignment(assignmentId: string): Promise<AdminInspection[]>;
  updateAdminInspection(id: string, inspection: Partial<AdminInspection>): Promise<AdminInspection | undefined>;
  
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
        phaseTaskData: jobs.phaseTaskData,
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
        phaseTaskData: jobs.phaseTaskData,
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

  async deleteJob(id: string): Promise<boolean> {
    const result = await db.delete(jobs).where(eq(jobs.id, id));
    console.log("🗑️ Deleted job:", id, "Affected rows:", result.rowCount);
    return result.rowCount > 0;
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

  async deleteCsvUpload(id: string): Promise<boolean> {
    // First check if there are any jobs associated with this upload
    const associatedJobs = await db.select().from(jobs).where(eq(jobs.uploadId, id));
    
    if (associatedJobs.length > 0) {
      // Delete associated jobs first to maintain referential integrity
      await db.delete(jobs).where(eq(jobs.uploadId, id));
      console.log(`🗑️ Deleted ${associatedJobs.length} jobs associated with upload ${id}`);
    }
    
    // Now delete the CSV upload record
    const result = await db.delete(csvUploads).where(eq(csvUploads.id, id));
    console.log(`🗑️ Deleted CSV upload record ${id}`);
    return result.rowCount > 0;
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

  async getJobAssignment(id: string): Promise<JobAssignmentRecord | undefined> {
    const [assignment] = await db.select().from(jobAssignments).where(eq(jobAssignments.id, id));
    console.log("🔍 Retrieved job assignment by ID:", id, assignment ? "found" : "not found");
    return assignment;
  }

  async updateJobAssignment(id: string, updates: Partial<JobAssignmentRecord>): Promise<JobAssignmentRecord | undefined> {
    const [assignment] = await db
      .update(jobAssignments)
      .set(updates)
      .where(eq(jobAssignments.id, id))
      .returning();
    console.log("📝 Updated job assignment:", id);
    return assignment;
  }

  async deleteJobAssignment(id: string): Promise<boolean> {
    const result = await db.delete(jobAssignments).where(eq(jobAssignments.id, id));
    console.log("🗑️ Deleted job assignment:", id, "Affected rows:", result.rowCount);
    return result.rowCount > 0;
  }

  async getContractorAssignments(contractorName: string): Promise<JobAssignmentRecord[]> {
    try {
      // Use simplified approach to fetch assignments
      const assignments = await db.query.jobAssignments.findMany({
        where: eq(jobAssignments.contractorName, contractorName)
      });
      
      console.log(`📋 Found ${assignments.length} assignments for contractor: ${contractorName}`);
      return assignments;
    } catch (error) {
      console.error("Error fetching contractor assignments:", error);
      return [];
    }
  }

  // Contractor Applications
  async getContractorApplications(): Promise<ContractorApplication[]> {
    return db.select().from(contractorApplications).orderBy(desc(contractorApplications.submittedAt));
  }

  async getContractorApplicationByUsername(username: string): Promise<ContractorApplication | undefined> {
    const [application] = await db.select().from(contractorApplications)
      .where(eq(contractorApplications.username, username));
    return application;
  }

  async getContractorApplication(id: string): Promise<ContractorApplication | undefined> {
    const [application] = await db.select().from(contractorApplications).where(eq(contractorApplications.id, id));
    return application;
  }

  async getContractorByName(name: string): Promise<ContractorApplication | undefined> {
    const [firstName, lastName] = name.split(' ');
    const [contractor] = await db.select().from(contractorApplications)
      .where(
        and(
          eq(contractorApplications.firstName, firstName),
          eq(contractorApplications.lastName, lastName || '')
        )
      );
    return contractor;
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
    // If ending a session (endTime provided), calculate totalHours and money tracking
    if (updates.endTime && updates.startTime) {
      const startTime = new Date(updates.startTime);
      const endTime = new Date(updates.endTime);
      const diffMs = endTime.getTime() - startTime.getTime();
      const hoursWorked = diffMs / (1000 * 60 * 60);
      updates.totalHours = hoursWorked.toFixed(2); // Convert to hours with 2 decimal places as string
      
      console.log(`🕐 Session Summary: ${updates.totalHours}h worked`);
      console.log(`📍 GPS Distance: ${updates.endLatitude && updates.startLatitude ? 'Tracked' : 'Missing'}`);
      
    } else if (updates.endTime) {
      // If only endTime provided, get the existing session to calculate from startTime
      const existingSession = await db.select().from(workSessions).where(eq(workSessions.id, id)).limit(1);
      if (existingSession.length > 0 && existingSession[0].startTime) {
        const startTime = new Date(existingSession[0].startTime);
        const endTime = new Date(updates.endTime);
        const diffMs = endTime.getTime() - startTime.getTime();
        const hoursWorked = diffMs / (1000 * 60 * 60);
        updates.totalHours = hoursWorked.toFixed(2);
        
        console.log(`🕐 Session Complete: ${updates.totalHours}h worked`);
      }
    }

    const [session] = await db
      .update(workSessions)
      .set(updates)
      .where(eq(workSessions.id, id))
      .returning();
    return session;
  }

  // Money and GPS calculation helper method
  private calculateEarnings(startTime: Date, endTime: Date, hoursWorked: number) {
    const baseRate = 25.00; // £25/hour standard rate
    
    // Check if weekend work for overtime calculation
    const dayOfWeek = startTime.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    const overtimeMultiplier = isWeekend ? 1.5 : 1.0;
    const hourlyRate = baseRate * overtimeMultiplier;
    
    // Calculate gross earnings
    const grossEarnings = hoursWorked * hourlyRate;
    
    // Calculate punctuality deduction (£0.50/minute after 8:15 AM, max £50)
    const startHour = startTime.getHours();
    const startMinute = startTime.getMinutes();
    const clockInTime = startHour + startMinute / 60;
    const lateThreshold = 8 + 15/60; // 8:15 AM
    
    let punctualityDeduction = 0;
    if (clockInTime > lateThreshold) {
      const lateMinutes = (clockInTime - lateThreshold) * 60;
      punctualityDeduction = Math.min(lateMinutes * 0.50, 50); // Max £50 deduction
    }
    
    // Calculate CIS deduction - Default to 30% for unregistered contractors
    // TODO: Make this dynamic based on contractor's actual form data
    const cisRate = 0.30; // Dalwayne is "Not CIS Registered (30% deduction)"
    const cisDeduction = grossEarnings * cisRate;
    
    // Calculate net earnings (minimum £100 daily pay)
    const beforeMinimum = grossEarnings - punctualityDeduction - cisDeduction;
    const netEarnings = Math.max(beforeMinimum, 100); // Minimum £100 daily pay
    
    console.log(`💰 Earnings Breakdown:`);
    console.log(`   - Hours: ${hoursWorked.toFixed(2)}h at £${hourlyRate.toFixed(2)}/h${isWeekend ? ' (weekend overtime)' : ''}`);
    console.log(`   - Gross: £${grossEarnings.toFixed(2)}`);
    console.log(`   - Punctuality deduction: £${punctualityDeduction.toFixed(2)}`);
    console.log(`   - CIS deduction: £${cisDeduction.toFixed(2)}`);
    console.log(`   - Net earnings: £${netEarnings.toFixed(2)}`);
    
    return {
      hourlyRate: hourlyRate.toFixed(2),
      grossEarnings: grossEarnings.toFixed(2),
      punctualityDeduction: punctualityDeduction.toFixed(2),
      cisDeduction: cisDeduction.toFixed(2),
      netEarnings: netEarnings.toFixed(2),
      isWeekendWork: isWeekend
    };
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

  // Contractor Reports
  async createContractorReport(insertReport: InsertContractorReport): Promise<ContractorReport> {
    const [report] = await db.insert(contractorReports).values(insertReport).returning();
    console.log("📝 Created contractor report:", report.id, "by", report.contractorName);
    return report;
  }

  async getContractorReports(): Promise<ContractorReport[]> {
    return db.select().from(contractorReports).orderBy(desc(contractorReports.createdAt));
  }

  // Admin Inspections
  async createAdminInspection(insertInspection: InsertAdminInspection): Promise<AdminInspection> {
    const [inspection] = await db.insert(adminInspections).values(insertInspection).returning();
    console.log("📋 Created admin inspection:", inspection.id, "by", inspection.inspectorName);
    return inspection;
  }

  async getAdminInspections(): Promise<AdminInspection[]> {
    return db.select().from(adminInspections).orderBy(desc(adminInspections.createdAt));
  }

  async getAdminInspectionsByAssignment(assignmentId: string): Promise<AdminInspection[]> {
    return db.select().from(adminInspections)
      .where(eq(adminInspections.assignmentId, assignmentId))
      .orderBy(desc(adminInspections.createdAt));
  }

  async updateAdminInspection(id: string, updates: Partial<AdminInspection>): Promise<AdminInspection | undefined> {
    const [inspection] = await db
      .update(adminInspections)
      .set(updates)
      .where(eq(adminInspections.id, id))
      .returning();
    console.log("📋 Updated admin inspection:", id);
    return inspection;
  }

  // Inspection Notifications for milestone triggers
  async createInspectionNotification(insertNotification: InsertInspectionNotification): Promise<InspectionNotification> {
    const [notification] = await db.insert(inspectionNotifications).values(insertNotification).returning();
    console.log("🚨 Inspection notification created:", notification.notificationType, "for", notification.contractorName);
    return notification;
  }

  async getInspectionNotifications(): Promise<InspectionNotification[]> {
    return db.select().from(inspectionNotifications).orderBy(desc(inspectionNotifications.createdAt));
  }

  async getPendingInspectionNotifications(): Promise<InspectionNotification[]> {
    return db.select().from(inspectionNotifications)
      .where(and(
        eq(inspectionNotifications.inspectionCompleted, false),
        eq(inspectionNotifications.notificationSent, true)
      ))
      .orderBy(desc(inspectionNotifications.createdAt));
  }

  async completeInspectionNotification(id: string): Promise<InspectionNotification | undefined> {
    const [notification] = await db
      .update(inspectionNotifications)
      .set({ 
        inspectionCompleted: true,
        completedAt: new Date()
      })
      .where(eq(inspectionNotifications.id, id))
      .returning();
    console.log("✅ Inspection notification completed:", id);
    return notification;
  }

  // Check if inspection notification already exists for milestone
  async getInspectionNotificationByAssignmentAndType(assignmentId: string, notificationType: string): Promise<InspectionNotification | undefined> {
    const [notification] = await db.select().from(inspectionNotifications)
      .where(and(
        eq(inspectionNotifications.assignmentId, assignmentId),
        eq(inspectionNotifications.notificationType, notificationType)
      ));
    return notification;
  }

  async deleteInspectionNotification(id: string): Promise<boolean> {
    const result = await db.delete(inspectionNotifications).where(eq(inspectionNotifications.id, id));
    console.log("🗑️ Deleted inspection notification:", id, "Affected rows:", result.rowCount);
    return result.rowCount > 0;
  }

  // COMPLETE CLEANUP METHODS - Following MANDATORY RULE 1: Fix broken data persistence
  async getAllJobAssignments(): Promise<JobAssignmentRecord[]> {
    const assignments = await db.select().from(jobAssignments);
    console.log(`📋 Fetching all job assignments: ${assignments.length} found`);
    return assignments;
  }

  async deleteAllInspectionNotifications(): Promise<void> {
    const result = await db.delete(inspectionNotifications);
    console.log("🗑️ Deleted all inspection notifications - Affected rows:", result.rowCount);
  }

  async deleteAllContractorReports(): Promise<void> {
    const result = await db.delete(contractorReports);
    console.log("🗑️ Deleted all contractor reports - Affected rows:", result.rowCount);
  }

  async deleteAllAdminInspections(): Promise<void> {
    const result = await db.delete(adminInspections);
    console.log("🗑️ Deleted all admin inspections - Affected rows:", result.rowCount);
  }
}

export const storage = new DatabaseStorage();
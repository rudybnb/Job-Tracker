import { type Contractor, type InsertContractor, type Job, type InsertJob, type CsvUpload, type InsertCsvUpload, type JobWithContractor, type JobAssignment } from "@shared/schema";
import { randomUUID } from "crypto";

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
  
  // Stats
  getStats(): Promise<{
    totalJobs: number;
    pendingJobs: number;
    completedJobs: number;
    activeContractors: number;
  }>;
}

export class MemStorage implements IStorage {
  private contractors: Map<string, Contractor>;
  private jobs: Map<string, Job>;
  private csvUploads: Map<string, CsvUpload>;

  constructor() {
    this.contractors = new Map();
    this.jobs = new Map();
    this.csvUploads = new Map();
    
    // Seed with initial data
    this.seedData();
  }

  private async seedData() {
    // Create initial contractors
    const initialContractors = [
      { name: "Mike Torres", email: "mike@example.com", specialty: "General Contractor", status: "available" as const, rating: "4.8", activeJobs: "3", completedJobs: "47" },
      { name: "Sarah Lee", email: "sarah@example.com", specialty: "Electrician", status: "busy" as const, rating: "4.9", activeJobs: "2", completedJobs: "62" },
      { name: "Robert Jackson", email: "robert@example.com", specialty: "HVAC Specialist", status: "available" as const, rating: "4.7", activeJobs: "1", completedJobs: "34" },
    ];

    for (const contractor of initialContractors) {
      await this.createContractor(contractor);
    }

    // Create initial jobs
    const contractorIds = Array.from(this.contractors.keys());
    const initialJobs = [
      { title: "Kitchen Renovation - Unit 4B", location: "Downtown Plaza, Chicago", status: "assigned" as const, contractorId: contractorIds[0], dueDate: "2024-03-28", description: "Complete kitchen renovation including cabinets and appliances" },
      { title: "Plumbing Repair - Office 201", location: "Business Center, Austin", status: "pending" as const, dueDate: "2024-03-30", description: "Fix water leak in office bathroom" },
      { title: "Electrical Inspection - Warehouse", location: "Industrial District, Houston", status: "completed" as const, contractorId: contractorIds[1], dueDate: "2024-03-25", description: "Safety inspection of electrical systems" },
      { title: "HVAC Maintenance - Building A", location: "Tech Campus, Seattle", status: "assigned" as const, contractorId: contractorIds[2], dueDate: "2024-04-02", description: "Quarterly HVAC system maintenance" },
    ];

    for (const job of initialJobs) {
      await this.createJob(job);
    }
  }

  async getContractors(): Promise<Contractor[]> {
    return Array.from(this.contractors.values());
  }

  async getContractor(id: string): Promise<Contractor | undefined> {
    return this.contractors.get(id);
  }

  async createContractor(insertContractor: InsertContractor): Promise<Contractor> {
    const id = randomUUID();
    const contractor: Contractor = { 
      ...insertContractor, 
      id,
      status: insertContractor.status || "available",
      rating: insertContractor.rating || "0",
      activeJobs: insertContractor.activeJobs || "0",
      completedJobs: insertContractor.completedJobs || "0"
    };
    this.contractors.set(id, contractor);
    return contractor;
  }

  async updateContractor(id: string, updates: Partial<Contractor>): Promise<Contractor | undefined> {
    const contractor = this.contractors.get(id);
    if (!contractor) return undefined;
    
    const updated = { ...contractor, ...updates };
    this.contractors.set(id, updated);
    return updated;
  }

  async getJobs(): Promise<JobWithContractor[]> {
    const jobs = Array.from(this.jobs.values());
    return jobs.map(job => ({
      ...job,
      contractor: job.contractorId ? this.contractors.get(job.contractorId) : undefined
    }));
  }

  async getJob(id: string): Promise<JobWithContractor | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    
    return {
      ...job,
      contractor: job.contractorId ? this.contractors.get(job.contractorId) : undefined
    };
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const id = randomUUID();
    const job: Job = { 
      ...insertJob, 
      id,
      description: insertJob.description || null,
      notes: insertJob.notes || null,
      contractorId: insertJob.contractorId || null,
      uploadId: insertJob.uploadId || null,
      status: insertJob.status || "pending"
    };
    this.jobs.set(id, job);
    return job;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    
    const updated = { ...job, ...updates };
    this.jobs.set(id, updated);
    return updated;
  }

  async createJobsFromCsv(jobs: InsertJob[], uploadId: string): Promise<Job[]> {
    const createdJobs: Job[] = [];
    
    for (const jobData of jobs) {
      const job = await this.createJob({ ...jobData, uploadId });
      createdJobs.push(job);
    }
    
    return createdJobs;
  }

  async getCsvUploads(): Promise<CsvUpload[]> {
    return Array.from(this.csvUploads.values()).sort((a, b) => 
      new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
    );
  }

  async createCsvUpload(insertUpload: InsertCsvUpload): Promise<CsvUpload> {
    const id = randomUUID();
    const upload: CsvUpload = { 
      ...insertUpload, 
      id, 
      status: insertUpload.status || "processing",
      jobsCount: insertUpload.jobsCount || "0",
      uploadedAt: new Date() 
    };
    this.csvUploads.set(id, upload);
    return upload;
  }

  async updateCsvUpload(id: string, updates: Partial<CsvUpload>): Promise<CsvUpload | undefined> {
    const upload = this.csvUploads.get(id);
    if (!upload) return undefined;
    
    const updated = { ...upload, ...updates };
    this.csvUploads.set(id, updated);
    return updated;
  }

  async assignJob(assignment: JobAssignment): Promise<Job | undefined> {
    const job = this.jobs.get(assignment.jobId);
    const contractor = this.contractors.get(assignment.contractorId);
    
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

  async getStats(): Promise<{
    totalJobs: number;
    pendingJobs: number;
    completedJobs: number;
    activeContractors: number;
  }> {
    const jobs = Array.from(this.jobs.values());
    const contractors = Array.from(this.contractors.values());
    
    return {
      totalJobs: jobs.length,
      pendingJobs: jobs.filter(job => job.status === "pending").length,
      completedJobs: jobs.filter(job => job.status === "completed").length,
      activeContractors: contractors.filter(contractor => contractor.status === "available" || contractor.status === "busy").length
    };
  }
}

export const storage = new MemStorage();

import { db } from "./db";
import { workers, jobAssignments, jobs } from "@shared/schema";
import { eq, and, desc, ne, sql } from "drizzle-orm";

/**
 * Normalise UK and international phone numbers to E.164 format.
 * - UK local mobile: 07xxx xxxxxx -> +447xxxxxxxx
 * - UK international: 447xxx xxxxxx -> +447xxxxxxxx
 * - E.164 format: +...
 */
export function normalizePhoneE164(phone: string): string {
  const trimmed = (phone || "").trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("07") && digits.length === 11) {
    return `+44${digits.slice(1)}`;
  }
  if (digits.startsWith("447") && digits.length === 12) {
    return `+${digits}`;
  }
  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return trimmed;
}

export interface NewSiteData {
  readonly title: string;
  readonly address?: string | null;
  readonly townArea?: string | null;
  readonly postcode?: string | null;
}

export interface CreateWorkerInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email?: string | null;
  readonly workerType?: "DIRECT_SELF_EMPLOYED" | "AGENCY";
  readonly isActive?: boolean;
  readonly jobId?: string | null;
  readonly newSiteData?: NewSiteData | null;
}

export interface UpdateWorkerInput {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly email?: string | null;
  readonly workerType?: "DIRECT_SELF_EMPLOYED" | "AGENCY";
  readonly isActive?: boolean;
  readonly jobId?: string | null;
  readonly newSiteData?: NewSiteData | null;
}

export interface WorkerWithAssignment {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly workerType: string;
  readonly isActive: boolean;
  readonly contractorId: string | null;
  readonly contractorApplicationId: string | null;
  readonly createdAt: Date | string | null;
  readonly updatedAt: Date | string | null;
  readonly assignedJobId?: string | null;
  readonly assignedJobTitle?: string | null;
  readonly assignedJobLocation?: string | null;
}

export class WorkerService {
  /**
   * Create a new Site/Job record using the existing canonical `jobs` table.
   * Compatible with site QR/GPS configurations (references jobs.id).
   */
  async createSiteJob(siteData: NewSiteData): Promise<{ id: string; title: string; location: string }> {
    const title = (siteData.title || "").trim();
    if (!title) {
      throw new Error("Site / Job name is required");
    }

    const address = (siteData.address || "").trim();
    const townArea = (siteData.townArea || "").trim();
    const postcode = (siteData.postcode || "").trim();

    const locationParts = [address, townArea, postcode].filter(Boolean);
    const location = locationParts.length > 0 ? locationParts.join(", ") : title;
    const dueDate = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

    const [createdJob] = await db
      .insert(jobs)
      .values({
        title,
        address: address || title,
        location,
        postcode: postcode || null,
        dueDate,
        status: "assigned",
      })
      .returning();

    return {
      id: createdJob.id,
      title: createdJob.title,
      location: createdJob.location,
    };
  }

  /**
   * List all workers with their active site/job assignments.
   */
  async listWorkers(): Promise<WorkerWithAssignment[]> {
    const workerRows = await db
      .select()
      .from(workers)
      .orderBy(desc(workers.createdAt));

    const assignments = await db
      .select()
      .from(jobAssignments)
      .orderBy(desc(jobAssignments.createdAt));

    const jobsList = await db.select().from(jobs);
    const jobsById = new Map(jobsList.map((j) => [j.id, j]));

    return workerRows.map((w) => {
      const fullName = `${w.firstName} ${w.lastName}`.trim();
      const normPhone = w.phone ? normalizePhoneE164(w.phone) : "";

      // Find matching active assignment by phone or name
      const assignment = assignments.find((a) => {
        if (normPhone && a.phone && normalizePhoneE164(a.phone) === normPhone) {
          return true;
        }
        return a.contractorName.toLowerCase() === fullName.toLowerCase();
      });

      let assignedJobId: string | null = null;
      let assignedJobTitle: string | null = null;
      let assignedJobLocation: string | null = null;

      if (assignment) {
        assignedJobId = assignment.jobId ?? null;
        if (assignedJobId && jobsById.has(assignedJobId)) {
          const matchedJob = jobsById.get(assignedJobId)!;
          assignedJobTitle = matchedJob.title;
          assignedJobLocation = matchedJob.location || matchedJob.address || null;
        } else {
          assignedJobTitle = assignment.hbxlJob || "Assigned Site";
          assignedJobLocation = assignment.workLocation || null;
        }
      }

      return {
        id: w.id,
        firstName: w.firstName,
        lastName: w.lastName,
        fullName,
        phone: w.phone,
        email: w.email,
        workerType: w.workerType,
        isActive: w.isActive,
        contractorId: w.contractorId,
        contractorApplicationId: w.contractorApplicationId,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        assignedJobId,
        assignedJobTitle,
        assignedJobLocation,
      };
    });
  }

  /**
   * Get a single worker by ID.
   */
  async getWorkerById(id: string): Promise<WorkerWithAssignment | null> {
    const list = await this.listWorkers();
    return list.find((w) => w.id === id) ?? null;
  }

  /**
   * Create a new worker record using the canonical `workers` table.
   * Enforces mobile number normalisation & duplicate protection.
   */
  async createWorker(input: CreateWorkerInput): Promise<WorkerWithAssignment> {
    const firstName = (input.firstName || "").trim();
    const lastName = (input.lastName || "").trim();
    if (!firstName || !lastName) {
      throw new Error("First name and last name are required");
    }

    const rawPhone = (input.phone || "").trim();
    if (!rawPhone) {
      throw new Error("Mobile number is required");
    }

    const normalizedPhone = normalizePhoneE164(rawPhone);

    // Duplicate protection check
    const existingWorkers = await db.select().from(workers);
    const duplicate = existingWorkers.find((w) => {
      if (!w.phone) return false;
      return normalizePhoneE164(w.phone) === normalizedPhone;
    });

    if (duplicate) {
      const err = new Error(`A worker with mobile number ${rawPhone} (${normalizedPhone}) already exists`);
      (err as any).code = "DUPLICATE_MOBILE";
      throw err;
    }

    let targetJobId = input.jobId ?? null;

    // Handle inline new site creation
    if ((targetJobId === "NEW_SITE" || !targetJobId) && input.newSiteData && input.newSiteData.title) {
      const newJob = await this.createSiteJob(input.newSiteData);
      targetJobId = newJob.id;
    }

    const [newWorker] = await db
      .insert(workers)
      .values({
        firstName,
        lastName,
        phone: normalizedPhone,
        email: input.email?.trim() || null,
        workerType: input.workerType ?? "DIRECT_SELF_EMPLOYED",
        isActive: input.isActive ?? true,
      })
      .returning();

    // Optionally assign to job site if targetJobId provided
    if (targetJobId && targetJobId !== "NEW_SITE") {
      await this.assignWorkerToJob(newWorker.id, `${firstName} ${lastName}`, normalizedPhone, targetJobId);
    }

    const created = await this.getWorkerById(newWorker.id);
    return created!;
  }

  /**
   * Update an existing worker record.
   */
  async updateWorker(id: string, input: UpdateWorkerInput): Promise<WorkerWithAssignment> {
    const [existing] = await db.select().from(workers).where(eq(workers.id, id));
    if (!existing) {
      throw new Error("Worker not found");
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.firstName !== undefined) {
      const fn = input.firstName.trim();
      if (!fn) throw new Error("First name cannot be empty");
      updates.firstName = fn;
    }

    if (input.lastName !== undefined) {
      const ln = input.lastName.trim();
      if (!ln) throw new Error("Last name cannot be empty");
      updates.lastName = ln;
    }

    if (input.phone !== undefined) {
      const rawPhone = input.phone.trim();
      if (!rawPhone) throw new Error("Mobile number cannot be empty");
      const normPhone = normalizePhoneE164(rawPhone);

      // Duplicate check among OTHER workers
      const allWorkers = await db.select().from(workers).where(ne(workers.id, id));
      const duplicate = allWorkers.find((w) => {
        if (!w.phone) return false;
        return normalizePhoneE164(w.phone) === normPhone;
      });

      if (duplicate) {
        const err = new Error(`Another worker with mobile number ${rawPhone} (${normPhone}) already exists`);
        (err as any).code = "DUPLICATE_MOBILE";
        throw err;
      }

      updates.phone = normPhone;
    }

    if (input.email !== undefined) {
      updates.email = input.email?.trim() || null;
    }

    if (input.workerType !== undefined) {
      updates.workerType = input.workerType;
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    let targetJobId = input.jobId;
    if (targetJobId === "NEW_SITE" && input.newSiteData && input.newSiteData.title) {
      const newJob = await this.createSiteJob(input.newSiteData);
      targetJobId = newJob.id;
    }

    await db.update(workers).set(updates).where(eq(workers.id, id));

    const updatedWorker = await this.getWorkerById(id);

    // Handle job site assignment update if provided
    if (targetJobId !== undefined && updatedWorker) {
      if (targetJobId && targetJobId !== "NEW_SITE") {
        await this.assignWorkerToJob(id, updatedWorker.fullName, updatedWorker.phone ?? "", targetJobId);
      } else if (!targetJobId) {
        // Unassign from current job assignment if null/empty
        await this.unassignWorkerFromJobs(updatedWorker.fullName, updatedWorker.phone);
      }
    }

    const result = await this.getWorkerById(id);
    return result!;
  }

  /**
   * Helper: Associate a worker with a job via existing `jobAssignments` table structure.
   */
  private async assignWorkerToJob(
    workerId: string,
    workerFullName: string,
    phone: string,
    jobId: string,
  ): Promise<void> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) return;

    const normPhone = normalizePhoneE164(phone);
    const existingAssignments = await db.select().from(jobAssignments);
    
    // Find existing assignment for worker
    const existing = existingAssignments.find((a) => {
      if (normPhone && a.phone && normalizePhoneE164(a.phone) === normPhone) return true;
      return a.contractorName.toLowerCase() === workerFullName.toLowerCase();
    });

    const location = job.location || job.address || job.title;

    if (existing) {
      await db
        .update(jobAssignments)
        .set({
          jobId,
          contractorName: workerFullName,
          phone: phone || existing.phone,
          workLocation: location,
          hbxlJob: job.title,
          status: "assigned",
          updatedAt: new Date(),
        })
        .where(eq(jobAssignments.id, existing.id));
    } else {
      await db.insert(jobAssignments).values({
        contractorName: workerFullName,
        email: `${workerFullName.toLowerCase().replace(/\s+/g, ".")}@sculptprojects.co.uk`,
        phone: phone || "07000000000",
        workLocation: location,
        hbxlJob: job.title,
        buildPhases: ["Site Work"],
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0],
        status: "assigned",
        jobId,
      });
    }
  }

  private async unassignWorkerFromJobs(fullName: string, phone: string | null): Promise<void> {
    const normPhone = phone ? normalizePhoneE164(phone) : "";
    const assignments = await db.select().from(jobAssignments);

    for (const a of assignments) {
      const matchPhone = normPhone && a.phone && normalizePhoneE164(a.phone) === normPhone;
      const matchName = a.contractorName.toLowerCase() === fullName.toLowerCase();
      if (matchPhone || matchName) {
        await db.delete(jobAssignments).where(eq(jobAssignments.id, a.id));
      }
    }
  }
}

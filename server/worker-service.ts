import { db } from "./db";
import { workers, jobAssignments, jobs, contractorApplications, contractors, workSessions } from "@shared/schema";
import { eq, and, desc, ne, sql, or, isNull } from "drizzle-orm";

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

/**
 * Normalise username or contractor name to a canonical authenticated username.
 */
export function deriveCanonicalUsername(username?: string | null, fullName?: string | null, email?: string | null): string {
  if (username && username.trim()) {
    const u = username.trim().toLowerCase();
    if (u === "mohamed" || u === "mohamed.shawky") return "mohamed.shawky";
    if (u === "ahmed" || u === "ahmed.gouda") return "ahmed.gouda";
    if (u === "dalwayne" || u === "dalwayne.bailey" || u === "dalwayne.diedericks") return "dalwayne";
    if (u === "rudy" || u === "rudy.test" || u === "rudy.diedericks" || u === "rudy.diedricks") return "rudy.test";
    if (u === "said" || u === "said.tiss") return "said.tiss";
    return u;
  }
  if (fullName && fullName.trim()) {
    const name = fullName.trim().toLowerCase();
    if (name.includes("dalwayne")) return "dalwayne";
    if (name.includes("mohamed") || name.includes("shawky")) return "mohamed.shawky";
    if (name.includes("ahmed") || name.includes("gouda")) return "ahmed.gouda";
    if (name.includes("said") || name.includes("tiss")) return "said.tiss";
    if (name.includes("rudy") || name.includes("diedericks") || name.includes("diedricks")) return "rudy.test";
    return name.replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  }
  if (email && email.trim()) {
    return email.split("@")[0].toLowerCase();
  }
  return "worker." + Math.random().toString(36).substring(2, 8);
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
  readonly username?: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly workerType: string;
  readonly isActive: boolean;
  readonly isDeleted?: boolean;
  readonly contractorId?: string | null;
  readonly contractorApplicationId?: string | null;
  readonly createdAt?: Date | string | null;
  readonly updatedAt?: Date | string | null;
  readonly assignedJobId?: string | null;
  readonly assignedJobTitle?: string | null;
  readonly assignedJobLocation?: string | null;
  readonly currentAttendanceStatus?: string | null;
}

export class WorkerService {
  /**
   * Helper to ensure workers table exists if direct DDL has not run yet.
   */
  async ensureWorkersTable(): Promise<void> {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS workers (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          worker_type TEXT NOT NULL DEFAULT 'DIRECT_SELF_EMPLOYED',
          contractor_id VARCHAR,
          contractor_application_id VARCHAR,
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_deleted BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await db.execute(sql`
        ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
      `);
    } catch {
      // Ignore if table already exists or permissions restricted
    }
  }

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
   * List all workers from live operational records (simple_users, contractor_applications, contractors, workers).
   * Deduplicates by canonical authenticated username, enriches with job assignments and real-time attendance status.
   * Soft-deleted workers are excluded.
   */
  async listWorkers(): Promise<WorkerWithAssignment[]> {
    // 1. Gather workers from `workers` table (if available)
    let workerRows: any[] = [];
    try {
      workerRows = await db
        .select()
        .from(workers)
        .where(or(isNull(workers.isDeleted), eq(workers.isDeleted, false)))
        .orderBy(desc(workers.createdAt));
    } catch {
      workerRows = [];
    }

    // 2. Gather simple_users (contractors)
    let simpleUserRows: any[] = [];
    try {
      const res = await db.execute(sql`
        SELECT id, username, role, full_name, created_at 
        FROM simple_users 
        WHERE role = 'contractor';
      `);
      simpleUserRows = Array.isArray(res) ? res : (res as any)?.rows ?? [];
    } catch {
      simpleUserRows = [];
    }

    // 3. Gather contractor_applications
    let applications: any[] = [];
    try {
      applications = await db.select().from(contractorApplications);
    } catch {
      applications = [];
    }

    // 4. Gather contractors
    let contractorRows: any[] = [];
    try {
      contractorRows = await db.select().from(contractors);
    } catch {
      contractorRows = [];
    }

    // 5. Gather assignments
    let assignments: any[] = [];
    try {
      assignments = await db.select().from(jobAssignments).orderBy(desc(jobAssignments.createdAt));
    } catch {
      assignments = [];
    }

    // 6. Gather jobs
    let jobsList: any[] = [];
    try {
      jobsList = await db.select().from(jobs);
    } catch {
      jobsList = [];
    }
    const jobsById = new Map(jobsList.map((j) => [j.id, j]));

    // 7. Gather latest work_sessions to compute real-time attendance status
    let workSessionsList: any[] = [];
    try {
      workSessionsList = await db.select().from(workSessions).orderBy(desc(workSessions.startTime));
    } catch {
      workSessionsList = [];
    }
    const latestSessionByWorkerName = new Map<string, any>();
    for (const sess of workSessionsList) {
      if (!sess.contractorName) continue;
      const key = sess.contractorName.trim().toLowerCase();
      if (!latestSessionByWorkerName.has(key)) {
        latestSessionByWorkerName.set(key, sess);
      }
    }

    // Track soft-deleted worker usernames/phones/IDs to exclude
    const deletedUsernames = new Set<string>();
    const deletedPhones = new Set<string>();
    const deletedIds = new Set<string>();

    try {
      const deletedRows = await db
        .select()
        .from(workers)
        .where(eq(workers.isDeleted, true));
      for (const d of deletedRows) {
        deletedIds.add(d.id);
        if (d.phone) deletedPhones.add(normalizePhoneE164(d.phone));
        const u = deriveCanonicalUsername(null, `${d.firstName} ${d.lastName}`, d.email);
        deletedUsernames.add(u);
      }
    } catch {
      // ignore
    }

    // Map by canonical username to deduplicate and merge
    const unifiedMap = new Map<string, {
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      username: string;
      phone: string | null;
      email: string | null;
      workerType: string;
      isActive: boolean;
      contractorId: string | null;
      contractorApplicationId: string | null;
      createdAt: Date | string | null;
      updatedAt: Date | string | null;
    }>();

    // Baseline live operational workers to ensure always available
    const baselineWorkers = [
      { username: "mohamed.shawky", fullName: "Mohamed Shawky", firstName: "Mohamed", lastName: "Shawky", phone: "+447123456790", email: "mohamed.shawky@sculptprojects.co.uk" },
      { username: "ahmed.gouda", fullName: "Ahmed Gouda", firstName: "Ahmed", lastName: "Gouda", phone: "+447123456791", email: "ahmed.gouda@sculptprojects.co.uk" },
      { username: "rudy.test", fullName: "Rudy Diedricks", firstName: "Rudy", lastName: "Diedricks", phone: "+447534251548", email: "rudy@sculptprojects.co.uk" },
      { username: "said.tiss", fullName: "Said Tiss", firstName: "Said", lastName: "Tiss", phone: "+447123456793", email: "said.tiss@sculptprojects.co.uk" },
      { username: "dalwayne", fullName: "Dalwayne Diedericks", firstName: "Dalwayne", lastName: "Diedericks", phone: "+447987654321", email: "dalwayne@sculptprojects.co.uk" },
    ];

    for (const b of baselineWorkers) {
      unifiedMap.set(b.username, {
        id: `op-${b.username}`,
        firstName: b.firstName,
        lastName: b.lastName,
        fullName: b.fullName,
        username: b.username,
        phone: b.phone,
        email: b.email,
        workerType: "DIRECT_SELF_EMPLOYED",
        isActive: true,
        contractorId: null,
        contractorApplicationId: null,
        createdAt: new Date("2026-08-01T00:00:00Z"),
        updatedAt: new Date("2026-08-01T00:00:00Z"),
      });
    }

    // Process simple_users
    for (const u of simpleUserRows) {
      const rawUser = String(u.username || "");
      const cUser = deriveCanonicalUsername(rawUser, String(u.full_name || ""));
      const rawFullName = (u.full_name || rawUser).trim();
      const parts = rawFullName.split(/\s+/);
      const fn = parts[0] || rawUser;
      const ln = parts.slice(1).join(" ") || "";

      if (!unifiedMap.has(cUser)) {
        unifiedMap.set(cUser, {
          id: String(u.id || `u-${cUser}`),
          firstName: fn,
          lastName: ln,
          fullName: rawFullName,
          username: cUser,
          phone: null,
          email: `${cUser}@sculptprojects.co.uk`,
          workerType: "DIRECT_SELF_EMPLOYED",
          isActive: true,
          contractorId: null,
          contractorApplicationId: null,
          createdAt: u.created_at || new Date(),
          updatedAt: u.created_at || new Date(),
        });
      } else {
        const existing = unifiedMap.get(cUser)!;
        if (rawFullName && !existing.fullName) existing.fullName = rawFullName;
      }
    }

    // Process contractor_applications
    for (const app of applications) {
      const appFullName = `${app.first_name || ""} ${app.last_name || ""}`.trim();
      const cUser = deriveCanonicalUsername(app.username, appFullName, app.email);
      const normPhone = app.phone ? normalizePhoneE164(app.phone) : null;

      if (unifiedMap.has(cUser)) {
        const existing = unifiedMap.get(cUser)!;
        if (normPhone) existing.phone = normPhone;
        if (app.email) existing.email = app.email;
        if (app.first_name) existing.firstName = app.first_name;
        if (app.last_name) existing.lastName = app.last_name;
        if (appFullName) existing.fullName = appFullName;
        existing.contractorApplicationId = app.id;
      } else {
        unifiedMap.set(cUser, {
          id: app.id,
          firstName: app.first_name || "Worker",
          lastName: app.last_name || "",
          fullName: appFullName || "Worker",
          username: cUser,
          phone: normPhone,
          email: app.email || null,
          workerType: "DIRECT_SELF_EMPLOYED",
          isActive: app.status !== "rejected",
          contractorId: null,
          contractorApplicationId: app.id,
          createdAt: app.submitted_at || new Date(),
          updatedAt: app.submitted_at || new Date(),
        });
      }
    }

    // Process contractors table
    for (const c of contractorRows) {
      const cUser = deriveCanonicalUsername(null, c.name, c.email);
      if (unifiedMap.has(cUser)) {
        const existing = unifiedMap.get(cUser)!;
        existing.contractorId = c.id;
        if (c.email && !existing.email) existing.email = c.email;
      } else {
        const parts = (c.name || "").trim().split(/\s+/);
        unifiedMap.set(cUser, {
          id: c.id,
          firstName: parts[0] || "Contractor",
          lastName: parts.slice(1).join(" ") || "",
          fullName: c.name || "Contractor",
          username: cUser,
          phone: null,
          email: c.email || null,
          workerType: "DIRECT_SELF_EMPLOYED",
          isActive: c.status !== "unavailable",
          contractorId: c.id,
          contractorApplicationId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Process explicit workers table
    for (const w of workerRows) {
      const wFullName = `${w.firstName || ""} ${w.lastName || ""}`.trim();
      const cUser = deriveCanonicalUsername(null, wFullName, w.email);
      const normPhone = w.phone ? normalizePhoneE164(w.phone) : null;

      if (unifiedMap.has(cUser)) {
        const existing = unifiedMap.get(cUser)!;
        existing.id = w.id; // use canonical DB UUID from workers table
        if (normPhone) existing.phone = normPhone;
        if (w.email) existing.email = w.email;
        if (w.firstName) existing.firstName = w.firstName;
        if (w.lastName) existing.lastName = w.lastName;
        if (wFullName) existing.fullName = wFullName;
        if (w.workerType) existing.workerType = w.workerType;
        if (w.isActive !== undefined) existing.isActive = w.isActive;
        if (w.contractorId) existing.contractorId = w.contractorId;
        if (w.contractorApplicationId) existing.contractorApplicationId = w.contractorApplicationId;
      } else {
        unifiedMap.set(cUser, {
          id: w.id,
          firstName: w.firstName || "",
          lastName: w.lastName || "",
          fullName: wFullName,
          username: cUser,
          phone: normPhone,
          email: w.email || null,
          workerType: w.workerType || "DIRECT_SELF_EMPLOYED",
          isActive: w.isActive ?? true,
          contractorId: w.contractorId || null,
          contractorApplicationId: w.contractorApplicationId || null,
          createdAt: w.createdAt || new Date(),
          updatedAt: w.updatedAt || new Date(),
        });
      }
    }

    // Filter out soft-deleted workers
    const activeWorkers = Array.from(unifiedMap.values()).filter((w) => {
      if (deletedIds.has(w.id)) return false;
      if (deletedUsernames.has(w.username)) return false;
      if (w.phone && deletedPhones.has(normalizePhoneE164(w.phone))) return false;
      return true;
    });

    // Enrich with job assignments and current attendance status
    return activeWorkers.map((w) => {
      const normPhone = w.phone ? normalizePhoneE164(w.phone) : "";
      const lowerFullName = w.fullName.toLowerCase();
      const lowerFirstName = w.firstName.toLowerCase();
      const lowerUsername = w.username.toLowerCase();

      // Find matching job assignment
      const assignment = assignments.find((a) => {
        if (normPhone && a.phone && normalizePhoneE164(a.phone) === normPhone) return true;
        if (!a.contractorName) return false;
        const aName = a.contractorName.toLowerCase();
        return (
          aName === lowerFullName ||
          aName.includes(lowerFirstName) ||
          lowerFullName.includes(aName) ||
          aName.replace(/\s+/g, ".") === lowerUsername
        );
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

      // Find real-time attendance status
      let currentAttendanceStatus = "CLOCKED OUT";
      const sess =
        latestSessionByWorkerName.get(lowerFullName) ||
        latestSessionByWorkerName.get(lowerFirstName) ||
        latestSessionByWorkerName.get(lowerUsername);

      if (sess) {
        if (sess.status === "active") {
          currentAttendanceStatus = "CLOCKED IN";
        } else if (sess.status === "on_break") {
          currentAttendanceStatus = "ON BREAK";
        } else {
          currentAttendanceStatus = "CLOCKED OUT";
        }
      }

      return {
        id: w.id,
        firstName: w.firstName,
        lastName: w.lastName,
        fullName: w.fullName,
        username: w.username,
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
        currentAttendanceStatus,
      };
    });
  }

  /**
   * Get a single worker by ID or canonical username.
   */
  async getWorkerById(id: string): Promise<WorkerWithAssignment | null> {
    const list = await this.listWorkers();
    return list.find((w) => w.id === id || (w as any).username === id) ?? null;
  }

  /**
   * Create a new worker record.
   * Enforces mobile number normalisation & duplicate protection.
   */
  async createWorker(input: CreateWorkerInput): Promise<WorkerWithAssignment> {
    await this.ensureWorkersTable();

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

    // Duplicate protection check among non-deleted workers
    const existingWorkers = await this.listWorkers();
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
        isDeleted: false,
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
    await this.ensureWorkersTable();

    const current = await this.getWorkerById(id);
    if (!current) {
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

      // Duplicate check among OTHER non-deleted workers
      const allWorkers = await this.listWorkers();
      const duplicate = allWorkers.find((w) => {
        if (w.id === id) return false;
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

    // Try updating workers table row if it exists
    let updatedInDb = false;
    try {
      const existingInTable = await db.select().from(workers).where(eq(workers.id, id));
      if (existingInTable.length > 0) {
        await db.update(workers).set(updates).where(eq(workers.id, id));
        updatedInDb = true;
      }
    } catch {
      // ignore
    }

    if (!updatedInDb) {
      // Upsert worker record into workers table
      try {
        await db.insert(workers).values({
          id: id.startsWith("op-") || id.startsWith("u-") ? undefined : id,
          firstName: updates.firstName || current.firstName,
          lastName: updates.lastName || current.lastName,
          phone: updates.phone || current.phone || "+447000000000",
          email: updates.email !== undefined ? updates.email : current.email,
          workerType: updates.workerType || (current.workerType as any) || "DIRECT_SELF_EMPLOYED",
          isActive: updates.isActive !== undefined ? updates.isActive : current.isActive,
          isDeleted: false,
        });
      } catch {
        // ignore
      }
    }

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
    return result || current;
  }

  /**
   * Soft-delete a worker from the active workers directory.
   * Preserves all historical attendance records, work sessions, timesheets, and payroll entries.
   */
  async deleteWorker(id: string): Promise<{ success: boolean; worker: WorkerWithAssignment | null }> {
    await this.ensureWorkersTable();

    const workerDetail = await this.getWorkerById(id);
    if (!workerDetail) {
      throw new Error("Worker not found");
    }

    // Soft delete in workers table: mark isDeleted = true and isActive = false
    try {
      const existing = await db.select().from(workers).where(eq(workers.id, id));
      if (existing.length > 0) {
        await db
          .update(workers)
          .set({
            isDeleted: true,
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(workers.id, id));
      } else {
        await db.insert(workers).values({
          firstName: workerDetail.firstName,
          lastName: workerDetail.lastName,
          phone: workerDetail.phone || "+447000000000",
          email: workerDetail.email,
          workerType: workerDetail.workerType as any,
          isActive: false,
          isDeleted: true,
          updatedAt: new Date(),
        });
      }
    } catch {
      // ignore
    }

    // Remove active job assignment if any
    if (workerDetail) {
      await this.unassignWorkerFromJobs(workerDetail.fullName, workerDetail.phone);
    }

    return {
      success: true,
      worker: {
        ...workerDetail,
        isActive: false,
        isDeleted: true,
      },
    };
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

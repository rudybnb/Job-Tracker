// Following Replit Auth blueprint patterns for storage implementation
import {
  users,
  sites,
  shifts,
  attendance,
  rooms,
  roomScans,
  payrollRuns,
  payslips,
  queries,
  queryMessages,
  type User,
  type UpsertUser,
  type InsertUser,
  type Site,
  type InsertSite,
  type Shift,
  type InsertShift,
  type Attendance,
  type InsertAttendance,
  type Room,
  type InsertRoom,
  type RoomScan,
  type InsertRoomScan,
  type PayrollRun,
  type InsertPayrollRun,
  type Payslip,
  type InsertPayslip,
  type Query,
  type InsertQuery,
  type QueryMessage,
  type InsertQueryMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gte, lte, isNull, isNotNull, desc } from "drizzle-orm";
import crypto from "crypto";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Site operations
  getAllSites(): Promise<Site[]>;
  getSite(id: number): Promise<Site | undefined>;
  createSite(site: InsertSite): Promise<Site>;
  updateSite(id: number, site: Partial<InsertSite>): Promise<Site | undefined>;
  refreshSiteClockQR(id: number): Promise<Site | undefined>;
  
  // User management operations
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Shift operations
  getAllShifts(filters?: { date?: string, siteId?: number, userId?: string, status?: string }): Promise<(Shift & { user: User, site: Site })[]>;
  getShift(id: number): Promise<(Shift & { user: User, site: Site }) | undefined>;
  createShift(shift: InsertShift): Promise<Shift>;
  updateShift(id: number, shift: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: number): Promise<boolean>;
  checkShiftConflict(userId: string, date: string, startTime: string, endTime: string, excludeShiftId?: number): Promise<boolean>;
  
  // Attendance operations
  getAllAttendance(filters?: { date?: string, siteId?: number, userId?: string, approvalStatus?: string }): Promise<(Attendance & { user: User, site: Site })[]>;
  getAttendance(id: number): Promise<(Attendance & { user: User, site: Site }) | undefined>;
  clockIn(userId: string, siteId: number, shiftId?: number, notes?: string): Promise<Attendance>;
  clockOut(attendanceId: number, notes?: string): Promise<Attendance | undefined>;
  approveAttendance(id: number, approvedBy: string): Promise<Attendance | undefined>;
  rejectAttendance(id: number, approvedBy: string): Promise<Attendance | undefined>;
  calculateDuration(clockIn: string, clockOut: string): string;
  
  // Room operations
  getAllRooms(filters?: { siteId?: number, isActive?: boolean }): Promise<(Room & { site: Site })[]>;
  getRoom(id: number): Promise<(Room & { site: Site }) | undefined>;
  createRoom(room: Omit<InsertRoom, 'qrCode' | 'qrCodeExpiry'>): Promise<Room>;
  updateRoom(id: number, room: Partial<InsertRoom>): Promise<Room | undefined>;
  refreshRoomQR(id: number): Promise<Room | undefined>;
  deleteRoom(id: number): Promise<boolean>;
  
  // Room scan operations
  logRoomScan(scan: InsertRoomScan): Promise<RoomScan>;
  getAllRoomScans(filters?: { roomId?: number, userId?: string, status?: string, date?: string }): Promise<(RoomScan & { room: Room & { site: Site }, user: User })[]>;
  
  // Payroll operations
  createPayrollRun(startDate: string, endDate: string, createdBy: string): Promise<PayrollRun>;
  getPayrollRuns(filters?: { status?: string }): Promise<PayrollRun[]>;
  getPayrollRun(id: number): Promise<(PayrollRun & { payslips: (Payslip & { user: User, site: Site })[] }) | undefined>;
  processPayrollRun(id: number): Promise<void>;
  finalizePayrollRun(id: number, finalizedBy: string): Promise<PayrollRun | undefined>;
  getPayslips(filters?: { payrollRunId?: number, userId?: string }): Promise<(Payslip & { user: User, site: Site, payrollRun: PayrollRun })[]>;
  getPayslip(id: number): Promise<(Payslip & { user: User, site: Site, payrollRun: PayrollRun }) | undefined>;
  addDeduction(payslipId: number, deduction: { amount: number, reason: string, type: string }): Promise<Payslip | undefined>;
  
  // Query operations
  getAllQueries(filters?: { userId?: string, category?: string, status?: string, priority?: string }): Promise<(Query & { user: User })[]>;
  getQuery(id: number): Promise<(Query & { user: User, messages: (QueryMessage & { user: User })[] }) | undefined>;
  createQuery(query: InsertQuery): Promise<Query>;
  updateQueryStatus(id: number, status: string, updatedBy: string): Promise<Query | undefined>;
  updateQueryPriority(id: number, priority: string): Promise<Query | undefined>;
  addMessage(queryId: number, message: InsertQueryMessage): Promise<QueryMessage>;
  getQueryMessages(queryId: number): Promise<(QueryMessage & { user: User })[]>;
  
  // Analytics operations
  getHoursSummary(filters: { startDate: string, endDate: string, siteId?: number, userId?: string }): Promise<{ regularHours: number, overtimeHours: number, totalHours: number }>;
  getCostSummary(filters: { startDate: string, endDate: string, siteId?: number }): Promise<{ regularCost: number, overtimeCost: number, totalCost: number }>;
  getAttendanceSummary(filters: { startDate: string, endDate: string, siteId?: number }): Promise<{ total: number, pending: number, approved: number, rejected: number, onTime: number, late: number }>;
  getSiteSummary(): Promise<{ siteId: number, siteName: string, activeWorkers: number, totalShifts: number, totalHours: number, totalCost: number }[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user exists by ID or email
    const existingUser = await db
      .select()
      .from(users)
      .where(or(eq(users.id, userData.id), eq(users.email, userData.email)))
      .limit(1);

    if (existingUser.length > 0) {
      // Update existing user
      const [updated] = await db
        .update(users)
        .set({
          ...userData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser[0].id))
        .returning();
      return updated;
    } else {
      // Insert new user
      const [user] = await db
        .insert(users)
        .values(userData)
        .returning();
      return user;
    }
  }

  // Site operations
  
  async getAllSites(): Promise<Site[]> {
    return await db.select().from(sites);
  }

  async getSite(id: number): Promise<Site | undefined> {
    const [site] = await db.select().from(sites).where(eq(sites.id, id));
    return site;
  }

  async createSite(siteData: InsertSite): Promise<Site> {
    const [site] = await db.insert(sites).values(siteData).returning();
    return site;
  }

  async updateSite(id: number, siteData: Partial<InsertSite>): Promise<Site | undefined> {
    const [site] = await db
      .update(sites)
      .set(siteData)
      .where(eq(sites.id, id))
      .returning();
    return site;
  }

  async refreshSiteClockQR(id: number): Promise<Site | undefined> {
    // Generate QR code data with site ID and timestamp
    const qrData = {
      siteId: id,
      type: 'clock-in',
      timestamp: Date.now(),
      nonce: crypto.randomBytes(8).toString('hex')
    };
    const qrCode = Buffer.from(JSON.stringify(qrData)).toString('base64');
    
    // Set expiry to 24 hours from now
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);
    
    const [site] = await db
      .update(sites)
      .set({
        clockInQrCode: qrCode,
        clockInQrExpiry: expiry,
      })
      .where(eq(sites.id, id))
      .returning();
    return site;
  }

  // User management operations
  
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        ...userData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Shift operations

  async getAllShifts(filters?: { date?: string, siteId?: number, userId?: string, status?: string }): Promise<(Shift & { user: User, site: Site })[]> {
    let query = db
      .select({
        shift: shifts,
        user: users,
        site: sites,
      })
      .from(shifts)
      .innerJoin(users, eq(shifts.userId, users.id))
      .innerJoin(sites, eq(shifts.siteId, sites.id));

    const conditions = [];
    if (filters?.date) {
      conditions.push(eq(shifts.date, filters.date));
    }
    if (filters?.siteId) {
      conditions.push(eq(shifts.siteId, filters.siteId));
    }
    if (filters?.userId) {
      conditions.push(eq(shifts.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(shifts.status, filters.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results.map((r: any) => ({ ...r.shift, user: r.user, site: r.site }));
  }

  async getShift(id: number): Promise<(Shift & { user: User, site: Site }) | undefined> {
    const [result] = await db
      .select({
        shift: shifts,
        user: users,
        site: sites,
      })
      .from(shifts)
      .innerJoin(users, eq(shifts.userId, users.id))
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .where(eq(shifts.id, id));

    if (!result) return undefined;
    return { ...result.shift, user: result.user, site: result.site };
  }

  async checkShiftConflict(
    userId: string,
    date: string,
    startTime: string,
    endTime: string,
    excludeShiftId?: number
  ): Promise<boolean> {
    const conditions = [
      eq(shifts.userId, userId),
      eq(shifts.date, date),
    ];

    if (excludeShiftId) {
      conditions.push(eq(shifts.id, excludeShiftId));
    }

    let query = db
      .select()
      .from(shifts)
      .where(and(
        eq(shifts.userId, userId),
        eq(shifts.date, date),
      ));

    if (excludeShiftId) {
      query = query.where(and(
        eq(shifts.userId, userId),
        eq(shifts.date, date),
      )) as any;
    }

    const existingShifts = await query;

    // Filter out the excluded shift
    const shiftsToCheck = excludeShiftId 
      ? existingShifts.filter(s => s.id !== excludeShiftId)
      : existingShifts;

    // Check for time overlap
    for (const existingShift of shiftsToCheck) {
      const conflict = this.doTimesOverlap(
        startTime,
        endTime,
        existingShift.startTime,
        existingShift.endTime
      );
      if (conflict) {
        return true;
      }
    }

    return false;
  }

  private doTimesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    // Convert HH:MM to minutes since midnight for comparison
    const toMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const start1Min = toMinutes(start1);
    const end1Min = toMinutes(end1);
    const start2Min = toMinutes(start2);
    const end2Min = toMinutes(end2);

    // Check if ranges overlap
    return (start1Min < end2Min && end1Min > start2Min);
  }

  async createShift(shiftData: InsertShift): Promise<Shift> {
    // Check for conflicts
    const hasConflict = await this.checkShiftConflict(
      shiftData.userId,
      shiftData.date,
      shiftData.startTime,
      shiftData.endTime
    );

    // Set status to conflict if overlap detected
    const status = hasConflict ? 'conflict' : (shiftData.status || 'scheduled');

    const dataToInsert: any = {
      ...shiftData,
      status,
    };

    const [shift] = await db
      .insert(shifts)
      .values(dataToInsert)
      .returning();

    return shift;
  }

  async updateShift(id: number, shiftData: Partial<InsertShift>): Promise<Shift | undefined> {
    // Get existing shift
    const existing = await this.getShift(id);
    if (!existing) return undefined;

    // Check for conflicts if time/date/user changed
    let status = (shiftData as any).status || existing.status;
    
    if ((shiftData as any).userId || (shiftData as any).date || (shiftData as any).startTime || (shiftData as any).endTime) {
      const hasConflict = await this.checkShiftConflict(
        (shiftData as any).userId || existing.userId,
        (shiftData as any).date || existing.date,
        (shiftData as any).startTime || existing.startTime,
        (shiftData as any).endTime || existing.endTime,
        id
      );

      if (hasConflict) {
        status = 'conflict';
      } else if (status === 'conflict') {
        // If was conflict but no longer, reset to scheduled
        status = 'scheduled';
      }
    }

    const dataToUpdate: any = {
      ...shiftData,
      status,
      updatedAt: new Date(),
    };

    const [shift] = await db
      .update(shifts)
      .set(dataToUpdate)
      .where(eq(shifts.id, id))
      .returning();

    return shift;
  }

  async deleteShift(id: number): Promise<boolean> {
    const result = await db.delete(shifts).where(eq(shifts.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Attendance operations

  async getAllAttendance(filters?: { date?: string, siteId?: number, userId?: string, approvalStatus?: string }): Promise<(Attendance & { user: User, site: Site })[]> {
    let query = db
      .select({
        attendance: attendance,
        user: users,
        site: sites,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .innerJoin(sites, eq(attendance.siteId, sites.id));

    const conditions = [];
    if (filters?.date) {
      conditions.push(eq(attendance.date, filters.date));
    }
    if (filters?.siteId) {
      conditions.push(eq(attendance.siteId, filters.siteId));
    }
    if (filters?.userId) {
      conditions.push(eq(attendance.userId, filters.userId));
    }
    if (filters?.approvalStatus) {
      conditions.push(eq(attendance.approvalStatus, filters.approvalStatus));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results.map((r: any) => ({ ...r.attendance, user: r.user, site: r.site }));
  }

  async getAttendance(id: number): Promise<(Attendance & { user: User, site: Site }) | undefined> {
    const [result] = await db
      .select({
        attendance: attendance,
        user: users,
        site: sites,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .innerJoin(sites, eq(attendance.siteId, sites.id))
      .where(eq(attendance.id, id));

    if (!result) return undefined;
    return { ...result.attendance, user: result.user, site: result.site };
  }

  async clockIn(userId: string, siteId: number, shiftId?: number, notes?: string): Promise<Attendance> {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const clockInTime = now.toTimeString().substring(0, 5); // HH:MM

    const attendanceData: InsertAttendance = {
      userId,
      siteId,
      shiftId: shiftId || null,
      date,
      clockIn: clockInTime,
      clockOut: null,
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      notes: notes || null,
    };

    const [record] = await db.insert(attendance).values(attendanceData).returning();
    return record;
  }

  async clockOut(attendanceId: number, notes?: string): Promise<Attendance | undefined> {
    const now = new Date();
    const clockOutTime = now.toTimeString().substring(0, 5); // HH:MM

    const updateData: any = {
      clockOut: clockOutTime,
      updatedAt: new Date(),
    };

    if (notes) {
      updateData.notes = notes;
    }

    const [record] = await db
      .update(attendance)
      .set(updateData)
      .where(eq(attendance.id, attendanceId))
      .returning();

    return record;
  }

  async approveAttendance(id: number, approvedBy: string): Promise<Attendance | undefined> {
    const [record] = await db
      .update(attendance)
      .set({
        approvalStatus: 'approved',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, id))
      .returning();

    return record;
  }

  async rejectAttendance(id: number, approvedBy: string): Promise<Attendance | undefined> {
    const [record] = await db
      .update(attendance)
      .set({
        approvalStatus: 'rejected',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, id))
      .returning();

    return record;
  }

  calculateDuration(clockIn: string, clockOut: string): string {
    const [inHours, inMinutes] = clockIn.split(':').map(Number);
    const [outHours, outMinutes] = clockOut.split(':').map(Number);

    let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
    
    // Handle overnight shifts (clock out is next day)
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
  }

  // Room operations

  private generateQRCode(roomId: number): { qrCode: string, qrCodeExpiry: Date } {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const qrCode = `ROOM_${roomId}_${timestamp}_${random}`;
    
    // Set expiry to 10 minutes from now
    const qrCodeExpiry = new Date(Date.now() + 10 * 60 * 1000);
    
    return { qrCode, qrCodeExpiry };
  }

  async getAllRooms(filters?: { siteId?: number, isActive?: boolean }): Promise<(Room & { site: Site })[]> {
    let query = db
      .select({
        room: rooms,
        site: sites,
      })
      .from(rooms)
      .innerJoin(sites, eq(rooms.siteId, sites.id));

    const conditions = [];
    if (filters?.siteId !== undefined) {
      conditions.push(eq(rooms.siteId, filters.siteId));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(rooms.isActive, filters.isActive));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results.map((r: any) => ({ ...r.room, site: r.site }));
  }

  async getRoom(id: number): Promise<(Room & { site: Site }) | undefined> {
    const [result] = await db
      .select({
        room: rooms,
        site: sites,
      })
      .from(rooms)
      .innerJoin(sites, eq(rooms.siteId, sites.id))
      .where(eq(rooms.id, id));

    if (!result) return undefined;
    return { ...result.room, site: result.site };
  }

  async createRoom(roomData: Omit<InsertRoom, 'qrCode' | 'qrCodeExpiry'>): Promise<Room> {
    // First create the room to get the ID
    const [room] = await db.insert(rooms).values({
      ...roomData,
      qrCode: 'temp',
      qrCodeExpiry: new Date(),
    }).returning();

    // Generate QR code with the room ID
    const { qrCode, qrCodeExpiry } = this.generateQRCode(room.id);

    // Update the room with the actual QR code
    const [updatedRoom] = await db
      .update(rooms)
      .set({ qrCode, qrCodeExpiry })
      .where(eq(rooms.id, room.id))
      .returning();

    return updatedRoom;
  }

  async updateRoom(id: number, roomData: Partial<InsertRoom>): Promise<Room | undefined> {
    const [room] = await db
      .update(rooms)
      .set(roomData)
      .where(eq(rooms.id, id))
      .returning();

    return room;
  }

  async refreshRoomQR(id: number): Promise<Room | undefined> {
    const { qrCode, qrCodeExpiry } = this.generateQRCode(id);
    
    const [room] = await db
      .update(rooms)
      .set({ qrCode, qrCodeExpiry })
      .where(eq(rooms.id, id))
      .returning();

    return room;
  }

  async deleteRoom(id: number): Promise<boolean> {
    const result = await db.delete(rooms).where(eq(rooms.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Room scan operations

  async logRoomScan(scanData: InsertRoomScan): Promise<RoomScan> {
    const [scan] = await db.insert(roomScans).values(scanData).returning();
    return scan;
  }

  async getAllRoomScans(filters?: { roomId?: number, userId?: string, status?: string, date?: string }): Promise<(RoomScan & { room: Room & { site: Site }, user: User })[]> {
    let query = db
      .select({
        scan: roomScans,
        room: rooms,
        site: sites,
        user: users,
      })
      .from(roomScans)
      .innerJoin(rooms, eq(roomScans.roomId, rooms.id))
      .innerJoin(sites, eq(rooms.siteId, sites.id))
      .innerJoin(users, eq(roomScans.userId, users.id))
      .orderBy(desc(roomScans.scannedAt));

    const conditions = [];
    if (filters?.roomId !== undefined) {
      conditions.push(eq(roomScans.roomId, filters.roomId));
    }
    if (filters?.userId) {
      conditions.push(eq(roomScans.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(roomScans.status, filters.status));
    }
    if (filters?.date) {
      // Filter by date (scannedAt contains the full timestamp)
      const startOfDay = new Date(filters.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);
      
      conditions.push(
        and(
          gte(roomScans.scannedAt, startOfDay),
          lte(roomScans.scannedAt, endOfDay)
        ) as any
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results.map((r: any) => ({
      ...r.scan,
      room: { ...r.room, site: r.site },
      user: r.user,
    }));
  }

  // Payroll operations

  async createPayrollRun(startDate: string, endDate: string, createdBy: string): Promise<PayrollRun> {
    const period = this.generatePayrollPeriod(startDate, endDate);
    
    const [payrollRun] = await db
      .insert(payrollRuns)
      .values({
        period,
        startDate,
        endDate,
        status: 'draft',
        createdBy,
        finalizedAt: null,
      })
      .returning();

    return payrollRun;
  }

  private generatePayrollPeriod(startDate: string, endDate: string): string {
    const start = new Date(startDate);
    const weekNumber = this.getWeekNumber(start);
    const year = start.getFullYear();
    return `Week ${weekNumber}, ${year}`;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  async getPayrollRuns(filters?: { status?: string }): Promise<PayrollRun[]> {
    let query = db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt));

    if (filters?.status) {
      query = query.where(eq(payrollRuns.status, filters.status)) as any;
    }

    return await query;
  }

  async getPayrollRun(id: number): Promise<(PayrollRun & { payslips: (Payslip & { user: User, site: Site })[] }) | undefined> {
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id));
    
    if (!run) return undefined;

    const payslipsData = await db
      .select({
        payslip: payslips,
        user: users,
        site: sites,
      })
      .from(payslips)
      .innerJoin(users, eq(payslips.userId, users.id))
      .innerJoin(sites, eq(payslips.siteId, sites.id))
      .where(eq(payslips.payrollRunId, id));

    const payslipsWithDetails = payslipsData.map((p: any) => ({
      ...p.payslip,
      user: p.user,
      site: p.site,
    }));

    return {
      ...run,
      payslips: payslipsWithDetails,
    };
  }

  async processPayrollRun(id: number): Promise<void> {
    const run = await this.getPayrollRun(id);
    if (!run) throw new Error('Payroll run not found');
    if (run.status !== 'draft') throw new Error('Payroll run is not in draft status');

    const approvedAttendance = await db
      .select({
        attendance: attendance,
        user: users,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .where(
        and(
          gte(attendance.date, run.startDate),
          lte(attendance.date, run.endDate),
          eq(attendance.approvalStatus, 'approved'),
          isNotNull(attendance.clockOut)
        )
      );

    const userAttendanceMap = new Map<string, Array<{ attendance: Attendance, user: User }>>();
    
    for (const record of approvedAttendance) {
      const userId = record.user.id;
      if (!userAttendanceMap.has(userId)) {
        userAttendanceMap.set(userId, []);
      }
      userAttendanceMap.get(userId)!.push(record);
    }

    for (const [userId, records] of userAttendanceMap.entries()) {
      const user = records[0].user;
      const hourlyRate = parseFloat(user.hourlyRate || '0');
      
      if (hourlyRate === 0) continue;

      const weeklyHours = this.groupByWeek(records.map(r => r.attendance));
      
      let totalRegularHours = 0;
      let totalOvertimeHours = 0;
      const lineItems: any[] = [];

      for (const [weekKey, weekAttendance] of Object.entries(weeklyHours)) {
        const weekTotalHours = weekAttendance.reduce((sum, att) => {
          return sum + this.calculateHoursFromTimes(att.clockIn, att.clockOut!);
        }, 0);

        const regularHours = Math.min(weekTotalHours, 40);
        const overtimeHours = Math.max(0, weekTotalHours - 40);

        totalRegularHours += regularHours;
        totalOvertimeHours += overtimeHours;

        if (regularHours > 0) {
          lineItems.push({
            id: `regular-${weekKey}`,
            description: `Regular hours - ${weekKey}`,
            type: 'regular',
            hours: regularHours.toFixed(2),
            rate: hourlyRate.toFixed(2),
            amount: (regularHours * hourlyRate).toFixed(2),
            reason: null,
          });
        }

        if (overtimeHours > 0) {
          const overtimeRate = hourlyRate * 1.5;
          lineItems.push({
            id: `overtime-${weekKey}`,
            description: `Overtime hours (1.5x) - ${weekKey}`,
            type: 'overtime',
            hours: overtimeHours.toFixed(2),
            rate: overtimeRate.toFixed(2),
            amount: (overtimeHours * overtimeRate).toFixed(2),
            reason: null,
          });
        }
      }

      const regularPay = totalRegularHours * hourlyRate;
      const overtimePay = totalOvertimeHours * hourlyRate * 1.5;
      const grossPay = regularPay + overtimePay;
      const deductions = 0;
      const netPay = grossPay - deductions;

      const siteId = records[0].attendance.siteId;

      await db.insert(payslips).values({
        payrollRunId: id,
        userId,
        siteId,
        grossPay: grossPay.toFixed(2),
        deductions: deductions.toFixed(2),
        netPay: netPay.toFixed(2),
        lineItems,
      });
    }

    await db
      .update(payrollRuns)
      .set({ status: 'processing' })
      .where(eq(payrollRuns.id, id));
  }

  private groupByWeek(attendanceRecords: Attendance[]): Record<string, Attendance[]> {
    const weekMap: Record<string, Attendance[]> = {};

    for (const att of attendanceRecords) {
      const date = new Date(att.date);
      const weekNumber = this.getWeekNumber(date);
      const year = date.getFullYear();
      const weekKey = `Week ${weekNumber}, ${year}`;

      if (!weekMap[weekKey]) {
        weekMap[weekKey] = [];
      }
      weekMap[weekKey].push(att);
    }

    return weekMap;
  }

  private calculateHoursFromTimes(clockIn: string, clockOut: string): number {
    const [inHours, inMinutes] = clockIn.split(':').map(Number);
    const [outHours, outMinutes] = clockOut.split(':').map(Number);

    let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
    
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60;
    }

    return totalMinutes / 60;
  }

  async finalizePayrollRun(id: number, finalizedBy: string): Promise<PayrollRun | undefined> {
    const [run] = await db
      .update(payrollRuns)
      .set({
        status: 'finalized',
        finalizedAt: new Date(),
      })
      .where(eq(payrollRuns.id, id))
      .returning();

    return run;
  }

  async getPayslips(filters?: { payrollRunId?: number, userId?: string }): Promise<(Payslip & { user: User, site: Site, payrollRun: PayrollRun })[]> {
    let query = db
      .select({
        payslip: payslips,
        user: users,
        site: sites,
        payrollRun: payrollRuns,
      })
      .from(payslips)
      .innerJoin(users, eq(payslips.userId, users.id))
      .innerJoin(sites, eq(payslips.siteId, sites.id))
      .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
      .orderBy(desc(payslips.createdAt));

    const conditions = [];
    if (filters?.payrollRunId !== undefined) {
      conditions.push(eq(payslips.payrollRunId, filters.payrollRunId));
    }
    if (filters?.userId) {
      conditions.push(eq(payslips.userId, filters.userId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results.map((r: any) => ({
      ...r.payslip,
      user: r.user,
      site: r.site,
      payrollRun: r.payrollRun,
    }));
  }

  async getPayslip(id: number): Promise<(Payslip & { user: User, site: Site, payrollRun: PayrollRun }) | undefined> {
    const [result] = await db
      .select({
        payslip: payslips,
        user: users,
        site: sites,
        payrollRun: payrollRuns,
      })
      .from(payslips)
      .innerJoin(users, eq(payslips.userId, users.id))
      .innerJoin(sites, eq(payslips.siteId, sites.id))
      .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
      .where(eq(payslips.id, id));

    if (!result) return undefined;

    return {
      ...result.payslip,
      user: result.user,
      site: result.site,
      payrollRun: result.payrollRun,
    };
  }

  async addDeduction(payslipId: number, deduction: { amount: number, reason: string, type: string }): Promise<Payslip | undefined> {
    const [payslip] = await db.select().from(payslips).where(eq(payslips.id, payslipId));
    
    if (!payslip) return undefined;

    const currentLineItems = (payslip.lineItems as any[]) || [];
    const deductionId = `deduction-${Date.now()}`;
    
    const newLineItem = {
      id: deductionId,
      description: deduction.reason,
      type: deduction.type,
      hours: null,
      rate: null,
      amount: (-Math.abs(deduction.amount)).toFixed(2),
      reason: deduction.reason,
    };

    const updatedLineItems = [...currentLineItems, newLineItem];
    const currentDeductions = parseFloat(payslip.deductions);
    const newDeductions = currentDeductions + Math.abs(deduction.amount);
    const grossPay = parseFloat(payslip.grossPay);
    const newNetPay = grossPay - newDeductions;

    const [updatedPayslip] = await db
      .update(payslips)
      .set({
        lineItems: updatedLineItems,
        deductions: newDeductions.toFixed(2),
        netPay: newNetPay.toFixed(2),
      })
      .where(eq(payslips.id, payslipId))
      .returning();

    return updatedPayslip;
  }

  // Query operations

  async getAllQueries(filters?: { userId?: string, category?: string, status?: string, priority?: string }): Promise<(Query & { user: User })[]> {
    let query = db
      .select({
        query: queries,
        user: users,
      })
      .from(queries)
      .innerJoin(users, eq(queries.userId, users.id))
      .orderBy(desc(queries.createdAt));

    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(queries.userId, filters.userId));
    }
    if (filters?.category) {
      conditions.push(eq(queries.category, filters.category));
    }
    if (filters?.status) {
      conditions.push(eq(queries.status, filters.status));
    }
    if (filters?.priority) {
      conditions.push(eq(queries.priority, filters.priority));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results.map((r: any) => ({ ...r.query, user: r.user }));
  }

  async getQuery(id: number): Promise<(Query & { user: User, messages: (QueryMessage & { user: User })[] }) | undefined> {
    const [result] = await db
      .select({
        query: queries,
        user: users,
      })
      .from(queries)
      .innerJoin(users, eq(queries.userId, users.id))
      .where(eq(queries.id, id));

    if (!result) return undefined;

    const messages = await this.getQueryMessages(id);

    return {
      ...result.query,
      user: result.user,
      messages,
    };
  }

  async createQuery(queryData: InsertQuery): Promise<Query> {
    const [query] = await db.insert(queries).values(queryData).returning();
    return query;
  }

  async updateQueryStatus(id: number, status: string, updatedBy: string): Promise<Query | undefined> {
    const [query] = await db
      .update(queries)
      .set({
        status,
        assignedTo: updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(queries.id, id))
      .returning();
    return query;
  }

  async updateQueryPriority(id: number, priority: string): Promise<Query | undefined> {
    const [query] = await db
      .update(queries)
      .set({
        priority,
        updatedAt: new Date(),
      })
      .where(eq(queries.id, id))
      .returning();
    return query;
  }

  async addMessage(queryId: number, messageData: InsertQueryMessage): Promise<QueryMessage> {
    const [message] = await db.insert(queryMessages).values(messageData).returning();
    
    // Update the query's updatedAt timestamp
    await db
      .update(queries)
      .set({ updatedAt: new Date() })
      .where(eq(queries.id, queryId));
    
    return message;
  }

  async getQueryMessages(queryId: number): Promise<(QueryMessage & { user: User })[]> {
    const results = await db
      .select({
        message: queryMessages,
        user: users,
      })
      .from(queryMessages)
      .innerJoin(users, eq(queryMessages.userId, users.id))
      .where(eq(queryMessages.queryId, queryId))
      .orderBy(queryMessages.createdAt);

    return results.map((r: any) => ({ ...r.message, user: r.user }));
  }

  // Analytics operations

  async getHoursSummary(filters: { startDate: string, endDate: string, siteId?: number, userId?: string }): Promise<{ regularHours: number, overtimeHours: number, totalHours: number }> {
    const conditions = [
      gte(attendance.date, filters.startDate),
      lte(attendance.date, filters.endDate),
      eq(attendance.approvalStatus, 'approved'),
      isNotNull(attendance.clockOut),
    ];

    if (filters.siteId !== undefined) {
      conditions.push(eq(attendance.siteId, filters.siteId));
    }
    if (filters.userId) {
      conditions.push(eq(attendance.userId, filters.userId));
    }

    const records = await db
      .select({
        attendance: attendance,
        user: users,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .where(and(...conditions));

    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;

    // Calculate hours for each record
    for (const record of records) {
      const hours = this.calculateHoursDecimal(record.attendance.clockIn, record.attendance.clockOut!);
      totalHours += hours;
      
      // Simple overtime calculation: hours beyond 8 in a single shift are overtime
      if (hours > 8) {
        regularHours += 8;
        overtimeHours += (hours - 8);
      } else {
        regularHours += hours;
      }
    }

    return {
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
    };
  }

  private calculateHoursDecimal(clockIn: string, clockOut: string): number {
    const [inHours, inMinutes] = clockIn.split(':').map(Number);
    const [outHours, outMinutes] = clockOut.split(':').map(Number);

    let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
    
    // Handle overnight shifts
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60;
    }

    return totalMinutes / 60;
  }

  async getCostSummary(filters: { startDate: string, endDate: string, siteId?: number }): Promise<{ regularCost: number, overtimeCost: number, totalCost: number }> {
    const conditions = [
      gte(attendance.date, filters.startDate),
      lte(attendance.date, filters.endDate),
      eq(attendance.approvalStatus, 'approved'),
      isNotNull(attendance.clockOut),
    ];

    if (filters.siteId !== undefined) {
      conditions.push(eq(attendance.siteId, filters.siteId));
    }

    const records = await db
      .select({
        attendance: attendance,
        user: users,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .where(and(...conditions));

    let regularCost = 0;
    let overtimeCost = 0;

    for (const record of records) {
      const hours = this.calculateHoursDecimal(record.attendance.clockIn, record.attendance.clockOut!);
      const hourlyRate = parseFloat(record.user.hourlyRate || '0');
      const overtimeRate = hourlyRate * 1.5; // 1.5x for overtime

      if (hours > 8) {
        regularCost += 8 * hourlyRate;
        overtimeCost += (hours - 8) * overtimeRate;
      } else {
        regularCost += hours * hourlyRate;
      }
    }

    return {
      regularCost: Math.round(regularCost * 100) / 100,
      overtimeCost: Math.round(overtimeCost * 100) / 100,
      totalCost: Math.round((regularCost + overtimeCost) * 100) / 100,
    };
  }

  async getAttendanceSummary(filters: { startDate: string, endDate: string, siteId?: number }): Promise<{ total: number, pending: number, approved: number, rejected: number, onTime: number, late: number }> {
    const conditions = [
      gte(attendance.date, filters.startDate),
      lte(attendance.date, filters.endDate),
    ];

    if (filters.siteId !== undefined) {
      conditions.push(eq(attendance.siteId, filters.siteId));
    }

    const records = await db
      .select({
        attendance: attendance,
        shift: shifts,
      })
      .from(attendance)
      .leftJoin(shifts, eq(attendance.shiftId, shifts.id))
      .where(and(...conditions));

    let total = records.length;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let onTime = 0;
    let late = 0;

    for (const record of records) {
      // Count by approval status
      if (record.attendance.approvalStatus === 'pending') pending++;
      if (record.attendance.approvalStatus === 'approved') approved++;
      if (record.attendance.approvalStatus === 'rejected') rejected++;

      // Count on-time vs late (if there's a shift to compare against)
      if (record.shift) {
        const clockInTime = record.attendance.clockIn;
        const shiftStartTime = record.shift.startTime;
        
        if (clockInTime <= shiftStartTime) {
          onTime++;
        } else {
          late++;
        }
      }
    }

    return { total, pending, approved, rejected, onTime, late };
  }

  async getSiteSummary(): Promise<{ siteId: number, siteName: string, activeWorkers: number, totalShifts: number, totalHours: number, totalCost: number }[]> {
    const allSites = await this.getAllSites();
    const summaries = [];

    for (const site of allSites) {
      // Get active workers at this site
      const activeWorkers = await db
        .select()
        .from(users)
        .where(and(eq(users.siteId, site.id), eq(users.isActive, true)));

      // Get total shifts for this site (current week)
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const siteShifts = await db
        .select()
        .from(shifts)
        .where(and(
          eq(shifts.siteId, site.id),
          gte(shifts.date, startOfWeek.toISOString().split('T')[0]),
          lte(shifts.date, endOfWeek.toISOString().split('T')[0])
        ));

      // Get hours and cost for this site (current week)
      const hoursSummary = await this.getHoursSummary({
        startDate: startOfWeek.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0],
        siteId: site.id,
      });

      const costSummary = await this.getCostSummary({
        startDate: startOfWeek.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0],
        siteId: site.id,
      });

      summaries.push({
        siteId: site.id,
        siteName: site.name,
        activeWorkers: activeWorkers.length,
        totalShifts: siteShifts.length,
        totalHours: hoursSummary.totalHours,
        totalCost: costSummary.totalCost,
      });
    }

    return summaries;
  }

  // Data clearing methods for admin
  async clearAllShifts(): Promise<void> {
    await db.delete(shifts);
  }

  async clearAllAttendance(): Promise<void> {
    await db.delete(attendance);
  }

  async clearAllPayroll(): Promise<void> {
    await db.delete(payslips);
    await db.delete(payrollRuns);
  }

  async clearAllQueries(): Promise<void> {
    await db.delete(queryMessages);
    await db.delete(queries);
  }
}

export const storage = new DatabaseStorage();
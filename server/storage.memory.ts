import {
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
import crypto from "crypto";
import type { IStorage } from "./storage";

function now() { return new Date(); }
function idStr() { return crypto.randomBytes(8).toString("hex"); }

export class InMemoryStorage implements IStorage {
  private users: User[] = [];
  private sites: Site[] = [
    { id: 1, name: "Kent Care Home", color: "purple", location: "Kent", postCode: "CT1 1AA", clockInQrCode: "", clockInQrExpiry: null as any, isActive: true, createdAt: now() },
  ];
  private shifts: (Shift & { user?: User; site?: Site })[] = [];
  private attendance: (Attendance & { user?: User; site?: Site })[] = [];
  private rooms: (Room & { site?: Site })[] = [];
  private roomScans: (RoomScan & { room?: Room & { site: Site }, user?: User })[] = [];
  private payrollRuns: PayrollRun[] = [];
  private payslips: (Payslip & { user?: User; site?: Site; payrollRun?: PayrollRun })[] = [];
  private queries: (Query & { user?: User; messages?: (QueryMessage & { user?: User })[] })[] = [];
  private queryMessages: (QueryMessage & { user?: User })[] = [];

  private seq = { site: 2, shift: 1, attendance: 1, room: 1, roomScan: 1, payrollRun: 1, payslip: 1, query: 1, queryMessage: 1 };

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }
  async upsertUser(user: UpsertUser): Promise<User> {
    const existing = this.users.find(u => u.id === user.id || (!!user.email && u.email === user.email));
    if (existing) {
      Object.assign(existing, {
        email: user.email ?? existing.email,
        firstName: user.firstName ?? existing.firstName,
        lastName: user.lastName ?? existing.lastName,
        profileImageUrl: user.profileImageUrl ?? existing.profileImageUrl,
        updatedAt: now(),
      });
      return existing;
    }
    const newUser: User = {
      id: user.id || idStr(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      role: "worker",
      siteId: undefined,
      hourlyRate: undefined as any,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    };
    this.users.push(newUser);
    return newUser;
  }
  async getAllUsers(): Promise<User[]> { return this.users.slice(); }
  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      id: idStr(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      role: user.role ?? "worker",
      siteId: user.siteId,
      hourlyRate: user.hourlyRate,
      isActive: user.isActive ?? true,
      createdAt: now(),
      updatedAt: now(),
    };
    this.users.push(newUser);
    return newUser;
  }
  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const u = this.users.find(x => x.id === id);
    if (!u) return undefined;
    Object.assign(u, user, { updatedAt: now() });
    return u;
  }
  async deleteUser(id: string): Promise<boolean> {
    const i = this.users.findIndex(u => u.id === id);
    if (i >= 0) { this.users.splice(i, 1); return true; }
    return false;
  }

  // Site operations
  async getAllSites(): Promise<Site[]> { return this.sites.slice(); }
  async getSite(id: number): Promise<Site | undefined> { return this.sites.find(s => s.id === id); }
  async createSite(site: InsertSite): Promise<Site> {
    const s: Site = { id: this.seq.site++, name: site.name, color: site.color, location: site.location, postCode: site.postCode, clockInQrCode: "", clockInQrExpiry: null as any, isActive: site.isActive ?? true, createdAt: now() };
    this.sites.push(s);
    return s;
  }
  async updateSite(id: number, site: Partial<InsertSite>): Promise<Site | undefined> {
    const s = this.sites.find(x => x.id === id);
    if (!s) return undefined;
    Object.assign(s, site);
    return s;
  }
  async refreshSiteClockQR(id: number): Promise<Site | undefined> {
    const s = this.sites.find(x => x.id === id);
    if (!s) return undefined;
    const qrData = { siteId: id, type: 'clock-in', timestamp: Date.now(), nonce: idStr() };
    s.clockInQrCode = Buffer.from(JSON.stringify(qrData)).toString('base64');
    const expiry = new Date(); expiry.setHours(expiry.getHours() + 24); s.clockInQrExpiry = expiry as any;
    return s;
  }

  // Shifts
  async getAllShifts(filters?: { date?: string, siteId?: number, userId?: string, status?: string }): Promise<(Shift & { user: User, site: Site })[]> {
    let items = this.shifts.slice();
    if (filters?.date) items = items.filter(s => s.date === filters.date);
    if (filters?.siteId) items = items.filter(s => s.siteId === filters.siteId);
    if (filters?.userId) items = items.filter(s => s.userId === filters.userId);
    if (filters?.status) items = items.filter(s => s.status === filters.status);
    return items as any;
  }
  async getShift(id: number): Promise<(Shift & { user: User, site: Site }) | undefined> {
    const s = this.shifts.find(x => x.id === id);
    return s as any;
  }
  async createShift(shift: InsertShift): Promise<Shift> {
    const s: Shift = { id: this.seq.shift++, ...shift, createdAt: now(), updatedAt: now() } as any;
    this.shifts.push({ ...s, user: this.users.find(u => u.id === s.userId), site: this.sites.find(si => si.id === s.siteId) } as any);
    return s;
  }
  async updateShift(id: number, shift: Partial<InsertShift>): Promise<Shift | undefined> {
    const idx = this.shifts.findIndex(x => x.id === id);
    if (idx < 0) return undefined;
    const merged = { ...this.shifts[idx], ...shift } as any;
    this.shifts[idx] = merged;
    return merged as any;
  }
  async deleteShift(id: number): Promise<boolean> { const i = this.shifts.findIndex(s => s.id === id); if (i>=0){ this.shifts.splice(i,1); return true;} return false; }
  async checkShiftConflict(_userId: string, _date: string, _startTime: string, _endTime: string, _excludeShiftId?: number): Promise<boolean> { return false; }

  // Attendance
  async getAllAttendance(filters?: { date?: string, siteId?: number, userId?: string, approvalStatus?: string }): Promise<(Attendance & { user: User, site: Site })[]> {
    let items = this.attendance.slice();
    if (filters?.date) items = items.filter(a => a.date === filters.date);
    if (filters?.siteId) items = items.filter(a => a.siteId === filters.siteId);
    if (filters?.userId) items = items.filter(a => a.userId === filters.userId);
    if (filters?.approvalStatus) items = items.filter(a => a.approvalStatus === filters.approvalStatus);
    return items as any;
  }
  async getAttendance(id: number): Promise<(Attendance & { user: User, site: Site }) | undefined> {
    return this.attendance.find(a => a.id === id) as any;
  }
  async clockIn(userId: string, siteId: number, shiftId?: number, notes?: string): Promise<Attendance> {
    const today = new Date(); const date = today.toISOString().slice(0,10); const time = today.toTimeString().slice(0,5);
    const rec: Attendance = { id: this.seq.attendance++, userId, siteId, shiftId, date, clockIn: time, clockOut: null as any, approvalStatus: "pending", approvedBy: undefined, approvedAt: undefined, notes, createdAt: now(), updatedAt: now() } as any;
    const site = this.sites.find(s => s.id === siteId);
    const user = this.users.find(u => u.id === userId);
    this.attendance.push({ ...rec, site, user } as any);
    return rec;
  }
  async clockOut(attendanceId: number, notes?: string): Promise<Attendance | undefined> {
    const rec = this.attendance.find(a => a.id === attendanceId);
    if (!rec) return undefined;
    rec.clockOut = new Date().toTimeString().slice(0,5);
    rec.notes = notes ?? rec.notes;
    return rec as any;
  }
  async approveAttendance(id: number, approvedBy: string): Promise<Attendance | undefined> { const r = this.attendance.find(a => a.id===id); if(!r) return undefined; r.approvalStatus="approved"; r.approvedBy=approvedBy; r.approvedAt=now(); return r as any; }
  async rejectAttendance(id: number, approvedBy: string): Promise<Attendance | undefined> { const r = this.attendance.find(a => a.id===id); if(!r) return undefined; r.approvalStatus="rejected"; r.approvedBy=approvedBy; r.approvedAt=now(); return r as any; }
  calculateDuration(clockIn: string, clockOut: string): string { const start = new Date(`2000-01-01 ${clockIn}`); const end = new Date(`2000-01-01 ${clockOut}`); const h = Math.max(0,(end.getTime()-start.getTime())/3600000); return `${Math.round(h)}h`; }

  // Rooms
  async getAllRooms(filters?: { siteId?: number, isActive?: boolean }): Promise<(Room & { site: Site })[]> { return this.rooms.filter(r => (filters?.siteId? r.siteId===filters.siteId:true) && (filters?.isActive!==undefined? r.isActive===filters.isActive:true)) as any; }
  async getRoom(id: number): Promise<(Room & { site: Site }) | undefined> { return this.rooms.find(r=>r.id===id) as any; }
  async createRoom(room: Omit<InsertRoom, 'qrCode' | 'qrCodeExpiry'>): Promise<Room> { const site = this.sites.find(s=>s.id===room.siteId); const expiry = new Date(); expiry.setHours(expiry.getHours()+24); const qr = Buffer.from(JSON.stringify({roomId:this.seq.room,type:'scan',nonce:idStr()})).toString('base64'); const r: Room = { id: this.seq.room++, name: room.name, siteId: room.siteId, qrCode: qr, qrCodeExpiry: expiry as any, isActive: room.isActive ?? true, createdAt: now() } as any; this.rooms.push({ ...r, site } as any); return r; }
  async updateRoom(id: number, room: Partial<InsertRoom>): Promise<Room | undefined> { const r = this.rooms.find(x=>x.id===id); if(!r) return undefined; Object.assign(r, room); return r as any; }
  async refreshRoomQR(id: number): Promise<Room | undefined> { const r = this.rooms.find(x=>x.id===id); if(!r) return undefined; const expiry = new Date(); expiry.setHours(expiry.getHours()+24); r.qrCodeExpiry = expiry as any; r.qrCode = Buffer.from(JSON.stringify({roomId:id,type:'scan',nonce:idStr()})).toString('base64'); return r as any; }
  async deleteRoom(id: number): Promise<boolean> { const i = this.rooms.findIndex(r=>r.id===id); if(i>=0){ this.rooms.splice(i,1); return true;} return false; }

  // Room scans
  async logRoomScan(scan: InsertRoomScan): Promise<RoomScan> { const rs: RoomScan = { id: this.seq.roomScan++, ...scan, scannedAt: now() as any } as any; this.roomScans.push(rs as any); return rs; }
  async getAllRoomScans(filters?: { roomId?: number, userId?: string, status?: string, date?: string }): Promise<(RoomScan & { room: Room & { site: Site }, user: User })[]> { let items = this.roomScans.slice() as any; if(filters?.roomId) items = items.filter((x:any)=>x.roomId===filters.roomId); if(filters?.userId) items = items.filter((x:any)=>x.userId===filters.userId); if(filters?.status) items = items.filter((x:any)=>x.status===filters.status); return items; }

  // Payroll
  private generatePayrollPeriod(startDate: string, _endDate: string): string {
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

  private groupByWeek(attendanceRecords: Attendance[]): Record<string, Attendance[]> {
    const weekMap: Record<string, Attendance[]> = {};
    for (const att of attendanceRecords) {
      const date = new Date(att.date);
      const weekNumber = this.getWeekNumber(date);
      const year = date.getFullYear();
      const weekKey = `Week ${weekNumber}, ${year}`;
      if (!weekMap[weekKey]) weekMap[weekKey] = [];
      weekMap[weekKey].push(att);
    }
    return weekMap;
  }

  private calculateHoursFromTimes(clockIn: string, clockOut: string): number {
    const [inH, inM] = clockIn.split(':').map(Number);
    const [outH, outM] = clockOut.split(':').map(Number);
    const startMinutes = inH * 60 + inM;
    let endMinutes = outH * 60 + outM;
    if (endMinutes < startMinutes) endMinutes += 24 * 60; // overnight shift
    return Math.max(0, (endMinutes - startMinutes) / 60);
  }

  async createPayrollRun(startDate: string, endDate: string, createdBy: string): Promise<PayrollRun> {
    const period = this.generatePayrollPeriod(startDate, endDate);
    const run: PayrollRun = {
      id: this.seq.payrollRun++,
      period,
      startDate,
      endDate,
      status: 'draft',
      createdBy,
      createdAt: now() as any,
      finalizedAt: null as any,
    } as any;
    this.payrollRuns.push(run);
    return run;
  }

  async getPayrollRuns(filters?: { status?: string }): Promise<PayrollRun[]> {
    let runs = this.payrollRuns.slice();
    if (filters?.status) runs = runs.filter(r => r.status === filters.status);
    runs.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
    return runs;
  }

  async getPayrollRun(id: number): Promise<(PayrollRun & { payslips: (Payslip & { user: User, site: Site })[] }) | undefined> {
    const run = this.payrollRuns.find(r => r.id === id);
    if (!run) return undefined;
    const slips = this.payslips.filter(p => p.payrollRunId === id).map(p => ({
      ...p,
      user: this.users.find(u => u.id === p.userId)!,
      site: this.sites.find(s => s.id === p.siteId)!,
    })) as any;
    return { ...run, payslips: slips } as any;
  }

  async processPayrollRun(id: number): Promise<void> {
    const run = await this.getPayrollRun(id);
    if (!run) throw new Error('Payroll run not found');
    if (run.status !== 'draft') throw new Error('Payroll run is not in draft status');

    const rangeStart = new Date(run.startDate);
    const rangeEnd = new Date(run.endDate);

    const approvedAttendance = this.attendance
      .filter(a =>
        a.approvalStatus === 'approved' &&
        a.clockOut &&
        new Date(a.date) >= rangeStart &&
        new Date(a.date) <= rangeEnd
      )
      .map(a => ({ attendance: a, user: this.users.find(u => u.id === a.userId)! }));

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
      if (!hourlyRate) continue;

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
            hours: parseFloat(regularHours.toFixed(2)),
            rate: parseFloat(hourlyRate.toFixed(2)),
            amount: parseFloat((regularHours * hourlyRate).toFixed(2)),
            reason: null,
          });
        }

        if (overtimeHours > 0) {
          const overtimeRate = hourlyRate * 1.5;
          lineItems.push({
            id: `overtime-${weekKey}`,
            description: `Overtime hours (1.5x) - ${weekKey}`,
            type: 'overtime',
            hours: parseFloat(overtimeHours.toFixed(2)),
            rate: parseFloat(overtimeRate.toFixed(2)),
            amount: parseFloat((overtimeHours * overtimeRate).toFixed(2)),
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

      const newPayslip: Payslip = {
        id: this.seq.payslip++,
        payrollRunId: id,
        userId,
        siteId,
        grossPay: grossPay.toFixed(2),
        deductions: deductions.toFixed(2),
        netPay: netPay.toFixed(2),
        lineItems,
        createdAt: now() as any,
      } as any;

      this.payslips.push(newPayslip as any);
    }

    const r = this.payrollRuns.find(r => r.id === id);
    if (r) r.status = 'processing';
  }

  async finalizePayrollRun(id: number, _finalizedBy: string): Promise<PayrollRun | undefined> {
    const r = this.payrollRuns.find(x => x.id === id);
    if (!r) return undefined;
    r.status = 'finalized';
    r.finalizedAt = now() as any;
    return r;
  }

  async getPayslips(filters?: { payrollRunId?: number, userId?: string }): Promise<(Payslip & { user: User, site: Site, payrollRun: PayrollRun })[]> {
    let slips = this.payslips.slice();
    if (filters?.payrollRunId !== undefined) slips = slips.filter(p => p.payrollRunId === filters.payrollRunId);
    if (filters?.userId) slips = slips.filter(p => p.userId === filters.userId);
    slips.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
    return slips.map(p => ({
      ...p,
      user: this.users.find(u => u.id === p.userId)!,
      site: this.sites.find(s => s.id === p.siteId)!,
      payrollRun: this.payrollRuns.find(r => r.id === p.payrollRunId)!,
    })) as any;
  }

  async getPayslip(id: number): Promise<(Payslip & { user: User, site: Site, payrollRun: PayrollRun }) | undefined> {
    const p = this.payslips.find(x => x.id === id);
    if (!p) return undefined;
    return {
      ...p,
      user: this.users.find(u => u.id === p.userId)!,
      site: this.sites.find(s => s.id === p.siteId)!,
      payrollRun: this.payrollRuns.find(r => r.id === p.payrollRunId)!,
    } as any;
  }

  async addDeduction(payslipId: number, deduction: { amount: number, reason: string, type: string }): Promise<Payslip | undefined> {
    const p = this.payslips.find(x => x.id === payslipId);
    if (!p) return undefined;

    const currentItems = (p.lineItems as any[]) || [];
    const newItem = {
      id: `deduction-${Date.now()}`,
      description: deduction.reason,
      type: deduction.type,
      hours: null,
      rate: null,
      amount: -Math.abs(deduction.amount),
      reason: deduction.reason,
    };

    const newDeductions = parseFloat(p.deductions) + Math.abs(deduction.amount);
    p.lineItems = [...currentItems, newItem];
    p.deductions = newDeductions.toFixed(2);
    const grossPay = parseFloat(p.grossPay);
    p.netPay = (grossPay - newDeductions).toFixed(2);

    return p as any;
  }

  // Queries (stubs)
  async getAllQueries(_filters?: { userId?: string, category?: string, status?: string, priority?: string }): Promise<(Query & { user: User })[]> { return []; }
  async getQuery(_id: number): Promise<(Query & { user: User, messages: (QueryMessage & { user: User })[] }) | undefined> { return undefined; }
  async createQuery(_query: InsertQuery): Promise<Query> { throw new Error("Not implemented in memory"); }
  async updateQueryStatus(_id: number, _status: string, _updatedBy: string): Promise<Query | undefined> { return undefined; }
  async updateQueryPriority(_id: number, _priority: string): Promise<Query | undefined> { return undefined; }
  async addMessage(_queryId: number, _message: InsertQueryMessage): Promise<QueryMessage> { throw new Error("Not implemented in memory"); }
  async getQueryMessages(_queryId: number): Promise<(QueryMessage & { user: User })[]> { return []; }

  // Analytics (basic)
  async getHoursSummary(_filters: { startDate: string, endDate: string, siteId?: number, userId?: string }): Promise<{ regularHours: number, overtimeHours: number, totalHours: number }> { return { regularHours: 0, overtimeHours: 0, totalHours: 0 }; }
  async getCostSummary(_filters: { startDate: string, endDate: string, siteId?: number }): Promise<{ regularCost: number, overtimeCost: number, totalCost: number }> { return { regularCost: 0, overtimeCost: 0, totalCost: 0 }; }
  async getAttendanceSummary(_filters: { startDate: string, endDate: string, siteId?: number }): Promise<{ total: number, pending: number, approved: number, rejected: number, onTime: number, late: number }> { return { total: this.attendance.length, pending: this.attendance.filter(a=>a.approvalStatus==="pending").length, approved: this.attendance.filter(a=>a.approvalStatus==="approved").length, rejected: this.attendance.filter(a=>a.approvalStatus==="rejected").length, onTime: 0, late: 0 }; }
  async getSiteSummary(): Promise<{ siteId: number, siteName: string, activeWorkers: number, totalShifts: number, totalHours: number, totalCost: number }[]> { return this.sites.map(s=>({ siteId: s.id, siteName: s.name, activeWorkers: this.users.filter(u=>u.siteId===s.id).length, totalShifts: this.shifts.filter(sh=>sh.siteId===s.id).length, totalHours: 0, totalCost: 0 })); }

  async clearAllShifts(): Promise<void> { this.shifts = []; }
  async clearAllAttendance(): Promise<void> { this.attendance = []; }
  async clearAllPayroll(): Promise<void> { this.payrollRuns = []; this.payslips = []; }
  async clearAllQueries(): Promise<void> { this.queries = []; this.queryMessages = []; }
}
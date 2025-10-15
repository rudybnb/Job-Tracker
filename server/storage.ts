// Following Replit Auth blueprint patterns for storage implementation
import {
  users,
  sites,
  shifts,
  type User,
  type UpsertUser,
  type InsertUser,
  type Site,
  type InsertSite,
  type Shift,
  type InsertShift,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Site operations
  getAllSites(): Promise<Site[]>;
  getSite(id: number): Promise<Site | undefined>;
  createSite(site: InsertSite): Promise<Site>;
  updateSite(id: number, site: Partial<InsertSite>): Promise<Site | undefined>;
  
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
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
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
}

export const storage = new DatabaseStorage();

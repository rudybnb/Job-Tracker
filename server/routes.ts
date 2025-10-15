// Following Replit Auth blueprint patterns for route setup
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, hasRole } from "./replitAuth";
import { insertSiteSchema, insertUserSchema, insertShiftSchema, insertAttendanceSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth middleware and routes
  await setupAuth(app);

  // Auth routes (required for Replit Auth integration)
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Protected test route to verify auth is working
  app.get("/api/protected/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      res.json({
        message: "Authentication successful",
        userId,
        user,
      });
    } catch (error) {
      console.error("Error in protected test route:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Site Management Routes
  
  // GET /api/sites - list all sites
  app.get("/api/sites", isAuthenticated, async (req, res) => {
    try {
      const sites = await storage.getAllSites();
      res.json(sites);
    } catch (error) {
      console.error("Error fetching sites:", error);
      res.status(500).json({ message: "Failed to fetch sites" });
    }
  });

  // POST /api/sites - create site (admin only)
  app.post("/api/sites", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const siteData = insertSiteSchema.parse(req.body);
      const site = await storage.createSite(siteData);
      res.status(201).json(site);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid site data", errors: error.errors });
      }
      console.error("Error creating site:", error);
      res.status(500).json({ message: "Failed to create site" });
    }
  });

  // PATCH /api/sites/:id - update site (admin only)
  app.patch("/api/sites/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const siteId = parseInt(req.params.id);
      const siteData = insertSiteSchema.partial().parse(req.body);
      const site = await storage.updateSite(siteId, siteData);
      
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }
      
      res.json(site);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid site data", errors: error.errors });
      }
      console.error("Error updating site:", error);
      res.status(500).json({ message: "Failed to update site" });
    }
  });

  // User Management Routes

  // GET /api/users - list all users with their site/role info
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // POST /api/users - create/invite user (admin/site_manager only)
  app.post("/api/users", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // PATCH /api/users/:id - update user role/site/rate (admin/site_manager only)
  app.patch("/api/users/:id", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const userId = req.params.id;
      const userData = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(userId, userData);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // DELETE /api/users/:id - deactivate user (admin only)
  app.delete("/api/users/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const userId = req.params.id;
      const success = await storage.deleteUser(userId);
      
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Shift Management Routes

  // GET /api/shifts - list shifts with optional filters
  app.get("/api/shifts", isAuthenticated, async (req, res) => {
    try {
      const filters: any = {};
      
      if (req.query.date) {
        filters.date = req.query.date as string;
      }
      if (req.query.siteId) {
        filters.siteId = parseInt(req.query.siteId as string);
      }
      if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }
      if (req.query.status) {
        filters.status = req.query.status as string;
      }

      const shifts = await storage.getAllShifts(filters);
      res.json(shifts);
    } catch (error) {
      console.error("Error fetching shifts:", error);
      res.status(500).json({ message: "Failed to fetch shifts" });
    }
  });

  // GET /api/shifts/:id - get single shift with user/site details
  app.get("/api/shifts/:id", isAuthenticated, async (req, res) => {
    try {
      const shiftId = parseInt(req.params.id);
      const shift = await storage.getShift(shiftId);
      
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      res.json(shift);
    } catch (error) {
      console.error("Error fetching shift:", error);
      res.status(500).json({ message: "Failed to fetch shift" });
    }
  });

  // POST /api/shifts - create shift (admin/site_manager only) with conflict detection
  app.post("/api/shifts", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const shiftData = insertShiftSchema.parse(req.body) as any;
      
      // Check for conflicts
      const hasConflict = await storage.checkShiftConflict(
        shiftData.userId,
        shiftData.date,
        shiftData.startTime,
        shiftData.endTime
      );

      const shift = await storage.createShift(shiftData);
      
      // Return shift with conflict indicator
      res.status(201).json({
        ...shift,
        hasConflict,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid shift data", errors: error.errors });
      }
      console.error("Error creating shift:", error);
      res.status(500).json({ message: "Failed to create shift" });
    }
  });

  // PATCH /api/shifts/:id - update shift (admin/site_manager only) with conflict recheck
  app.patch("/api/shifts/:id", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const shiftId = parseInt(req.params.id);
      const shiftData = insertShiftSchema.partial().parse(req.body);
      
      const shift = await storage.updateShift(shiftId, shiftData);
      
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      res.json(shift);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid shift data", errors: error.errors });
      }
      console.error("Error updating shift:", error);
      res.status(500).json({ message: "Failed to update shift" });
    }
  });

  // DELETE /api/shifts/:id - delete shift (admin only)
  app.delete("/api/shifts/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const shiftId = parseInt(req.params.id);
      const success = await storage.deleteShift(shiftId);
      
      if (!success) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting shift:", error);
      res.status(500).json({ message: "Failed to delete shift" });
    }
  });

  // Attendance Management Routes

  // GET /api/attendance - list attendance records with filters
  app.get("/api/attendance", isAuthenticated, async (req, res) => {
    try {
      const filters: any = {};
      
      if (req.query.date) {
        filters.date = req.query.date as string;
      }
      if (req.query.siteId) {
        filters.siteId = parseInt(req.query.siteId as string);
      }
      if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }
      if (req.query.approvalStatus) {
        filters.approvalStatus = req.query.approvalStatus as string;
      }

      const attendanceRecords = await storage.getAllAttendance(filters);
      
      // Add duration for completed records
      const recordsWithDuration = attendanceRecords.map(record => ({
        ...record,
        duration: record.clockOut ? storage.calculateDuration(record.clockIn, record.clockOut) : null,
      }));
      
      res.json(recordsWithDuration);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  // GET /api/attendance/:id - get single record
  app.get("/api/attendance/:id", isAuthenticated, async (req, res) => {
    try {
      const attendanceId = parseInt(req.params.id);
      const record = await storage.getAttendance(attendanceId);
      
      if (!record) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      
      // Add duration if completed
      const recordWithDuration = {
        ...record,
        duration: record.clockOut ? storage.calculateDuration(record.clockIn, record.clockOut) : null,
      };
      
      res.json(recordWithDuration);
    } catch (error) {
      console.error("Error fetching attendance record:", error);
      res.status(500).json({ message: "Failed to fetch attendance record" });
    }
  });

  // POST /api/attendance/clock-in - clock in (worker, site_manager, admin)
  app.post("/api/attendance/clock-in", isAuthenticated, hasRole(["worker", "site_manager", "admin"]), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const clockInSchema = z.object({
        siteId: z.number(),
        shiftId: z.number().optional(),
        notes: z.string().optional(),
      });
      
      const { siteId, shiftId, notes } = clockInSchema.parse(req.body);
      
      const record = await storage.clockIn(userId, siteId, shiftId, notes);
      res.status(201).json(record);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid clock-in data", errors: error.errors });
      }
      console.error("Error clocking in:", error);
      res.status(500).json({ message: "Failed to clock in" });
    }
  });

  // PATCH /api/attendance/:id/clock-out - clock out (worker, site_manager, admin)
  app.patch("/api/attendance/:id/clock-out", isAuthenticated, hasRole(["worker", "site_manager", "admin"]), async (req, res) => {
    try {
      const attendanceId = parseInt(req.params.id);
      
      const clockOutSchema = z.object({
        notes: z.string().optional(),
      });
      
      const { notes } = clockOutSchema.parse(req.body);
      
      const record = await storage.clockOut(attendanceId, notes);
      
      if (!record) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      
      res.json(record);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid clock-out data", errors: error.errors });
      }
      console.error("Error clocking out:", error);
      res.status(500).json({ message: "Failed to clock out" });
    }
  });

  // PATCH /api/attendance/:id/approve - approve (admin, site_manager)
  app.patch("/api/attendance/:id/approve", isAuthenticated, hasRole(["admin", "site_manager"]), async (req: any, res) => {
    try {
      const attendanceId = parseInt(req.params.id);
      const approverId = req.user.claims.sub;
      
      const record = await storage.approveAttendance(attendanceId, approverId);
      
      if (!record) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      
      res.json(record);
    } catch (error) {
      console.error("Error approving attendance:", error);
      res.status(500).json({ message: "Failed to approve attendance" });
    }
  });

  // PATCH /api/attendance/:id/reject - reject (admin, site_manager)
  app.patch("/api/attendance/:id/reject", isAuthenticated, hasRole(["admin", "site_manager"]), async (req: any, res) => {
    try {
      const attendanceId = parseInt(req.params.id);
      const approverId = req.user.claims.sub;
      
      const record = await storage.rejectAttendance(attendanceId, approverId);
      
      if (!record) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      
      res.json(record);
    } catch (error) {
      console.error("Error rejecting attendance:", error);
      res.status(500).json({ message: "Failed to reject attendance" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

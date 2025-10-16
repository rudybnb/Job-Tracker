// Following Replit Auth blueprint patterns for route setup
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, hasRole } from "./replitAuth";
import { insertSiteSchema, insertUserSchema, insertShiftSchema, insertAttendanceSchema, insertRoomSchema, insertRoomScanSchema, insertQuerySchema, insertQueryMessageSchema } from "@shared/schema";
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

  // POST /api/sites/:id/refresh-clock-qr - refresh site clock-in QR code (admin, site_manager)
  app.post("/api/sites/:id/refresh-clock-qr", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const siteId = parseInt(req.params.id);
      const site = await storage.refreshSiteClockQR(siteId);
      
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }
      
      res.json(site);
    } catch (error) {
      console.error("Error refreshing site clock-in QR:", error);
      res.status(500).json({ message: "Failed to refresh clock-in QR code" });
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

  // Room Management Routes

  // GET /api/rooms - list rooms with site info
  app.get("/api/rooms", isAuthenticated, async (req, res) => {
    try {
      const filters: any = {};
      
      if (req.query.siteId) {
        filters.siteId = parseInt(req.query.siteId as string);
      }
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive === 'true';
      }

      const rooms = await storage.getAllRooms(filters);
      res.json(rooms);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      res.status(500).json({ message: "Failed to fetch rooms" });
    }
  });

  // POST /api/rooms - create room (admin only)
  app.post("/api/rooms", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const roomData = insertRoomSchema.parse(req.body);
      const room = await storage.createRoom(roomData);
      res.status(201).json(room);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid room data", errors: error.errors });
      }
      console.error("Error creating room:", error);
      res.status(500).json({ message: "Failed to create room" });
    }
  });

  // PATCH /api/rooms/:id - update room (admin only)
  app.patch("/api/rooms/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const roomId = parseInt(req.params.id);
      const roomData = insertRoomSchema.partial().parse(req.body);
      const room = await storage.updateRoom(roomId, roomData);
      
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      res.json(room);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid room data", errors: error.errors });
      }
      console.error("Error updating room:", error);
      res.status(500).json({ message: "Failed to update room" });
    }
  });

  // POST /api/rooms/:id/refresh-qr - refresh QR code (admin, site_manager)
  app.post("/api/rooms/:id/refresh-qr", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const roomId = parseInt(req.params.id);
      const room = await storage.refreshRoomQR(roomId);
      
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      res.json(room);
    } catch (error) {
      console.error("Error refreshing QR code:", error);
      res.status(500).json({ message: "Failed to refresh QR code" });
    }
  });

  // DELETE /api/rooms/:id - delete room (admin only)
  app.delete("/api/rooms/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const roomId = parseInt(req.params.id);
      const success = await storage.deleteRoom(roomId);
      
      if (!success) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting room:", error);
      res.status(500).json({ message: "Failed to delete room" });
    }
  });

  // Room Scan Routes

  // POST /api/room-scans - log scan (worker, site_manager, admin)
  app.post("/api/room-scans", isAuthenticated, hasRole(["worker", "site_manager", "admin"]), async (req, res) => {
    try {
      const scanData = insertRoomScanSchema.parse(req.body);
      const scan = await storage.logRoomScan(scanData);
      res.status(201).json(scan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid scan data", errors: error.errors });
      }
      console.error("Error logging room scan:", error);
      res.status(500).json({ message: "Failed to log room scan" });
    }
  });

  // GET /api/room-scans - list scans with filters
  app.get("/api/room-scans", isAuthenticated, async (req, res) => {
    try {
      const filters: any = {};
      
      if (req.query.roomId) {
        filters.roomId = parseInt(req.query.roomId as string);
      }
      if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      if (req.query.date) {
        filters.date = req.query.date as string;
      }

      const scans = await storage.getAllRoomScans(filters);
      res.json(scans);
    } catch (error) {
      console.error("Error fetching room scans:", error);
      res.status(500).json({ message: "Failed to fetch room scans" });
    }
  });

  // Payroll Routes

  // GET /api/payroll-runs - list payroll runs (admin, site_manager)
  app.get("/api/payroll-runs", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const filters: any = {};
      
      if (req.query.status) {
        filters.status = req.query.status as string;
      }

      const runs = await storage.getPayrollRuns(filters);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching payroll runs:", error);
      res.status(500).json({ message: "Failed to fetch payroll runs" });
    }
  });

  // POST /api/payroll-runs - create payroll run (admin only)
  app.post("/api/payroll-runs", isAuthenticated, hasRole(["admin"]), async (req: any, res) => {
    try {
      const { startDate, endDate } = req.body;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const userId = req.user.claims.sub;
      const run = await storage.createPayrollRun(startDate, endDate, userId);
      res.status(201).json(run);
    } catch (error) {
      console.error("Error creating payroll run:", error);
      res.status(500).json({ message: "Failed to create payroll run" });
    }
  });

  // GET /api/payroll-runs/:id - get single payroll run with payslips
  app.get("/api/payroll-runs/:id", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const runId = parseInt(req.params.id);
      const run = await storage.getPayrollRun(runId);
      
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }
      
      res.json(run);
    } catch (error) {
      console.error("Error fetching payroll run:", error);
      res.status(500).json({ message: "Failed to fetch payroll run" });
    }
  });

  // POST /api/payroll-runs/:id/process - process run to generate payslips (admin only)
  app.post("/api/payroll-runs/:id/process", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const runId = parseInt(req.params.id);
      
      await storage.processPayrollRun(runId);
      
      const updatedRun = await storage.getPayrollRun(runId);
      res.json(updatedRun);
    } catch (error: any) {
      console.error("Error processing payroll run:", error);
      res.status(500).json({ message: error.message || "Failed to process payroll run" });
    }
  });

  // POST /api/payroll-runs/:id/finalize - finalize run (admin only)
  app.post("/api/payroll-runs/:id/finalize", isAuthenticated, hasRole(["admin"]), async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const run = await storage.finalizePayrollRun(runId, userId);
      
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }
      
      res.json(run);
    } catch (error) {
      console.error("Error finalizing payroll run:", error);
      res.status(500).json({ message: "Failed to finalize payroll run" });
    }
  });

  // GET /api/payslips - list payslips (admin sees all, workers see their own)
  app.get("/api/payslips", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const filters: any = {};
      
      if (req.query.payrollRunId) {
        filters.payrollRunId = parseInt(req.query.payrollRunId as string);
      }
      
      // Workers can only see their own payslips
      if (user.role === 'worker') {
        filters.userId = userId;
      } else if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }

      const payslips = await storage.getPayslips(filters);
      res.json(payslips);
    } catch (error) {
      console.error("Error fetching payslips:", error);
      res.status(500).json({ message: "Failed to fetch payslips" });
    }
  });

  // GET /api/payslips/:id - get single payslip with breakdown
  app.get("/api/payslips/:id", isAuthenticated, async (req: any, res) => {
    try {
      const payslipId = parseInt(req.params.id);
      const payslip = await storage.getPayslip(payslipId);
      
      if (!payslip) {
        return res.status(404).json({ message: "Payslip not found" });
      }

      // Check authorization - workers can only see their own payslips
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role === 'worker' && payslip.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to view this payslip" });
      }
      
      res.json(payslip);
    } catch (error) {
      console.error("Error fetching payslip:", error);
      res.status(500).json({ message: "Failed to fetch payslip" });
    }
  });

  // POST /api/payslips/:id/deductions - add deduction to payslip (admin only)
  app.post("/api/payslips/:id/deductions", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const payslipId = parseInt(req.params.id);
      const { amount, reason, type } = req.body;
      
      if (!amount || !reason || !type) {
        return res.status(400).json({ message: "Amount, reason, and type are required" });
      }

      const payslip = await storage.addDeduction(payslipId, {
        amount: parseFloat(amount),
        reason,
        type,
      });
      
      if (!payslip) {
        return res.status(404).json({ message: "Payslip not found" });
      }
      
      res.json(payslip);
    } catch (error) {
      console.error("Error adding deduction:", error);
      res.status(500).json({ message: "Failed to add deduction" });
    }
  });

  // Query/Ticket Routes

  // GET /api/queries - list queries (workers see their own, admin/site_manager see all)
  app.get("/api/queries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const filters: any = {};
      
      if (req.query.category) {
        filters.category = req.query.category as string;
      }
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      if (req.query.priority) {
        filters.priority = req.query.priority as string;
      }
      
      // Workers can only see their own queries
      if (user.role === 'worker') {
        filters.userId = userId;
      } else if (req.query.userId) {
        filters.userId = req.query.userId as string;
      }

      const queries = await storage.getAllQueries(filters);
      res.json(queries);
    } catch (error) {
      console.error("Error fetching queries:", error);
      res.status(500).json({ message: "Failed to fetch queries" });
    }
  });

  // GET /api/queries/:id - get query with messages
  app.get("/api/queries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const queryId = parseInt(req.params.id);
      const query = await storage.getQuery(queryId);
      
      if (!query) {
        return res.status(404).json({ message: "Query not found" });
      }

      // Check authorization - workers can only see their own queries
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role === 'worker' && query.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to view this query" });
      }
      
      res.json(query);
    } catch (error) {
      console.error("Error fetching query:", error);
      res.status(500).json({ message: "Failed to fetch query" });
    }
  });

  // POST /api/queries - create query (all authenticated users)
  app.post("/api/queries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const queryData = insertQuerySchema.parse({
        ...req.body,
        userId,
      });
      
      const query = await storage.createQuery(queryData);
      res.status(201).json(query);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query data", errors: error.errors });
      }
      console.error("Error creating query:", error);
      res.status(500).json({ message: "Failed to create query" });
    }
  });

  // PATCH /api/queries/:id/status - update status (admin, site_manager)
  app.patch("/api/queries/:id/status", isAuthenticated, hasRole(["admin", "site_manager"]), async (req: any, res) => {
    try {
      const queryId = parseInt(req.params.id);
      const { status } = req.body;
      const userId = req.user.claims.sub;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      const query = await storage.updateQueryStatus(queryId, status, userId);
      
      if (!query) {
        return res.status(404).json({ message: "Query not found" });
      }
      
      res.json(query);
    } catch (error) {
      console.error("Error updating query status:", error);
      res.status(500).json({ message: "Failed to update query status" });
    }
  });

  // PATCH /api/queries/:id/priority - update priority (admin, site_manager)
  app.patch("/api/queries/:id/priority", isAuthenticated, hasRole(["admin", "site_manager"]), async (req: any, res) => {
    try {
      const queryId = parseInt(req.params.id);
      const { priority } = req.body;
      
      if (!priority) {
        return res.status(400).json({ message: "Priority is required" });
      }

      const query = await storage.updateQueryPriority(queryId, priority);
      
      if (!query) {
        return res.status(404).json({ message: "Query not found" });
      }
      
      res.json(query);
    } catch (error) {
      console.error("Error updating query priority:", error);
      res.status(500).json({ message: "Failed to update query priority" });
    }
  });

  // POST /api/queries/:id/messages - add message to query (all authenticated users)
  app.post("/api/queries/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const queryId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      // Verify query exists and user has access
      const query = await storage.getQuery(queryId);
      if (!query) {
        return res.status(404).json({ message: "Query not found" });
      }

      const user = await storage.getUser(userId);
      if (user?.role === 'worker' && query.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to add messages to this query" });
      }

      const messageData = insertQueryMessageSchema.parse({
        queryId,
        userId,
        message: req.body.message,
      });
      
      const message = await storage.addMessage(queryId, messageData);
      
      // Return message with user info
      const userInfo = await storage.getUser(userId);
      res.status(201).json({ ...message, user: userInfo });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid message data", errors: error.errors });
      }
      console.error("Error adding message:", error);
      res.status(500).json({ message: "Failed to add message" });
    }
  });

  // GET /api/queries/:id/messages - get all messages for query
  app.get("/api/queries/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const queryId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      // Verify query exists and user has access
      const query = await storage.getQuery(queryId);
      if (!query) {
        return res.status(404).json({ message: "Query not found" });
      }

      const user = await storage.getUser(userId);
      if (user?.role === 'worker' && query.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to view messages for this query" });
      }

      const messages = await storage.getQueryMessages(queryId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Analytics Routes

  // GET /api/analytics/hours - get hours summary (admin, site_manager)
  app.get("/api/analytics/hours", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const { startDate, endDate, siteId, userId } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const filters: any = {
        startDate: startDate as string,
        endDate: endDate as string,
      };

      if (siteId) {
        filters.siteId = parseInt(siteId as string);
      }
      if (userId) {
        filters.userId = userId as string;
      }

      const summary = await storage.getHoursSummary(filters);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching hours summary:", error);
      res.status(500).json({ message: "Failed to fetch hours summary" });
    }
  });

  // GET /api/analytics/costs - get cost summary (admin only)
  app.get("/api/analytics/costs", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const { startDate, endDate, siteId } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const filters: any = {
        startDate: startDate as string,
        endDate: endDate as string,
      };

      if (siteId) {
        filters.siteId = parseInt(siteId as string);
      }

      const summary = await storage.getCostSummary(filters);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching cost summary:", error);
      res.status(500).json({ message: "Failed to fetch cost summary" });
    }
  });

  // GET /api/analytics/attendance - get attendance summary (admin, site_manager)
  app.get("/api/analytics/attendance", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const { startDate, endDate, siteId } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const filters: any = {
        startDate: startDate as string,
        endDate: endDate as string,
      };

      if (siteId) {
        filters.siteId = parseInt(siteId as string);
      }

      const summary = await storage.getAttendanceSummary(filters);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching attendance summary:", error);
      res.status(500).json({ message: "Failed to fetch attendance summary" });
    }
  });

  // GET /api/analytics/sites - get per-site summary (admin, site_manager)
  app.get("/api/analytics/sites", isAuthenticated, hasRole(["admin", "site_manager"]), async (req, res) => {
    try {
      const summary = await storage.getSiteSummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching site summary:", error);
      res.status(500).json({ message: "Failed to fetch site summary" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

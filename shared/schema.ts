import { pgTable, text, integer, timestamp, boolean, decimal, jsonb, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Sites Table
export const sites = pgTable("sites", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(), // purple, teal, orange
  location: text("location").notNull(),
  clockInQrCode: text("clock_in_qr_code").notNull().default(''), // QR code for clock-in verification
  clockInQrExpiry: timestamp("clock_in_qr_expiry"), // Expiry time for QR code
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
  clockInQrCode: true,
  clockInQrExpiry: true,
});
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;

// Users Table (compatible with Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: text("role").notNull().default("worker"), // admin, site_manager, worker
  siteId: integer("site_id").references(() => sites.id),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
  role: true,
  siteId: true,
  hourlyRate: true,
  isActive: true,
});
export type UpsertUser = z.infer<typeof upsertUserSchema>;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Shifts Table
export const shifts = pgTable("shifts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  siteId: integer("site_id").notNull().references(() => sites.id),
  date: text("date").notNull(), // YYYY-MM-DD format
  startTime: text("start_time").notNull(), // HH:MM format
  endTime: text("end_time").notNull(), // HH:MM format
  role: text("role").notNull(),
  shiftType: text("shift_type").notNull().default("day"), // day, night
  status: text("status").notNull().default("scheduled"), // scheduled, in-progress, completed, cancelled, conflict
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

// Attendance Table
export const attendance = pgTable("attendance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  siteId: integer("site_id").notNull().references(() => sites.id),
  shiftId: integer("shift_id").references(() => shifts.id),
  date: text("date").notNull(), // YYYY-MM-DD format
  clockIn: text("clock_in").notNull(), // HH:MM format
  clockOut: text("clock_out"), // HH:MM format
  approvalStatus: text("approval_status").notNull().default("pending"), // pending, approved, rejected
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

// Rooms Table
export const rooms = pgTable("rooms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  siteId: integer("site_id").notNull().references(() => sites.id),
  qrCode: text("qr_code").notNull(),
  qrCodeExpiry: timestamp("qr_code_expiry").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
  createdAt: true,
});
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

// Room Scans Table
export const roomScans = pgTable("room_scans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  roomId: integer("room_id").notNull().references(() => rooms.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  deviceId: text("device_id").notNull(),
  confidence: integer("confidence").notNull(), // 0-100
  status: text("status").notNull(), // verified, low-confidence, failed
  location: jsonb("location"), // {lat, lng} for geofencing
  notes: text("notes"),
});

export const insertRoomScanSchema = createInsertSchema(roomScans).omit({
  id: true,
  scannedAt: true,
});
export type InsertRoomScan = z.infer<typeof insertRoomScanSchema>;
export type RoomScan = typeof roomScans.$inferSelect;

// Payroll Runs Table
export const payrollRuns = pgTable("payroll_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  period: text("period").notNull(), // "Week 15, 2025"
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date").notNull(), // YYYY-MM-DD
  status: text("status").notNull().default("draft"), // draft, finalized, exported
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at"),
});

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRun = typeof payrollRuns.$inferSelect;

// Payslips Table
export const payslips = pgTable("payslips", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRuns.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  siteId: integer("site_id").notNull().references(() => sites.id),
  grossPay: decimal("gross_pay", { precision: 10, scale: 2 }).notNull(),
  deductions: decimal("deductions", { precision: 10, scale: 2 }).notNull(),
  netPay: decimal("net_pay", { precision: 10, scale: 2 }).notNull(),
  lineItems: jsonb("line_items").notNull(), // Array of {id, description, type, hours, rate, amount, reason}
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPayslipSchema = createInsertSchema(payslips).omit({
  id: true,
  createdAt: true,
});
export type InsertPayslip = z.infer<typeof insertPayslipSchema>;
export type Payslip = typeof payslips.$inferSelect;

// Queries Table (Support Tickets)
export const queries = pgTable("queries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // pay, hr, scheduling, other
  priority: text("priority").notNull().default("medium"), // low, medium, high
  status: text("status").notNull().default("open"), // open, in_progress, closed
  relatedTo: text("related_to"), // e.g., "Week 15 Payslip"
  assignedTo: varchar("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertQuerySchema = createInsertSchema(queries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuery = z.infer<typeof insertQuerySchema>;
export type Query = typeof queries.$inferSelect;

// Query Messages Table (For ticket conversation threads)
export const queryMessages = pgTable("query_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  queryId: integer("query_id").notNull().references(() => queries.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertQueryMessageSchema = createInsertSchema(queryMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertQueryMessage = z.infer<typeof insertQueryMessageSchema>;
export type QueryMessage = typeof queryMessages.$inferSelect;

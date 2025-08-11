import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const jobStatusEnum = pgEnum("job_status", ["pending", "assigned", "completed"]);
export const contractorStatusEnum = pgEnum("contractor_status", ["available", "busy", "unavailable"]);
export const uploadStatusEnum = pgEnum("upload_status", ["processing", "processed", "failed"]);
export const sessionStatusEnum = pgEnum("session_status", ["active", "completed", "cancelled"]);

export const contractors = pgTable("contractors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  specialty: text("specialty").notNull(),
  status: contractorStatusEnum("status").notNull().default("available"),
  rating: text("rating").notNull().default("0"),
  activeJobs: text("active_jobs").notNull().default("0"),
  completedJobs: text("completed_jobs").notNull().default("0"),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location").notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  contractorId: varchar("contractor_id").references(() => contractors.id),
  contractorName: text("contractor_name"),
  dueDate: text("due_date").notNull(),
  startDate: text("start_date"),
  notes: text("notes"),
  uploadId: varchar("upload_id").references(() => csvUploads.id),
  phases: text("phases"), // JSON string of selected phases
  phaseTaskData: text("phase_task_data"), // JSON string of detailed task data from CSV
  telegramNotified: text("telegram_notified").default("false"),
  latitude: text("latitude"), // GPS latitude for work site
  longitude: text("longitude"), // GPS longitude for work site
});

export const csvUploads = pgTable("csv_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  status: uploadStatusEnum("status").notNull().default("processing"),
  jobsCount: text("jobs_count").notNull().default("0"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const contractorApplications = pgTable("contractor_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Personal Information
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  telegramId: text("telegram_id"),
  fullAddress: text("full_address").notNull(),
  city: text("city").notNull(),
  postcode: text("postcode").notNull(),
  
  // Right to Work & Documentation
  hasRightToWork: text("has_right_to_work").notNull().default("false"),
  passportNumber: text("passport_number").notNull(),
  passportPhotoUploaded: text("passport_photo_uploaded").notNull().default("false"),
  hasPublicLiability: text("has_public_liability").notNull().default("false"),
  
  // CIS & Tax Information
  cisStatus: text("cis_status").notNull(),
  utrNumberDetails: text("utr_number_details").notNull(),
  isCisRegistered: text("is_cis_registered").notNull().default("false"),
  hasValidCscs: text("has_valid_cscs").notNull().default("false"),
  
  // Banking Details
  bankName: text("bank_name").notNull(),
  accountHolderName: text("account_holder_name").notNull(),
  sortCode: text("sort_code").notNull(),
  accountNumber: text("account_number").notNull(),
  
  // Emergency Contact
  emergencyName: text("emergency_name").notNull(),
  emergencyPhone: text("emergency_phone").notNull(),
  relationship: text("relationship").notNull(),
  
  // Trade & Tools
  primaryTrade: text("primary_trade").notNull(),
  yearsExperience: text("years_experience").notNull(),
  hasOwnTools: text("has_own_tools").notNull().default("false"),
  toolsList: text("tools_list"),
  
  // Admin-only fields
  adminCisVerification: text("admin_cis_verification"), // Admin fills CIS verification details
  adminPayRate: text("admin_pay_rate"), // Admin sets pay rate
  adminNotes: text("admin_notes"), // Admin internal notes
  
  // Login credentials (set by admin when approving contractor)
  username: text("username"), // Unique login username
  password: text("password"), // Hashed password
  
  // Metadata
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const workSessions = pgTable("work_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorName: text("contractor_name").notNull(),
  jobSiteLocation: text("job_site_location").notNull(), // e.g., "ME5 9GX"
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  totalHours: text("total_hours"), // e.g., "08:11:19"
  startLatitude: text("start_latitude"),
  startLongitude: text("start_longitude"),
  endLatitude: text("end_latitude"), 
  endLongitude: text("end_longitude"),
  status: sessionStatusEnum("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContractorSchema = createInsertSchema(contractors).omit({
  id: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
});

export const insertCsvUploadSchema = createInsertSchema(csvUploads).omit({
  id: true,
  uploadedAt: true,
});

export const insertContractorApplicationSchema = createInsertSchema(contractorApplications).omit({
  id: true,
  submittedAt: true,
});

export const jobAssignmentSchema = z.object({
  jobId: z.string(),
  contractorId: z.string(),
  dueDate: z.string(),
  notes: z.string().optional(),
});

// Contractor Replies tracking  
export const contractorReplies = pgTable("contractor_replies", {
  id: text("id").primaryKey(),
  contractorName: text("contractor_name").notNull(),
  contractorPhone: text("contractor_phone"),
  messageText: text("message_text").notNull(),
  contractorId: text("contractor_id").notNull(), // The generated unique ID
  telegramUserId: text("telegram_user_id"),
  receivedAt: text("received_at").notNull(),
  formSent: boolean("form_sent").default(false),
});

export const insertContractorReplySchema = createInsertSchema(contractorReplies).omit({
  id: true,
});

export const insertWorkSessionSchema = createInsertSchema(workSessions).omit({
  id: true,
  createdAt: true,
});

// Admin settings table for system configuration
export const adminSettings = pgTable("admin_settings", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value").notNull(),
  description: text("description"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminSettingSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});

// Job Assignments table
export const jobAssignments = pgTable("job_assignments", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorName: text("contractor_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  workLocation: text("work_location").notNull(),
  hbxlJob: text("hbxl_job").notNull(),
  buildPhases: text("build_phases").array().notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  specialInstructions: text("special_instructions"),
  status: text("status").notNull().default("assigned"),
  sendTelegramNotification: boolean("send_telegram_notification").default(false),
  latitude: text("latitude"), // GPS latitude for work site
  longitude: text("longitude"), // GPS longitude for work site
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertJobAssignmentSchema = createInsertSchema(jobAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Task Progress table for tracking individual task completion
export const taskProgress = pgTable("task_progress", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorName: text("contractor_name").notNull(),
  assignmentId: text("assignment_id").notNull(), // Reference to job assignment
  taskId: text("task_id").notNull(), // Unique task identifier (phase-description)
  phase: text("phase").notNull(),
  taskDescription: text("task_description").notNull(),
  completed: boolean("completed").notNull().default(false),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaskProgressSchema = createInsertSchema(taskProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});



// Contractor Reports table for simple issue reporting
export const contractorReports = pgTable("contractor_reports", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorName: text("contractor_name").notNull(),
  assignmentId: text("assignment_id").notNull(),
  reportText: text("report_text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: text("status").default("pending").notNull(), // pending, viewed, resolved
});

export const insertContractorReportSchema = createInsertSchema(contractorReports).omit({
  id: true,
  createdAt: true,
});

// Admin Site Inspections table for detailed admin reports with photos
export const adminInspections = pgTable("admin_inspections", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: text("assignment_id").notNull(),
  inspectorName: text("inspector_name").notNull(),
  inspectionType: text("inspection_type").notNull(), // "50_percent" or "100_percent"
  workQualityRating: text("work_quality_rating").notNull(),
  weatherConditions: text("weather_conditions").notNull(),
  progressComments: text("progress_comments").notNull(),
  safetyNotes: text("safety_notes"),
  materialsIssues: text("materials_issues"),
  nextActions: text("next_actions"),
  photoUrls: text("photo_urls").array(), // Array of photo URLs
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: text("status").default("draft").notNull(), // draft, submitted, contractor_viewed
});

// Inspection notifications to track when admin visits are needed
export const inspectionNotifications = pgTable("inspection_notifications", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: text("assignment_id").notNull(),
  contractorName: text("contractor_name").notNull(),
  notificationType: text("notification_type").notNull(), // "50_percent_ready" or "100_percent_ready"
  notificationSent: boolean("notification_sent").default(false).notNull(),
  inspectionCompleted: boolean("inspection_completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertAdminInspectionSchema = createInsertSchema(adminInspections).omit({
  id: true,
  createdAt: true,
});

export const insertInspectionNotificationSchema = createInsertSchema(inspectionNotifications).omit({
  id: true,
  createdAt: true,
});

export type InsertContractor = z.infer<typeof insertContractorSchema>;
export type Contractor = typeof contractors.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertCsvUpload = z.infer<typeof insertCsvUploadSchema>;
export type CsvUpload = typeof csvUploads.$inferSelect;
export type InsertContractorApplication = z.infer<typeof insertContractorApplicationSchema>;
export type ContractorApplication = typeof contractorApplications.$inferSelect;
export type InsertContractorReply = z.infer<typeof insertContractorReplySchema>;
export type ContractorReply = typeof contractorReplies.$inferSelect;
export type InsertWorkSession = z.infer<typeof insertWorkSessionSchema>;
export type WorkSession = typeof workSessions.$inferSelect;
export type JobAssignment = z.infer<typeof jobAssignmentSchema>;
export type InsertAdminSetting = z.infer<typeof insertAdminSettingSchema>;
export type AdminSetting = typeof adminSettings.$inferSelect;
export type InsertJobAssignment = z.infer<typeof insertJobAssignmentSchema>;
export type JobAssignmentRecord = typeof jobAssignments.$inferSelect;
export type InsertContractorReport = z.infer<typeof insertContractorReportSchema>;
export type ContractorReport = typeof contractorReports.$inferSelect;
export type InsertAdminInspection = z.infer<typeof insertAdminInspectionSchema>;
export type AdminInspection = typeof adminInspections.$inferSelect;
export type InsertInspectionNotification = z.infer<typeof insertInspectionNotificationSchema>;
export type InspectionNotification = typeof inspectionNotifications.$inferSelect;
export type InsertTaskProgress = z.infer<typeof insertTaskProgressSchema>;
export type TaskProgress = typeof taskProgress.$inferSelect;

export interface JobWithContractor extends Job {
  contractor?: Contractor;
}

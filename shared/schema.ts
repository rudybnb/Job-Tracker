import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, date, pgEnum, boolean, uuid, integer, numeric, jsonb, bigint, index, uniqueIndex, check, doublePrecision, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const jobStatusEnum = pgEnum("job_status", ["pending", "assigned", "completed"]);
export const contractorStatusEnum = pgEnum("contractor_status", ["available", "busy", "unavailable"]);
export const uploadStatusEnum = pgEnum("upload_status", ["processing", "processed", "failed"]);
export const sessionStatusEnum = pgEnum("session_status", ["active", "on_break", "completed", "cancelled", "temporarily_away"]);
export const eventStatusEnum = pgEnum("event_status", ["scheduled", "completed", "cancelled"]);
export const costCategoryEnum = pgEnum("cost_category", ["LABOUR", "MATERIAL", "PLANT", "SUBCONTRACTOR"]);
export const packageSourceEnum = pgEnum("package_source", ["IFC", "MANUAL", "CSV"]);
export const packageTypeEnum = pgEnum("package_type", ["ROOM", "STRUCTURE"]);
export const roomStatusEnum = pgEnum("room_status", ["not_started", "in_progress", "complete"]);

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
  clientName: text("client_name"),
  clientId: uuid("client_id").references(() => clients.id),
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
  externalCode: text("external_code"),
  projectType: text("project_type"),
  address: text("address"),
  postcode: text("postcode"),
  quotedAmount: text("quoted_amount"),
  financialSummary: text("financial_summary"),
  externalJobKey: text("external_job_key"),
  externalSource: text("external_source").default("AG_8000"),
  externalManifestPath: text("external_manifest_path"),
  budgetLedger: text("budget_ledger"),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  externalReference: text("external_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("clients_name_unique").on(table.name),
]);

export const clientContactMethods = pgTable("client_contact_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  contactName: text("contact_name"),
  methodType: text("method_type").notNull(),
  valueNormalized: text("value_normalized").notNull(),
  verificationStatus: text("verification_status").notNull().default("UNVERIFIED"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source"),
  evidence: text("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_client_contact_methods_client").on(table.clientId),
  index("idx_client_contact_methods_lookup").on(table.methodType, table.valueNormalized, table.isActive, table.verificationStatus),
  check("client_contact_methods_type_check", sql`${table.methodType} IN ('PHONE', 'WHATSAPP')`),
  check("client_contact_methods_verification_check", sql`${table.verificationStatus} IN ('UNVERIFIED', 'VERIFIED')`),
  check("client_contact_methods_e164_check", sql`${table.valueNormalized} ~ '^\\+[0-9]{8,15}$'`),
  check("client_contact_methods_verified_guard", sql`${table.verificationStatus} <> 'VERIFIED' OR (${table.verifiedAt} IS NOT NULL AND NULLIF(BTRIM(${table.verifiedBy}), '') IS NOT NULL)`),
]);

export const csvUploads = pgTable("csv_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  status: uploadStatusEnum("status").notNull().default("processing"),
  jobsCount: text("jobs_count").notNull().default("0"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const projectSourceImports = pgTable("project_source_import", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  sourceType: text("source_type").notNull(),
  sourceStreamKey: text("source_stream_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  sourceHash: varchar("source_hash", { length: 64 }).notNull(),
  revisionNumber: integer("revision_number").notNull(),
  supersedesImportId: uuid("supersedes_import_id").references((): AnyPgColumn => projectSourceImports.id, { onDelete: "restrict" }),
  isCurrentRevision: boolean("is_current_revision").notNull().default(false),
  parserVersion: text("parser_version"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  sourceMetadata: jsonb("source_metadata"),
  status: text("status").notNull().default("RECEIVED"),
  reviewStatus: text("review_status").notNull().default("NOT_APPLICABLE"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("project_source_import_revision_unique").on(table.jobId, table.sourceStreamKey, table.revisionNumber),
  uniqueIndex("project_source_import_hash_unique").on(table.jobId, table.sourceStreamKey, table.sourceHash),
  uniqueIndex("project_source_import_current_revision_unique")
    .on(table.jobId, table.sourceStreamKey)
    .where(sql`${table.isCurrentRevision} = true AND ${table.status} = 'IMPORTED'`),
  index("project_source_import_job_source_idx").on(table.jobId, table.sourceType, table.sourceStreamKey),
  index("project_source_import_status_idx").on(table.status, table.reviewStatus),
  check("project_source_import_source_type_check", sql`${table.sourceType} IN ('DXF', 'PLANSEXPRESS_PXD', 'SMART_SCHEDULE_CSV', 'PDF', 'IFC', 'OTHER')`),
  check("project_source_import_source_hash_check", sql`${table.sourceHash} ~ '^[0-9a-f]{64}$'`),
  check("project_source_import_revision_number_check", sql`${table.revisionNumber} > 0`),
  check("project_source_import_status_check", sql`${table.status} IN ('RECEIVED', 'PARSING', 'IMPORTED', 'PARTIAL', 'FAILED', 'SUPERSEDED')`),
  check("project_source_import_review_status_check", sql`${table.reviewStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("project_source_import_supersedes_other", sql`${table.supersedesImportId} IS NULL OR ${table.supersedesImportId} <> ${table.id}`),
  check("project_source_import_confirmation_guard", sql`${table.reviewStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const workAreas = pgTable("work_area", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  sourceImportId: uuid("source_import_id").references(() => projectSourceImports.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  areaType: text("area_type").notNull(),
  parentWorkAreaId: uuid("parent_work_area_id").references((): AnyPgColumn => workAreas.id, { onDelete: "restrict" }),
  levelName: text("level_name"),
  levelIndex: integer("level_index"),
  plansxpressAreaHandle: text("plansxpress_area_handle"),
  plansxpressAreaId: text("plansxpress_area_id"),
  geometry: jsonb("geometry"),
  coordinateUnits: text("coordinate_units"),
  coordinateSystem: text("coordinate_system"),
  sourceOriginMetadata: jsonb("source_origin_metadata"),
  source: text("source").notNull(),
  confidence: text("confidence"),
  reviewStatus: text("review_status").notNull().default("REVIEW_REQUIRED"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lifecycleStatus: text("lifecycle_status").notNull().default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("work_area_source_handle_unique")
    .on(table.sourceImportId, table.plansxpressAreaHandle)
    .where(sql`${table.sourceImportId} IS NOT NULL AND ${table.plansxpressAreaHandle} IS NOT NULL`),
  uniqueIndex("work_area_root_identity_unique")
    .on(table.jobId, table.areaType, table.normalizedName, sql`COALESCE(${table.levelName}, '')`)
    .where(sql`${table.parentWorkAreaId} IS NULL`),
  uniqueIndex("work_area_child_identity_unique")
    .on(table.jobId, table.parentWorkAreaId, table.areaType, table.normalizedName, sql`COALESCE(${table.levelName}, '')`)
    .where(sql`${table.parentWorkAreaId} IS NOT NULL`),
  index("work_area_job_type_idx").on(table.jobId, table.areaType),
  index("work_area_job_parent_idx").on(table.jobId, table.parentWorkAreaId),
  index("work_area_source_import_idx").on(table.sourceImportId),
  index("work_area_review_status_idx").on(table.reviewStatus),
  check("work_area_area_type_check", sql`${table.areaType} IN ('ROOM', 'FOUNDATION', 'ROOF', 'ELEVATION', 'STRUCTURAL_ZONE', 'EXTERNAL_WORKS', 'FLOOR', 'OTHER')`),
  check("work_area_source_check", sql`${table.source} IN ('PLANSEXPRESS_AREA', 'DXF', 'HBXL_PHASE', 'USER_DEFINED', 'DERIVED', 'OTHER')`),
  check("work_area_review_status_check", sql`${table.reviewStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("work_area_lifecycle_status_check", sql`${table.lifecycleStatus} IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')`),
  check("work_area_confirmation_guard", sql`${table.reviewStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const drawingObjects = pgTable("drawing_object", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  sourceImportId: uuid("source_import_id").notNull().references(() => projectSourceImports.id, { onDelete: "restrict" }),
  workAreaId: uuid("work_area_id").references(() => workAreas.id, { onDelete: "restrict" }),
  sourceEntityIndex: integer("source_entity_index"),
  plansxpressHandle: text("plansxpress_handle"),
  entityType: text("entity_type").notNull(),
  objectCategory: text("object_category").notNull(),
  canonicalName: text("canonical_name"),
  geometry: jsonb("geometry"),
  coordinateUnits: text("coordinate_units"),
  coordinateSystem: text("coordinate_system"),
  levelName: text("level_name"),
  levelIndex: integer("level_index"),
  estimatingStatus: text("estimating_status").notNull().default("UNKNOWN_REVIEW"),
  plansxpressPxid: text("plansxpress_pxid"),
  cadxSpreadsheet: text("cadx_spreadsheet"),
  cadxTemplate: text("cadx_template"),
  estimatorCalculator: text("estimator_calculator"),
  sourceMetadata: jsonb("source_metadata"),
  confidence: text("confidence"),
  reviewStatus: text("review_status").notNull().default("REVIEW_REQUIRED"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lifecycleStatus: text("lifecycle_status").notNull().default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("drawing_object_source_handle_unique")
    .on(table.sourceImportId, table.plansxpressHandle)
    .where(sql`${table.plansxpressHandle} IS NOT NULL`),
  uniqueIndex("drawing_object_source_index_unique")
    .on(table.sourceImportId, table.sourceEntityIndex)
    .where(sql`${table.sourceEntityIndex} IS NOT NULL`),
  index("drawing_object_job_category_idx").on(table.jobId, table.objectCategory),
  index("drawing_object_source_import_idx").on(table.sourceImportId),
  index("drawing_object_work_area_idx").on(table.workAreaId),
  index("drawing_object_estimation_review_idx").on(table.estimatingStatus, table.reviewStatus),
  check("drawing_object_object_category_check", sql`${table.objectCategory} IN ('WALL', 'DOOR', 'WINDOW', 'OPENING', 'AREA', 'ROOF', 'ELECTRICAL', 'PLUMBING', 'ANNOTATION', 'SYMBOL', 'OTHER')`),
  check("drawing_object_estimating_status_check", sql`${table.estimatingStatus} IN ('ESTIMATED', 'NON_ESTIMATED_VISUAL_ONLY', 'UNKNOWN_REVIEW')`),
  check("drawing_object_review_status_check", sql`${table.reviewStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("drawing_object_lifecycle_status_check", sql`${table.lifecycleStatus} IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')`),
  check("drawing_object_source_identity_required", sql`${table.plansxpressHandle} IS NOT NULL OR ${table.sourceEntityIndex} IS NOT NULL`),
  check("drawing_object_source_entity_index_nonnegative", sql`${table.sourceEntityIndex} IS NULL OR ${table.sourceEntityIndex} >= 0`),
  check("drawing_object_confirmation_guard", sql`${table.reviewStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const physicalWalls = pgTable("physical_wall", {
  id: uuid("id").primaryKey().defaultRandom(),
  drawingObjectId: uuid("drawing_object_id").notNull().unique().references(() => drawingObjects.id, { onDelete: "restrict" }),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  sourceImportId: uuid("source_import_id").notNull().references(() => projectSourceImports.id, { onDelete: "restrict" }),
  plansxpressHandle: text("plansxpress_handle").notNull(),
  startPoint: jsonb("start_point").notNull(),
  endPoint: jsonb("end_point").notNull(),
  coordinateUnits: text("coordinate_units"),
  coordinateSystem: text("coordinate_system"),
  rawCentrelineLength: numeric("raw_centreline_length", { precision: 18, scale: 6 }).notNull(),
  estimatorLength: numeric("estimator_length", { precision: 18, scale: 6 }).notNull(),
  wallHeight: numeric("wall_height", { precision: 18, scale: 6 }).notNull(),
  wallType: text("wall_type"),
  externalLeafConstruction: text("external_leaf_construction"),
  internalLeafConstruction: text("internal_leaf_construction"),
  externalLeafThickness: numeric("external_leaf_thickness", { precision: 18, scale: 6 }),
  internalLeafThickness: numeric("internal_leaf_thickness", { precision: 18, scale: 6 }),
  cavityThickness: numeric("cavity_thickness", { precision: 18, scale: 6 }),
  justification: text("justification"),
  internalSideMetadata: jsonb("internal_side_metadata"),
  externalSideMetadata: jsonb("external_side_metadata"),
  estimatorCalculator: text("estimator_calculator"),
  grossConstructionArea: numeric("gross_construction_area", { precision: 18, scale: 6 }).notNull(),
  openingDeductionArea: numeric("opening_deduction_area", { precision: 18, scale: 6 }).notNull().default("0"),
  netConstructionArea: numeric("net_construction_area", { precision: 18, scale: 6 }).notNull(),
  estimatingStatus: text("estimating_status").notNull().default("UNKNOWN_REVIEW"),
  quantitySource: text("quantity_source").notNull().default("HBXL_STORED"),
  sourceMetadata: jsonb("source_metadata"),
  confidence: text("confidence"),
  reviewStatus: text("review_status").notNull().default("REVIEW_REQUIRED"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lifecycleStatus: text("lifecycle_status").notNull().default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("physical_wall_source_handle_unique").on(table.sourceImportId, table.plansxpressHandle),
  index("physical_wall_job_idx").on(table.jobId),
  index("physical_wall_source_import_idx").on(table.sourceImportId),
  index("physical_wall_estimator_calculator_idx").on(table.estimatorCalculator),
  index("physical_wall_review_status_idx").on(table.reviewStatus),
  check("physical_wall_raw_centreline_length_nonnegative", sql`${table.rawCentrelineLength} >= 0`),
  check("physical_wall_estimator_length_nonnegative", sql`${table.estimatorLength} >= 0`),
  check("physical_wall_height_nonnegative", sql`${table.wallHeight} >= 0`),
  check("physical_wall_external_leaf_thickness_nonnegative", sql`${table.externalLeafThickness} IS NULL OR ${table.externalLeafThickness} >= 0`),
  check("physical_wall_internal_leaf_thickness_nonnegative", sql`${table.internalLeafThickness} IS NULL OR ${table.internalLeafThickness} >= 0`),
  check("physical_wall_cavity_thickness_nonnegative", sql`${table.cavityThickness} IS NULL OR ${table.cavityThickness} >= 0`),
  check("physical_wall_gross_construction_area_nonnegative", sql`${table.grossConstructionArea} >= 0`),
  check("physical_wall_opening_deduction_area_nonnegative", sql`${table.openingDeductionArea} >= 0`),
  check("physical_wall_net_construction_area_nonnegative", sql`${table.netConstructionArea} >= 0`),
  check("physical_wall_estimating_status_check", sql`${table.estimatingStatus} IN ('ESTIMATED', 'NON_ESTIMATED_VISUAL_ONLY', 'UNKNOWN_REVIEW')`),
  check("physical_wall_quantity_source_check", sql`${table.quantitySource} IN ('HBXL_STORED', 'PLANSEXPRESS_STORED', 'DERIVED', 'USER_CONFIRMED')`),
  check("physical_wall_review_status_check", sql`${table.reviewStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("physical_wall_lifecycle_status_check", sql`${table.lifecycleStatus} IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')`),
  check("physical_wall_confirmation_guard", sql`${table.reviewStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const wallSurfaces = pgTable("wall_surface", {
  id: uuid("id").primaryKey().defaultRandom(),
  physicalWallId: uuid("physical_wall_id").notNull().references(() => physicalWalls.id, { onDelete: "restrict" }),
  adjacentWorkAreaId: uuid("adjacent_work_area_id").references(() => workAreas.id, { onDelete: "restrict" }),
  side: text("side").notNull(),
  grossSurfaceArea: numeric("gross_surface_area", { precision: 18, scale: 6 }).notNull(),
  openingDeductionArea: numeric("opening_deduction_area", { precision: 18, scale: 6 }).notNull().default("0"),
  netAvailableSurfaceArea: numeric("net_available_surface_area", { precision: 18, scale: 6 }).notNull(),
  allocationSource: text("allocation_source").notNull(),
  sourceMetadata: jsonb("source_metadata"),
  confidence: text("confidence"),
  reviewStatus: text("review_status").notNull().default("REVIEW_REQUIRED"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("wall_surface_wall_side_unique").on(table.physicalWallId, table.side),
  index("wall_surface_work_area_idx").on(table.adjacentWorkAreaId),
  index("wall_surface_review_status_idx").on(table.reviewStatus),
  check("wall_surface_side_check", sql`${table.side} IN ('A', 'B')`),
  check("wall_surface_gross_surface_area_nonnegative", sql`${table.grossSurfaceArea} >= 0`),
  check("wall_surface_opening_deduction_area_nonnegative", sql`${table.openingDeductionArea} >= 0`),
  check("wall_surface_net_available_surface_area_nonnegative", sql`${table.netAvailableSurfaceArea} >= 0`),
  check("wall_surface_allocation_source_check", sql`${table.allocationSource} IN ('PLANSEXPRESS_AREA', 'DXF_GEOMETRY', 'EXTERIOR_SIDE', 'USER_CONFIRMED', 'UNRESOLVED')`),
  check("wall_surface_review_status_check", sql`${table.reviewStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("wall_surface_confirmation_guard", sql`${table.reviewStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const openings = pgTable("opening", {
  id: uuid("id").primaryKey().defaultRandom(),
  drawingObjectId: uuid("drawing_object_id").references(() => drawingObjects.id, { onDelete: "restrict" }),
  physicalWallId: uuid("physical_wall_id").references(() => physicalWalls.id, { onDelete: "restrict" }),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  sourceImportId: uuid("source_import_id").notNull().references(() => projectSourceImports.id, { onDelete: "restrict" }),
  sourceEntityIndex: integer("source_entity_index"),
  plansxpressHandle: text("plansxpress_handle"),
  plansxpressPxid: text("plansxpress_pxid"),
  openingType: text("opening_type").notNull(),
  width: numeric("width", { precision: 18, scale: 6 }),
  height: numeric("height", { precision: 18, scale: 6 }),
  area: numeric("area", { precision: 18, scale: 6 }),
  positionGeometry: jsonb("position_geometry"),
  coordinateUnits: text("coordinate_units"),
  coordinateSystem: text("coordinate_system"),
  estimatingStatus: text("estimating_status").notNull().default("UNKNOWN_REVIEW"),
  sourceMetadata: jsonb("source_metadata"),
  confidence: text("confidence"),
  reviewStatus: text("review_status").notNull().default("REVIEW_REQUIRED"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lifecycleStatus: text("lifecycle_status").notNull().default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("opening_source_handle_unique")
    .on(table.sourceImportId, table.plansxpressHandle)
    .where(sql`${table.plansxpressHandle} IS NOT NULL`),
  uniqueIndex("opening_source_index_unique")
    .on(table.sourceImportId, table.sourceEntityIndex)
    .where(sql`${table.sourceEntityIndex} IS NOT NULL`),
  index("opening_physical_wall_idx").on(table.physicalWallId),
  index("opening_drawing_object_idx").on(table.drawingObjectId),
  index("opening_job_type_idx").on(table.jobId, table.openingType),
  index("opening_source_import_idx").on(table.sourceImportId),
  index("opening_estimation_review_idx").on(table.estimatingStatus, table.reviewStatus),
  check("opening_opening_type_check", sql`${table.openingType} IN ('DOOR', 'WINDOW', 'OPENING', 'OTHER')`),
  check("opening_width_nonnegative", sql`${table.width} IS NULL OR ${table.width} >= 0`),
  check("opening_height_nonnegative", sql`${table.height} IS NULL OR ${table.height} >= 0`),
  check("opening_area_nonnegative", sql`${table.area} IS NULL OR ${table.area} >= 0`),
  check("opening_estimating_status_check", sql`${table.estimatingStatus} IN ('ESTIMATED', 'NON_ESTIMATED_VISUAL_ONLY', 'UNKNOWN_REVIEW')`),
  check("opening_review_status_check", sql`${table.reviewStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("opening_lifecycle_status_check", sql`${table.lifecycleStatus} IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')`),
  check("opening_source_identity_required", sql`${table.plansxpressHandle} IS NOT NULL OR ${table.sourceEntityIndex} IS NOT NULL`),
  check("opening_source_entity_index_nonnegative", sql`${table.sourceEntityIndex} IS NULL OR ${table.sourceEntityIndex} >= 0`),
  check("opening_evidence_link_required", sql`${table.drawingObjectId} IS NOT NULL OR ${table.physicalWallId} IS NOT NULL`),
  check("opening_confirmation_guard", sql`${table.reviewStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const hbxlResourceBaselines = pgTable("hbxl_resource_baseline", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  sourceImportId: uuid("source_import_id").notNull().references(() => projectSourceImports.id, { onDelete: "restrict" }),
  sourceRowNumber: integer("source_row_number").notNull(),
  sourceRowKey: text("source_row_key"),
  sourceRowHash: varchar("source_row_hash", { length: 64 }).notNull(),
  hbxlProductCode: text("hbxl_product_code"),
  description: text("description").notNull(),
  originalDescription: text("original_description"),
  sourceResourceType: text("source_resource_type"),
  resourceType: text("resource_type").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
  canonicalUnitCode: text("canonical_unit_code"),
  originalUnitText: text("original_unit_text"),
  baselineUnitRate: numeric("baseline_unit_rate", { precision: 18, scale: 6 }),
  baselineValue: numeric("baseline_value", { precision: 18, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("GBP"),
  buildPhase: text("build_phase"),
  supplier: text("supplier"),
  orderDate: date("order_date"),
  requiredDate: date("required_date"),
  sourceMetadata: jsonb("source_metadata"),
  reviewStatus: text("review_status").notNull().default("NOT_APPLICABLE"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("hbxl_resource_baseline_source_row_unique").on(table.sourceImportId, table.sourceRowNumber),
  index("hbxl_resource_baseline_job_import_idx").on(table.jobId, table.sourceImportId),
  index("hbxl_resource_baseline_phase_type_idx").on(table.jobId, table.buildPhase, table.resourceType),
  index("hbxl_resource_baseline_product_code_idx").on(table.hbxlProductCode),
  index("hbxl_resource_baseline_required_date_idx").on(table.requiredDate),
  index("hbxl_resource_baseline_order_date_idx").on(table.orderDate),
  check("hbxl_resource_baseline_source_row_number_positive", sql`${table.sourceRowNumber} > 0`),
  check("hbxl_resource_baseline_source_row_hash_check", sql`${table.sourceRowHash} ~ '^[0-9a-f]{64}$'`),
  check("hbxl_resource_baseline_resource_type_check", sql`${table.resourceType} IN ('MATERIAL', 'LABOUR', 'PLANT', 'OTHER')`),
  check("hbxl_resource_baseline_currency_code_check", sql`${table.currencyCode} IS NULL OR ${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("hbxl_resource_baseline_review_status_check", sql`${table.reviewStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("hbxl_resource_baseline_confirmation_guard", sql`${table.reviewStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const measurableWorkItems = pgTable("measurable_work_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  workAreaId: uuid("work_area_id").references(() => workAreas.id, { onDelete: "restrict" }),
  tradeCode: text("trade_code"),
  tradeName: text("trade_name").notNull(),
  packageCode: text("package_code"),
  packageName: text("package_name"),
  itemCode: text("item_code"),
  description: text("description").notNull(),
  itemType: text("item_type"),
  plannedQuantity: numeric("planned_quantity", { precision: 18, scale: 6 }),
  canonicalUnitCode: text("canonical_unit_code"),
  originalUnitText: text("original_unit_text"),
  quantitySource: text("quantity_source"),
  reconciliationStatus: text("reconciliation_status").notNull().default("REVIEW_REQUIRED"),
  confidence: text("confidence"),
  confidenceMetadata: jsonb("confidence_metadata"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lifecycleStatus: text("lifecycle_status").notNull().default("UNKNOWN"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("measurable_work_item_job_area_idx").on(table.jobId, table.workAreaId),
  index("measurable_work_item_job_trade_idx").on(table.jobId, table.tradeCode, table.tradeName),
  index("measurable_work_item_job_package_idx").on(table.jobId, table.packageCode, table.packageName),
  index("measurable_work_item_job_item_code_idx").on(table.jobId, table.itemCode),
  index("measurable_work_item_reconciliation_idx").on(table.jobId, table.reconciliationStatus),
  check("measurable_work_item_planned_quantity_nonnegative", sql`${table.plannedQuantity} IS NULL OR ${table.plannedQuantity} >= 0`),
  check("measurable_work_item_quantity_source_check", sql`${table.quantitySource} IS NULL OR ${table.quantitySource} IN ('DRAWING', 'HBXL_BASELINE', 'USER_CONFIRMED', 'DERIVED', 'UNKNOWN')`),
  check("measurable_work_item_reconciliation_status_check", sql`${table.reconciliationStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("measurable_work_item_lifecycle_status_check", sql`${table.lifecycleStatus} IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')`),
  check("measurable_work_item_confirmation_guard", sql`${table.reconciliationStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const workItemSourceLinks = pgTable("work_item_source_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  measurableWorkItemId: uuid("measurable_work_item_id").notNull().references(() => measurableWorkItems.id, { onDelete: "restrict" }),
  drawingObjectId: uuid("drawing_object_id").references(() => drawingObjects.id, { onDelete: "restrict" }),
  physicalWallId: uuid("physical_wall_id").references(() => physicalWalls.id, { onDelete: "restrict" }),
  wallSurfaceId: uuid("wall_surface_id").references(() => wallSurfaces.id, { onDelete: "restrict" }),
  openingId: uuid("opening_id").references(() => openings.id, { onDelete: "restrict" }),
  sourceRole: text("source_role").notNull(),
  quantityContribution: numeric("quantity_contribution", { precision: 18, scale: 6 }),
  canonicalUnitCode: text("canonical_unit_code"),
  originalUnitText: text("original_unit_text"),
  confidence: text("confidence"),
  confidenceMetadata: jsonb("confidence_metadata"),
  reconciliationStatus: text("reconciliation_status").notNull().default("REVIEW_REQUIRED"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("work_item_source_link_drawing_unique")
    .on(table.measurableWorkItemId, table.drawingObjectId, table.sourceRole)
    .where(sql`${table.drawingObjectId} IS NOT NULL`),
  uniqueIndex("work_item_source_link_wall_unique")
    .on(table.measurableWorkItemId, table.physicalWallId, table.sourceRole)
    .where(sql`${table.physicalWallId} IS NOT NULL`),
  uniqueIndex("work_item_source_link_surface_unique")
    .on(table.measurableWorkItemId, table.wallSurfaceId, table.sourceRole)
    .where(sql`${table.wallSurfaceId} IS NOT NULL`),
  uniqueIndex("work_item_source_link_opening_unique")
    .on(table.measurableWorkItemId, table.openingId, table.sourceRole)
    .where(sql`${table.openingId} IS NOT NULL`),
  index("work_item_source_link_work_item_idx").on(table.measurableWorkItemId),
  index("work_item_source_link_drawing_idx").on(table.drawingObjectId),
  index("work_item_source_link_wall_idx").on(table.physicalWallId),
  index("work_item_source_link_surface_idx").on(table.wallSurfaceId),
  index("work_item_source_link_opening_idx").on(table.openingId),
  index("work_item_source_link_review_idx").on(table.reconciliationStatus),
  check("work_item_source_link_source_role_check", sql`${table.sourceRole} IN ('QUANTITY_SOURCE', 'LOCATION_EVIDENCE', 'SCOPE', 'EXCLUSION', 'REFERENCE')`),
  check("work_item_source_link_quantity_contribution_nonnegative", sql`${table.quantityContribution} IS NULL OR ${table.quantityContribution} >= 0`),
  check("work_item_source_link_reconciliation_status_check", sql`${table.reconciliationStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("work_item_source_link_exactly_one_target", sql`num_nonnulls(${table.drawingObjectId}, ${table.physicalWallId}, ${table.wallSurfaceId}, ${table.openingId}) = 1`),
  check("work_item_source_link_confirmation_guard", sql`${table.reconciliationStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const workItemHbxlResourceLinks = pgTable("work_item_hbxl_resource_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  measurableWorkItemId: uuid("measurable_work_item_id").notNull().references(() => measurableWorkItems.id, { onDelete: "restrict" }),
  hbxlResourceBaselineId: uuid("hbxl_resource_baseline_id").notNull().references(() => hbxlResourceBaselines.id, { onDelete: "restrict" }),
  resourceRole: text("resource_role"),
  allocationQuantity: numeric("allocation_quantity", { precision: 18, scale: 6 }),
  allocationBasis: text("allocation_basis"),
  allocationMetadata: jsonb("allocation_metadata"),
  confidence: text("confidence"),
  confidenceMetadata: jsonb("confidence_metadata"),
  reconciliationStatus: text("reconciliation_status").notNull().default("REVIEW_REQUIRED"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("work_item_hbxl_resource_link_unique")
    .on(table.measurableWorkItemId, table.hbxlResourceBaselineId, sql`COALESCE(${table.resourceRole}, '')`),
  index("work_item_hbxl_resource_link_work_item_idx").on(table.measurableWorkItemId),
  index("work_item_hbxl_resource_link_resource_idx").on(table.hbxlResourceBaselineId),
  index("work_item_hbxl_resource_link_review_idx").on(table.reconciliationStatus),
  check("work_item_hbxl_resource_link_resource_role_check", sql`${table.resourceRole} IS NULL OR ${table.resourceRole} IN ('PRIMARY', 'MATERIAL_SUPPORT', 'LABOUR_SUPPORT', 'PLANT_SUPPORT', 'COMMERCIAL_REFERENCE')`),
  check("work_item_hbxl_resource_link_allocation_quantity_nonnegative", sql`${table.allocationQuantity} IS NULL OR ${table.allocationQuantity} >= 0`),
  check("work_item_hbxl_resource_link_reconciliation_status_check", sql`${table.reconciliationStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("work_item_hbxl_resource_link_confirmation_guard", sql`${table.reconciliationStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const procurementRequirements = pgTable("procurement_requirement", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  hbxlResourceBaselineId: uuid("hbxl_resource_baseline_id").references(() => hbxlResourceBaselines.id, { onDelete: "restrict" }),
  measurableWorkItemId: uuid("measurable_work_item_id").references(() => measurableWorkItems.id, { onDelete: "restrict" }),
  workAreaId: uuid("work_area_id").references(() => workAreas.id, { onDelete: "restrict" }),
  requirementCode: text("requirement_code"),
  description: text("description").notNull(),
  resourceCode: text("resource_code"),
  resourceType: text("resource_type").notNull(),
  requiredQuantity: numeric("required_quantity", { precision: 18, scale: 6 }).notNull(),
  unitCode: text("unit_code").notNull(),
  originalUnitText: text("original_unit_text"),
  quantitySource: text("quantity_source").notNull().default("UNKNOWN"),
  status: text("status").notNull().default("DRAFT"),
  requiredDate: date("required_date"),
  preferredSupplier: text("preferred_supplier"),
  notes: text("notes"),
  reviewMetadata: jsonb("review_metadata"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("procurement_requirement_code_unique").on(table.jobId, table.requirementCode),
  index("procurement_requirement_job_status_idx").on(table.jobId, table.status, table.requiredDate),
  index("procurement_requirement_hbxl_idx").on(table.hbxlResourceBaselineId),
  index("procurement_requirement_work_item_idx").on(table.measurableWorkItemId),
  index("procurement_requirement_work_area_idx").on(table.workAreaId),
  check("procurement_requirement_resource_type_check", sql`${table.resourceType} IN ('MATERIAL', 'LABOUR', 'PLANT', 'OTHER')`),
  check("procurement_requirement_quantity_nonnegative", sql`${table.requiredQuantity} >= 0`),
  check("procurement_requirement_quantity_source_check", sql`${table.quantitySource} IN ('HBXL_BASELINE', 'DRAWING', 'USER_CONFIRMED', 'DERIVED', 'REVISION', 'UNKNOWN')`),
  check("procurement_requirement_status_check", sql`${table.status} IN ('DRAFT', 'REVIEW_REQUIRED', 'APPROVED_TO_BUY', 'PART_ORDERED', 'FULLY_ORDERED', 'CANCELLED')`),
  check("procurement_requirement_hbxl_source_guard", sql`${table.quantitySource} <> 'HBXL_BASELINE' OR ${table.hbxlResourceBaselineId} IS NOT NULL`),
  check("procurement_requirement_nonmaterial_approval_guard", sql`${table.status} <> 'APPROVED_TO_BUY' OR ${table.resourceType} = 'MATERIAL' OR COALESCE((${table.reviewMetadata} ->> 'non_material_approved')::boolean, false)`),
]);

export const supplierQuotes = pgTable("supplier_quote", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  supersedesSupplierQuoteId: uuid("supersedes_supplier_quote_id").references((): AnyPgColumn => supplierQuotes.id, { onDelete: "restrict" }),
  supplierName: text("supplier_name").notNull(),
  supplierIdentity: text("supplier_identity"),
  quoteReference: text("quote_reference"),
  revisionNumber: integer("revision_number").notNull().default(1),
  quoteDate: date("quote_date").notNull(),
  validUntil: date("valid_until"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("GBP"),
  status: text("status").notNull().default("DRAFT"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("supplier_quote_reference_revision_unique")
    .on(table.jobId, table.supplierName, table.quoteReference, table.revisionNumber)
    .where(sql`${table.quoteReference} IS NOT NULL`),
  uniqueIndex("supplier_quote_supersedes_unique").on(table.supersedesSupplierQuoteId).where(sql`${table.supersedesSupplierQuoteId} IS NOT NULL`),
  index("supplier_quote_job_supplier_idx").on(table.jobId, table.supplierName, table.quoteDate),
  index("supplier_quote_status_validity_idx").on(table.status, table.validUntil),
  check("supplier_quote_revision_positive", sql`${table.revisionNumber} > 0`),
  check("supplier_quote_validity_guard", sql`${table.validUntil} IS NULL OR ${table.validUntil} >= ${table.quoteDate}`),
  check("supplier_quote_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("supplier_quote_status_check", sql`${table.status} IN ('DRAFT', 'RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED')`),
  check("supplier_quote_supersedes_other", sql`${table.supersedesSupplierQuoteId} IS NULL OR ${table.supersedesSupplierQuoteId} <> ${table.id}`),
]);

export const supplierQuoteLines = pgTable("supplier_quote_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierQuoteId: uuid("supplier_quote_id").notNull().references(() => supplierQuotes.id, { onDelete: "restrict" }),
  procurementRequirementId: uuid("procurement_requirement_id").references(() => procurementRequirements.id, { onDelete: "restrict" }),
  lineNumber: integer("line_number").notNull(),
  supplierProductCode: text("supplier_product_code"),
  supplierDescription: text("supplier_description").notNull(),
  quotedQuantity: numeric("quoted_quantity", { precision: 18, scale: 6 }).notNull(),
  unitCode: text("unit_code").notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 6 }).notNull(),
  lineValue: numeric("line_value", { precision: 18, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  leadTimeDays: integer("lead_time_days"),
  availabilityStatus: text("availability_status"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("supplier_quote_line_number_unique").on(table.supplierQuoteId, table.lineNumber),
  index("supplier_quote_line_quote_idx").on(table.supplierQuoteId),
  index("supplier_quote_line_requirement_idx").on(table.procurementRequirementId),
  check("supplier_quote_line_number_positive", sql`${table.lineNumber} > 0`),
  check("supplier_quote_line_quantity_nonnegative", sql`${table.quotedQuantity} >= 0`),
  check("supplier_quote_line_unit_price_nonnegative", sql`${table.unitPrice} >= 0`),
  check("supplier_quote_line_value_reconciles", sql`${table.lineValue} = round(${table.quotedQuantity} * ${table.unitPrice}, 2)`),
  check("supplier_quote_line_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("supplier_quote_line_lead_time_nonnegative", sql`${table.leadTimeDays} IS NULL OR ${table.leadTimeDays} >= 0`),
]);

export const purchaseOrders = pgTable("purchase_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  acceptedSupplierQuoteId: uuid("accepted_supplier_quote_id").references(() => supplierQuotes.id, { onDelete: "restrict" }),
  supersedesPurchaseOrderId: uuid("supersedes_purchase_order_id").references((): AnyPgColumn => purchaseOrders.id, { onDelete: "restrict" }),
  supplierName: text("supplier_name").notNull(),
  supplierIdentity: text("supplier_identity"),
  poNumber: text("po_number").notNull(),
  supplierReference: text("supplier_reference"),
  orderDate: date("order_date").notNull(),
  expectedDeliveryDate: date("expected_delivery_date"),
  status: text("status").notNull().default("DRAFT"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("GBP"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("purchase_order_number_unique").on(table.jobId, table.poNumber),
  index("purchase_order_job_status_date_idx").on(table.jobId, table.status, table.orderDate),
  index("purchase_order_supplier_idx").on(table.jobId, table.supplierName, table.orderDate),
  index("purchase_order_quote_idx").on(table.acceptedSupplierQuoteId),
  uniqueIndex("purchase_order_supersedes_unique").on(table.supersedesPurchaseOrderId).where(sql`${table.supersedesPurchaseOrderId} IS NOT NULL`),
  check("purchase_order_supplier_required", sql`NULLIF(BTRIM(${table.supplierName}), '') IS NOT NULL`),
  check("purchase_order_number_required", sql`NULLIF(BTRIM(${table.poNumber}), '') IS NOT NULL`),
  check("purchase_order_delivery_date_guard", sql`${table.expectedDeliveryDate} IS NULL OR ${table.expectedDeliveryDate} >= ${table.orderDate}`),
  check("purchase_order_status_check", sql`${table.status} IN ('DRAFT', 'APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'CANCELLED', 'COMPLETED')`),
  check("purchase_order_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("purchase_order_supersedes_other", sql`${table.supersedesPurchaseOrderId} IS NULL OR ${table.supersedesPurchaseOrderId} <> ${table.id}`),
  check("purchase_order_manual_source_guard", sql`${table.acceptedSupplierQuoteId} IS NOT NULL OR (NULLIF(BTRIM(${table.sourceMetadata} ->> 'source'), '') IS NOT NULL AND NULLIF(BTRIM(${table.sourceMetadata} ->> 'reason'), '') IS NOT NULL)`),
]);

export const purchaseOrderLines = pgTable("purchase_order_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "restrict" }),
  procurementRequirementId: uuid("procurement_requirement_id").references(() => procurementRequirements.id, { onDelete: "restrict" }),
  supplierQuoteLineId: uuid("supplier_quote_line_id").references(() => supplierQuoteLines.id, { onDelete: "restrict" }),
  lineNumber: integer("line_number").notNull(),
  supplierProductCode: text("supplier_product_code"),
  description: text("description").notNull(),
  orderedQuantity: numeric("ordered_quantity", { precision: 18, scale: 6 }).notNull(),
  unitCode: text("unit_code").notNull(),
  agreedUnitPrice: numeric("agreed_unit_price", { precision: 18, scale: 6 }).notNull(),
  orderedLineValue: numeric("ordered_line_value", { precision: 18, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  requiredDate: date("required_date"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("purchase_order_line_number_unique").on(table.purchaseOrderId, table.lineNumber),
  index("purchase_order_line_requirement_idx").on(table.procurementRequirementId),
  index("purchase_order_line_quote_line_idx").on(table.supplierQuoteLineId),
  check("purchase_order_line_number_positive", sql`${table.lineNumber} > 0`),
  check("purchase_order_line_quantity_positive", sql`${table.orderedQuantity} > 0`),
  check("purchase_order_line_unit_price_nonnegative", sql`${table.agreedUnitPrice} >= 0`),
  check("purchase_order_line_value_reconciles", sql`${table.orderedLineValue} = round(${table.orderedQuantity} * ${table.agreedUnitPrice}, 2)`),
  check("purchase_order_line_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
]);

export const goodsReceipts = pgTable("goods_receipt", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "restrict" }),
  supplierName: text("supplier_name").notNull(),
  deliveryReference: text("delivery_reference"),
  receivedDate: date("received_date").notNull(),
  receivedBy: text("received_by"),
  status: text("status").notNull().default("DRAFT"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("goods_receipt_delivery_reference_unique").on(table.purchaseOrderId, table.deliveryReference).where(sql`${table.deliveryReference} IS NOT NULL`),
  index("goods_receipt_job_status_date_idx").on(table.jobId, table.status, table.receivedDate),
  index("goods_receipt_order_status_date_idx").on(table.purchaseOrderId, table.status, table.receivedDate),
  check("goods_receipt_supplier_required", sql`NULLIF(BTRIM(${table.supplierName}), '') IS NOT NULL`),
  check("goods_receipt_status_check", sql`${table.status} IN ('DRAFT', 'RECEIVED', 'PART_RECEIVED', 'REJECTED', 'CANCELLED')`),
]);

export const goodsReceiptLines = pgTable("goods_receipt_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  goodsReceiptId: uuid("goods_receipt_id").notNull().references(() => goodsReceipts.id, { onDelete: "restrict" }),
  purchaseOrderLineId: uuid("purchase_order_line_id").notNull().references(() => purchaseOrderLines.id, { onDelete: "restrict" }),
  lineNumber: integer("line_number").notNull(),
  receivedQuantity: numeric("received_quantity", { precision: 18, scale: 6 }).notNull(),
  acceptedQuantity: numeric("accepted_quantity", { precision: 18, scale: 6 }).notNull(),
  rejectedQuantity: numeric("rejected_quantity", { precision: 18, scale: 6 }).notNull().default("0"),
  unitCode: text("unit_code").notNull(),
  reconciliationStatus: text("reconciliation_status").notNull().default("REVIEW_REQUIRED"),
  conditionNotes: text("condition_notes"),
  defectNotes: text("defect_notes"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("goods_receipt_line_number_unique").on(table.goodsReceiptId, table.lineNumber),
  index("goods_receipt_line_order_line_idx").on(table.purchaseOrderLineId),
  index("goods_receipt_line_review_idx").on(table.reconciliationStatus).where(sql`${table.reconciliationStatus} IN ('REVIEW_REQUIRED', 'UNRESOLVED')`),
  check("goods_receipt_line_number_positive", sql`${table.lineNumber} > 0`),
  check("goods_receipt_line_received_positive", sql`${table.receivedQuantity} > 0`),
  check("goods_receipt_line_accepted_nonnegative", sql`${table.acceptedQuantity} >= 0`),
  check("goods_receipt_line_rejected_nonnegative", sql`${table.rejectedQuantity} >= 0`),
  check("goods_receipt_line_allocation_guard", sql`${table.acceptedQuantity} + ${table.rejectedQuantity} <= ${table.receivedQuantity}`),
  check("goods_receipt_line_status_check", sql`${table.reconciliationStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED')`),
  check("goods_receipt_line_matched_guard", sql`${table.reconciliationStatus} <> 'MATCHED' OR (${table.rejectedQuantity} = 0 AND ${table.acceptedQuantity} = ${table.receivedQuantity})`),
  check("goods_receipt_line_review_guard", sql`${table.reconciliationStatus} NOT IN ('REVIEW_REQUIRED', 'UNRESOLVED') OR NULLIF(BTRIM(${table.reviewReason}), '') IS NOT NULL`),
  check("goods_receipt_line_confirmation_guard", sql`${table.reconciliationStatus} <> 'USER_CONFIRMED' OR (NULLIF(BTRIM(${table.reviewReason}), '') IS NOT NULL AND NULLIF(BTRIM(${table.confirmedBy}), '') IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const supplierInvoices = pgTable("supplier_invoice", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "restrict" }),
  supplierName: text("supplier_name").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  status: text("status").notNull().default("RECEIVED"),
  supplierReference: text("supplier_reference"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("supplier_invoice_identity_unique").on(table.jobId, sql`lower(BTRIM(${table.supplierName}))`, sql`lower(BTRIM(${table.invoiceNumber}))`),
  index("supplier_invoice_job_status_date_idx").on(table.jobId, table.status, table.invoiceDate),
  index("supplier_invoice_order_status_date_idx").on(table.purchaseOrderId, table.status, table.invoiceDate),
  check("supplier_invoice_supplier_required", sql`NULLIF(BTRIM(${table.supplierName}), '') IS NOT NULL`),
  check("supplier_invoice_number_required", sql`NULLIF(BTRIM(${table.invoiceNumber}), '') IS NOT NULL`),
  check("supplier_invoice_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("supplier_invoice_status_check", sql`${table.status} IN ('RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'DISPUTED', 'CANCELLED')`),
  check("supplier_invoice_unlinked_source_guard", sql`${table.purchaseOrderId} IS NOT NULL OR (NULLIF(BTRIM(${table.sourceMetadata} ->> 'source'), '') IS NOT NULL AND NULLIF(BTRIM(${table.sourceMetadata} ->> 'reason'), '') IS NOT NULL)`),
]);

export const supplierInvoiceLines = pgTable("supplier_invoice_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierInvoiceId: uuid("supplier_invoice_id").notNull().references(() => supplierInvoices.id, { onDelete: "restrict" }),
  purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLines.id, { onDelete: "restrict" }),
  procurementRequirementId: uuid("procurement_requirement_id").references(() => procurementRequirements.id, { onDelete: "restrict" }),
  lineNumber: integer("line_number").notNull(),
  supplierProductCode: text("supplier_product_code"),
  description: text("description").notNull(),
  invoicedQuantity: numeric("invoiced_quantity", { precision: 18, scale: 6 }).notNull(),
  unitCode: text("unit_code").notNull(),
  actualUnitPrice: numeric("actual_unit_price", { precision: 18, scale: 6 }).notNull(),
  actualLineValue: numeric("actual_line_value", { precision: 18, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  reconciliationStatus: text("reconciliation_status").notNull().default("REVIEW_REQUIRED"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("supplier_invoice_line_number_unique").on(table.supplierInvoiceId, table.lineNumber),
  index("supplier_invoice_line_order_line_idx").on(table.purchaseOrderLineId),
  index("supplier_invoice_line_requirement_idx").on(table.procurementRequirementId),
  index("supplier_invoice_line_review_idx").on(table.reconciliationStatus).where(sql`${table.reconciliationStatus} IN ('REVIEW_REQUIRED', 'UNRESOLVED')`),
  check("supplier_invoice_line_number_positive", sql`${table.lineNumber} > 0`),
  check("supplier_invoice_line_quantity_positive", sql`${table.invoicedQuantity} > 0`),
  check("supplier_invoice_line_unit_price_nonnegative", sql`${table.actualUnitPrice} >= 0`),
  check("supplier_invoice_line_value_reconciles", sql`${table.actualLineValue} = round(${table.invoicedQuantity} * ${table.actualUnitPrice}, 2)`),
  check("supplier_invoice_line_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("supplier_invoice_line_status_check", sql`${table.reconciliationStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED')`),
  check("supplier_invoice_line_review_guard", sql`${table.reconciliationStatus} NOT IN ('REVIEW_REQUIRED', 'UNRESOLVED') OR NULLIF(BTRIM(${table.reviewReason}), '') IS NOT NULL`),
  check("supplier_invoice_line_confirmation_guard", sql`${table.reconciliationStatus} <> 'USER_CONFIRMED' OR (NULLIF(BTRIM(${table.reviewReason}), '') IS NOT NULL AND NULLIF(BTRIM(${table.confirmedBy}), '') IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const clientReceivables = pgTable("client_receivable", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  reference: text("reference").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("GBP"),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
  vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
  amountReceived: numeric("amount_received", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("DRAFT"),
  vatStatus: text("vat_status").notNull().default("NOT_REGISTERED_INACTIVE"),
  sourceEvidence: text("source_evidence"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("client_receivable_reference_unique").on(table.jobId, table.reference),
  index("idx_client_receivable_job_status").on(table.jobId, table.status),
  index("idx_client_receivable_client").on(table.clientId),
  index("idx_client_receivable_due_date").on(table.dueDate),
  check("client_receivable_amounts_nonnegative", sql`${table.netAmount} >= 0 AND ${table.vatAmount} >= 0 AND ${table.grossAmount} >= 0 AND ${table.amountReceived} >= 0`),
  check("client_receivable_gross_reconciles", sql`${table.grossAmount} = ${table.netAmount} + ${table.vatAmount}`),
  check("client_receivable_received_cap", sql`${table.amountReceived} <= ${table.grossAmount}`),
  check("client_receivable_due_date_guard", sql`${table.dueDate} IS NULL OR ${table.dueDate} >= ${table.invoiceDate}`),
  check("client_receivable_status_check", sql`${table.status} IN ('DRAFT', 'ISSUED', 'PART_RECEIVED', 'RECEIVED', 'DISPUTED', 'CANCELLED')`),
  check("client_receivable_vat_status_check", sql`${table.vatStatus} IN ('NOT_REGISTERED_INACTIVE', 'VAT_READY_FUTURE')`),
  check("client_receivable_vat_inactive_guard", sql`${table.vatStatus} <> 'NOT_REGISTERED_INACTIVE' OR ${table.vatAmount} = 0`),
]);

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("MONZO"),
  providerAccountId: text("provider_account_id").notNull(),
  description: text("description"),
  accountType: text("account_type"),
  currencyCode: varchar("currency_code", { length: 3 }),
  rawProviderPayload: jsonb("raw_provider_payload"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bank_accounts_identity_unique").on(table.provider, table.providerAccountId),
  index("idx_bank_accounts_provider_account").on(table.provider, table.providerAccountId),
  check("bank_accounts_provider_check", sql`${table.provider} IN ('MONZO')`),
  check("bank_accounts_currency_code_check", sql`${table.currencyCode} IS NULL OR ${table.currencyCode} ~ '^[A-Z]{3}$'`),
]);

export const bankTransactions = pgTable("bank_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, { onDelete: "restrict" }),
  provider: text("provider").notNull().default("MONZO"),
  providerAccountId: text("provider_account_id").notNull(),
  providerTransactionId: text("provider_transaction_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  direction: text("direction").notNull(),
  transactionAt: timestamp("transaction_at", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  counterpartyName: text("counterparty_name"),
  merchantName: text("merchant_name"),
  rawProviderPayload: jsonb("raw_provider_payload").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bank_transactions_identity_unique").on(table.provider, table.providerTransactionId),
  index("idx_bank_transactions_account_date").on(table.bankAccountId, table.transactionAt),
  index("idx_bank_transactions_direction_date").on(table.direction, table.transactionAt),
  check("bank_transactions_provider_check", sql`${table.provider} IN ('MONZO')`),
  check("bank_transactions_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("bank_transactions_direction_check", sql`${table.direction} IN ('INCOMING', 'OUTGOING')`),
  check("bank_transactions_amount_nonzero", sql`${table.amount} <> 0 AND ${table.amountMinor} <> 0`),
  check("bank_transactions_direction_amount_guard", sql`(${table.direction} = 'INCOMING' AND ${table.amount} > 0 AND ${table.amountMinor} > 0) OR (${table.direction} = 'OUTGOING' AND ${table.amount} < 0 AND ${table.amountMinor} < 0)`),
]);

export const bankReconciliationMatches = pgTable("bank_reconciliation_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankTransactionId: uuid("bank_transaction_id").notNull().references(() => bankTransactions.id, { onDelete: "restrict" }),
  direction: text("direction").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  jobId: varchar("job_id").references(() => jobs.id, { onDelete: "restrict" }),
  counterpartyName: text("counterparty_name"),
  matchedAmount: numeric("matched_amount", { precision: 14, scale: 2 }).notNull(),
  matchStatus: text("match_status").notNull().default("PROPOSED"),
  matchType: text("match_type").notNull(),
  evidence: text("evidence"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  rejectedBy: text("rejected_by"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_bank_recon_transaction_status").on(table.bankTransactionId, table.matchStatus),
  index("idx_bank_recon_target_status").on(table.targetType, table.targetId, table.matchStatus),
  index("idx_bank_recon_job_status").on(table.jobId, table.matchStatus),
  check("bank_recon_direction_check", sql`${table.direction} IN ('INCOMING', 'OUTGOING')`),
  check("bank_recon_target_type_check", sql`${table.targetType} IN ('LABOUR_SETTLEMENT', 'CONTRACTOR_VALUATION', 'SUPPLIER_INVOICE', 'CLIENT_RECEIVABLE')`),
  check("bank_recon_direction_target_guard", sql`(${table.direction} = 'INCOMING' AND ${table.targetType} = 'CLIENT_RECEIVABLE') OR (${table.direction} = 'OUTGOING' AND ${table.targetType} IN ('LABOUR_SETTLEMENT', 'CONTRACTOR_VALUATION', 'SUPPLIER_INVOICE'))`),
  check("bank_recon_amount_positive", sql`${table.matchedAmount} > 0`),
  check("bank_recon_status_check", sql`${table.matchStatus} IN ('PROPOSED', 'CONFIRMED', 'REJECTED')`),
  check("bank_recon_type_check", sql`${table.matchType} IN ('EXACT', 'PARTIAL', 'MULTI_PAYMENT', 'MULTI_OBLIGATION', 'MANUAL')`),
  check("bank_recon_confirm_guard", sql`${table.matchStatus} <> 'CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
  check("bank_recon_reject_guard", sql`${table.matchStatus} <> 'REJECTED' OR (${table.rejectedBy} IS NOT NULL AND ${table.rejectedAt} IS NOT NULL)`),
]);

export const bankProviderConnections = pgTable("bank_provider_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("MONZO"),
  status: text("status").notNull().default("PENDING_AUTH"),
  providerUserId: text("provider_user_id"),
  providerClientIdHash: varchar("provider_client_id_hash", { length: 64 }),
  selectedProviderAccountId: text("selected_provider_account_id"),
  encryptedTokenPayload: text("encrypted_token_payload"),
  tokenKeyVersion: text("token_key_version"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bank_provider_connections_single_connected").on(table.provider).where(sql`${table.status} = 'CONNECTED'`),
  index("idx_bank_provider_connections_provider_status").on(table.provider, table.status),
  check("bank_provider_connections_provider_check", sql`${table.provider} IN ('MONZO')`),
  check("bank_provider_connections_status_check", sql`${table.status} IN ('PENDING_AUTH', 'CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED')`),
  check("bank_provider_connections_hash_check", sql`${table.providerClientIdHash} IS NULL OR ${table.providerClientIdHash} ~ '^[a-f0-9]{64}$'`),
  check("bank_provider_connections_connected_token_guard", sql`${table.status} <> 'CONNECTED' OR (${table.encryptedTokenPayload} IS NOT NULL AND ${table.tokenExpiresAt} IS NOT NULL AND ${table.authorizedAt} IS NOT NULL)`),
  check("bank_provider_connections_disconnect_guard", sql`${table.status} <> 'DISCONNECTED' OR ${table.disconnectedAt} IS NOT NULL`),
]);

export const contractPackages = pgTable("contract_package", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id, { onDelete: "restrict" }),
  packageCode: text("package_code"),
  packageName: text("package_name").notNull(),
  tradeCode: text("trade_code"),
  tradeName: text("trade_name"),
  status: text("status").notNull().default("DRAFT"),
  tenderedAt: timestamp("tendered_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("GBP"),
  packageNotes: text("package_notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contract_package_job_status_idx").on(table.jobId, table.status),
  index("contract_package_contractor_status_idx").on(table.contractorId, table.status),
  index("contract_package_job_trade_idx").on(table.jobId, table.tradeCode, table.tradeName),
  index("contract_package_job_code_idx").on(table.jobId, table.packageCode),
  check("contract_package_status_check", sql`${table.status} IN ('DRAFT', 'TENDERING', 'ACCEPTED', 'ACTIVE', 'COMPLETED', 'CANCELLED')`),
  check("contract_package_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("contract_package_date_order_guard", sql`${table.startDate} IS NULL OR ${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
  check("contract_package_tendered_guard", sql`${table.status} NOT IN ('TENDERING', 'ACCEPTED', 'ACTIVE', 'COMPLETED') OR ${table.tenderedAt} IS NOT NULL`),
  check("contract_package_accepted_guard", sql`${table.status} NOT IN ('ACCEPTED', 'ACTIVE', 'COMPLETED') OR ${table.acceptedAt} IS NOT NULL`),
]);

export const contractorTenderRates = pgTable("contractor_tender_rate", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractPackageId: uuid("contract_package_id").notNull().references(() => contractPackages.id, { onDelete: "restrict" }),
  tenderItemCode: text("tender_item_code").notNull(),
  description: text("description").notNull(),
  agreedQuantity: numeric("agreed_quantity", { precision: 18, scale: 6 }).notNull(),
  unitCode: text("unit_code").notNull(),
  originalUnitText: text("original_unit_text"),
  lockedUnitRate: numeric("locked_unit_rate", { precision: 18, scale: 6 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("GBP"),
  lockedContractValue: numeric("locked_contract_value", { precision: 18, scale: 2 }).notNull(),
  tenderRevisionNumber: integer("tender_revision_number").notNull(),
  status: text("status").notNull().default("DRAFT"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: text("accepted_by"),
  source: text("source"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contractor_tender_rate_revision_unique").on(table.contractPackageId, table.tenderItemCode, table.tenderRevisionNumber),
  uniqueIndex("contractor_tender_rate_current_accepted_unique")
    .on(table.contractPackageId, table.tenderItemCode)
    .where(sql`${table.status} IN ('ACCEPTED', 'LOCKED')`),
  index("contractor_tender_rate_package_status_idx").on(table.contractPackageId, table.status),
  index("contractor_tender_rate_package_item_idx").on(table.contractPackageId, table.tenderItemCode),
  index("contractor_tender_rate_review_idx").on(table.status, table.acceptedAt),
  check("contractor_tender_rate_agreed_quantity_nonnegative", sql`${table.agreedQuantity} >= 0`),
  check("contractor_tender_rate_locked_unit_rate_nonnegative", sql`${table.lockedUnitRate} >= 0`),
  check("contractor_tender_rate_locked_contract_value_nonnegative", sql`${table.lockedContractValue} >= 0`),
  check("contractor_tender_rate_revision_positive", sql`${table.tenderRevisionNumber} > 0`),
  check("contractor_tender_rate_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("contractor_tender_rate_status_check", sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'LOCKED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN')`),
  check("contractor_tender_rate_value_reconciles", sql`${table.lockedContractValue} = round(${table.agreedQuantity} * ${table.lockedUnitRate}, 2)`),
  check("contractor_tender_rate_acceptance_guard", sql`${table.status} NOT IN ('ACCEPTED', 'LOCKED', 'SUPERSEDED') OR (${table.acceptedAt} IS NOT NULL AND ${table.acceptedBy} IS NOT NULL)`),
]);

export const contractorTenderRateWorkItemLinks = pgTable("contractor_tender_rate_work_item_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractorTenderRateId: uuid("contractor_tender_rate_id").notNull().references(() => contractorTenderRates.id, { onDelete: "restrict" }),
  measurableWorkItemId: uuid("measurable_work_item_id").notNull().references(() => measurableWorkItems.id, { onDelete: "restrict" }),
  allocatedQuantity: numeric("allocated_quantity", { precision: 18, scale: 6 }),
  allocationStatus: text("allocation_status").notNull().default("REVIEW_REQUIRED"),
  confidence: text("confidence"),
  confidenceMetadata: jsonb("confidence_metadata"),
  reasonCode: text("reason_code"),
  reviewReason: text("review_reason"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  source: text("source"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contractor_tender_rate_work_item_link_unique").on(table.contractorTenderRateId, table.measurableWorkItemId),
  index("contractor_tender_rate_work_item_link_rate_idx").on(table.contractorTenderRateId),
  index("contractor_tender_rate_work_item_link_item_idx").on(table.measurableWorkItemId),
  index("contractor_tender_rate_work_item_link_review_idx").on(table.allocationStatus),
  check("contractor_tender_rate_work_item_link_allocated_quantity_nonnegative", sql`${table.allocatedQuantity} IS NULL OR ${table.allocatedQuantity} >= 0`),
  check("contractor_tender_rate_work_item_link_allocation_status_check", sql`${table.allocationStatus} IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')`),
  check("contractor_tender_rate_work_item_link_confirmation_guard", sql`${table.allocationStatus} <> 'USER_CONFIRMED' OR (${table.confirmedBy} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`),
]);

export const workProgress = pgTable("work_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  measurableWorkItemId: uuid("measurable_work_item_id").notNull().references(() => measurableWorkItems.id, { onDelete: "restrict" }),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id, { onDelete: "restrict" }),
  contractPackageId: uuid("contract_package_id").references(() => contractPackages.id, { onDelete: "restrict" }),
  tenderRateId: uuid("tender_rate_id").references(() => contractorTenderRates.id, { onDelete: "restrict" }),
  tenderRateWorkItemLinkId: uuid("tender_rate_work_item_link_id").references(() => contractorTenderRateWorkItemLinks.id, { onDelete: "restrict" }),
  progressQuantity: numeric("progress_quantity", { precision: 18, scale: 6 }).notNull(),
  unitCode: text("unit_code").notNull(),
  progressDate: date("progress_date").notNull(),
  entryType: text("entry_type").notNull().default("PROGRESS"),
  reversesProgressId: uuid("reverses_progress_id").references((): AnyPgColumn => workProgress.id, { onDelete: "restrict" }),
  recordedBy: text("recorded_by").notNull(),
  actorMetadata: jsonb("actor_metadata"),
  notes: text("notes"),
  evidenceMetadata: jsonb("evidence_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("work_progress_reversal_unique").on(table.reversesProgressId).where(sql`${table.reversesProgressId} IS NOT NULL`),
  index("work_progress_job_item_date_idx").on(table.jobId, table.measurableWorkItemId, table.progressDate),
  index("work_progress_contractor_date_idx").on(table.contractorId, table.progressDate),
  index("work_progress_package_idx").on(table.contractPackageId),
  index("work_progress_tender_link_idx").on(table.tenderRateWorkItemLinkId),
  check("work_progress_quantity_positive", sql`${table.progressQuantity} > 0`),
  check("work_progress_entry_type_check", sql`${table.entryType} IN ('PROGRESS', 'REVERSAL')`),
  check("work_progress_reversal_guard", sql`(${table.entryType} = 'PROGRESS' AND ${table.reversesProgressId} IS NULL) OR (${table.entryType} = 'REVERSAL' AND ${table.reversesProgressId} IS NOT NULL)`),
  check("work_progress_tender_link_guard", sql`${table.tenderRateWorkItemLinkId} IS NULL OR (${table.contractPackageId} IS NOT NULL AND ${table.tenderRateId} IS NOT NULL)`),
]);

export const contractorClaims = pgTable("contractor_claim", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  contractPackageId: uuid("contract_package_id").notNull().references(() => contractPackages.id, { onDelete: "restrict" }),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id, { onDelete: "restrict" }),
  claimNumber: text("claim_number").notNull(),
  claimSequence: integer("claim_sequence").notNull(),
  claimPeriodStart: date("claim_period_start"),
  claimPeriodEnd: date("claim_period_end"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  status: text("status").notNull().default("DRAFT"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contractor_claim_number_unique").on(table.contractPackageId, table.claimNumber),
  uniqueIndex("contractor_claim_sequence_unique").on(table.contractPackageId, table.claimSequence),
  index("contractor_claim_job_status_idx").on(table.jobId, table.status),
  index("contractor_claim_package_status_idx").on(table.contractPackageId, table.status),
  index("contractor_claim_contractor_idx").on(table.contractorId, table.submittedAt),
  check("contractor_claim_sequence_positive", sql`${table.claimSequence} > 0`),
  check("contractor_claim_status_check", sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PART_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN')`),
  check("contractor_claim_period_guard", sql`${table.claimPeriodStart} IS NULL OR ${table.claimPeriodEnd} IS NULL OR ${table.claimPeriodEnd} >= ${table.claimPeriodStart}`),
  check("contractor_claim_submission_guard", sql`${table.status} = 'DRAFT' OR ${table.submittedAt} IS NOT NULL`),
]);

export const contractorClaimLines = pgTable("contractor_claim_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractorClaimId: uuid("contractor_claim_id").notNull().references(() => contractorClaims.id, { onDelete: "restrict" }),
  measurableWorkItemId: uuid("measurable_work_item_id").notNull().references(() => measurableWorkItems.id, { onDelete: "restrict" }),
  contractorTenderRateId: uuid("contractor_tender_rate_id").notNull().references(() => contractorTenderRates.id, { onDelete: "restrict" }),
  tenderRateWorkItemLinkId: uuid("tender_rate_work_item_link_id").notNull().references(() => contractorTenderRateWorkItemLinks.id, { onDelete: "restrict" }),
  claimedQuantity: numeric("claimed_quantity", { precision: 18, scale: 6 }).notNull(),
  unitCode: text("unit_code").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contractor_claim_line_item_unique").on(table.contractorClaimId, table.tenderRateWorkItemLinkId),
  index("contractor_claim_line_claim_idx").on(table.contractorClaimId),
  index("contractor_claim_line_work_item_idx").on(table.measurableWorkItemId),
  index("contractor_claim_line_tender_rate_idx").on(table.contractorTenderRateId),
  index("contractor_claim_line_allocation_idx").on(table.tenderRateWorkItemLinkId),
  check("contractor_claim_line_claimed_quantity_positive", sql`${table.claimedQuantity} > 0`),
]);

export const inspectionDecisions = pgTable("inspection_decision", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractorClaimLineId: uuid("contractor_claim_line_id").notNull().references(() => contractorClaimLines.id, { onDelete: "restrict" }),
  inspectorId: text("inspector_id").notNull(),
  inspectorMetadata: jsonb("inspector_metadata"),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }).notNull(),
  inspectedQuantity: numeric("inspected_quantity", { precision: 18, scale: 6 }).notNull(),
  approvedQuantity: numeric("approved_quantity", { precision: 18, scale: 6 }).notNull().default("0"),
  rejectedQuantity: numeric("rejected_quantity", { precision: 18, scale: 6 }).notNull().default("0"),
  heldQuantity: numeric("held_quantity", { precision: 18, scale: 6 }).notNull().default("0"),
  decisionStatus: text("decision_status").notNull(),
  defectReasonCode: text("defect_reason_code"),
  notes: text("notes"),
  evidenceMetadata: jsonb("evidence_metadata"),
  supersedesDecisionId: uuid("supersedes_decision_id").references((): AnyPgColumn => inspectionDecisions.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("inspection_decision_supersedes_unique").on(table.supersedesDecisionId).where(sql`${table.supersedesDecisionId} IS NOT NULL`),
  index("inspection_decision_claim_line_idx").on(table.contractorClaimLineId, table.inspectedAt),
  index("inspection_decision_status_idx").on(table.decisionStatus, table.inspectedAt),
  check("inspection_decision_inspected_quantity_nonnegative", sql`${table.inspectedQuantity} >= 0`),
  check("inspection_decision_approved_quantity_nonnegative", sql`${table.approvedQuantity} >= 0`),
  check("inspection_decision_rejected_quantity_nonnegative", sql`${table.rejectedQuantity} >= 0`),
  check("inspection_decision_held_quantity_nonnegative", sql`${table.heldQuantity} >= 0`),
  check("inspection_decision_status_check", sql`${table.decisionStatus} IN ('APPROVED', 'PART_APPROVED', 'REJECTED', 'HELD', 'REINSPECTION_REQUIRED')`),
  check("inspection_decision_quantity_allocation_guard", sql`${table.approvedQuantity} + ${table.rejectedQuantity} + ${table.heldQuantity} <= ${table.inspectedQuantity}`),
  check("inspection_decision_approved_guard", sql`${table.decisionStatus} <> 'APPROVED' OR (${table.approvedQuantity} = ${table.inspectedQuantity} AND ${table.rejectedQuantity} = 0 AND ${table.heldQuantity} = 0)`),
  check("inspection_decision_rejected_guard", sql`${table.decisionStatus} <> 'REJECTED' OR (${table.rejectedQuantity} > 0 AND ${table.approvedQuantity} = 0)`),
  check("inspection_decision_held_guard", sql`${table.decisionStatus} NOT IN ('HELD', 'REINSPECTION_REQUIRED') OR ${table.heldQuantity} > 0`),
  check("inspection_decision_supersedes_other", sql`${table.supersedesDecisionId} IS NULL OR ${table.supersedesDecisionId} <> ${table.id}`),
]);

export const contractorValuations = pgTable("contractor_valuation", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  contractPackageId: uuid("contract_package_id").notNull().references(() => contractPackages.id, { onDelete: "restrict" }),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id, { onDelete: "restrict" }),
  valuationNumber: text("valuation_number").notNull(),
  valuationSequence: integer("valuation_sequence").notNull(),
  valuationPeriodStart: date("valuation_period_start"),
  valuationPeriodEnd: date("valuation_period_end"),
  status: text("status").notNull().default("DRAFT"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("GBP"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  supersedesValuationId: uuid("supersedes_valuation_id").references((): AnyPgColumn => contractorValuations.id, { onDelete: "restrict" }),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contractor_valuation_number_unique").on(table.contractPackageId, table.valuationNumber),
  uniqueIndex("contractor_valuation_sequence_unique").on(table.contractPackageId, table.valuationSequence),
  index("contractor_valuation_job_status_idx").on(table.jobId, table.status),
  index("contractor_valuation_package_status_idx").on(table.contractPackageId, table.status),
  index("contractor_valuation_contractor_idx").on(table.contractorId, table.approvedAt),
  uniqueIndex("contractor_valuation_supersedes_unique").on(table.supersedesValuationId).where(sql`${table.supersedesValuationId} IS NOT NULL`),
  check("contractor_valuation_sequence_positive", sql`${table.valuationSequence} > 0`),
  check("contractor_valuation_status_check", sql`${table.status} IN ('DRAFT', 'CALCULATED', 'APPROVED', 'SUPERSEDED', 'CANCELLED')`),
  check("contractor_valuation_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("contractor_valuation_period_guard", sql`${table.valuationPeriodStart} IS NULL OR ${table.valuationPeriodEnd} IS NULL OR ${table.valuationPeriodEnd} >= ${table.valuationPeriodStart}`),
  check("contractor_valuation_approval_guard", sql`${table.status} NOT IN ('APPROVED', 'SUPERSEDED') OR (${table.approvedAt} IS NOT NULL AND ${table.approvedBy} IS NOT NULL)`),
  check("contractor_valuation_supersedes_other", sql`${table.supersedesValuationId} IS NULL OR ${table.supersedesValuationId} <> ${table.id}`),
]);

export const contractorValuationLines = pgTable("contractor_valuation_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractorValuationId: uuid("contractor_valuation_id").notNull().references(() => contractorValuations.id, { onDelete: "restrict" }),
  measurableWorkItemId: uuid("measurable_work_item_id").notNull().references(() => measurableWorkItems.id, { onDelete: "restrict" }),
  contractorTenderRateId: uuid("contractor_tender_rate_id").notNull().references(() => contractorTenderRates.id, { onDelete: "restrict" }),
  tenderRateWorkItemLinkId: uuid("tender_rate_work_item_link_id").notNull().references(() => contractorTenderRateWorkItemLinks.id, { onDelete: "restrict" }),
  approvedQuantity: numeric("approved_quantity", { precision: 18, scale: 6 }).notNull(),
  previouslyValuedQuantity: numeric("previously_valued_quantity", { precision: 18, scale: 6 }).notNull(),
  currentValuationQuantity: numeric("current_valuation_quantity", { precision: 18, scale: 6 }).notNull(),
  currentValue: numeric("current_value", { precision: 18, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  approvalSnapshot: jsonb("approval_snapshot").notNull(),
  calculationMetadata: jsonb("calculation_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contractor_valuation_line_allocation_unique").on(table.contractorValuationId, table.tenderRateWorkItemLinkId),
  index("contractor_valuation_line_valuation_idx").on(table.contractorValuationId),
  index("contractor_valuation_line_work_item_idx").on(table.measurableWorkItemId),
  index("contractor_valuation_line_tender_rate_idx").on(table.contractorTenderRateId),
  index("contractor_valuation_line_allocation_idx").on(table.tenderRateWorkItemLinkId),
  check("contractor_valuation_line_approved_quantity_nonnegative", sql`${table.approvedQuantity} >= 0`),
  check("contractor_valuation_line_previously_valued_quantity_nonnegative", sql`${table.previouslyValuedQuantity} >= 0`),
  check("contractor_valuation_line_current_quantity_positive", sql`${table.currentValuationQuantity} > 0`),
  check("contractor_valuation_line_current_value_nonnegative", sql`${table.currentValue} >= 0`),
  check("contractor_valuation_line_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("contractor_valuation_line_quantity_reconciles", sql`${table.currentValuationQuantity} = ${table.approvedQuantity} - ${table.previouslyValuedQuantity}`),
]);

export const contractorPayments = pgTable("contractor_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id, { onDelete: "restrict" }),
  contractorValuationId: uuid("contractor_valuation_id").references(() => contractorValuations.id, { onDelete: "restrict" }),
  reversesPaymentId: uuid("reverses_payment_id").references((): AnyPgColumn => contractorPayments.id, { onDelete: "restrict" }),
  paymentAmount: numeric("payment_amount", { precision: 18, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("GBP"),
  paymentDate: date("payment_date").notNull(),
  paymentStatus: text("payment_status").notNull(),
  paymentReference: text("payment_reference"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  sourceMetadata: jsonb("source_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contractor_payments_job_idx").on(table.jobId, table.paymentDate),
  index("contractor_payments_contractor_idx").on(table.contractorId, table.paymentDate),
  index("contractor_payments_valuation_idx").on(table.contractorValuationId, table.paymentStatus),
  index("contractor_payments_reverses_idx").on(table.reversesPaymentId),
  check("contractor_payments_amount_positive", sql`${table.paymentAmount} > 0`),
  check("contractor_payments_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  check("contractor_payments_status_check", sql`${table.paymentStatus} IN ('PENDING', 'SCHEDULED', 'PAID', 'FAILED', 'CANCELLED', 'REVERSED')`),
  check("contractor_payments_unlinked_reason_guard", sql`${table.contractorValuationId} IS NOT NULL OR (NULLIF(BTRIM(${table.sourceMetadata} ->> 'source'), '') IS NOT NULL AND NULLIF(BTRIM(${table.sourceMetadata} ->> 'reason'), '') IS NOT NULL)`),
  check("contractor_payments_reversal_guard", sql`(${table.paymentStatus} = 'REVERSED') = (${table.reversesPaymentId} IS NOT NULL)`),
]);

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
  jobId: varchar("job_id").references(() => jobs.id),
  workerId: varchar("worker_id").references(() => workers.id),
  contractorId: varchar("contractor_id").references(() => contractors.id),
  supplierId: varchar("supplier_id").references(() => suppliers.id),
  payeeId: varchar("payee_id").references(() => payees.id),
});

// Temporary departure tracking for contractors during work hours
export const temporaryDepartures = pgTable("temporary_departures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorName: text("contractor_name").notNull(),
  workSessionId: varchar("work_session_id").references(() => workSessions.id),
  departureTime: timestamp("departure_time").notNull(),
  returnTime: timestamp("return_time"),
  status: text("status").notNull().default("away"), // "away" or "returned"
  distanceFromSite: text("distance_from_site"), // Distance in meters
  nearestJobSite: text("nearest_job_site"), // Which job site they're away from
  createdAt: timestamp("created_at").defaultNow(),
});

// Event-driven attendance tracking history linked to parent work session
export const attendanceEvents = pgTable("attendance_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workSessionId: varchar("work_session_id").notNull().references(() => workSessions.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // 'CLOCK_IN' | 'BREAK_START' | 'BREAK_END' | 'CLOCK_OUT' | 'LOCATION_SIGNAL_LOST' | 'LOCATION_SIGNAL_RESTORED'
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  gpsAccuracy: doublePrecision("gps_accuracy"),
  jobId: varchar("job_id").references(() => jobs.id),
  siteName: text("site_name"),
  source: text("source").notNull().default("worker"), // 'worker' | 'admin' | 'system'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AttendanceEvent = typeof attendanceEvents.$inferSelect;
export type InsertAttendanceEvent = typeof attendanceEvents.$inferInsert;

export const siteCheckinConfigs = pgTable("site_checkin_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "restrict" }),
  siteName: text("site_name"),
  siteLatitude: text("site_latitude").notNull(),
  siteLongitude: text("site_longitude").notNull(),
  allowedRadiusMetres: integer("allowed_radius_metres").notNull().default(100),
  qrEnabled: boolean("qr_enabled").notNull().default(true),
  gpsEnabled: boolean("gps_enabled").notNull().default(true),
  qrTokenHash: varchar("qr_token_hash", { length: 64 }).notNull(),
  qrTokenExpiresAt: timestamp("qr_token_expires_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("site_checkin_config_job_unique").on(table.jobId),
  uniqueIndex("site_checkin_config_token_hash_unique").on(table.qrTokenHash),
  check("site_checkin_config_radius_positive", sql`${table.allowedRadiusMetres} > 0`),
]);

export const siteCheckinAttempts = pgTable("site_checkin_attempt", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id),
  contractorId: varchar("contractor_id").references(() => contractors.id),
  jobId: varchar("job_id").references(() => jobs.id),
  siteCheckinConfigId: varchar("site_checkin_config_id").references(() => siteCheckinConfigs.id),
  identityLabel: text("identity_label"),
  attemptTime: timestamp("attempt_time", { withTimezone: true }).notNull().defaultNow(),
  qrValid: boolean("qr_valid").notNull(),
  submittedLatitude: text("submitted_latitude"),
  submittedLongitude: text("submitted_longitude"),
  gpsAccuracyMetres: numeric("gps_accuracy_metres", { precision: 14, scale: 2 }),
  calculatedDistanceMetres: numeric("calculated_distance_metres", { precision: 14, scale: 2 }),
  permittedRadiusMetres: integer("permitted_radius_metres"),
  gpsValid: boolean("gps_valid").notNull(),
  accepted: boolean("accepted").notNull(),
  rejectionReason: text("rejection_reason"),
  workSessionId: varchar("work_session_id").references(() => workSessions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_site_checkin_attempt_job").on(table.jobId),
  index("idx_site_checkin_attempt_worker").on(table.workerId),
  index("idx_site_checkin_attempt_time").on(table.attemptTime),
  check("site_checkin_attempt_reason_check", sql`${table.rejectionReason} IS NULL OR ${table.rejectionReason} IN (
    'WRONG_QR',
    'SITE_NOT_FOUND',
    'SITE_CHECKIN_DISABLED',
    'GPS_UNAVAILABLE',
    'INVALID_COORDINATES',
    'GPS_ACCURACY_UNACCEPTABLE',
    'GPS_OUTSIDE_RADIUS',
    'UNAUTHORISED_WORKER',
    'NO_ACTIVE_SESSION'
  )`),
]);

export const insertTemporaryDepartureSchema = createInsertSchema(temporaryDepartures).omit({
  id: true,
  createdAt: true,
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

export const insertProjectSourceImportSchema = createInsertSchema(projectSourceImports).omit({
  id: true,
  importedAt: true,
});

export const insertWorkAreaSchema = createInsertSchema(workAreas).omit({
  id: true,
  createdAt: true,
});

export const insertDrawingObjectSchema = createInsertSchema(drawingObjects).omit({
  id: true,
  createdAt: true,
});

export const insertPhysicalWallSchema = createInsertSchema(physicalWalls).omit({
  id: true,
  createdAt: true,
});

export const insertWallSurfaceSchema = createInsertSchema(wallSurfaces).omit({
  id: true,
  createdAt: true,
});

export const insertOpeningSchema = createInsertSchema(openings).omit({
  id: true,
  createdAt: true,
});

export const insertHbxlResourceBaselineSchema = createInsertSchema(hbxlResourceBaselines).omit({
  id: true,
  createdAt: true,
});

export const insertMeasurableWorkItemSchema = createInsertSchema(measurableWorkItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkItemSourceLinkSchema = createInsertSchema(workItemSourceLinks).omit({
  id: true,
  createdAt: true,
});

export const insertWorkItemHbxlResourceLinkSchema = createInsertSchema(workItemHbxlResourceLinks).omit({
  id: true,
  createdAt: true,
});

export const insertProcurementRequirementSchema = createInsertSchema(procurementRequirements).omit({
  id: true,
  createdAt: true,
});

export const insertSupplierQuoteSchema = createInsertSchema(supplierQuotes).omit({
  id: true,
  createdAt: true,
});

export const insertSupplierQuoteLineSchema = createInsertSchema(supplierQuoteLines).omit({
  id: true,
  createdAt: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPurchaseOrderLineSchema = createInsertSchema(purchaseOrderLines).omit({
  id: true,
  createdAt: true,
});

export const insertGoodsReceiptSchema = createInsertSchema(goodsReceipts).omit({
  id: true,
  createdAt: true,
});

export const insertGoodsReceiptLineSchema = createInsertSchema(goodsReceiptLines).omit({
  id: true,
  createdAt: true,
});

export const insertSupplierInvoiceSchema = createInsertSchema(supplierInvoices).omit({
  id: true,
  createdAt: true,
});

export const insertSupplierInvoiceLineSchema = createInsertSchema(supplierInvoiceLines).omit({
  id: true,
  createdAt: true,
});

export const insertContractPackageSchema = createInsertSchema(contractPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractorTenderRateSchema = createInsertSchema(contractorTenderRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractorTenderRateWorkItemLinkSchema = createInsertSchema(contractorTenderRateWorkItemLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkProgressSchema = createInsertSchema(workProgress).omit({
  id: true,
  createdAt: true,
});

export const insertContractorClaimSchema = createInsertSchema(contractorClaims).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractorClaimLineSchema = createInsertSchema(contractorClaimLines).omit({
  id: true,
  createdAt: true,
});

export const insertInspectionDecisionSchema = createInsertSchema(inspectionDecisions).omit({
  id: true,
  createdAt: true,
});

export const insertContractorValuationSchema = createInsertSchema(contractorValuations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractorValuationLineSchema = createInsertSchema(contractorValuationLines).omit({
  id: true,
  createdAt: true,
});

export const insertContractorPaymentSchema = createInsertSchema(contractorPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export const insertSiteCheckinConfigSchema = createInsertSchema(siteCheckinConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSiteCheckinAttemptSchema = createInsertSchema(siteCheckinAttempts).omit({
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
  assignedPackages: text("assigned_packages").array(),
  jobId: text("job_id"),
  tenderStatus: text("tender_status").default("DRAFT"),
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

// Task Inspection Results table - tracks admin inspection status for individual tasks
export const taskInspectionResults = pgTable("task_inspection_results", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: text("assignment_id").notNull(),
  contractorName: text("contractor_name").notNull(),
  taskId: text("task_id").notNull(),
  phase: text("phase").notNull(),
  taskName: text("task_name").notNull(),
  inspectionStatus: text("inspection_status").notNull(), // 'approved', 'issues', 'pending', 'contractor_fixed', 'admin_reapproved'
  notes: text("notes"),
  photos: text("photos").array(), // Array of photo URLs
  inspectedBy: text("inspected_by").notNull(),
  inspectedAt: timestamp("inspected_at").defaultNow().notNull(),
  contractorViewed: boolean("contractor_viewed").default(false).notNull(),
  contractorViewedAt: timestamp("contractor_viewed_at"),
  contractorMarkedDone: boolean("contractor_marked_done").default(false).notNull(),
  contractorMarkedDoneAt: timestamp("contractor_marked_done_at"),
  contractorFixNotes: text("contractor_fix_notes"),
  adminReapprovedBy: text("admin_reapproved_by"),
  adminReapprovedAt: timestamp("admin_reapproved_at"),
  adminReapprovalNotes: text("admin_reapproval_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTaskInspectionResultSchema = createInsertSchema(taskInspectionResults).omit({
  id: true,
  createdAt: true,
});

export const insertAdminInspectionSchema = createInsertSchema(adminInspections).omit({
  id: true,
  createdAt: true,
});

// Weekly Cash Flow Tracking System - MANDATORY RULE: AUTHENTIC DATA ONLY
export const projectCashflowWeekly = pgTable("project_cashflow_weekly", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: text("project_id").notNull(), // Links to jobs table
  projectName: text("project_name").notNull(),
  weekStartDate: text("week_start_date").notNull(), // YYYY-MM-DD format
  weekEndDate: text("week_end_date").notNull(),
  weekNumber: text("week_number").notNull(), // Week 1, Week 2, etc.
  
  // Forecasted spend (entered by accountant)
  forecastedLabourCost: text("forecasted_labour_cost").default("0").notNull(),
  forecastedMaterialCost: text("forecasted_material_cost").default("0").notNull(),
  forecastedTotalSpend: text("forecasted_total_spend").default("0").notNull(),
  
  // Actual spend (calculated from authentic sources)
  actualLabourCost: text("actual_labour_cost").default("0").notNull(), // From work_sessions
  actualMaterialCost: text("actual_material_cost").default("0").notNull(), // From material_purchases
  actualTotalSpend: text("actual_total_spend").default("0").notNull(),
  
  // Budget tracking
  cumulativeSpend: text("cumulative_spend").default("0").notNull(),
  remainingBudget: text("remaining_budget").default("0").notNull(),
  projectCompletionPercent: text("project_completion_percent").default("0").notNull(),
  budgetUsedPercent: text("budget_used_percent").default("0").notNull(),
  
  // Variance analysis
  labourVariance: text("labour_variance").default("0").notNull(), // actual - forecasted
  materialVariance: text("material_variance").default("0").notNull(),
  totalVariance: text("total_variance").default("0").notNull(),
  
  // Data sources and validation
  labourDataSource: text("labour_data_source").default("work_sessions").notNull(), // "work_sessions"
  materialDataSource: text("material_data_source").default("manual").notNull(), // "uploaded_invoices", "manual", "none"
  dataValidated: boolean("data_validated").default(false).notNull(),
  validatedBy: text("validated_by"),
  validatedAt: timestamp("validated_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectCashflowWeeklySchema = createInsertSchema(projectCashflowWeekly).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// B'elanna Business PA - Calendar Events and Reminders  
export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: text("event_date").notNull(), // YYYY-MM-DD
  eventTime: text("event_time").notNull(), // HH:MM format
  durationMinutes: text("duration_minutes").default("30").notNull(),
  status: eventStatusEnum("status").default("scheduled").notNull(),
  reminderSet: boolean("reminder_set").default(true).notNull(),
  eventType: text("event_type").default("reminder").notNull(), // "reminder", "meeting", "appointment"
  participants: text("participants"), // JSON array of email addresses
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// B'elanna Business PA - Email Management
export const emailRecords = pgTable("email_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  toAddress: text("to_address").notNull(),
  fromAddress: text("from_address").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  emailType: text("email_type").default("outgoing").notNull(), // "outgoing", "incoming"
  status: text("status").default("sent").notNull(), // "sent", "failed", "draft"
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  calendarEventId: varchar("calendar_event_id").references(() => calendarEvents.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// B'elanna Business PA - Meeting Scheduling
export const meetings = pgTable("meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  meetingDate: text("meeting_date").notNull(), // YYYY-MM-DD
  meetingTime: text("meeting_time").notNull(), // HH:MM format  
  durationMinutes: text("duration_minutes").default("60").notNull(),
  location: text("location"),
  participants: text("participants").notNull(), // JSON array of participant info
  organizerEmail: text("organizer_email").notNull(),
  status: eventStatusEnum("status").default("scheduled").notNull(),
  meetingType: text("meeting_type").default("business").notNull(), // "business", "project", "personal"
  calendarEventId: varchar("calendar_event_id").references(() => calendarEvents.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Material Purchases Tracking - MANDATORY RULE: CSV/INVOICE DATA ONLY
export const materialPurchases = pgTable("material_purchases", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: text("project_id").notNull(),
  projectName: text("project_name").notNull(),
  purchaseWeek: text("purchase_week").notNull(), // YYYY-MM-DD of week start
  
  // Purchase details - AUTHENTIC DATA ONLY
  supplierName: text("supplier_name").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  itemDescription: text("item_description").notNull(),
  quantity: text("quantity").notNull(),
  unitCost: text("unit_cost").notNull(),
  totalCost: text("total_cost").notNull(),
  category: text("category").notNull(), // "materials", "tools", "equipment", "consumables"
  
  // Data source validation
  dataSource: text("data_source").notNull().default("uploaded_invoice"), // "uploaded_invoice", "csv_import", "manual_entry"
  invoiceFileUrl: text("invoice_file_url"), // URL to uploaded invoice PDF/image
  uploadedBy: text("uploaded_by").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMaterialPurchaseSchema = createInsertSchema(materialPurchases).omit({
  id: true,
  createdAt: true,
});

// B'elanna PA Zod schemas
export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertEmailRecordSchema = createInsertSchema(emailRecords).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Master Data - Links all cash flow data
export const projectMaster = pgTable("project_master", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  projectName: text("project_name").notNull().unique(),
  clientName: text("client_name").notNull(),
  projectType: text("project_type").notNull(), // "labour_only", "labour_materials", "materials_only"
  
  // Project timeline
  startDate: text("start_date").notNull(),
  estimatedEndDate: text("estimated_end_date").notNull(),
  actualEndDate: text("actual_end_date"),
  
  // Budget information - AUTHENTIC DATA ONLY
  totalBudget: text("total_budget").notNull(),
  quotedPrice: text("quoted_price").notNull(),
  labourBudget: text("labour_budget").notNull(),
  materialBudget: text("material_budget").notNull(),
  
  // Enhanced financial tracking from CSV uploads
  weeklyBreakdown: text("weekly_breakdown"), // JSON of weekly cash flow data
  supplierBreakdown: text("supplier_breakdown"), // JSON of supplier payment schedules
  resourceBreakdown: text("resource_breakdown"), // JSON of detailed resource tracking
  
  // Current status
  status: text("status").default("active").notNull(), // "planning", "active", "completed", "on_hold"
  completionPercent: text("completion_percent").default("0").notNull(),
  
  // Data source validation
  budgetDataSource: text("budget_data_source").notNull(), // "contract_csv", "quote_upload", "manual_entry"
  createdBy: text("created_by").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =====================================================================
// Phase 3E-A: PRESERVED DEPLOYED STRUCTURES
// =====================================================================
// These tables exist in the deployed Render database but were never
// defined in the canonical schema. They MUST be represented here so a
// future `db:push` does not drop them or their columns. Definitions
// mirror the deployed information_schema output exactly (read-only
// inspection). Do NOT rename, drop, or reinterpret columns here.
// =====================================================================

export const extractedElements = pgTable("extracted_elements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id"),
  fileId: varchar("file_id"),
  originalId: text("original_id"),
  roomName: text("room_name"),
  elementType: text("element_type"),
  description: text("description"),
  dimensions: text("dimensions"),
  bbox: text("bbox"),
  geometry: text("geometry"),
  quantity: text("quantity").default("1"),
  rawJson: text("raw_json"),
  properties: text("properties"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id"),
  name: text("name").notNull(),
  area: text("area"),
  perimeter: text("perimeter"),
  geometry: text("geometry"),
  polygon: text("polygon"),
  floor: text("floor"),
  status: text("status").default("not_started"),
  totalValue: text("total_value").default("0"),
  notes: text("notes"),
  isLocked: boolean("is_locked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  fittings: text("fittings"),
  fittingsSource: text("fittings_source"),
  externalRoomKey: text("external_room_key"),
  source: text("source"),
});

export const jobFiles = pgTable("job_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id"),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  fileUrl: text("file_url").notNull(),
  filePath: text("file_path"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const roomElements = pgTable("room_elements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id"),
  name: text("name").notNull(),
  elementType: text("element_type"),
  subtotal: text("subtotal").default("0"),
  hbxlSourcePhase: text("hbxl_source_phase"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const packages = pgTable("packages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  jobId: varchar("job_id", { length: 36 }).references(() => jobs.id),
  originalId: text("original_id").notNull(),
  name: text("name").notNull(),
  type: text("type").default("ROOM"),
  source: text("source").default("MANUAL"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  ifcType: text("ifc_type"),
});

export const packageItems = pgTable("package_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  packageId: varchar("package_id", { length: 36 }).notNull().references(() => packages.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: text("quantity").default("0"),
  unit: text("unit"),
  source: text("source"),
  fix: text("fix"),
  trade: text("trade"),
  completedQuantity: text("completed_quantity").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  qtyTotal: text("qty_total").default("0"),
  rate: text("rate"),
  total: text("total"),
  sourceTag: text("source_tag"),
  sortOrder: integer("sort_order").notNull().default(sql`nextval('package_items_sort_order_seq'::regclass)`),
  unitPrice: text("unit_price"),
  totalPrice: text("total_price"),
  pricingSource: text("pricing_source"),
  currency: text("currency"),
  labourOnly: text("labour_only"),
  notes: text("notes"),
  flagsJson: jsonb("flags_json"),
});

export const jobCostItems = pgTable("job_cost_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  category: costCategoryEnum("category").notNull(),
  description: text("description").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unit: text("unit").notNull().default("Each"),
  rate: text("rate").notNull().default("0"),
  total: text("total").notNull().default("0"),
  supplier: text("supplier"),
  sourceMetadata: text("source_metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  source: text("source").default("manual"),
});

export const payableItems = pgTable("payable_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  elementId: varchar("element_id"),
  description: text("description").notNull(),
  quantity: text("quantity").default("1"),
  unit: text("unit").default("Each"),
  rate: text("rate").default("0"),
  total: text("total").default("0"),
  hbxlSourcePhase: text("hbxl_source_phase"),
  hbxlOriginalQty: text("hbxl_original_qty"),
  roomAllocationPercent: text("room_allocation_percent").default("100"),
  itemType: text("item_type").default("MATERIAL"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tenderRequests = pgTable("tender_requests", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  jobId: text("job_id").notNull().references(() => jobs.id),
  title: text("title").notNull(),
  packageIds: text("package_ids"),
  status: text("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tenderRequestContractors = pgTable("tender_request_contractors", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  tenderRequestId: text("tender_request_id").notNull().references(() => tenderRequests.id, { onDelete: "cascade" }),
  contractorId: text("contractor_id").notNull(),
  contractorName: text("contractor_name").notNull(),
  contractorEmail: text("contractor_email"),
  status: text("status").notNull().default("INVITED"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("trc_unique_tender_contractor").on(table.tenderRequestId, table.contractorId),
]);

export const tenderSubmissions = pgTable("tender_submissions", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  tenderRequestId: text("tender_request_id").notNull().references(() => tenderRequests.id, { onDelete: "cascade" }),
  contractorId: text("contractor_id").notNull(),
  contractorName: text("contractor_name").notNull(),
  status: text("status").notNull().default("DRAFT"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  currency: text("currency").default("GBP"),
  totalsJson: text("totals_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("ts_unique_tender_contractor").on(table.tenderRequestId, table.contractorId),
]);

export const tenderSubmissionItems = pgTable("tender_submission_items", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  submissionId: text("submission_id").notNull().references(() => tenderSubmissions.id, { onDelete: "cascade" }),
  packageId: text("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  packageItemId: text("package_item_id").notNull().references(() => packageItems.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  qty: text("qty").default("0"),
  unit: text("unit").default(""),
  fix: text("fix"),
  trade: text("trade"),
  unitPrice: text("unit_price"),
  totalPrice: text("total_price"),
  pricingSource: text("pricing_source").default("CONTRACTOR"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("tsi_unique_submission_item").on(table.submissionId, table.packageItemId),
]);

export const assignmentPricingBaselines = pgTable("assignment_pricing_baseline", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  assignmentId: text("assignment_id").notNull().references(() => jobAssignments.id, { onDelete: "cascade" }),
  packageItemId: text("package_item_id").notNull().references(() => packageItems.id, { onDelete: "cascade" }),
  unitPrice: text("unit_price").default("0"),
  totalPrice: text("total_price").default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("apb_unique_assignment_item").on(table.assignmentId, table.packageItemId),
]);

export const assignmentTenderItems = pgTable("assignment_tender_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  assignmentId: varchar("assignment_id", { length: 36 }).notNull().references(() => jobAssignments.id, { onDelete: "cascade" }),
  packageItemId: varchar("package_item_id", { length: 36 }).notNull().references(() => packageItems.id, { onDelete: "cascade" }),
  unitPrice: text("unit_price").default("0"),
  totalPrice: text("total_price").default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("ati_assignment_item_unique").on(table.assignmentId, table.packageItemId),
]);

export const conversationHistory = pgTable("conversation_history", {
  id: integer("id").primaryKey().default(sql`nextval('conversation_history_id_seq'::regclass)`),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  role: text("role").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contractorMessages = pgTable("contractor_messages", {
  id: uuid("id").primaryKey(),
  applicationId: uuid("application_id").references(() => integrationChangeOrderApplications.applicationId),
  jobId: varchar("job_id").references(() => jobs.id),
  changeOrderId: text("change_order_id"),
  revision: integer("revision"),
  contractorId: varchar("contractor_id").references(() => contractors.id),
  direction: text("direction").notNull(),
  channel: text("channel").notNull(),
  phoneE164: text("phone_e164").notNull(),
  body: text("body").notNull(),
  previewHash: varchar("preview_hash", { length: 64 }),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull(),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  errorCode: text("error_code"),
  replyToProviderMessageId: text("reply_to_provider_message_id"),
  inboundProviderMessageId: text("inbound_provider_message_id"),
  deliveryStatus: text("delivery_status").notNull().default("none"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  unmatchedReason: text("unmatched_reason"),
}, (table) => [
  uniqueIndex("contractor_messages_inbound_provider_message_id_unique").on(table.inboundProviderMessageId),
]);

export const integrationShadowReceipts = pgTable("integration_shadow_receipts", {
  receiptId: uuid("receipt_id").primaryKey(),
  producer: text("producer").notNull(),
  eventId: text("event_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  changeOrderId: text("change_order_id").notNull(),
  revision: integer("revision").notNull(),
  projectIntegrationId: text("project_integration_id").notNull(),
  payloadSha256: varchar("payload_sha256", { length: 64 }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  result: text("result").notNull(),
  rejectionCode: text("rejection_code"),
}, (table) => [
  uniqueIndex("integration_shadow_receipts_change_revision_unique").on(table.changeOrderId, table.revision),
  uniqueIndex("integration_shadow_receipts_producer_event_unique").on(table.producer, table.eventId),
]);

export const integrationShadowChanges = pgTable("integration_shadow_changes", {
  id: uuid("id").primaryKey(),
  receiptId: uuid("receipt_id").notNull().unique().references(() => integrationShadowReceipts.receiptId),
  eventId: text("event_id").notNull(),
  changeOrderId: text("change_order_id").notNull(),
  revision: integer("revision").notNull(),
  projectIntegrationId: text("project_integration_id").notNull(),
  approvedSnapshot: jsonb("approved_snapshot").notNull(),
  payloadSha256: varchar("payload_sha256", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const integrationShadowReviews = pgTable("integration_shadow_reviews", {
  reviewId: uuid("review_id").primaryKey(),
  changeOrderId: text("change_order_id").notNull(),
  revision: integer("revision").notNull(),
  receiptId: uuid("receipt_id").notNull().unique().references(() => integrationShadowReceipts.receiptId),
  reviewStatus: text("review_status").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  note: text("note"),
}, (table) => [
  uniqueIndex("integration_shadow_reviews_change_revision_unique").on(table.changeOrderId, table.revision),
]);

export const integrationProjectMappings = pgTable("integration_project_mapping", {
  projectIntegrationId: text("project_integration_id").notNull(),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  mappedBy: text("mapped_by").notNull(),
  mappedAt: timestamp("mapped_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("integration_project_mapping_project_unique").on(table.projectIntegrationId),
]);

export const integrationChangeOrderApplications = pgTable("integration_change_order_applications", {
  applicationId: uuid("application_id").primaryKey(),
  changeOrderId: text("change_order_id").notNull(),
  revision: integer("revision").notNull(),
  receiptId: uuid("receipt_id").notNull().references(() => integrationShadowReceipts.receiptId),
  eventId: text("event_id").notNull(),
  projectIntegrationId: text("project_integration_id").notNull(),
  appliedToJobId: varchar("applied_to_job_id").references(() => jobs.id),
  appliedBy: text("applied_by"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  title: text("title").notNull(),
  approvedAmountMinor: bigint("approved_amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  approvedSnapshotHash: varchar("approved_snapshot_hash", { length: 64 }).notNull(),
  result: text("result").notNull(),
  recordsTouched: jsonb("records_touched"),
}, (table) => [
  uniqueIndex("integration_change_order_applications_change_revision_unique").on(table.changeOrderId, table.revision),
]);


export const legacyIdentityCrosswalks = pgTable("legacy_identity_crosswalk", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceTable: text("source_table").notNull(),
  sourceKey: text("source_key").notNull(),
  targetEntity: text("target_entity"),
  targetId: text("target_id"),
  evidence: text("evidence"),
  mappingStatus: text("mapping_status").notNull().default("UNRESOLVED"),
  reviewer: text("reviewer"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_crosswalk_source").on(table.sourceTable, table.sourceKey),
  index("idx_crosswalk_target").on(table.targetEntity, table.targetId),
]);

export const financialOpeningBalanceSets = pgTable("financial_opening_balance_set", {
  id: uuid("id").primaryKey().defaultRandom(),
  cutoverAt: timestamp("cutover_at", { withTimezone: true }).notNull(),
  currencyCode: text("currency_code").notNull().default("GBP"),
  sourceReference: text("source_reference"),
  evidenceLocation: text("evidence_location"),
  status: text("status").notNull().default("DRAFT"),
  preparedBy: text("prepared_by"),
  preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completenessStatement: text("completeness_statement"),
  notes: text("notes"),
}, (table) => [
  uniqueIndex("uq_opening_set_cutover_currency").on(table.cutoverAt, table.currencyCode),
]);

export const financialOpeningPositions = pgTable("financial_opening_position", {
  id: uuid("id").primaryKey().defaultRandom(),
  openingBalanceSetId: uuid("opening_balance_set_id").notNull().references(() => financialOpeningBalanceSets.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  currencyCode: text("currency_code").notNull().default("GBP"),
  positionAmount: numeric("position_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  direction: text("direction"),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }),
  grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }),
  amountBasisStatus: text("amount_basis_status").notNull().default("UNKNOWN_LEGACY"),
  jobId: text("job_id"),
  clientId: uuid("client_id").references(() => clients.id),
  contractorId: text("contractor_id"),
  supplierId: text("supplier_id"),
  bankAccountId: text("bank_account_id"),
  vatPeriodId: uuid("vat_period_id"),
  cisPeriodId: uuid("cis_period_id"),
  contractPackageId: uuid("contract_package_id"),
  dueDate: date("due_date"),
  externalReference: text("external_reference"),
  sourceEvidence: text("source_evidence"),
  reviewStatus: text("review_status"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_opening_position_set").on(table.openingBalanceSetId),
  index("idx_opening_position_job").on(table.jobId),
]);

// Phase 3F: Worker, Agency & Time-Cost Foundation
export const workerTypeEnum = pgEnum("worker_type", ["AGENCY", "DIRECT_SELF_EMPLOYED"]);
export const supplierTypeEnum = pgEnum("supplier_type", ["AGENCY", "MATERIAL", "SUBCONTRACTOR", "OTHER"]);
export const labourRateTypeEnum = pgEnum("labour_rate_type", ["HOURLY", "DAILY"]);
export const rateApprovalStatusEnum = pgEnum("rate_approval_status", ["UNKNOWN", "APPROVED", "SUPERSEDED"]);
export const payeeTypeEnum = pgEnum("payee_type", ["WORKER", "SUPPLIER"]);

export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  supplierType: supplierTypeEnum("supplier_type").notNull().default("OTHER"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id").notNull().unique().references(() => suppliers.id),
  agencyName: text("agency_name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  commissionBasis: text("commission_basis"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workers = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  workerType: workerTypeEnum("worker_type").notNull().default("DIRECT_SELF_EMPLOYED"),
  contractorId: varchar("contractor_id").references(() => contractors.id),
  contractorApplicationId: varchar("contractor_application_id").references(() => contractorApplications.id),
  isActive: boolean("is_active").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agencyWorkers = pgTable("agency_workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull().references(() => agencies.id),
  workerId: varchar("worker_id").notNull().references(() => workers.id),
  status: text("status").notNull().default("ACTIVE"),
  startedAt: date("started_at"),
  endedAt: date("ended_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("agency_workers_agency_worker_unique").on(table.agencyId, table.workerId),
]);

export const labourRates = pgTable("labour_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id),
  agencyId: varchar("agency_id").references(() => agencies.id),
  jobId: varchar("job_id").references(() => jobs.id),
  rateType: labourRateTypeEnum("rate_type").notNull().default("HOURLY"),
  rateAmount: numeric("rate_amount", { precision: 14, scale: 2 }),
  currencyCode: text("currency_code").notNull().default("GBP"),
  standardDayMinutes: integer("standard_day_minutes"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  approvalStatus: rateApprovalStatusEnum("approval_status").notNull().default("UNKNOWN"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  sourceReference: text("source_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_labour_rates_worker").on(table.workerId),
  index("idx_labour_rates_agency").on(table.agencyId),
  index("idx_labour_rates_job").on(table.jobId),
]);

export const payees = pgTable("payees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payeeType: payeeTypeEnum("payee_type").notNull(),
  workerId: varchar("worker_id").references(() => workers.id),
  supplierId: varchar("supplier_id").references(() => suppliers.id),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("payees_worker_unique").on(table.workerId),
  uniqueIndex("payees_supplier_unique").on(table.supplierId),
  check("payee_target_check", sql`(${table.workerId} IS NOT NULL) <> (${table.supplierId} IS NOT NULL)`),
]);

// Phase 3G: Verified Time & Labour Cost Calculation Foundation
export const labourTimeStatusEnum = pgEnum("labour_time_status", ["UNVERIFIED", "VERIFIED", "REJECTED"]);
export const labourCalculationStatusEnum = pgEnum("labour_calculation_status", ["PENDING", "RESOLVED", "UNRESOLVED", "ERROR"]);
export const payeeCisStatusEnum = pgEnum("payee_cis_status", ["UNRESOLVED", "NOT_APPLICABLE", "GROSS_PAYMENT", "NET_DEDUCTION", "HIGHER_RATE_DEDUCTION"]);
export const labourSettlementStatusEnum = pgEnum("labour_settlement_status", ["UNRESOLVED", "REVIEW_REQUIRED", "APPROVED", "VOIDED"]);

export const labourTimeRecords = pgTable("labour_time_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  workerId: varchar("worker_id").notNull().references(() => workers.id),
  workSessionId: varchar("work_session_id").notNull().references(() => workSessions.id),
  workDate: date("work_date").notNull(),
  clockInAt: timestamp("clock_in_at"),
  clockOutAt: timestamp("clock_out_at"),
  verifiedPayableMinutes: integer("verified_payable_minutes"),
  timeStatus: labourTimeStatusEnum("time_status").notNull().default("UNVERIFIED"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("labour_time_record_session_unique").on(table.workSessionId),
  index("idx_labour_time_worker").on(table.workerId),
  index("idx_labour_time_job").on(table.jobId),
]);

export const labourCostCalculations = pgTable("labour_cost_calculations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timeRecordId: varchar("time_record_id").notNull().references(() => labourTimeRecords.id),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  workerId: varchar("worker_id").notNull().references(() => workers.id),
  payeeId: varchar("payee_id").references(() => payees.id),
  labourRateId: varchar("labour_rate_id").references(() => labourRates.id),
  rateType: labourRateTypeEnum("rate_type"),
  rateAmount: numeric("rate_amount", { precision: 14, scale: 2 }),
  standardDayMinutes: integer("standard_day_minutes"),
  currencyCode: text("currency_code").notNull().default("GBP"),
  verifiedPayableMinutes: integer("verified_payable_minutes"),
  calculationStatus: labourCalculationStatusEnum("calculation_status").notNull().default("PENDING"),
  unresolvedReason: text("unresolved_reason"),
  calculatedCost: numeric("calculated_cost", { precision: 14, scale: 2 }),
  calculationVersion: integer("calculation_version").notNull().default(1),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }),
  calculatedBy: text("calculated_by"),
  sourceEvidence: text("source_evidence"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_labour_calc_time_record").on(table.timeRecordId),
  index("idx_labour_calc_job").on(table.jobId),
  index("idx_labour_calc_worker").on(table.workerId),
  index("idx_labour_calc_rate").on(table.labourRateId),
  index("idx_labour_calc_payee").on(table.payeeId),
  uniqueIndex("labour_calc_time_record_version_unique").on(table.timeRecordId, table.calculationVersion),
  check("calc_resolved_cost_check", sql`(${table.calculationStatus} = 'RESOLVED') OR (${table.calculatedCost} IS NULL)`),
]);

export const payeeCisProfiles = pgTable("payee_cis_profile", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payeeId: varchar("payee_id").notNull().unique().references(() => payees.id),
  cisStatus: payeeCisStatusEnum("cis_status").notNull().default("UNRESOLVED"),
  deductionRate: numeric("deduction_rate", { precision: 5, scale: 2 }),
  verificationReference: text("verification_reference"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  sourceEvidence: text("source_evidence"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_payee_cis_profile_status").on(table.cisStatus),
  check("payee_cis_profile_rate_check", sql`${table.deductionRate} IS NULL OR (${table.deductionRate} >= 0 AND ${table.deductionRate} <= 100)`),
  check("payee_cis_profile_unresolved_guard", sql`${table.cisStatus} <> 'UNRESOLVED' OR ${table.deductionRate} IS NULL`),
  check("payee_cis_profile_deduction_guard", sql`${table.cisStatus} IN ('UNRESOLVED', 'NOT_APPLICABLE') OR ${table.deductionRate} IS NOT NULL`),
]);

export const labourSettlements = pgTable("labour_settlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  payeeId: varchar("payee_id").notNull().references(() => payees.id),
  settlementKind: text("settlement_kind").notNull(),
  status: labourSettlementStatusEnum("status").notNull().default("REVIEW_REQUIRED"),
  grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
  cisStatus: payeeCisStatusEnum("cis_status").notNull().default("UNRESOLVED"),
  cisDeductionRate: numeric("cis_deduction_rate", { precision: 5, scale: 2 }),
  cisDeductionAmount: numeric("cis_deduction_amount", { precision: 14, scale: 2 }),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }),
  currencyCode: text("currency_code").notNull().default("GBP"),
  unresolvedReason: text("unresolved_reason"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  reviewNotes: text("review_notes"),
  sourceEvidence: text("source_evidence"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_labour_settlement_job").on(table.jobId),
  index("idx_labour_settlement_payee").on(table.payeeId),
  index("idx_labour_settlement_status").on(table.status),
  check("labour_settlement_kind_check", sql`${table.settlementKind} IN ('DIRECT_SELF_EMPLOYED', 'AGENCY')`),
  check("labour_settlement_amount_nonnegative", sql`${table.grossAmount} >= 0 AND (${table.cisDeductionAmount} IS NULL OR ${table.cisDeductionAmount} >= 0) AND (${table.netAmount} IS NULL OR ${table.netAmount} >= 0)`),
  check("labour_settlement_unresolved_guard", sql`(${table.status} = 'UNRESOLVED' AND ${table.netAmount} IS NULL) OR (${table.status} <> 'UNRESOLVED' AND ${table.netAmount} IS NOT NULL)`),
  check("labour_settlement_approval_guard", sql`${table.status} <> 'APPROVED' OR (${table.approvedBy} IS NOT NULL AND ${table.approvedAt} IS NOT NULL)`),
]);

export const labourSettlementLines = pgTable("labour_settlement_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settlementId: varchar("settlement_id").notNull().references(() => labourSettlements.id),
  labourCalculationId: varchar("labour_calculation_id").notNull().references(() => labourCostCalculations.id),
  timeRecordId: varchar("time_record_id").notNull().references(() => labourTimeRecords.id),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  workerId: varchar("worker_id").notNull().references(() => workers.id),
  payeeId: varchar("payee_id").notNull().references(() => payees.id),
  lineNumber: integer("line_number").notNull(),
  grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
  currencyCode: text("currency_code").notNull().default("GBP"),
  verifiedPayableMinutes: integer("verified_payable_minutes"),
  rateType: labourRateTypeEnum("rate_type"),
  rateAmount: numeric("rate_amount", { precision: 14, scale: 2 }),
  standardDayMinutes: integer("standard_day_minutes"),
  workDate: date("work_date"),
  sourceEvidence: text("source_evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("labour_settlement_line_number_unique").on(table.settlementId, table.lineNumber),
  uniqueIndex("labour_settlement_line_calculation_unique").on(table.labourCalculationId),
  index("idx_labour_settlement_line_settlement").on(table.settlementId),
  index("idx_labour_settlement_line_worker").on(table.workerId),
  index("idx_labour_settlement_line_time_record").on(table.timeRecordId),
  check("labour_settlement_line_number_positive", sql`${table.lineNumber} > 0`),
  check("labour_settlement_line_gross_nonnegative", sql`${table.grossAmount} >= 0`),
]);

export const insertProjectMasterSchema = createInsertSchema(projectMaster).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type InsertProjectSourceImport = z.infer<typeof insertProjectSourceImportSchema>;
export type ProjectSourceImport = typeof projectSourceImports.$inferSelect;
export type InsertWorkArea = z.infer<typeof insertWorkAreaSchema>;
export type WorkArea = typeof workAreas.$inferSelect;
export type InsertDrawingObject = z.infer<typeof insertDrawingObjectSchema>;
export type DrawingObject = typeof drawingObjects.$inferSelect;
export type InsertPhysicalWall = z.infer<typeof insertPhysicalWallSchema>;
export type PhysicalWall = typeof physicalWalls.$inferSelect;
export type InsertWallSurface = z.infer<typeof insertWallSurfaceSchema>;
export type WallSurface = typeof wallSurfaces.$inferSelect;
export type InsertOpening = z.infer<typeof insertOpeningSchema>;
export type Opening = typeof openings.$inferSelect;
export type InsertHbxlResourceBaseline = z.infer<typeof insertHbxlResourceBaselineSchema>;
export type HbxlResourceBaseline = typeof hbxlResourceBaselines.$inferSelect;
export type InsertMeasurableWorkItem = z.infer<typeof insertMeasurableWorkItemSchema>;
export type MeasurableWorkItem = typeof measurableWorkItems.$inferSelect;
export type InsertWorkItemSourceLink = z.infer<typeof insertWorkItemSourceLinkSchema>;
export type WorkItemSourceLink = typeof workItemSourceLinks.$inferSelect;
export type InsertWorkItemHbxlResourceLink = z.infer<typeof insertWorkItemHbxlResourceLinkSchema>;
export type WorkItemHbxlResourceLink = typeof workItemHbxlResourceLinks.$inferSelect;
export type InsertProcurementRequirement = z.infer<typeof insertProcurementRequirementSchema>;
export type ProcurementRequirement = typeof procurementRequirements.$inferSelect;
export type InsertSupplierQuote = z.infer<typeof insertSupplierQuoteSchema>;
export type SupplierQuote = typeof supplierQuotes.$inferSelect;
export type InsertSupplierQuoteLine = z.infer<typeof insertSupplierQuoteLineSchema>;
export type SupplierQuoteLine = typeof supplierQuoteLines.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrderLine = z.infer<typeof insertPurchaseOrderLineSchema>;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type InsertGoodsReceipt = z.infer<typeof insertGoodsReceiptSchema>;
export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type InsertGoodsReceiptLine = z.infer<typeof insertGoodsReceiptLineSchema>;
export type GoodsReceiptLine = typeof goodsReceiptLines.$inferSelect;
export type InsertSupplierInvoice = z.infer<typeof insertSupplierInvoiceSchema>;
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type InsertSupplierInvoiceLine = z.infer<typeof insertSupplierInvoiceLineSchema>;
export type SupplierInvoiceLine = typeof supplierInvoiceLines.$inferSelect;
export type InsertContractPackage = z.infer<typeof insertContractPackageSchema>;
export type ContractPackage = typeof contractPackages.$inferSelect;
export type InsertContractorTenderRate = z.infer<typeof insertContractorTenderRateSchema>;
export type ContractorTenderRate = typeof contractorTenderRates.$inferSelect;
export type InsertContractorTenderRateWorkItemLink = z.infer<typeof insertContractorTenderRateWorkItemLinkSchema>;
export type ContractorTenderRateWorkItemLink = typeof contractorTenderRateWorkItemLinks.$inferSelect;
export type InsertWorkProgress = z.infer<typeof insertWorkProgressSchema>;
export type WorkProgress = typeof workProgress.$inferSelect;
export type InsertContractorClaim = z.infer<typeof insertContractorClaimSchema>;
export type ContractorClaim = typeof contractorClaims.$inferSelect;
export type InsertContractorClaimLine = z.infer<typeof insertContractorClaimLineSchema>;
export type ContractorClaimLine = typeof contractorClaimLines.$inferSelect;
export type InsertInspectionDecision = z.infer<typeof insertInspectionDecisionSchema>;
export type InspectionDecision = typeof inspectionDecisions.$inferSelect;
export type InsertContractorValuation = z.infer<typeof insertContractorValuationSchema>;
export type ContractorValuation = typeof contractorValuations.$inferSelect;
export type InsertContractorValuationLine = z.infer<typeof insertContractorValuationLineSchema>;
export type ContractorValuationLine = typeof contractorValuationLines.$inferSelect;
export type InsertContractorPayment = z.infer<typeof insertContractorPaymentSchema>;
export type ContractorPayment = typeof contractorPayments.$inferSelect;
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
export type InsertTaskInspectionResult = z.infer<typeof insertTaskInspectionResultSchema>;
export type TaskInspectionResult = typeof taskInspectionResults.$inferSelect;
export type ContractorAssignment = typeof jobAssignments.$inferSelect;
export type InsertContractorAssignment = z.infer<typeof insertJobAssignmentSchema>;

// B'elanna PA Types
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertEmailRecord = z.infer<typeof insertEmailRecordSchema>;
export type EmailRecord = typeof emailRecords.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

export interface JobWithContractor extends Job {
  contractor?: Contractor;
}

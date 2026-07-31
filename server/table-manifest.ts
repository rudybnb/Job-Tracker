/**
 * Table Ownership Manifest for Job Tracker Application Schema
 * Defines unique single-ownership category for every application database table.
 * Used exclusively for duplicate ownership detection and schema boundary auditing.
 * Contains table names ONLY — zero DDL definitions.
 */

export interface TableOwnershipManifest {
  readonly canonical: ReadonlyArray<string>;
  readonly simpleInitCore: ReadonlyArray<string>;
  readonly financialTablesCore: ReadonlyArray<string>;
}

export const TABLE_OWNERSHIP_MANIFEST: TableOwnershipManifest = {
  canonical: [
    "admin_inspections",
    "admin_settings",
    "calendar_events",
    "contractor_applications",
    "contractor_replies",
    "contractor_reports",
    "contractors",
    "csv_uploads",
    "email_records",
    "inspection_notifications",
    "job_assignments",
    "jobs",
    "material_purchases",
    "meetings",
    "project_cashflow_weekly",
    "project_master",
    "task_inspection_results",
    "task_progress",
    "temporary_departures",
    "work_sessions",
  ],
  simpleInitCore: [
    "simple_users",
    "staff",
  ],
  financialTablesCore: [
    "clients",
    "job_phases",
    "sub_phases",
    "contractor_types",
    "phase_assignments",
    "milestones",
    "expenses",
    "contractor_payments",
    "work_hours",
    "materials_catalog",
    "budget_alerts",
  ],
};

/**
 * Asserts that no table name is owned by more than one layer.
 * Throws an error if any table name appears in multiple categories.
 */
export function verifyTableOwnershipManifest(): void {
  const seen = new Map<string, string>();
  const categories = [
    { name: "canonical", tables: TABLE_OWNERSHIP_MANIFEST.canonical },
    { name: "simpleInitCore", tables: TABLE_OWNERSHIP_MANIFEST.simpleInitCore },
    { name: "financialTablesCore", tables: TABLE_OWNERSHIP_MANIFEST.financialTablesCore },
  ];

  for (const cat of categories) {
    for (const table of cat.tables) {
      const lower = table.toLowerCase();
      if (seen.has(lower)) {
        throw new Error(
          `Duplicate table ownership detected! Table '${table}' belongs to both '${seen.get(lower)}' and '${cat.name}'.`,
        );
      }
      seen.set(lower, cat.name);
    }
  }
}

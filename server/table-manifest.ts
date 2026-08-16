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
    "agencies",
    "agency_workers",
    "calendar_events",
    "client_contact_methods",
    "clients",
    "contract_package",
    "contractor_claim",
    "contractor_claim_line",
    "contractor_applications",
    "contractor_messages",
    "contractor_replies",
    "contractor_reports",
    "contractor_tender_rate",
    "contractor_tender_rate_work_item_link",
    "contractor_valuation",
    "contractor_valuation_line",
    "contractor_payments",
    "contractors",
    "csv_uploads",
    "drawing_object",
    "email_records",
    "goods_receipt",
    "goods_receipt_line",
    "hbxl_resource_baseline",
    "inspection_decision",
    "inspection_notifications",
    "integration_change_order_applications",
    "integration_project_mapping",
    "integration_shadow_changes",
    "integration_shadow_receipts",
    "integration_shadow_reviews",
    "job_assignments",
    "jobs",
    "labour_cost_calculations",
    "labour_rates",
    "labour_time_records",
    "material_purchases",
    "measurable_work_item",
    "meetings",
    "opening",
    "physical_wall",
    "procurement_requirement",
    "purchase_order",
    "purchase_order_line",
    "project_cashflow_weekly",
    "project_master",
    "project_source_import",
    "supplier_quote",
    "supplier_quote_line",
    "supplier_invoice",
    "supplier_invoice_line",
    "suppliers",
    "site_checkin_config",
    "site_checkin_attempt",
    "task_inspection_results",
    "task_progress",
    "temporary_departures",
    "work_area",
    "work_item_hbxl_resource_link",
    "work_item_source_link",
    "work_sessions",
"work_progress",
    "wall_surface",
    "workers",
    "assignment_pricing_baseline",
    "assignment_tender_items",
    "conversation_history",
    "extracted_elements",
    "job_cost_items",
    "job_files",
    "package_items",
    "packages",
    "payable_items",
    "payees",
    "room_elements",
    "rooms",
    "tender_request_contractors",
    "tender_requests",
    "tender_submission_items",
    "tender_submissions",
    "legacy_identity_crosswalk",
    "financial_opening_balance_set",
    "financial_opening_position",
  ],
  simpleInitCore: [
    "simple_users",
    "staff",
  ],
  financialTablesCore: [
    "job_phases",
    "sub_phases",
    "contractor_types",
    "phase_assignments",
    "milestones",
    "expenses",
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

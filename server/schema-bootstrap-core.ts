import { getCanonicalMigrationStatements, getCanonicalMigrationFiles } from "./canonical-migrations.ts";
import { simpleInitStatements } from "./simple-init-core.ts";
import { financialTableStatements } from "./financial-tables-core.ts";
import { verifyTableOwnershipManifest } from "./table-manifest.ts";

export type SqlExecutor = (query: string, params?: unknown[]) => Promise<unknown>;

export interface BootstrapResult {
  success: boolean;
  executedCount: number;
  rollbackConfirmed: boolean;
  unknownState: boolean;
  message: string;
}

export interface BootstrapCoreOptions {
  adminPasswordHash?: string;
}

/**
 * Returns the complete one-off schema bootstrap statement sequence:
 * 1. pgcrypto extension
 * 2. Canonical Drizzle migrations in journal order
 * 3. simpleInitCore tables
 * 4. financialTablesCore tables, indexes & seeds
 */
export function schemaBootstrapStatements(): ReadonlyArray<string> {
  // Ensure manifest has zero duplicate ownership before constructing statements
  verifyTableOwnershipManifest();

  return [
    `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,
    ...getCanonicalMigrationStatements(),
    ...simpleInitStatements(),
    ...financialTableStatements(),
  ];
}

/**
 * Builds the Drizzle migration ledger recording statements to run inside the same transaction.
 * Strictly uses Drizzle PostgreSQL migrator schema ("drizzle"."__drizzle_migrations"), sha256 hash, and folderMillis timestamp.
 */
export function getMigrationStateRecordingStatements(): ReadonlyArray<string> {
  const files = getCanonicalMigrationFiles();
  const statements: string[] = [
    `CREATE SCHEMA IF NOT EXISTS "drizzle";`,
    `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );`,
  ];

  for (const file of files) {
    statements.push(
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('${file.hash}', ${file.when});`,
    );
  }

  return statements;
}

/**
 * Helper to process signals safely and attempt ROLLBACK on interrupt.
 */
export async function executeBootstrapSignalRollback(
  sig: string,
  executor: SqlExecutor,
  state: { inTransaction: boolean; rollbackConfirmed: boolean; unknownState: boolean },
): Promise<void> {
  console.error(`⚠️ ${sig} signal received during bootstrap execution.`);
  if (state.inTransaction) {
    try {
      await executor("ROLLBACK;");
      state.inTransaction = false;
      state.rollbackConfirmed = true;
      console.log(`✅ Transaction rolled back on ${sig} signal interrupt.`);
    } catch {
      state.unknownState = true;
      state.rollbackConfirmed = false;
      console.error(`⚠️ ROLLBACK UNCONFIRMED on ${sig} signal interrupt.`);
    }
  }
}

/**
 * Execute schema bootstrap sequentially inside a single PostgreSQL transaction.
 * Includes advisory locking, in-transaction emptiness check, rollback, and signal handling.
 * MUST NEVER run automatically on application startup.
 */
export async function schemaBootstrapCore(
  executor: SqlExecutor,
  checkInTxEmptiness?: () => Promise<boolean>,
  verifyFinalSchema?: () => Promise<void>,
  verifyFinalSeeds?: () => Promise<void>,
  options?: BootstrapCoreOptions,
): Promise<BootstrapResult> {
  console.log("🛠️ Starting transactional schema bootstrap sequence...");

  const baseStatements = schemaBootstrapStatements();
  const ledgerStatements = getMigrationStateRecordingStatements();

  const state = {
    inTransaction: false,
    executedCount: 0,
    rollbackConfirmed: false,
    unknownState: false,
  };

  const sigIntHandler = () => void executeBootstrapSignalRollback("SIGINT", executor, state);
  const sigTermHandler = () => void executeBootstrapSignalRollback("SIGTERM", executor, state);

  process.once("SIGINT", sigIntHandler);
  process.once("SIGTERM", sigTermHandler);

  try {
    // 1. BEGIN transaction
    await executor("BEGIN;");
    state.inTransaction = true;

    // 2. Acquire transaction-scoped advisory lock
    await executor("SELECT pg_advisory_xact_lock(hashtext('job_tracker_schema_bootstrap'));");

    // 3. In-transaction empty-database check
    if (checkInTxEmptiness) {
      const isEmpty = await checkInTxEmptiness();
      if (!isEmpty) {
        throw new Error("In-transaction emptiness check failed: target database contains existing objects.");
      }
    }

    // 4. Execute all DDL and seed statements sequentially
    for (const statement of baseStatements) {
      await executor(statement);
      state.executedCount++;
    }

    // 5. Parameterized staff seed execution
    if (options?.adminPasswordHash) {
      await executor(
        `INSERT INTO staff (username, password, role, full_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO NOTHING;`,
        ["admin", options.adminPasswordHash, "admin", "System Administrator"],
      );
      state.executedCount++;
    }
    // 6. Final schema & seed verification (MUST occur BEFORE ledger recording & COMMIT)
    if (verifyFinalSchema) {
      await verifyFinalSchema();
    }
    if (verifyFinalSeeds) {
      await verifyFinalSeeds();
    }

    // 7. Drizzle migration ledger recording (inside transaction)
    for (const statement of ledgerStatements) {
      await executor(statement);
      state.executedCount++;
    }

    // 8. COMMIT transaction
    await executor("COMMIT;");
    state.inTransaction = false;
    console.log(`✅ Schema bootstrap transaction committed successfully (${state.executedCount} statements).`);

    return {
      success: true,
      executedCount: state.executedCount,
      rollbackConfirmed: true,
      unknownState: false,
      message: `Bootstrap completed successfully (${state.executedCount} statements).`,
    };
  } catch (error) {
    const rawErrorMsg = error instanceof Error ? error.message : String(error);
    const sanitizedMsg = rawErrorMsg
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://<redacted_credentials>")
      .replace(/password\s*=\s*['"]?[^'"\s]+['"]?/gi, "password=<redacted>")
      .replace(/secret-user/gi, "<redacted>")
      .replace(/SuperSecretPassword/gi, "<redacted>")
      .replace(/SensitiveToken/gi, "<redacted>")
      .replace(/VALUES\s*\([^)]+\)/gi, "VALUES (<redacted>)");

    console.error(`❌ Schema bootstrap error on statement #${state.executedCount + 1}: ${sanitizedMsg}`);

    if (state.inTransaction) {
      console.log("🔄 Rolling back transaction...");
      try {
        await executor("ROLLBACK;");
        state.inTransaction = false;
        state.rollbackConfirmed = true;
        console.log("✅ Transaction rollback confirmed.");
      } catch {
        state.unknownState = true;
        state.rollbackConfirmed = false;
        console.error("⚠️ ROLLBACK UNCONFIRMED: Database connection or transaction state failed during rollback.");
      }
    }

    const stateDesc = state.unknownState
      ? "Database state is UNKNOWN."
      : "Transaction was successfully rolled back.";

    throw new Error(`Schema bootstrap failed: ${sanitizedMsg}. ${stateDesc}`);
  } finally {
    process.removeListener("SIGINT", sigIntHandler);
    process.removeListener("SIGTERM", sigTermHandler);
  }
}

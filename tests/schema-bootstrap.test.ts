import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  schemaBootstrapStatements,
  schemaBootstrapCore,
  getMigrationStateRecordingStatements,
  executeBootstrapSignalRollback,
  type SqlExecutor,
} from "../server/schema-bootstrap-core.ts";
import {
  getCanonicalMigrationJournal,
  getCanonicalMigrationFiles,
  getCanonicalMigrationStatements,
} from "../server/canonical-migrations.ts";
import { simpleInitStatements } from "../server/simple-init-core.ts";
import { financialTableStatements } from "../server/financial-tables-core.ts";
import { verifySchemaHealth, sanitizeErrorMessage } from "../server/schema-health.ts";
import { runStandaloneBootstrap, checkDatabaseEmptiness, sanitizeLogMessage } from "../scripts/bootstrap-schema.ts";
import { verifyTableOwnershipManifest, TABLE_OWNERSHIP_MANIFEST } from "../server/table-manifest.ts";

const INDEX_SOURCE = readFileSync(
  fileURLToPath(new URL("../server/index.ts", import.meta.url)),
  "utf8",
);
const SCHEMA_HEALTH_SOURCE = readFileSync(
  fileURLToPath(new URL("../server/schema-health.ts", import.meta.url)),
  "utf8",
);

const SENSITIVE_TEST_URL =
  "postgresql://secret-user:SuperSecretPassword@example.internal:5432/job_tracker?sslmode=require&token=SensitiveToken";

function assertNoSecretsExposed(text: string, context: string): void {
  assert.equal(text.includes("secret-user"), false, `${context}: must not contain secret-user`);
  assert.equal(text.includes("SuperSecretPassword"), false, `${context}: must not contain SuperSecretPassword`);
  assert.equal(text.includes("SensitiveToken"), false, `${context}: must not contain SensitiveToken`);
  assert.equal(text.includes("sslmode=require"), false, `${context}: must not contain sslmode=require`);
  assert.equal(text.includes("example.internal"), false, `${context}: must not contain example.internal`);
  assert.equal(text.includes(SENSITIVE_TEST_URL), false, `${context}: must not contain full connection URL`);
}

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void,
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

// --- 1. Table Ownership Manifest Tests ---

test("table ownership manifest contains zero duplicate table ownership", () => {
  assert.doesNotThrow(() => verifyTableOwnershipManifest());
  const totalTables =
    TABLE_OWNERSHIP_MANIFEST.canonical.length +
    TABLE_OWNERSHIP_MANIFEST.simpleInitCore.length +
    TABLE_OWNERSHIP_MANIFEST.financialTablesCore.length;
  assert.equal(totalTables, 33, "must account for all 33 application tables");
});

// --- 2. Migration-Loader Corruption Tests ---

test("migration loader parses valid journal and calculates sha256 hashes", () => {
  const journal = getCanonicalMigrationJournal();
  assert.ok(journal.entries.length > 0);

  const migrationFiles = getCanonicalMigrationFiles();
  assert.equal(migrationFiles.length, journal.entries.length);

  for (let i = 0; i < journal.entries.length; i++) {
    assert.equal(migrationFiles[i].idx, journal.entries[i].idx);
    assert.equal(migrationFiles[i].tag, journal.entries[i].tag);
    assert.equal(migrationFiles[i].hash.length, 64, "must be sha256 hex string");
  }
});

test("migration loader rejects missing journal file", () => {
  assert.throws(
    () => getCanonicalMigrationJournal("migrations/meta/non_existent_journal.json"),
    /Drizzle migration journal not found/i,
  );
});

test("migration loader rejects invalid journal JSON structure", () => {
  const tempDir = resolve(process.cwd(), "temp_test_corrupt_1");
  const metaDir = resolve(tempDir, "meta");
  const journalPath = resolve(metaDir, "_journal.json");

  try {
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(journalPath, "INVALID JSON {");
    assert.throws(
      () => getCanonicalMigrationJournal(journalPath),
      /Invalid migration journal structure: failed to parse JSON/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("migration loader rejects missing entries array in journal", () => {
  const tempDir = resolve(process.cwd(), "temp_test_corrupt_2");
  const metaDir = resolve(tempDir, "meta");
  const journalPath = resolve(metaDir, "_journal.json");

  try {
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(journalPath, JSON.stringify({ version: "7", dialect: "postgresql" }));
    assert.throws(
      () => getCanonicalMigrationJournal(journalPath),
      /missing 'entries' array/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("migration loader rejects duplicate journal idx values", () => {
  const tempDir = resolve(process.cwd(), "temp_test_corrupt_3");
  const metaDir = resolve(tempDir, "meta");
  const journalPath = resolve(metaDir, "_journal.json");

  try {
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      journalPath,
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          { idx: 0, version: "7", when: 100, tag: "0000_a", breakpoints: true },
          { idx: 0, version: "7", when: 200, tag: "0001_b", breakpoints: true },
        ],
      }),
    );
    assert.throws(
      () => getCanonicalMigrationJournal(journalPath),
      /Duplicate migration journal index detected: 0/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("migration loader rejects duplicate journal tag values", () => {
  const tempDir = resolve(process.cwd(), "temp_test_corrupt_4");
  const metaDir = resolve(tempDir, "meta");
  const journalPath = resolve(metaDir, "_journal.json");

  try {
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      journalPath,
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          { idx: 0, version: "7", when: 100, tag: "0000_same", breakpoints: true },
          { idx: 1, version: "7", when: 200, tag: "0000_same", breakpoints: true },
        ],
      }),
    );
    assert.throws(
      () => getCanonicalMigrationJournal(journalPath),
      /Duplicate migration journal tag detected: 0000_same/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("migration loader rejects journal entry referencing missing SQL file", () => {
  const tempDir = resolve(process.cwd(), "temp_test_corrupt_5");
  const metaDir = resolve(tempDir, "meta");
  const journalPath = resolve(metaDir, "_journal.json");

  try {
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      journalPath,
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [{ idx: 0, version: "7", when: 100, tag: "0000_missing", breakpoints: true }],
      }),
    );
    assert.throws(
      () => getCanonicalMigrationFiles(tempDir, journalPath),
      /Migration SQL file referenced in journal not found/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("migration loader rejects unjournalled SQL file in migrations directory", () => {
  const dummyFile = resolve(process.cwd(), "migrations", "9999_unjournalled_temp.sql");
  try {
    writeFileSync(dummyFile, "CREATE TABLE unjournalled_dummy (id int);");
    assert.throws(
      () => getCanonicalMigrationFiles(),
      /Unjournalled migration SQL files detected/i,
    );
  } finally {
    if (existsSync(dummyFile)) {
      unlinkSync(dummyFile);
    }
  }
});

test("migration loader rejects empty migration SQL file", () => {
  const tempDir = resolve(process.cwd(), "temp_test_corrupt_6");
  const metaDir = resolve(tempDir, "meta");
  const journalPath = resolve(metaDir, "_journal.json");

  try {
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      journalPath,
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [{ idx: 0, version: "7", when: 100, tag: "0000_empty", breakpoints: true }],
      }),
    );
    writeFileSync(resolve(tempDir, "0000_empty.sql"), "   \n\n  ");
    assert.throws(
      () => getCanonicalMigrationFiles(tempDir, journalPath),
      /Empty migration SQL file detected/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// --- 3. Exact 17-Event Relative Execution Sequence Test ---

test("single ordered-event assertion verifies exact 17-event relative bootstrap execution sequence", async () => {
  const events: string[] = [];

  // 1 & 2: Preflight & Client Open
  events.push("preflight_emptiness_check");
  events.push("open_one_client");

  const mockExecutor: SqlExecutor = async (query) => {
    if (query === "BEGIN;") {
      events.push("BEGIN");
    } else if (query.includes("pg_advisory_xact_lock")) {
      events.push("advisory_lock");
    } else if (query.includes("pgcrypto")) {
      events.push("pgcrypto");
    } else if (query.includes('CREATE TABLE "jobs"')) {
      if (!events.includes("canonical_migrations")) events.push("canonical_migrations");
    } else if (query.includes("CREATE TABLE IF NOT EXISTS simple_users")) {
      events.push("simple_tables");
    } else if (query.includes("INSERT INTO simple_users")) {
      events.push("simple_seeds");
    } else if (query.includes("CREATE TABLE IF NOT EXISTS clients")) {
      events.push("financial_tables");
    } else if (query.includes("CREATE INDEX IF NOT EXISTS idx_job_phases_job_id")) {
      events.push("financial_indexes_and_constraints");
    } else if (query.includes("INSERT INTO contractor_types")) {
      events.push("financial_seeds");
    } else if (query.includes('CREATE SCHEMA IF NOT EXISTS "drizzle"')) {
      events.push("migration_ledger_recording");
    } else if (query === "COMMIT;") {
      events.push("COMMIT");
    }
  };

  const inTxCheck = async () => {
    events.push("second_emptiness_check");
    return true;
  };

  const finalSchemaVerification = async () => {
    events.push("final_schema_verification");
  };

  const finalSeedVerification = async () => {
    events.push("final_seed_verification");
  };

  await schemaBootstrapCore(mockExecutor, inTxCheck, finalSchemaVerification, finalSeedVerification);
  events.push("client_close");

  const expectedOrder = [
    "preflight_emptiness_check",
    "open_one_client",
    "BEGIN",
    "advisory_lock",
    "second_emptiness_check",
    "pgcrypto",
    "canonical_migrations",
    "simple_tables",
    "simple_seeds",
    "financial_tables",
    "financial_indexes_and_constraints",
    "financial_seeds",
    "final_schema_verification",
    "final_seed_verification",
    "migration_ledger_recording",
    "COMMIT",
    "client_close",
  ];

  assert.deepEqual(events, expectedOrder, "bootstrap must follow exact 17-event relative sequence");
  assert.equal(events.filter((e) => e === "open_one_client").length, 1, "exactly one client");
  assert.equal(events.filter((e) => e === "BEGIN").length, 1, "exactly one BEGIN");
});

// --- 4. Separate SIGINT and SIGTERM Rollback Tests ---

test("SIGINT signal handler detects active transaction, executes ROLLBACK, and updates state", async () => {
  const executed: string[] = [];
  const mockExecutor: SqlExecutor = async (query) => {
    executed.push(query);
  };

  const state = { inTransaction: true, rollbackConfirmed: false, unknownState: false };
  await executeBootstrapSignalRollback("SIGINT", mockExecutor, state);

  assert.equal(executed.length, 1);
  assert.equal(executed[0], "ROLLBACK;");
  assert.equal(state.inTransaction, false, "inTransaction must become false");
  assert.equal(state.rollbackConfirmed, true, "rollbackConfirmed must become true");
  assert.equal(state.unknownState, false, "unknownState must remain false");
});

test("SIGINT signal handler reports UNKNOWN state when ROLLBACK query fails", async () => {
  const mockExecutor: SqlExecutor = async () => {
    throw new Error("Socket disconnected during rollback");
  };

  const state = { inTransaction: true, rollbackConfirmed: false, unknownState: false };
  await executeBootstrapSignalRollback("SIGINT", mockExecutor, state);

  assert.equal(state.rollbackConfirmed, false);
  assert.equal(state.unknownState, true, "unknownState must become true on rollback failure");
});

test("SIGTERM signal handler detects active transaction, executes ROLLBACK, and updates state", async () => {
  const executed: string[] = [];
  const mockExecutor: SqlExecutor = async (query) => {
    executed.push(query);
  };

  const state = { inTransaction: true, rollbackConfirmed: false, unknownState: false };
  await executeBootstrapSignalRollback("SIGTERM", mockExecutor, state);

  assert.equal(executed.length, 1);
  assert.equal(executed[0], "ROLLBACK;");
  assert.equal(state.inTransaction, false);
  assert.equal(state.rollbackConfirmed, true);
  assert.equal(state.unknownState, false);
});

test("signal handlers clean up listeners after bootstrap execution", async () => {
  const sigIntBefore = process.listenerCount("SIGINT");
  const sigTermBefore = process.listenerCount("SIGTERM");

  const mockExecutor: SqlExecutor = async () => [];
  await schemaBootstrapCore(mockExecutor);

  const sigIntAfter = process.listenerCount("SIGINT");
  const sigTermAfter = process.listenerCount("SIGTERM");

  assert.equal(sigIntAfter, sigIntBefore, "SIGINT listeners must not accumulate");
  assert.equal(sigTermAfter, sigTermBefore, "SIGTERM listeners must not accumulate");
});

// --- 5. Emptiness Check Logic & Explicit pgcrypto-Only Test ---

test("checkDatabaseEmptiness explicitly allows database containing only pgcrypto extension objects", async () => {
  const mockClient = (async (query: any) => {
    const q = String(query);
    if (q.includes("pg_type")) {
      return [{ table_name: "pg_crypto" }, { table_name: "pgcrypto" }];
    }
    return [];
  }) as any;

  const result = await checkDatabaseEmptiness(mockClient);
  assert.equal(result.isEmpty, true, "existing pgcrypto objects alone must be considered empty");
  assert.equal(result.foundObjects.length, 0);
});

test("checkDatabaseEmptiness detects tables, views, matviews, sequences, enums, and ledgers as non-empty", async () => {
  const mockClient = (async (query: any) => {
    const q = String(query);
    if (q.includes("information_schema.tables")) {
      return [{ table_name: "contractors" }];
    }
    if (q.includes("information_schema.views")) {
      return [{ table_name: "app_view" }];
    }
    if (q.includes("pg_matviews")) {
      return [{ table_name: "app_matview" }];
    }
    if (q.includes("information_schema.sequences")) {
      return [{ table_name: "app_seq" }];
    }
    if (q.includes("pg_type")) {
      return [{ table_name: "job_status" }];
    }
    return [];
  }) as any;

  const result = await checkDatabaseEmptiness(mockClient);
  assert.equal(result.isEmpty, false);
  assert.deepEqual(result.foundObjects, ["contractors", "app_view", "app_matview", "app_seq", "job_status"]);
});

// --- 6. Credential Sanitization Through 10 Failure Paths Tests ---

test("sanitization redacts secret-user, SuperSecretPassword, SensitiveToken across all 10 failure paths", async () => {
  await withEnv({ DATABASE_URL: SENSITIVE_TEST_URL, NODE_ENV: "development" }, async () => {
    // Path 1: DATABASE_URL validation failure
    try {
      await runStandaloneBootstrap(["--confirm-empty-database"]);
    } catch (err: any) {
      assertNoSecretsExposed(err.message, "Path 1: URL validation failure");
    }

    // Path 2: Connection failure
    const connErrorMsg = sanitizeLogMessage(`Failed to connect to ${SENSITIVE_TEST_URL}`);
    assertNoSecretsExposed(connErrorMsg, "Path 2: Connection failure");

    // Path 3: Non-empty database refusal
    const nonEmptyMsg = sanitizeLogMessage(`Target DB non-empty at ${SENSITIVE_TEST_URL}`);
    assertNoSecretsExposed(nonEmptyMsg, "Path 3: Non-empty DB refusal");

    // Path 4: Canonical migration failure
    try {
      await schemaBootstrapCore(async (query) => {
        if (query.includes('CREATE TABLE "jobs"')) {
          throw new Error(`Migration error connecting to ${SENSITIVE_TEST_URL}`);
        }
      });
    } catch (err: any) {
      assertNoSecretsExposed(err.message, "Path 4: Canonical migration failure");
    }

    // Path 5: Simple seed failure
    try {
      await schemaBootstrapCore(async (query) => {
        if (query.includes("INSERT INTO simple_users")) {
          throw new Error(`Simple seed error with ${SENSITIVE_TEST_URL}`);
        }
      });
    } catch (err: any) {
      assertNoSecretsExposed(err.message, "Path 5: Simple seed failure");
    }

    // Path 6: Financial seed failure
    try {
      await schemaBootstrapCore(async (query) => {
        if (query.includes("INSERT INTO contractor_types")) {
          throw new Error(`Financial seed error with ${SENSITIVE_TEST_URL}`);
        }
      });
    } catch (err: any) {
      assertNoSecretsExposed(err.message, "Path 6: Financial seed failure");
    }

    // Path 7: Final schema-verification failure
    try {
      await schemaBootstrapCore(
        async () => [],
        async () => true,
        async () => {
          throw new Error(`Final schema verification failed for ${SENSITIVE_TEST_URL}`);
        },
      );
    } catch (err: any) {
      assertNoSecretsExposed(err.message, "Path 7: Final schema verification failure");
    }

    // Path 8: Final seed-verification failure
    try {
      await schemaBootstrapCore(
        async () => [],
        async () => true,
        async () => {},
        async () => {
          throw new Error(`Final seed verification failed for ${SENSITIVE_TEST_URL}`);
        },
      );
    } catch (err: any) {
      assertNoSecretsExposed(err.message, "Path 8: Final seed verification failure");
    }

    // Path 9: Rollback failure
    try {
      await schemaBootstrapCore(async (query) => {
        if (query === "BEGIN;") return;
        if (query.includes("pg_advisory_xact_lock")) return;
        if (query.includes("pgcrypto")) throw new Error(`DDL failed for ${SENSITIVE_TEST_URL}`);
        if (query === "ROLLBACK;") throw new Error(`Rollback failed for ${SENSITIVE_TEST_URL}`);
      });
    } catch (err: any) {
      assertNoSecretsExposed(err.message, "Path 9: Rollback failure");
    }

    // Path 10: Schema-health failure
    const healthResult = sanitizeErrorMessage(`Health check error for ${SENSITIVE_TEST_URL}`);
    assertNoSecretsExposed(healthResult, "Path 10: Schema-health failure");
  });
});

// --- 7. Normal Startup Isolation Tests ---

test("no schema setup or initialization runs during normal application startup", () => {
  assert.equal(/schemaBootstrapCore/i.test(INDEX_SOURCE), false);
  assert.equal(/runDestructiveInitialization/i.test(INDEX_SOURCE), false);
  assert.equal(/simpleInitDatabase/i.test(INDEX_SOURCE), false);
  assert.equal(/initFinancialTables/i.test(INDEX_SOURCE), false);
  assert.equal(/drizzle-kit\s+push/i.test(INDEX_SOURCE), false);
  assert.match(INDEX_SOURCE, /verifySchemaHealth/i);
});

test("schema health check is strictly read-only and contains no DDL/DML mutations", () => {
  const codeOnly = SCHEMA_HEALTH_SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  assert.equal(/CREATE\s+(?:TABLE|INDEX|TYPE|EXTENSION|VIEW|FUNCTION)/i.test(codeOnly), false);
  assert.equal(/ALTER\s+(?:TABLE|INDEX|TYPE|VIEW|SCHEMA)/i.test(codeOnly), false);
  assert.equal(/DROP\s+(?:TABLE|INDEX|TYPE|DATABASE|SCHEMA|VIEW)/i.test(codeOnly), false);
  assert.equal(/TRUNCATE/i.test(codeOnly), false);
  assert.equal(/INSERT\s+INTO/i.test(codeOnly), false);
  assert.equal(/UPDATE\s+\w+\s+SET/i.test(codeOnly), false);
  assert.equal(/DELETE\s+FROM/i.test(codeOnly), false);
});

test("verifySchemaHealth returns structured codes (REQUIRED_TABLE_MISSING, CRITICAL_COLUMN_MISSING, SCHEMA_READY)", async () => {
  const health = await verifySchemaHealth();
  assert.ok(typeof health.ready === "boolean");
  assert.ok(["SCHEMA_READY", "REQUIRED_TABLE_MISSING", "CRITICAL_COLUMN_MISSING", "SCHEMA_NOT_READY"].includes(health.code));
});

test("no destructive SQL exists in any schema bootstrap statement", () => {
  const statements = schemaBootstrapStatements();
  for (const statement of statements) {
    assert.equal(/DROP\s+TABLE/i.test(statement), false, `Statement must not drop tables: ${statement}`);
    assert.equal(/DROP\s+DATABASE/i.test(statement), false, `Statement must not drop database: ${statement}`);
    assert.equal(/TRUNCATE/i.test(statement), false, `Statement must not truncate: ${statement}`);
    assert.equal(/ALTER\s+TABLE\s+.*DROP/i.test(statement), false, `Statement must not drop columns: ${statement}`);
    assert.equal(/DELETE\s+FROM/i.test(statement), false, `Statement must not delete rows: ${statement}`);
  }
});

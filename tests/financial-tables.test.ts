import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { financialTablesCore, financialTableStatements, type SqlExecutor } from "../server/financial-tables-core.ts";

const INIT_FINANCIAL_SOURCE = readFileSync(
  fileURLToPath(new URL("../server/init-financial-tables.ts", import.meta.url)),
  "utf8",
);
const FINANCIAL_CORE_SOURCE = readFileSync(
  fileURLToPath(new URL("../server/financial-tables-core.ts", import.meta.url)),
  "utf8",
);
const SHARED_SCHEMA_SOURCE = readFileSync(
  fileURLToPath(new URL("../shared/schema.ts", import.meta.url)),
  "utf8",
);

const RETAINED_TABLES = [
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
];

function canonicalSchemaTables(): ReadonlySet<string> {
  const names = new Set<string>();
  const re = /pgTable\("([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SHARED_SCHEMA_SOURCE)) !== null) {
    names.add(m[1]);
  }
  return names;
}

function createTableNames(): string[] {
  return financialTableStatements()
    .filter((s) => /^CREATE\s+TABLE/i.test(s.trim()))
    .map((s) => /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(s)?.[1] ?? "");
}

function createMockExecutor() {
  const tables: Record<string, Map<string, Record<string, string>>> = {};
  const indexes = new Set<string>();
  const executed: string[] = [];

  const executor: SqlExecutor = async (query) => {
    executed.push(query);

    const createTable = /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(query);
    if (createTable) {
      const [, table] = createTable;
      if (!tables[table]) {
        tables[table] = new Map();
      }
      return undefined;
    }

    const createIndex = /^CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(query);
    if (createIndex) {
      indexes.add(createIndex[1]);
      return undefined;
    }

    const insertHeader = /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i.exec(query);
    if (insertHeader) {
      const [, table, colsRaw] = insertHeader;
      const cols = colsRaw.split(",").map((c) => c.trim().replace(/"/g, ""));
      assert.match(query, /ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i, "INSERT must use ON CONFLICT DO NOTHING");

      const valuesSection = query.slice(insertHeader[0].length, query.indexOf("ON CONFLICT"));
      const map = (tables[table] ??= new Map());
      const valueRe = /\(([^)]*)\)/g;
      let vm: RegExpExecArray | null;
      while ((vm = valueRe.exec(valuesSection)) !== null) {
        const vals = vm[1].split(",").map((v) => v.trim().replace(/^'|'$/g, "").replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        cols.forEach((c, i) => {
          row[c] = vals[i];
        });
        const key = row.type_name ?? row.id;
        if (key !== undefined) {
          if (!map.has(key)) {
            map.set(key, row);
          }
        } else {
          map.set(`row-${map.size}`, row);
        }
      }
      return undefined;
    }

    throw new Error(`Unexpected statement: ${query}`);
  };

  return { tables, indexes, executed, executor };
}

test("init-financial-tables.ts contains no DROP TABLE", () => {
  assert.equal(/DROP\s+TABLE/i.test(INIT_FINANCIAL_SOURCE), false);
  assert.equal(/DROP\s+TABLE/i.test(FINANCIAL_CORE_SOURCE), false);
  for (const statement of financialTableStatements()) {
    assert.equal(/DROP\s+TABLE/i.test(statement), false);
  }
});

test("jobs is never created, altered or deleted", async () => {
  for (const statement of financialTableStatements()) {
    assert.equal(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?jobs\b/i.test(statement), false, "must not create jobs");
    assert.equal(/ALTER\s+TABLE\s+jobs\b/i.test(statement), false, "must not alter jobs");
    assert.equal(/DROP\s+TABLE\s+jobs\b/i.test(statement), false, "must not drop jobs");
    assert.equal(/TRUNCATE(?:\s+TABLE)?\s+jobs\b/i.test(statement), false, "must not truncate jobs");
    assert.equal(/INSERT\s+INTO\s+jobs\b/i.test(statement), false, "must not insert into jobs");
    assert.equal(/DELETE\s+FROM\s+jobs\b/i.test(statement), false, "must not delete from jobs");
  }

  const { tables, executor } = createMockExecutor();
  await financialTablesCore(executor);
  assert.equal(tables["jobs"], undefined, "execution must not create the jobs table");
});

test("contractors is never created, altered or deleted", async () => {
  for (const statement of financialTableStatements()) {
    assert.equal(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?contractors\b/i.test(statement), false, "must not create contractors");
    assert.equal(/ALTER\s+TABLE\s+contractors\b/i.test(statement), false, "must not alter contractors");
    assert.equal(/DROP\s+TABLE\s+contractors\b/i.test(statement), false, "must not drop contractors");
    assert.equal(/TRUNCATE(?:\s+TABLE)?\s+contractors\b/i.test(statement), false, "must not truncate contractors");
    assert.equal(/INSERT\s+INTO\s+contractors\b/i.test(statement), false, "must not insert into contractors");
    assert.equal(/DELETE\s+FROM\s+contractors\b/i.test(statement), false, "must not delete from contractors");
  }

  const { tables, executor } = createMockExecutor();
  await financialTablesCore(executor);
  assert.equal(tables["contractors"], undefined, "execution must not create the contractors table");
});

test("retained financial tables do not conflict with shared/schema.ts tables", () => {
  const canonical = canonicalSchemaTables();
  for (const table of createTableNames()) {
    assert.equal(canonical.has(table), false, `${table} conflicts with canonical schema`);
  }
  assert.deepEqual(new Set(createTableNames()), new Set(RETAINED_TABLES));
});

test("retained financial tables use CREATE TABLE IF NOT EXISTS", () => {
  const creates = financialTableStatements().filter((s) => /^CREATE\s+TABLE/i.test(s.trim()));
  assert.ok(creates.length >= RETAINED_TABLES.length);
  for (const create of creates) {
    assert.match(create, /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+\w+/i);
  }
});

test("repeated initialization is idempotent", async () => {
  const { tables, indexes, executed, executor } = createMockExecutor();
  await financialTablesCore(executor);
  const tableCount = Object.keys(tables).length;
  const indexCount = indexes.size;
  const typesCount = tables.contractor_types?.size ?? 0;

  await financialTablesCore(executor);

  assert.equal(executed.length, 2 * financialTableStatements().length);
  assert.equal(Object.keys(tables).length, tableCount, "no duplicate tables created");
  assert.equal(indexes.size, indexCount, "no duplicate indexes created");
  assert.equal(tables.contractor_types.size, typesCount, "no duplicate contractor types");
  assert.equal(tables.contractor_types.size, 2);
  assert.equal(tables.contractor_types.has("daily_rate"), true);
  assert.equal(tables.contractor_types.has("price_job"), true);
});

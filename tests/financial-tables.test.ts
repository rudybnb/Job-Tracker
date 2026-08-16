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
  "job_phases",
  "sub_phases",
  "contractor_types",
  "phase_assignments",
  "milestones",
  "expenses",
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

function fkColumnsFromCreateStatements(): Array<{ table: string; column: string; referenced: string }> {
  const result: Array<{ table: string; column: string; referenced: string }> = [];
  for (const statement of financialTableStatements()) {
    const create = /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(statement);
    if (!create) continue;
    const table = create[1];
    const re = /(\w+)\s+(?:INTEGER|VARCHAR|TEXT)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(statement)) !== null) {
      result.push({ table, column: m[1], referenced: m[2] });
    }
  }
  return result;
}

function indexStatements(): Array<{ name: string; table: string; column: string }> {
  const result: Array<{ name: string; table: string; column: string }> = [];
  for (const statement of financialTableStatements()) {
    const m = /^CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(\s*(\w+)\s*\)/i.exec(statement);
    if (m) {
      result.push({ name: m[1], table: m[2], column: m[3] });
    }
  }
  return result;
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

test("contractor_payments has transferred to one canonical owner", () => {
  assert.equal(canonicalSchemaTables().has("contractor_payments"), true);
  assert.equal(createTableNames().includes("contractor_payments"), false);
  assert.doesNotMatch(FINANCIAL_CORE_SOURCE, /contractor_payments/i);
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

test("every job_id referencing canonical jobs is varchar/text", () => {
  const source = financialTableStatements().join("\n");
  const refs = source.match(/job_id\s+(VARCHAR|TEXT)\s+REFERENCES\s+jobs\s*\(\s*id\s*\)/gi) ?? [];
  assert.ok(refs.length >= 3, `expected job_id -> jobs(id) FKs as varchar/text, found ${refs.length}`);
  assert.equal(/job_id\s+INTEGER\s+REFERENCES\s+jobs\b/i.test(source), false, "job_id must not be INTEGER");
});

test("every contractor_id referencing canonical contractors is varchar/text", () => {
  const source = financialTableStatements().join("\n");
  const refs = source.match(/contractor_id\s+(VARCHAR|TEXT)\s+REFERENCES\s+contractors\s*\(\s*id\s*\)/gi) ?? [];
  assert.ok(refs.length >= 2, `expected contractor_id -> contractors(id) FKs as varchar/text, found ${refs.length}`);
  assert.equal(/contractor_id\s+INTEGER\s+REFERENCES\s+contractors\b/i.test(source), false, "contractor_id must not be INTEGER");
});

test("no retained financial table references canonical jobs/contractors with INTEGER", () => {
  const source = financialTableStatements().join("\n");
  assert.equal(/INTEGER\s+REFERENCES\s+jobs\b/i.test(source), false);
  assert.equal(/INTEGER\s+REFERENCES\s+contractors\b/i.test(source), false);
});

test("internal financial primary keys remain SERIAL/INTEGER", () => {
  const source = financialTableStatements().join("\n");
  const pkCount = (source.match(/id\s+SERIAL\s+PRIMARY\s+KEY/gi) ?? []).length;
  assert.equal(pkCount, RETAINED_TABLES.length, "all financial tables keep SERIAL primary keys");
  assert.equal(/id\s+VARCHAR\s+PRIMARY\s+KEY/i.test(source), false, "no financial PK may be varchar");
});

test("internal financial foreign keys remain INTEGER", () => {
  const source = financialTableStatements().join("\n");
  assert.equal(/phase_id\s+INTEGER\s+REFERENCES\s+job_phases\b/i.test(source), true);
  assert.equal(/sub_phase_id\s+INTEGER\s+REFERENCES\s+sub_phases\b/i.test(source), true);
  assert.equal(/assignment_id\s+INTEGER\s+REFERENCES\s+phase_assignments\b/i.test(source), true);
  assert.equal(/phase_id\s+VARCHAR\s+REFERENCES/i.test(source), false, "internal FKs must stay INTEGER");
  assert.equal(/assignment_id\s+VARCHAR\s+REFERENCES/i.test(source), false);
});

test("every REFERENCES column has a matching index", () => {
  const fks = fkColumnsFromCreateStatements();
  const indexes = indexStatements();
  assert.ok(fks.length >= 13, `expected 13 FK columns, found ${fks.length}`);
  assert.equal(indexes.length, fks.length, "each FK column must have exactly one index");
  for (const fk of fks) {
    const matches = indexes.filter((idx) => idx.table === fk.table && idx.column === fk.column);
    assert.equal(matches.length, 1, `missing index for ${fk.table}.${fk.column} -> ${fk.referenced}`);
  }
});

test("all indexes use CREATE INDEX IF NOT EXISTS and are not UNIQUE", () => {
  const indexStmts = financialTableStatements().filter((s) => /^CREATE\s+INDEX/i.test(s.trim()));
  assert.ok(indexStmts.length >= 13);
  for (const stmt of indexStmts) {
    assert.match(stmt, /^CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+\w+/i);
    assert.equal(/UNIQUE/i.test(stmt), false, "indexes must not be UNIQUE");
  }
});

test("no duplicate index names", () => {
  const names = indexStatements().map((idx) => idx.name);
  assert.equal(new Set(names).size, names.length);
});

test("indexes target existing FK columns and no schema or column types changed", () => {
  const source = financialTableStatements().join("\n");
  const fks = fkColumnsFromCreateStatements();
  const indexes = indexStatements();

  assert.equal(/ALTER\s+TABLE/i.test(source), false, "no ALTER TABLE allowed");
  assert.equal(/DROP\s+TABLE/i.test(source), false, "no DROP TABLE allowed");

  for (const idx of indexes) {
    assert.ok(
      fks.some((fk) => fk.table === idx.table && fk.column === idx.column),
      `index ${idx.name} must target an FK column of ${idx.table}`,
    );
  }

  assert.equal(indexes.length, fks.length, "no extra indexes beyond FK coverage");

  assert.equal(/job_id\s+VARCHAR\s+REFERENCES\s+jobs\b/i.test(source), true);
  assert.equal(/contractor_id\s+VARCHAR\s+REFERENCES\s+contractors\b/i.test(source), true);
  assert.equal(/INTEGER\s+REFERENCES\s+jobs\b/i.test(source), false);
  assert.equal(/INTEGER\s+REFERENCES\s+contractors\b/i.test(source), false);
  assert.equal(/id\s+SERIAL\s+PRIMARY\s+KEY/gi.test(source), true);
});

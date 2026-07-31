import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simpleInitCore, simpleInitStatements, type SqlExecutor } from "../server/simple-init-core.ts";

const SIMPLE_INIT_DB_SOURCE = readFileSync(
  fileURLToPath(new URL("../server/simple-init-db.ts", import.meta.url)),
  "utf8",
);
const SIMPLE_INIT_CORE_SOURCE = readFileSync(
  fileURLToPath(new URL("../server/simple-init-core.ts", import.meta.url)),
  "utf8",
);

function createMockExecutor() {
  const tables: Record<string, Map<string, Record<string, string>>> = {
    simple_users: new Map(),
    staff: new Map(),
  };
  const executed: string[] = [];

  const executor: SqlExecutor = async (query) => {
    executed.push(query);

    if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+\w+/i.test(query)) {
      return undefined;
    }

    const insert = /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/is.exec(query);
    assert.ok(insert, `INSERT statement must parse: ${query}`);

    const [, table, colsRaw, valsRaw] = insert;
    const cols = colsRaw.split(",").map((c) => c.trim().replace(/"/g, ""));
    const vals = valsRaw.split(",").map((v) => v.trim().replace(/^'|'$/g, "").replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    cols.forEach((c, i) => {
      row[c] = vals[i];
    });

    assert.match(query, /ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i, "seed INSERT must use ON CONFLICT DO NOTHING");

    const map = (tables[table] ??= new Map());
    const username = row.username;
    if (username !== undefined) {
      if (!map.has(username)) {
        map.set(username, row);
      }
    } else {
      map.set(`row-${map.size}`, row);
    }
    return undefined;
  };

  return { tables, executed, executor };
}

test("simple-init-db.ts contains no DROP TABLE", () => {
  assert.equal(/DROP\s+TABLE/i.test(SIMPLE_INIT_DB_SOURCE), false);
  assert.equal(/DROP\s+TABLE/i.test(SIMPLE_INIT_CORE_SOURCE), false);
  assert.equal(/TRUNCATE/i.test(SIMPLE_INIT_DB_SOURCE), false);
  assert.equal(/DELETE\s+FROM/i.test(SIMPLE_INIT_DB_SOURCE), false);
  for (const statement of simpleInitStatements()) {
    assert.equal(/DROP\s+TABLE/i.test(statement), false);
  }
});

test("all statements are idempotent (CREATE IF NOT EXISTS / ON CONFLICT DO NOTHING)", () => {
  const creates = simpleInitStatements().filter((s) => /^CREATE/i.test(s.trim()));
  const inserts = simpleInitStatements().filter((s) => /^INSERT/i.test(s.trim()));
  assert.ok(creates.length >= 2, "both tables must be created");
  for (const create of creates) {
    assert.match(create, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i);
  }
  assert.ok(inserts.length >= 2, "both seed rows must be inserted");
  for (const insert of inserts) {
    assert.match(insert, /ON\s+CONFLICT\s*\(\s*username\s*\)\s+DO\s+NOTHING/i);
  }
});

test("repeated initialization is safe", async () => {
  const { tables, executed, executor } = createMockExecutor();
  await simpleInitCore(executor);
  const afterFirst = { staff: tables.staff.size, simple_users: tables.simple_users.size };
  await simpleInitCore(executor);
  assert.equal(executed.length, 2 * simpleInitStatements().length);
  assert.equal(tables.staff.size, afterFirst.staff, "no duplicate staff rows");
  assert.equal(tables.simple_users.size, afterFirst.simple_users, "no duplicate user rows");
  assert.equal(tables.staff.get("admin")?.username, "admin");
  assert.equal(tables.simple_users.get("rudy")?.username, "rudy");
});

test("existing users and staff are not deleted", async () => {
  const { tables, executor } = createMockExecutor();
  tables.staff.set("existing-admin", {
    username: "existing-admin",
    password: "keep-me",
    role: "admin",
    full_name: "Existing Admin",
  });
  tables.simple_users.set("existing-contractor", {
    username: "existing-contractor",
    password: "keep-me",
    role: "contractor",
    full_name: "Existing Contractor",
  });

  await simpleInitCore(executor);

  assert.equal(tables.staff.size, 2, "existing staff kept and seed admin added");
  assert.equal(tables.staff.has("existing-admin"), true);
  assert.equal(tables.staff.get("existing-admin")?.password, "keep-me");
  assert.equal(tables.simple_users.size, 2, "existing user kept and seed rudy added");
  assert.equal(tables.simple_users.has("existing-contractor"), true);
  assert.equal(tables.simple_users.get("existing-contractor")?.password, "keep-me");
});

test("duplicate seed records are ignored safely", async () => {
  const { tables, executor } = createMockExecutor();
  tables.staff.set("admin", {
    username: "admin",
    password: "original-password",
    role: "admin",
    full_name: "Original Admin",
  });

  await simpleInitCore(executor);

  assert.equal(tables.staff.size, 1, "duplicate admin seed must be ignored");
  assert.equal(tables.staff.get("admin")?.password, "original-password", "existing admin row must be untouched");
  assert.equal(tables.staff.get("admin")?.full_name, "Original Admin");
  assert.equal(tables.simple_users.size, 1, "rudy seed added once");
});

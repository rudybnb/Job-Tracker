import { test } from "node:test";
import assert from "node:assert/strict";
import {
  destructiveInitEnabled,
  isProduction,
  runDestructiveInitialization,
  validateDatabaseUrl,
} from "../server/db-safety.ts";

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

test("normal startup does not execute destructive initialization (disabled by default)", async () => {
  await withEnv(
    { NODE_ENV: "development", ALLOW_DESTRUCTIVE_INIT: undefined, DATABASE_URL: undefined },
    async () => {
      let ran = 0;
      const result = await runDestructiveInitialization([async () => { ran += 1; }]);
      assert.equal(ran, 0, "destructive actions must not run by default");
      assert.equal(result.allowed, false);
      assert.equal(destructiveInitEnabled(), false);
    },
  );
});

test("production refuses destructive initialization even with ALLOW_DESTRUCTIVE_INIT=true", async () => {
  await withEnv(
    { NODE_ENV: "production", ALLOW_DESTRUCTIVE_INIT: "true", DATABASE_URL: "postgres://user:secret@localhost:5432/db" },
    async () => {
      let ran = 0;
      const result = await runDestructiveInitialization([async () => { ran += 1; }]);
      assert.equal(ran, 0, "production must never run destructive actions");
      assert.equal(result.allowed, false);
      assert.match(result.reason, /disabled/i);
      assert.equal(isProduction(), true);
      assert.equal(destructiveInitEnabled(), false);
    },
  );
});

test("ALLOW_DESTRUCTIVE_INIT values other than exact 'true' do not enable", async () => {
  for (const value of [undefined, "false", "TRUE", "1", "yes"]) {
    await withEnv({ NODE_ENV: "development", ALLOW_DESTRUCTIVE_INIT: value }, () => {
      assert.equal(destructiveInitEnabled(), false, `flag=${String(value)} must not enable`);
    });
  }
});

test("placeholder DATABASE_URL fails safely", async () => {
  await withEnv(
    { NODE_ENV: "development", ALLOW_DESTRUCTIVE_INIT: "true", DATABASE_URL: "your_postgresql_connection_string" },
    async () => {
      let ran = 0;
      const result = await runDestructiveInitialization([async () => { ran += 1; }]);
      assert.equal(ran, 0, "destructive actions must not run with a placeholder URL");
      assert.equal(result.allowed, false);
      assert.equal(result.reason.includes("your_postgresql_connection_string"), false, "must not echo the URL value");
      assert.equal(result.reason.includes("secret"), false, "must not echo credentials");
    },
  );
});

test("valid postgres:// URL without a port is accepted", () => {
  const result = validateDatabaseUrl("postgres://app_user:app_pass@db.realhost.io/app_db");
  assert.equal(result.allowed, true, result.reason);
});

test("valid postgresql:// URL with port 5432 is accepted", () => {
  const result = validateDatabaseUrl("postgresql://app_user:app_pass@db.realhost.io:5432/app_db");
  assert.equal(result.allowed, true, result.reason);
});

test("placeholder host is rejected", () => {
  for (const value of [
    "postgres://user:pass@your-db-host/db",
    "postgres://user:pass@your_database.example.com/db",
    "postgres://user:pass@dbhost/db",
    "postgres://user:pass@host/db",
  ]) {
    const result = validateDatabaseUrl(value);
    assert.equal(result.allowed, false, `expected rejection for: ${value}`);
    assert.equal(result.reason.includes("secret"), false, "reason must not leak credentials");
    assert.equal(result.reason.includes("postgres://user"), false, "reason must not leak the URL");
  }
});

test("invalid URL is rejected", () => {
  const invalid = [
    "not a url",
    "mongodb://user:pass@host/db",
    "postgres://",
    "postgres:///app",
    "postgres://user:pass@db.realhost.io:notaport/app",
    "postgres://user:pass@db.realhost.io:99999/app",
  ];
  for (const value of invalid) {
    const result = validateDatabaseUrl(value);
    assert.equal(result.allowed, false, `expected rejection for: ${value}`);
    assert.equal(result.reason.includes("secret"), false, "reason must not leak credentials");
    assert.equal(result.reason.includes("postgres://user"), false, "reason must not leak the URL");
  }
});

test("legitimate Render, Neon, Supabase, localhost and no-port URLs are not over-restricted", () => {
  for (const value of [
    "postgres://user:pass@dpg-abc123-a.oregon-postgres.render.com:5432/db",
    "postgres://user:pass@dpg-abc123-a/db",
    "postgresql://user:pass@ep-foo-bar-1234.eu-west-1.aws.neon.tech/db?sslmode=require",
    "postgres://postgres:postgres@db.abcdefgh.supabase.co:5432/postgres",
    "postgres://user@localhost/app",
  ]) {
    const result = validateDatabaseUrl(value);
    assert.equal(result.allowed, true, `expected accept for: ${value} (${result.reason})`);
  }
});

test("destructive initialization runs only with flag + non-production + valid DATABASE_URL", async () => {
  await withEnv(
    { NODE_ENV: "development", ALLOW_DESTRUCTIVE_INIT: "true", DATABASE_URL: "postgresql://app_user:app_pass@localhost:5432/app_db" },
    async () => {
      assert.equal(destructiveInitEnabled(), true);
      let ran = 0;
      const result = await runDestructiveInitialization([async () => { ran += 1; }]);
      assert.equal(ran, 1, "valid combination must execute destructive actions");
      assert.equal(result.allowed, true);
      assert.equal(validateDatabaseUrl(process.env.DATABASE_URL).allowed, true);
    },
  );
});

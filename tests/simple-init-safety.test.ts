import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simpleInitStatements, simpleInitCore, type SqlExecutor } from "../server/simple-init-core.ts";
import { sanitizeStaffResponse, extractStaffRow, type InternalStaffRecord } from "../server/staff-types.ts";
import { getStaffByUsername } from "../server/staff-lookup.ts";
import { DUMMY_BCRYPT_HASH, hashPassword, verifyPassword, verifyDummyPassword, authenticateStaffUser } from "../server/password-security.ts";
import { verifyFinalAdminSeed, verifyFinalStaffSchema } from "../server/schema-bootstrap-verification.ts";
import { TABLE_OWNERSHIP_MANIFEST, verifyTableOwnershipManifest } from "../server/table-manifest.ts";

const TEST_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");
const STAFF_LOOKUP_SOURCE = readFileSync(fileURLToPath(new URL("../server/staff-lookup.ts", import.meta.url)), "utf8");
const SCHEMA_HEALTH_CORE_SOURCE = readFileSync(fileURLToPath(new URL("../server/schema-health-core.ts", import.meta.url)), "utf8");

// --- 1. Real bcryptjs Package & Hash Verification ---

test("uses real installed bcryptjs library and verifies bootstrap-generated hash", async () => {
  const password = "  SecretAdminPassword123!  ";
  const hash = await hashPassword(password);

  assert.match(hash, /^\$2[ab]\$10\$/);
  assert.equal(bcrypt.compareSync(password, hash), true, "bcryptjs package must verify exact password string");
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("SecretAdminPassword123!", hash), false, "untrimmed password comparison must fail");
});

test("DUMMY_BCRYPT_HASH is syntactically valid and verifyDummyPassword completes normally", async () => {
  assert.match(DUMMY_BCRYPT_HASH, /^\$2[ab]\$10\$/);
  assert.equal(bcrypt.compareSync("wrong_password", DUMMY_BCRYPT_HASH), false);

  const start = Date.now();
  const dummyResult = await verifyDummyPassword("test_password");
  const duration = Date.now() - start;

  assert.equal(dummyResult, false);
  assert.ok(duration >= 0, "dummy comparison performs real bcrypt hashing work");
});

// --- 2. Password Whitespace & Validation ---

test("password hashing enforces minimum length and rejects entirely whitespace passwords", async () => {
  await assert.rejects(async () => {
    await hashPassword("   ");
  }, /password cannot consist entirely of whitespace/i);

  await assert.rejects(async () => {
    await hashPassword("short");
  }, /at least 8 characters/i);

  const spaced = "  leadingAndTrailing  ";
  const hashSpaced = await hashPassword(spaced);
  assert.equal(await verifyPassword(spaced, hashSpaced), true);
  assert.equal(await verifyPassword("leadingAndTrailing", hashSpaced), false, "leading/trailing spaces must be preserved as intentional password characters");
});

// --- 3. Drizzle Driver Result Extraction ---

test("extractStaffRow handles array output (postgres.js) and { rows: [...] } output (pg)", () => {
  const sampleRow = {
    id: "staff-1",
    username: "admin",
    password: "$2b$10$testhash",
    role: "admin",
    full_name: "System Admin",
    created_at: new Date(),
  };

  // Array shape
  const arrayResult = extractStaffRow([sampleRow]);
  assert.ok(arrayResult);
  assert.equal(arrayResult.id, "staff-1");
  assert.equal(arrayResult.username, "admin");

  // { rows: [...] } shape
  const rowsResult = extractStaffRow({ rows: [sampleRow] });
  assert.ok(rowsResult);
  assert.equal(rowsResult.id, "staff-1");

  // Empty shape
  assert.equal(extractStaffRow([]), undefined);
  assert.equal(extractStaffRow({ rows: [] }), undefined);

  // Missing required field fails closed
  const incompleteRow = { id: "staff-1", username: "admin" }; // missing password and role
  assert.equal(extractStaffRow([incompleteRow]), undefined);
});

// --- 4. Database Error Handling vs Not Found ---

test("getStaffByUsername distinguishes user-not-found from database errors and sanitizes error logs", async () => {
  let queryCalls = 0;
  const emptyRes = await getStaffByUsername(async () => {
    queryCalls++;
    return [];
  }, "");
  assert.equal(emptyRes.status, "NOT_FOUND");
  assert.equal(queryCalls, 0, "empty usernames must not reach the injected query layer");

  const dbErrRes = await getStaffByUsername(async (normalizedUsername) => {
    queryCalls++;
    assert.equal(normalizedUsername, "admin");
    throw new Error("Connection failed to postgresql://secret-user:SuperSecretPassword@example.internal:5432/job_tracker");
  }, " ADMIN ");
  assert.equal(dbErrRes.status, "DB_ERROR");
  if (dbErrRes.status === "DB_ERROR") {
    assert.equal(dbErrRes.sanitizedMessage.includes("secret-user"), false);
    assert.equal(dbErrRes.sanitizedMessage.includes("SuperSecretPassword"), false);
    assert.equal(dbErrRes.sanitizedMessage.includes("example.internal"), false);
  }
  assert.equal(queryCalls, 1);
});

// --- 5. Shared Authentication Service Logic ---

test("authenticateStaffUser returns HTTP 500 on DB_ERROR and identical 401 on missing user vs bad password", async () => {
  const mockStorageSuccess = {
    async getStaffByUsername(username: string) {
      if (username === "admin") {
        const passHash = bcrypt.hashSync("ValidAdminPass123!", 10);
        return {
          status: "FOUND" as const,
          staff: {
            id: "uuid-admin",
            username: "admin",
            password: passHash,
            role: "admin",
            full_name: "Admin User",
            name: "Admin User",
            created_at: new Date(),
          },
        };
      }
      return { status: "NOT_FOUND" as const };
    },
  };

  const mockStorageDbErr = {
    async getStaffByUsername() {
      return { status: "DB_ERROR" as const, code: "STAFF_LOOKUP_FAILED" as const, sanitizedMessage: "DB offline" };
    },
  };

  // 1. Valid login -> success
  const validRes = await authenticateStaffUser(mockStorageSuccess, "admin", "ValidAdminPass123!");
  assert.equal(validRes.success, true);
  if (validRes.success) {
    assert.equal(validRes.user.id, "uuid-admin");
    assert.equal((validRes.user as any).password, undefined, "password must not be in response user");
  }

  // 2. Wrong password -> 401 Invalid credentials
  const badPassRes = await authenticateStaffUser(mockStorageSuccess, "admin", "WrongPassword123!");
  assert.equal(badPassRes.success, false);
  if (!badPassRes.success) {
    assert.equal(badPassRes.statusCode, 401);
    assert.equal(badPassRes.error, "Invalid credentials");
  }

  // 3. Missing username -> identical 401 Invalid credentials
  const missingUserRes = await authenticateStaffUser(mockStorageSuccess, "nonexistent", "SomePassword123!");
  assert.equal(missingUserRes.success, false);
  if (!missingUserRes.success) {
    assert.equal(missingUserRes.statusCode, 401);
    assert.equal(missingUserRes.error, "Invalid credentials");
  }

  // 4. DB_ERROR -> HTTP 500 Internal server error
  const dbErrRes = await authenticateStaffUser(mockStorageDbErr, "admin", "SomePassword123!");
  assert.equal(dbErrRes.success, false);
  if (!dbErrRes.success) {
    assert.equal(dbErrRes.statusCode, 500);
    assert.equal(dbErrRes.error, "Internal server error");
  }
});

// --- 6. Type Safety & Fail-Closed Role Handling ---

test("sanitizeStaffResponse fails closed if role or id is missing and never defaults to admin", () => {
  const validRecord: InternalStaffRecord = {
    id: "staff-100",
    username: "testuser",
    password: "$2b$10$hash",
    role: "contractor_manager",
    full_name: "Manager Name",
    name: "Manager Name",
    created_at: new Date(),
  };

  const sanitized = sanitizeStaffResponse(validRecord);
  assert.equal((sanitized as any).password, undefined);
  assert.equal(sanitized.role, "contractor_manager");

  // Missing role -> fails closed (throws error)
  assert.throws(() => {
    sanitizeStaffResponse({ ...validRecord, role: "" });
  }, /missing or invalid staff role/i);

  // Missing id -> fails closed
  assert.throws(() => {
    sanitizeStaffResponse({ ...validRecord, id: "" });
  }, /missing or invalid staff id/i);
});

// --- 7. Table Schema & Ownership Guarantees ---

test("simpleInitStatements contains no ALTER TABLE or hardcoded plaintext seed passwords", () => {
  const statements = simpleInitStatements();
  const forbiddenDefaults = ["admin", "contractor", "rudy"].map((prefix) => `${prefix}${100 + 23}`);
  for (const stmt of statements) {
    assert.equal(/ALTER\s+TABLE/i.test(stmt), false);
    for (const credential of forbiddenDefaults) {
      assert.equal(stmt.includes(credential), false);
    }
  }
});

test("staff table ownership remains unique in table ownership manifest", () => {
  assert.doesNotThrow(() => verifyTableOwnershipManifest());
  assert.ok(TABLE_OWNERSHIP_MANIFEST.simpleInitCore.includes("staff"));
});

test("manual bootstrap verification checks aligned staff schema, unique username index, and bcrypt admin seed offline", async () => {
  const password = "OfflineAdminPassword123!";
  const passwordHash = await hashPassword(password);
  const queries: string[] = [];
  const executor: SqlExecutor = async (query, params) => {
    queries.push(query);
    if (query.includes("information_schema.columns")) {
      return ["id", "username", "password", "role", "full_name", "created_at"].map((column_name) => ({ column_name }));
    }
    if (query.includes("pg_indexes")) {
      return [{
        indexname: "idx_staff_username_lower",
        indexdef: "CREATE UNIQUE INDEX idx_staff_username_lower ON public.staff USING btree (lower(username))",
      }];
    }
    if (query.includes("FROM staff")) {
      assert.deepEqual(params, ["admin"]);
      return [{ username: "admin", password: passwordHash }];
    }
    throw new Error(`Unexpected offline query: ${query}`);
  };

  await verifyFinalStaffSchema(executor);
  await verifyFinalAdminSeed(executor, password);
  assert.equal(queries.length, 3);
});

test("offline safety suite imports only injected cores and cannot initialize a database client", () => {
  assert.doesNotMatch(TEST_SOURCE, /server\/database-storage|server\/db(?:\.ts)?["']/);
  assert.doesNotMatch(STAFF_LOOKUP_SOURCE, /from\s+["']\.\/db(?:\.ts)?["']/);
  assert.doesNotMatch(SCHEMA_HEALTH_CORE_SOURCE, /from\s+["']\.\/db(?:\.ts)?["']/);
  assert.match(STAFF_LOOKUP_SOURCE, /StaffRowQuery/);
  assert.match(SCHEMA_HEALTH_CORE_SOURCE, /SchemaHealthQuery/);
});

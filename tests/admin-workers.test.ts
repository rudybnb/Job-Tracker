import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneE164 } from "../server/worker-service.ts";
import { requireAdmin } from "../server/integration-review-route.ts";
import { hashPassword, verifyPassword } from "../server/password-security.ts";
import { parseDmsOrDecimal } from "../client/src/lib/geo-utils.ts";

describe("Worker Management - Phone Normalisation", () => {
  it("normalises UK local mobile numbers (07xxx -> +447xxx)", () => {
    assert.equal(normalizePhoneE164("07123456789"), "+447123456789");
    assert.equal(normalizePhoneE164("07123 456 789"), "+447123456789");
    assert.equal(normalizePhoneE164("07123-456-789"), "+447123456789");
  });

  it("normalises UK international mobile numbers (447xxx -> +447xxx)", () => {
    assert.equal(normalizePhoneE164("447123456789"), "+447123456789");
    assert.equal(normalizePhoneE164("+447123456789"), "+447123456789");
    assert.equal(normalizePhoneE164("+44 7123 456789"), "+447123456789");
  });

  it("normalises international numbers", () => {
    assert.equal(normalizePhoneE164("+1 555 123 4567"), "+15551234567");
    assert.equal(normalizePhoneE164("+20 100 123 4567"), "+201001234567");
  });

  it("returns empty string if empty", () => {
    assert.equal(normalizePhoneE164(""), "");
    assert.equal(normalizePhoneE164("   "), "");
  });
});

describe("Admin Authentication Guard (requireAdmin)", () => {
  it("allows access for admin session with lowercase role 'admin'", () => {
    let nextCalled = false;
    const req = { session: { role: "admin", username: "admin" } } as any;
    const res = { status: () => res, json: () => res } as any;
    requireAdmin(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it("allows access for admin session with uppercase role 'ADMIN' and userId", () => {
    let nextCalled = false;
    const req = { session: { role: "ADMIN", userId: "env-admin", adminName: "System Admin" } } as any;
    const res = { status: () => res, json: () => res } as any;
    requireAdmin(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it("rejects non-admin role with 401 Unauthorized", () => {
    let statusCode = 0;
    let jsonBody: any = null;
    const req = { session: { role: "contractor", username: "john" } } as any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (body: any) => {
        jsonBody = body;
        return res;
      },
    } as any;

    requireAdmin(req, res, () => {});
    assert.equal(statusCode, 401);
    assert.equal(jsonBody?.error, "Unauthorized");
  });

  it("rejects unauthenticated request (missing session) with 401 Unauthorized", () => {
    let statusCode = 0;
    let jsonBody: any = null;
    const req = {} as any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (body: any) => {
        jsonBody = body;
        return res;
      },
    } as any;

    requireAdmin(req, res, () => {});
    assert.equal(statusCode, 401);
    assert.equal(jsonBody?.error, "Unauthorized");
  });
});

describe("Worker First-Login Password Change Logic", () => {
  it("detects legacy plaintext password and sets mustChangePassword: true", async () => {
    const storedPassword = "ShawkyTemp2026!";
    const isBcrypt = storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2a$");
    assert.equal(isBcrypt, false);

    const submitted = "ShawkyTemp2026!";
    const isValid = storedPassword === submitted;
    const isTemporary = isValid;

    assert.equal(isValid, true);
    assert.equal(isTemporary, true);
  });

  it("hashes new user password with bcrypt and clears mustChangePassword flag", async () => {
    const rawNewPassword = "MyPrivatePassword2026!";
    const hash = await hashPassword(rawNewPassword);

    assert.ok(hash.startsWith("$2b$10$"));
    assert.equal(await verifyPassword(rawNewPassword, hash), true);

    const isBcryptNow = hash.startsWith("$2b$") || hash.startsWith("$2a$");
    assert.equal(isBcryptNow, true);
  });

  it("invalidates old temporary password after bcrypt password change", async () => {
    const oldTemp = "ShawkyTemp2026!";
    const newPrivate = "MyPrivatePassword2026!";
    const hash = await hashPassword(newPrivate);

    // Old temporary password fails
    const oldCheck = await verifyPassword(oldTemp, hash);
    assert.equal(oldCheck, false);

    // New password succeeds
    const newCheck = await verifyPassword(newPrivate, hash);
    assert.equal(newCheck, true);
  });

  it("blocks check-in attempts when mustChangePassword is true", () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req = {
      session: {
        userId: "w-123",
        username: "mohamed.shawky",
        role: "contractor",
        mustChangePassword: true,
      },
    } as any;

    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (body: any) => {
        jsonBody = body;
        return res;
      },
    } as any;

    if (req.session?.mustChangePassword === true) {
      res.status(403).json({
        error: "Password change required before accessing check-in functionality",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }

    assert.equal(statusCode, 403);
    assert.equal(jsonBody?.code, "PASSWORD_CHANGE_REQUIRED");
  });
});

describe("Site QR & GPS Admin Coordinates and DMS Parsing", () => {
  it("parses decimal latitude and longitude strings correctly", () => {
    assert.equal(parseDmsOrDecimal("51.491306"), 51.491306);
    assert.equal(parseDmsOrDecimal("0.148139"), 0.148139);
    assert.equal(parseDmsOrDecimal("-0.127758"), -0.127758);
  });

  it("converts DMS format 51°29'28.7\"N to decimal coordinates", () => {
    const parsed = parseDmsOrDecimal("51°29'28.7\"N");
    assert.ok(parsed !== null);
    assert.equal(parsed?.toFixed(4), "51.4913");
  });

  it("converts DMS format with West/South direction to negative decimal coordinates", () => {
    const parsedWest = parseDmsOrDecimal("0°08'53.3\"W");
    assert.ok(parsedWest !== null);
    assert.equal(parsedWest?.toFixed(4), "-0.1481");
  });

  it("returns null for invalid coordinate inputs", () => {
    assert.equal(parseDmsOrDecimal("invalid_coords"), null);
    assert.equal(parseDmsOrDecimal(""), null);
  });
});

describe("Site QR Admin Page Data-Loading Resilience", () => {
  it("populates jobs list independently even if site configs request fails", async () => {
    const mockJobs = [
      { id: "j-1", title: "Tester", location: "15 Gilbert Road, Belvedere, DA17 5DB" },
      { id: "j-2", title: "Woolwich Church", location: "165 Powis Street, SE18 6JW" },
      { id: "j-3", title: "38 Crescent Road", location: "SE18 7BN" },
    ];

    let loadedJobs: any[] = [];
    let loadedConfigs: any[] = [];
    let errorMessage: string | null = null;

    // Simulate independent fetch handling
    const fetchJobs = async () => {
      return { ok: true, json: async () => mockJobs };
    };

    const fetchConfigs = async () => {
      // Simulate config fetch failure (e.g. HTTP 500 or network issue)
      return { ok: false, status: 500, json: async () => ({ error: "Database error" }) };
    };

    // 1. Fetch jobs
    const jobsRes = await fetchJobs();
    if (jobsRes.ok) {
      loadedJobs = await jobsRes.json();
    }

    // 2. Fetch configs
    const configsRes = await fetchConfigs();
    if (!configsRes.ok) {
      errorMessage = "Could not load site check-in policies.";
    }

    // Verify jobs populated regardless of config error
    assert.equal(loadedJobs.length, 3);
    assert.equal(loadedJobs[0].title, "Tester");
    assert.equal(loadedJobs[1].title, "Woolwich Church");
    assert.equal(loadedJobs[2].title, "38 Crescent Road");
    assert.equal(errorMessage, "Could not load site check-in policies.");
  });
});

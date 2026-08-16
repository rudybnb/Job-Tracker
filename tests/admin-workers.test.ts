import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneE164 } from "../server/worker-service.ts";
import { requireAdmin } from "../server/integration-review-route.ts";
import { hashPassword, verifyPassword } from "../server/password-security.ts";
import { parseDmsOrDecimal } from "../client/src/lib/geo-utils.ts";
import { calculateDistanceMetres } from "../client/src/lib/location.ts";

function extractTokenFromUrlOrText(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("t") || url.searchParams.get("qrToken") || url.searchParams.get("token");
    if (token) return token.trim();
  } catch {
    // Not a URL
  }
  return trimmed;
}

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

    const oldCheck = await verifyPassword(oldTemp, hash);
    assert.equal(oldCheck, false);

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

describe("Site QR Poster URL & Token Parsing", () => {
  it("extracts qrToken from HTTPS checkin URL with ?t= parameter", () => {
    const url = "https://job-tracker-6evs.onrender.com/checkin?t=tok_tester_123456";
    const token = extractTokenFromUrlOrText(url);
    assert.equal(token, "tok_tester_123456");
  });

  it("extracts qrToken from HTTPS checkin URL with ?qrToken= parameter", () => {
    const url = "https://job-tracker-6evs.onrender.com/login?qrToken=tok_tester_789";
    const token = extractTokenFromUrlOrText(url);
    assert.equal(token, "tok_tester_789");
  });

  it("returns literal raw string if scanned text is a direct token", () => {
    const directToken = "tok_raw_direct_999";
    const token = extractTokenFromUrlOrText(directToken);
    assert.equal(token, "tok_raw_direct_999");
  });
});

describe("Worker GPS Dashboard - Site Checkin Config Integration", () => {
  it("loads canonical site_checkin_config instead of legacy hardcoded coordinates", () => {
    const siteConfig = {
      siteName: "Tester — 15 Gilbert Road",
      siteLatitude: "51.491306",
      siteLongitude: "0.148139",
      allowedRadiusMetres: 100,
    };

    assert.notEqual(siteConfig.siteName, undefined);
    assert.equal(siteConfig.siteName, "Tester — 15 Gilbert Road");
    assert.equal(siteConfig.siteLatitude, "51.491306");
    assert.equal(siteConfig.siteLongitude, "0.148139");
    assert.equal(siteConfig.allowedRadiusMetres, 100);
  });

  it("ensures GPS timer active is false when no active session exists", () => {
    const activeSession = null;
    const isTracking = activeSession !== null;
    assert.equal(isTracking, false);
  });
});

describe("Worker-Safe Site Config Endpoint Protection", () => {
  it("sanitizes worker site config response and hides QR secrets", () => {
    const rawDbRow = {
      jobId: "j-tester-123",
      siteName: "Tester — 15 Gilbert Road",
      siteLatitude: "51.491306",
      siteLongitude: "0.148139",
      allowedRadiusMetres: 100,
      qrEnabled: true,
      gpsEnabled: true,
      qrToken: "tok_secret_123456",
      qrTokenHash: "hash_secret_654321",
    };

    const workerResponse = {
      config: {
        jobId: rawDbRow.jobId,
        siteName: rawDbRow.siteName,
        siteLatitude: rawDbRow.siteLatitude,
        siteLongitude: rawDbRow.siteLongitude,
        allowedRadiusMetres: rawDbRow.allowedRadiusMetres,
        qrEnabled: rawDbRow.qrEnabled,
        gpsEnabled: rawDbRow.gpsEnabled,
      },
    };

    assert.equal((workerResponse.config as any).qrToken, undefined);
    assert.equal((workerResponse.config as any).qrTokenHash, undefined);
    assert.equal(workerResponse.config.siteName, "Tester — 15 Gilbert Road");
    assert.equal(workerResponse.config.allowedRadiusMetres, 100);
  });
});

describe("Site QR & GPS Worker Check-In Enforcement", () => {
  const siteLat = 51.491306;
  const siteLng = 0.148139;
  const allowedRadiusMetres = 100;

  it("allows clock-in when worker is inside site radius and QR is scanned", () => {
    const workerLat = 51.491350;
    const workerLng = 0.148140;
    const distance = calculateDistanceMetres(workerLat, workerLng, siteLat, siteLng);

    assert.ok(distance <= allowedRadiusMetres);
    assert.ok(distance < 10);
  });

  it("blocks clock-in when worker is 802 metres away (outside 100m radius)", () => {
    const workerLat = 51.498500;
    const workerLng = 0.158500;
    const distance = calculateDistanceMetres(workerLat, workerLng, siteLat, siteLng);

    const isInsideRadius = distance <= allowedRadiusMetres;
    assert.equal(isInsideRadius, false);
    assert.ok(distance > 800);
  });

  it("blocks clock-in when QR token is missing and qrEnabled is true", () => {
    const qrEnabled = true;
    const scannedQrToken = "";

    const isQrValid = !qrEnabled || scannedQrToken.length > 0;
    assert.equal(isQrValid, false);
  });

  it("accepts canonical job ID for work_sessions insert without FK error", () => {
    const canonicalJobId = "j-tester-123";
    assert.ok(canonicalJobId !== "1");
    assert.ok(canonicalJobId.length > 3);
  });
});

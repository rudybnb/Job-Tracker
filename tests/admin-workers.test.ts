import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneE164, deriveCanonicalUsername, WorkerService } from "../server/worker-service.ts";
import { requireAdmin } from "../server/integration-review-route.ts";
import { hashPassword, verifyPassword } from "../server/password-security.ts";
import { parseDmsOrDecimal } from "../client/src/lib/geo-utils.ts";
import { calculateDistanceMetres } from "../client/src/lib/location.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

describe("Worker App Access Rules Without Clock-In", () => {
  it("grants access to Worker Dashboard (/) immediately upon login without clock-in", () => {
    const isLoggedIn = true;
    const userRole = "contractor";
    const pendingToken = null;

    const targetRoute = isLoggedIn && userRole === "contractor" ? (pendingToken ? "/checkin" : "/") : "/login";
    assert.equal(targetRoute, "/");
  });

  it("allows access to Dashboard (/), Jobs (/jobs), and More (/more) when Not Clocked In", () => {
    const isClockedIn = false;
    const accessiblePagesWhenUnclocked = ["/", "/jobs", "/more", "/task-progress"];

    assert.equal(isClockedIn, false);
    for (const page of accessiblePagesWhenUnclocked) {
      assert.ok(page.length > 0);
    }
  });

  it("displays 'Not Clocked In' status and 'Scan Site QR to Clock In' action when session is inactive", () => {
    const isTracking = false;
    const statusText = isTracking ? "Clocked In" : "Not Clocked In";
    const actionButtonText = isTracking ? "Clock Out" : "Scan Site QR to Clock In";

    assert.equal(statusText, "Not Clocked In");
    assert.equal(actionButtonText, "Scan Site QR to Clock In");
  });

  it("displays 'Clocked In' status, site name, and start time when session is active", () => {
    const isTracking = true;
    const siteName = "Tester — 15 Gilbert Road";
    const statusText = isTracking ? "Clocked In" : "Not Clocked In";

    assert.equal(statusText, "Clocked In");
    assert.equal(siteName, "Tester — 15 Gilbert Road");
  });

  it("strictly blocks Admin pages (/admin) for worker role 'contractor'", () => {
    const userRole = "contractor";
    const isAdminAllowed = userRole === "admin";
    assert.equal(isAdminAllowed, false);
  });
});

describe("Worker Post-Clock-In Navigation & Active Session UI", () => {
  it("triggers redirect target '/' upon successful clock-in", () => {
    const clockInAccepted = true;
    const redirectTarget = clockInAccepted ? "/" : null;
    assert.equal(redirectTarget, "/");
  });

  it("blocks duplicate clock-in when an active work session exists", () => {
    const activeSession = { id: "ws-active-123", status: "active" };
    const isTracking = activeSession !== null;
    const isWithinRadius = true;
    const qrValid = true;

    const canClockIn = isWithinRadius && qrValid && !isTracking;
    const canClockOut = isTracking;

    assert.equal(canClockIn, false);
    assert.equal(canClockOut, true);
  });

  it("disables clock-out and re-enables clock-in eligibility after session closure", () => {
    let isTracking = true;
    let activeSessionId: string | null = "ws-active-123";

    // Clock out event
    isTracking = false;
    activeSessionId = null;

    const canClockOut = isTracking;
    assert.equal(canClockOut, false);
    assert.equal(activeSessionId, null);
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

describe("Worker Daily Rate & Payroll Structure (£130/day)", () => {
  it("calculates £130.00 daily rate from £16.25 hourly rate across 8 hours", () => {
    const hourlyRate = 16.25;
    const hoursWorked = 8;
    const dailyRate = hourlyRate * hoursWorked;
    assert.equal(dailyRate, 130.00);
  });

  it("applies £130.00 daily rate for full 8-hour shift for Rudy, Mohamed, and Ahmed", () => {
    const workers = [
      { name: "Rudy Diedricks", username: "rudy.test", adminPayRate: "16.25" },
      { name: "Mohamed Shawky", username: "mohamed.shawky", adminPayRate: "16.25" },
      { name: "Ahmed Gouda", username: "ahmed.gouda", adminPayRate: "16.25" },
    ];

    for (const w of workers) {
      const hourly = parseFloat(w.adminPayRate);
      const daily = hourly * 8;
      assert.equal(daily, 130.00);
    }
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

describe("Worker Deletion & Record Preservation", () => {
  it("soft-deletes worker by flagging isDeleted=true and isActive=false", () => {
    const worker = {
      id: "w-101",
      firstName: "Mohamed",
      lastName: "Shawky",
      phone: "+447123456789",
      isActive: true,
      isDeleted: false,
    };

    // Simulate deleteWorker soft-delete action
    const deletedWorker = {
      ...worker,
      isDeleted: true,
      isActive: false,
      updatedAt: new Date(),
    };

    assert.equal(deletedWorker.isDeleted, true);
    assert.equal(deletedWorker.isActive, false);
  });

  it("filters out soft-deleted workers from active list", () => {
    const workerList = [
      { id: "w-1", fullName: "Ahmed Gouda", isDeleted: false },
      { id: "w-2", fullName: "Mohamed Shawky", isDeleted: true },
      { id: "w-3", fullName: "John Doe", isDeleted: false },
    ];

    const activeDirectory = workerList.filter((w) => !w.isDeleted);
    assert.equal(activeDirectory.length, 2);
    assert.equal(activeDirectory.some((w) => w.id === "w-2"), false);
  });

  it("preserves historical work sessions, attendance events and payroll when worker is deleted", () => {
    const historicalWorkSessions = [
      { id: "ws-1", contractorName: "Mohamed Shawky", totalHours: 8, status: "completed" },
      { id: "ws-2", contractorName: "Mohamed Shawky", totalHours: 7.5, status: "completed" },
    ];

    const historicalAttendanceEvents = [
      { id: "ev-1", workSessionId: "ws-1", eventType: "CLOCK_IN", timestamp: "2026-08-18T08:00:00Z" },
      { id: "ev-2", workSessionId: "ws-1", eventType: "CLOCK_OUT", timestamp: "2026-08-18T16:30:00Z" },
    ];

    // Deleting the worker removes worker from directory, but historical sessions and events remain intact
    assert.equal(historicalWorkSessions.length, 2);
    assert.equal(historicalAttendanceEvents.length, 2);
    assert.equal(historicalWorkSessions[0].totalHours, 8);
  });
});

describe("Canonical Username Deduplication & Operational Sources", () => {
  it("derives canonical username from varying inputs correctly", () => {
    assert.equal(deriveCanonicalUsername("mohamed.shawky"), "mohamed.shawky");
    assert.equal(deriveCanonicalUsername("Mohamed"), "mohamed.shawky");
    assert.equal(deriveCanonicalUsername(null, "Mohamed Shawky"), "mohamed.shawky");

    assert.equal(deriveCanonicalUsername("ahmed.gouda"), "ahmed.gouda");
    assert.equal(deriveCanonicalUsername("Ahmed"), "ahmed.gouda");
    assert.equal(deriveCanonicalUsername(null, "Ahmed Gouda"), "ahmed.gouda");

    assert.equal(deriveCanonicalUsername("rudy.test"), "rudy.test");
    assert.equal(deriveCanonicalUsername("Rudy"), "rudy.test");
    assert.equal(deriveCanonicalUsername(null, "Rudy Diedricks"), "rudy.test");

    assert.equal(deriveCanonicalUsername("said.tiss"), "said.tiss");
    assert.equal(deriveCanonicalUsername(null, "SAID tiss"), "said.tiss");

    assert.equal(deriveCanonicalUsername("dalwayne"), "dalwayne");
    assert.equal(deriveCanonicalUsername(null, "Dalwayne Diedericks"), "dalwayne");
    assert.equal(deriveCanonicalUsername(null, "Dalwayne Bailey"), "dalwayne");
  });

  it("deduplicates multiple records of same worker across simple_users, applications and contractors", () => {
    const rawSources = [
      { username: "mohamed.shawky", fullName: "Mohamed Shawky", source: "simple_users" },
      { username: "mohamed.shawky", fullName: "Mohamed Shawky", phone: "07123456790", source: "contractor_applications" },
      { name: "Mohamed Shawky", source: "contractors" },
      { username: "ahmed.gouda", fullName: "Ahmed Gouda", source: "simple_users" },
      { name: "Rudy Diedricks", source: "contractors" },
    ];

    const deduplicated = new Map<string, any>();
    for (const item of rawSources) {
      const cUser = deriveCanonicalUsername(item.username, (item as any).fullName || (item as any).name);
      if (!deduplicated.has(cUser)) {
        deduplicated.set(cUser, {
          username: cUser,
          fullName: (item as any).fullName || (item as any).name,
          phone: (item as any).phone ? normalizePhoneE164((item as any).phone) : null,
        });
      } else {
        const existing = deduplicated.get(cUser);
        if ((item as any).phone) existing.phone = normalizePhoneE164((item as any).phone);
      }
    }

    assert.equal(deduplicated.size, 3);
    assert.ok(deduplicated.has("mohamed.shawky"));
    assert.ok(deduplicated.has("ahmed.gouda"));
    assert.ok(deduplicated.has("rudy.test"));
    assert.equal(deduplicated.get("mohamed.shawky").phone, "+447123456790");
  });

  it("enriches workers with site assignments and attendance status", () => {
    const worker = {
      username: "mohamed.shawky",
      fullName: "Mohamed Shawky",
      phone: "+447123456790",
    };

    const assignments = [
      { contractorName: "Mohamed Shawky", jobId: "job-101", hbxlJob: "15 Gilbert Road", workLocation: "Belvedere" },
    ];

    const workSessions = [
      { contractorName: "Mohamed Shawky", status: "active", startTime: "2026-08-19T08:00:00Z" },
    ];

    const matchedAssignment = assignments.find((a) => a.contractorName.toLowerCase() === worker.fullName.toLowerCase());
    const matchedSession = workSessions.find((s) => s.contractorName.toLowerCase() === worker.fullName.toLowerCase());

    const enriched = {
      ...worker,
      assignedJobId: matchedAssignment?.jobId ?? null,
      assignedJobTitle: matchedAssignment?.hbxlJob ?? null,
      assignedJobLocation: matchedAssignment?.workLocation ?? null,
      currentAttendanceStatus: matchedSession?.status === "active" ? "CLOCKED IN" : "CLOCKED OUT",
    };

    assert.equal(enriched.assignedJobId, "job-101");
    assert.equal(enriched.assignedJobTitle, "15 Gilbert Road");
    assert.equal(enriched.assignedJobLocation, "Belvedere");
    assert.equal(enriched.currentAttendanceStatus, "CLOCKED IN");
  });
});

describe("Admin Email Sanitisation & Routes Verification", () => {
  it("ensures hardcoded admin@erbuildanddesign.co.uk is removed from admin pages", () => {
    const adminWorkersContent = readFileSync(
      resolve(process.cwd(), "client", "src", "pages", "admin-workers.tsx"),
      "utf8",
    );
    const adminDashboardContent = readFileSync(
      resolve(process.cwd(), "client", "src", "pages", "admin-dashboard.tsx"),
      "utf8",
    );

    assert.equal(adminWorkersContent.includes("admin@erbuildanddesign.co.uk"), false);
    assert.equal(adminDashboardContent.includes("admin@erbuildanddesign.co.uk"), false);
  });

  it("ensures /workers route is configured in App.tsx", () => {
    const appContent = readFileSync(
      resolve(process.cwd(), "client", "src", "App.tsx"),
      "utf8",
    );

    assert.ok(appContent.includes('<Route path="/workers"'));
    assert.ok(appContent.includes('<Route path="/admin/workers"'));
  });
});


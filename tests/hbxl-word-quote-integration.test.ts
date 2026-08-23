import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import multer from "multer";
import { parseHbxlWordQuote } from "../shared/hbxl-word-parser.ts";
import { createSpencerHouseDocxBuffer, createMaureenOrubebeDocxBuffer } from "./hbxl-word-quote-parser.test.ts";

// ============================================================
// REAL SPENCER HOUSE GOLDEN DATA (from Job 2 Spencer House - Quote(1).docx)
// ============================================================
const REAL_SPENCER = {
  projectSiteName: "Spencer House",
  clientName: "Promise Igbinedion",
  postcode: "CT7 9EZ",
  totalQuotePrice: 17350.46,
  formattedTotalPrice: "£17,350.46",
  addressMustInclude: ["Spencer House", "Birchington"],
  locationNames: ["Customised Build", "Dining Room", "Dinning Room", "House", "Living Room"],
  flaggedLocations: ["Customised Build", "Dining Room", "Dinning Room", "House"],
  confirmedLocations: ["Living Room"],
} as const;

// REAL MAUREEN ORUBEBE GOLDEN DATA
const REAL_MAUREEN = {
  projectSiteName: "2nd Floor",
  clientName: "Maureen Orubebe",
  postcode: "NW9 5YZ",
  totalQuotePrice: 38822.47,
  formattedTotalPrice: "£38,822.47",
  locationNames: [
    "2nd bathroom",
    "2nd floor bedroom 4",
    "2nd main bedroom",
    "2nd Passage",
    "Bathroom Wall",
    "Bathrooms",
    "Downstairs",
    "External Walls",
    "Floor",
    "Ground Floor",
    "House",
    "Internal Walls",
    "Upstairs",
  ],
  locationCount: 13,
  categoryCount: 21,
  taskCount: 47,
} as const;

// Invented values that must NEVER appear in any output
const INVENTED_BANNED = {
  prices: [45250],
  postcodes: ["SG1 1EH"],
  addressFragments: ["10 High Street", "Stevenage"],
  tasks: [
    "Oak veneer internal door",
    "Stainless steel handles and hinges",
    "Lintel installation",
    "Steel beam installation",
    "Padstones 440 x 140 x 100mm",
    "Temporary propping and demolition",
    "Masonry opening alterations",
    "Luxury vinyl tiles",
    "Underlay and acoustic matting",
    "Preparation and filling",
    "Emulsion paint to walls and ceiling in Living Room",
    "Undercoat and gloss to skirting in Living Room",
    "Material",
    "Labour",
    "Plant",
    "Other",
    "Total",
    "Description",
    "Resources to include:",
    "Acceptance of Estimate",
    "Terms and Conditions",
  ],
};

// ============================================================
// Test infrastructure
// ============================================================

interface MockClient {
  id: string;
  name: string;
  address?: string | null;
}

interface MockJob {
  id: string;
  title: string;
  clientName?: string | null;
  clientId?: string | null;
  location: string;
  address?: string | null;
  postcode?: string | null;
  quotedAmount?: string | null;
  status: string;
  dueDate: string;
  uploadId?: string | null;
}

interface MockLocation {
  id: string;
  jobId: string;
  name: string;
  normalizedName?: string | null;
  source: string;
  reviewStatus: string;
  reviewReason?: string | null;
}

interface MockTask {
  id: string;
  jobId: string;
  locationId: string;
  workCategory: string;
  taskName: string;
  status: string;
  assignedContractorId?: string | null;
  assignedContractorName?: string | null;
}

interface MockContractor {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface MockAssignment {
  id: string;
  jobId: string;
  contractorName: string;
  locationId?: string | null;
  locationName?: string | null;
  locationTaskId?: string | null;
  workCategory?: string | null;
  taskName?: string | null;
  buildPhases: string[];
  quotedAmountAtAssignment: string | null;
}

class MockWordQuoteStorage {
  clients: MockClient[] = [];
  jobs: MockJob[] = [];
  locations: MockLocation[] = [];
  tasks: MockTask[] = [];
  contractors: MockContractor[] = [];
  assignments: MockAssignment[] = [];
  uploads: Array<{ id: string; filename: string; status: string }> = [];
}

interface TestServerContext {
  readonly storage: MockWordQuoteStorage;
  postWordQuote(params: { buffer: Buffer; filename: string; preview?: boolean; metadataOverrides?: Record<string, string> }): Promise<{ status: number; body: Record<string, unknown> }>;
  getLocations(jobId: string): Promise<{ status: number; body: MockLocation[] }>;
  patchLocation(jobId: string, locationId: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>;
  getTasks(jobId: string, locationId?: string): Promise<{ status: number; body: MockTask[] }>;
  assignWorkerTask(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>;
}

async function withWordQuoteServer(run: (context: TestServerContext) => Promise<void>): Promise<void> {
  const storage = new MockWordQuoteStorage();
  const app = express();
  app.use(express.json());
  const upload = multer({ storage: multer.memoryStorage() });

  // Default test contractor
  storage.contractors.push({ id: "c-ahmed", name: "Ahmed Gouda", email: "ahmed@test.com", phone: "07123456789" });

  // POST /api/upload-word-quote
  app.post("/api/upload-word-quote", upload.single("quoteFile"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const parsed = await parseHbxlWordQuote(req.file.buffer, req.file.originalname);
    if (!parsed.valid || parsed.locations.length === 0) {
      return res.status(400).json({ error: "Invalid document" });
    }

    const clientNameToMatch = (req.body.clientName || parsed.metadata.clientName || "").trim();
    let clientMatch: { status: string; clientId?: string; clientName: string; isNew: boolean; message: string };

    if (clientNameToMatch) {
      const existing = storage.clients.find(c => c.name.trim().toLowerCase() === clientNameToMatch.toLowerCase());
      if (existing) {
        clientMatch = { status: "MATCHED_EXISTING", clientId: existing.id, clientName: existing.name, isNew: false, message: `Matches existing client: "${existing.name}"` };
      } else {
        clientMatch = { status: "CREATE_NEW", clientName: clientNameToMatch, isNew: true, message: `Will create new client: "${clientNameToMatch}"` };
      }
    } else {
      clientMatch = { status: "MISSING", clientName: "", isNew: false, message: "Client name not found in Word quote" };
    }

    if (req.query.preview === "true" || req.body.preview === "true") {
      return res.json({
        success: true,
        preview: true,
        metadata: {
          ...parsed.metadata,
          clientMatch,
        },
        locations: parsed.locations,
        stats: parsed.stats,
      });
    }

    // Import mode — metadata overrides or parsed
    const finalClientName = (req.body.clientName !== undefined ? req.body.clientName : parsed.metadata.clientName || "").trim();
    const finalProjectSiteName = (req.body.projectSiteName !== undefined ? req.body.projectSiteName : parsed.metadata.projectSiteName || "").trim();
    const finalAddress = (req.body.address !== undefined ? req.body.address : parsed.metadata.address || "").trim();
    const finalPostcode = (req.body.postcode !== undefined ? req.body.postcode : parsed.metadata.postcode || "").trim();
    const finalQuotedAmount = req.body.quotedAmount || parsed.metadata.formattedTotalPrice || null;

    let clientId: string | null = null;
    let clientCreated = false;

    if (finalClientName) {
      const existing = storage.clients.find(c => c.name.trim().toLowerCase() === finalClientName.toLowerCase());
      if (existing) {
        clientId = existing.id;
      } else {
        const newClient: MockClient = { id: `client-${Date.now()}`, name: finalClientName, address: finalAddress || null };
        storage.clients.push(newClient);
        clientId = newClient.id;
        clientCreated = true;
      }
    }

    const uploadRecord = { id: `upload-${Date.now()}`, filename: req.file.originalname, status: "processed" };
    storage.uploads.push(uploadRecord);

    const jobRecord: MockJob = {
      id: `job-${Date.now()}`,
      title: finalProjectSiteName || req.file.originalname.replace(/\.docx$/i, ""),
      clientName: finalClientName || null,
      clientId: clientId,
      location: finalAddress || finalProjectSiteName || "TBD",
      address: finalAddress || null,
      postcode: finalPostcode || null,
      quotedAmount: finalQuotedAmount,
      status: "pending",
      dueDate: "2026-10-31",
      uploadId: uploadRecord.id,
    };
    storage.jobs.push(jobRecord);

    let taskSeq = 0;
    for (let i = 0; i < parsed.locations.length; i++) {
      const loc = parsed.locations[i];
      const locationRecord: MockLocation = {
        id: `loc-${i + 1}`,
        jobId: jobRecord.id,
        name: loc.name,
        normalizedName: loc.normalizedName,
        source: "HBXL_WORD",
        reviewStatus: loc.reviewStatus,
        reviewReason: loc.reviewReason,
      };
      storage.locations.push(locationRecord);

      for (const cat of loc.categories) {
        for (const task of cat.tasks) {
          taskSeq++;
          storage.tasks.push({
            id: `task-${taskSeq}`,
            jobId: jobRecord.id,
            locationId: locationRecord.id,
            workCategory: cat.name,
            taskName: task.name,
            status: "pending",
          });
        }
      }
    }

    res.json({
      success: true,
      job: jobRecord,
      clientId,
      clientCreated,
      locations: storage.locations,
      tasksCount: taskSeq,
    });
  });

  // GET /api/jobs/:jobId/locations
  app.get("/api/jobs/:jobId/locations", async (req, res) => {
    res.json(storage.locations.filter((l) => l.jobId === req.params.jobId));
  });

  // PATCH /api/jobs/:jobId/locations/:locationId
  app.patch("/api/jobs/:jobId/locations/:locationId", async (req, res) => {
    const loc = storage.locations.find((l) => l.id === req.params.locationId);
    if (!loc) return res.status(404).json({ error: "Not found" });
    Object.assign(loc, req.body);
    res.json(loc);
  });

  // GET /api/jobs/:jobId/location-tasks
  app.get("/api/jobs/:jobId/location-tasks", async (req, res) => {
    const { locationId } = req.query;
    let tasks = storage.tasks.filter((t) => t.jobId === req.params.jobId);
    if (locationId) tasks = tasks.filter((t) => t.locationId === locationId);
    res.json(tasks);
  });

  // POST /api/assign-worker-task
  app.post("/api/assign-worker-task", async (req, res) => {
    const { jobId, locationId, taskId, contractorId } = req.body;
    if (!jobId || !locationId || !taskId || !contractorId) return res.status(400).json({ error: "Missing fields" });

    const job = storage.jobs.find((j) => j.id === jobId);
    const location = storage.locations.find((l) => l.id === locationId);
    const task = storage.tasks.find((t) => t.id === taskId);
    const contractor = storage.contractors.find((c) => c.id === contractorId);

    if (!job || !location || !task || !contractor) return res.status(404).json({ error: "Not found" });

    const quotedAmountBeforeAssignment = job.quotedAmount;

    const assignment: MockAssignment = {
      id: `assign-${Date.now()}`,
      jobId: job.id,
      contractorName: contractor.name,
      locationId: location.id,
      locationName: location.name,
      locationTaskId: task.id,
      workCategory: task.workCategory,
      taskName: task.taskName,
      buildPhases: [],
      quotedAmountAtAssignment: job.quotedAmount,
    };
    storage.assignments.push(assignment);

    task.status = "assigned";
    task.assignedContractorId = contractor.id;
    task.assignedContractorName = contractor.name;

    assert.equal(job.quotedAmount, quotedAmountBeforeAssignment, "COMMERCIAL SAFETY: quotedAmount must not change on assignment");

    res.json({ success: true, assignment, task, jobTitle: job.title, locationName: location.name, taskName: task.taskName, contractorName: contractor.name });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const addr = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    await run({
      storage,
      async postWordQuote({ buffer, filename, preview, metadataOverrides }) {
        const fd = new FormData();
        fd.append("quoteFile", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), filename);
        if (preview) fd.append("preview", "true");
        if (metadataOverrides) {
          for (const [k, v] of Object.entries(metadataOverrides)) {
            fd.append(k, v);
          }
        }
        const url = preview ? `${base}/api/upload-word-quote?preview=true` : `${base}/api/upload-word-quote`;
        const res = await fetch(url, { method: "POST", body: fd });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      },
      async getLocations(jobId) {
        const res = await fetch(`${base}/api/jobs/${jobId}/locations`);
        return { status: res.status, body: (await res.json()) as MockLocation[] };
      },
      async patchLocation(jobId, locationId, body) {
        const res = await fetch(`${base}/api/jobs/${jobId}/locations/${locationId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      },
      async getTasks(jobId, locationId?) {
        const url = locationId ? `${base}/api/jobs/${jobId}/location-tasks?locationId=${locationId}` : `${base}/api/jobs/${jobId}/location-tasks`;
        const res = await fetch(url);
        return { status: res.status, body: (await res.json()) as MockTask[] };
      },
      async assignWorkerTask(body) {
        const res = await fetch(`${base}/api/assign-worker-task`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      },
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

// ============================================================
// Test 1 — Maureen Orubebe 2nd Floor Quote: Preview & Full Import
// ============================================================
test("Maureen Orubebe 2nd Floor Quote: clean preview & import with client auto-fill and dynamic client creation", async () => {
  await withWordQuoteServer(async ({ postWordQuote, storage, getTasks, assignWorkerTask }) => {
    const buf = await createMaureenOrubebeDocxBuffer();

    // 1. Preview mode — extracts all metadata and indicates new client creation
    const previewRes = await postWordQuote({ buffer: buf, filename: "Maureen Orubebe 2nd Floor Quote.docx", preview: true });
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.body.preview, true);
    assert.equal(storage.jobs.length, 0, "Preview must not create jobs");
    assert.equal(storage.locations.length, 0, "Preview must not create locations");

    const meta = previewRes.body.metadata as Record<string, any>;
    assert.equal(meta.clientName, REAL_MAUREEN.clientName, "Client name must be Maureen Orubebe");
    assert.equal(meta.projectSiteName, REAL_MAUREEN.projectSiteName, "Site name must be 2nd Floor");
    assert.ok(meta.address.includes("3 Lingard Avenue"), "Address must include 3 Lingard Avenue");
    assert.equal(meta.postcode, REAL_MAUREEN.postcode, "Postcode must be NW9 5YZ");
    assert.equal(meta.totalExclVat, 38822.47, "Net total must be £38,822.47");
    assert.equal(meta.vatAmount, 7764.49, "VAT must be £7,764.49");
    assert.equal(meta.totalIncVat, 46586.96, "Gross total must be £46,586.96");
    assert.equal(meta.clientMatch.status, "CREATE_NEW", "Must indicate new client will be created");

    // 2. Full import — creates job, creates client Maureen Orubebe, and links them
    const importRes = await postWordQuote({ buffer: buf, filename: "Maureen Orubebe 2nd Floor Quote.docx", preview: false });
    assert.equal(importRes.status, 200);
    assert.equal(importRes.body.success, true);
    assert.equal(importRes.body.clientCreated, true, "Must have created client record");

    // Assert client in storage
    assert.equal(storage.clients.length, 1, "Must have created 1 client");
    assert.equal(storage.clients[0].name, "Maureen Orubebe");
    assert.equal(storage.jobs[0].clientId, storage.clients[0].id, "Job must link to created client");
    assert.equal(storage.jobs[0].clientName, "Maureen Orubebe");
    assert.equal(storage.jobs[0].title, "2nd Floor");

    // Assert exact 13 locations and 47 tasks
    assert.equal(storage.locations.length, REAL_MAUREEN.locationCount, "Must have exactly 13 locations");
    assert.deepEqual(
      storage.locations.map(l => l.name),
      REAL_MAUREEN.locationNames as unknown as string[]
    );
    assert.equal(storage.tasks.length, REAL_MAUREEN.taskCount, "Must have exactly 47 tasks");

    // Check no table header or currency is stored as task
    for (const t of storage.tasks) {
      for (const banned of ["Material", "Labour", "Plant", "Other", "Total", "Description", "Resources to include:"]) {
        assert.notEqual(t.taskName, banned);
      }
      assert.ok(!t.taskName.includes("£"), "Task must not be a price line");
    }

    // 3. Worker assignment to 2nd bathroom -> Replace Existing Floorboards task
    const bathLoc = storage.locations.find(l => l.name === "2nd bathroom")!;
    const bathTasks = await getTasks(storage.jobs[0].id, bathLoc.id);
    assert.equal(bathTasks.body.length, 3);

    const floorboardTask = bathTasks.body.find(t => t.taskName === "Remove 3.13m² of floorboards")!;
    assert.ok(floorboardTask);

    const assignRes = await assignWorkerTask({
      jobId: storage.jobs[0].id,
      locationId: bathLoc.id,
      taskId: floorboardTask.id,
      contractorId: "c-ahmed",
    });
    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.body.locationName, "2nd bathroom");
    assert.equal(assignRes.body.taskName, "Remove 3.13m² of floorboards");
    assert.equal(assignRes.body.contractorName, "Ahmed Gouda");
  });
});

// ============================================================
// Test 2 — Spencer House Quote: Preview Mode & Existing Client Linking
// ============================================================
test("Spencer House — Preview mode extracts real quote details and links existing client", async () => {
  await withWordQuoteServer(async ({ postWordQuote, storage }) => {
    // Pre-create existing client in Job Tracker
    storage.clients.push({ id: "client-promise-1", name: "Promise Igbinedion", address: "Spencer House" });

    const buf = await createSpencerHouseDocxBuffer();
    const res = await postWordQuote({ buffer: buf, filename: "Job 2 Spencer House - Quote(1).docx", preview: true });

    assert.equal(res.status, 200, "Preview must return 200");
    assert.equal(res.body.preview, true);

    const meta = res.body.metadata as Record<string, any>;
    assert.equal(meta.clientName, REAL_SPENCER.clientName, `Client must be ${REAL_SPENCER.clientName}`);
    assert.equal(meta.projectSiteName, REAL_SPENCER.projectSiteName);
    assert.equal(meta.postcode, REAL_SPENCER.postcode, `Postcode must be ${REAL_SPENCER.postcode}`);
    assert.equal(meta.totalExclVat, REAL_SPENCER.totalQuotePrice);
    assert.equal(meta.formattedTotalExclVat, REAL_SPENCER.formattedTotalPrice);
    assert.notEqual(meta.totalQuotePrice, INVENTED_BANNED.prices[0], "Must not use invented £45,250");

    // Client match assertion
    assert.equal(meta.clientMatch.status, "MATCHED_EXISTING", "Must match existing client");
    assert.equal(meta.clientMatch.clientId, "client-promise-1", "Must link to client-promise-1");
    assert.equal(meta.clientMatch.isNew, false);

    assert.equal(storage.jobs.length, 0, "Preview must not create any jobs");
    assert.equal(storage.locations.length, 0, "Preview must not create any locations");
    assert.equal(storage.tasks.length, 0, "Preview must not create any tasks");
  });
});

// ============================================================
// Test 3 — Spencer House Quote: Full import, reviews, assignments, safety
// ============================================================
test("Spencer House — Full import: real data, review flags, worker assignment, commercial safety", async () => {
  await withWordQuoteServer(async ({ postWordQuote, storage, getLocations, patchLocation, getTasks, assignWorkerTask }) => {
    // Pre-populate existing client
    storage.clients.push({ id: "client-promise-1", name: "Promise Igbinedion", address: "Spencer House" });

    const buf = await createSpencerHouseDocxBuffer();
    const res = await postWordQuote({ buffer: buf, filename: "Job 2 Spencer House - Quote(1).docx", preview: false });

    assert.equal(res.status, 200, "Import must return 200");
    assert.equal(res.body.success, true);
    assert.equal(res.body.clientCreated, false, "Must NOT create duplicate client record");
    assert.equal(storage.clients.length, 1, "Must retain exactly 1 client");

    const job = res.body.job as MockJob;
    assert.equal(job.clientId, "client-promise-1", "Job must link to existing client-promise-1");
    assert.equal(job.clientName, "Promise Igbinedion");

    assert.equal(job.title, REAL_SPENCER.projectSiteName);
    assert.equal(job.clientName, REAL_SPENCER.clientName);
    assert.equal(job.postcode, REAL_SPENCER.postcode, `Postcode must be ${REAL_SPENCER.postcode}`);
    assert.notEqual(job.postcode, "SG1 1EH", "Must not store invented SG1 1EH postcode");
    if (job.address) {
      for (const banned of INVENTED_BANNED.addressFragments) {
        assert.ok(!job.address.includes(banned), `Address must not contain invented fragment: "${banned}"`);
      }
    }

    assert.equal(job.quotedAmount, REAL_SPENCER.formattedTotalPrice, `Quote must be ${REAL_SPENCER.formattedTotalPrice}`);
    assert.notEqual(job.quotedAmount, "£45,250.00", "Must not store invented £45,250.00");

    assert.equal(storage.locations.length, 5, "Must have exactly 5 locations");
    const locationNames = storage.locations.map((l) => l.name);
    assert.deepEqual(locationNames, REAL_SPENCER.locationNames as unknown as string[], "Locations must match real document order");

    for (const task of storage.tasks) {
      for (const banned of INVENTED_BANNED.tasks) {
        assert.notEqual(task.taskName, banned, `Invented task "${banned}" must not appear`);
      }
    }

    const allTaskNames = storage.tasks.map((t) => t.taskName);
    assert.ok(allTaskNames.includes("Internal Door 6 Panel Smooth 838 x 1981mm"), "Real door spec must be preserved");
    assert.ok(allTaskNames.includes("Universal Beam 178 x 102 x 19kg per m"), "Real beam spec for Customised Build must be preserved");
    assert.ok(allTaskNames.includes("Universal Beam 203 x 133 x 25kg per m"), "Real beam spec for Dinning Room must be preserved");
    assert.ok(allTaskNames.includes("2nd layer levelling compound"), "Real 'Dining Room' specific wording must be preserved");
    assert.ok(allTaskNames.includes("vinyl adhesive"), "Real wording 'vinyl adhesive' must be preserved");
    assert.ok(allTaskNames.includes("Lintel Number 1 RSJ 178 x 102 x 19kg per m"), "Real lintel spec 1 must be preserved");
    assert.ok(allTaskNames.includes("Lintel Number 2 RSJ 178 x 102 x 19kg per m"), "Real lintel spec 2 must be preserved");
    assert.ok(allTaskNames.includes("associated padstones/making good"), "Real 'associated padstones/making good' must be preserved");
    assert.ok(allTaskNames.includes("walls/plaster"), "Real 'walls/plaster' for Dinning Room must be preserved");
    assert.ok(allTaskNames.includes("architraves/casings"), "Real 'architraves/casings' must be preserved");
    assert.ok(allTaskNames.includes("skirtings"), "Real 'skirtings' must be preserved");

    // Review status assertions
    for (const flaggedName of REAL_SPENCER.flaggedLocations) {
      const loc = storage.locations.find((l) => l.name === flaggedName)!;
      assert.ok(loc, `Location "${flaggedName}" must exist`);
      assert.equal(loc.reviewStatus, "REVIEW_REQUIRED", `"${flaggedName}" must be REVIEW_REQUIRED`);
    }

    const livingLoc = storage.locations.find((l) => l.name === "Living Room")!;
    assert.equal(livingLoc.reviewStatus, "CONFIRMED", "Living Room must be CONFIRMED");

    // Worker allocation
    const diningLoc = storage.locations.find((l) => l.name === "Dining Room")!;
    const diningTasks = await getTasks(job.id, diningLoc.id);
    const vinylTask = diningTasks.body.find((t) => t.taskName === "Vinyl flooring")!;
    assert.ok(vinylTask);

    const assignRes = await assignWorkerTask({
      jobId: job.id,
      locationId: diningLoc.id,
      taskId: vinylTask.id,
      contractorId: "c-ahmed",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
    });
    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.body.success, true);
    assert.equal(assignRes.body.locationName, "Dining Room");
    assert.equal(assignRes.body.taskName, "Vinyl flooring");
    assert.equal(assignRes.body.contractorName, "Ahmed Gouda");

    const savedAssignment = storage.assignments[0];
    assert.equal(savedAssignment.locationId, diningLoc.id);
    assert.equal(savedAssignment.locationName, "Dining Room");
    assert.equal(savedAssignment.locationTaskId, vinylTask.id);
    assert.deepEqual(savedAssignment.buildPhases, [], "Build phases MUST be empty — not used for worker assignment");

    // Commercial safety
    const storedJob = storage.jobs.find((j) => j.id === job.id)!;
    assert.equal(storedJob.quotedAmount, REAL_SPENCER.formattedTotalPrice, "quotedAmount must remain unchanged after assignment");

    // Location rename review
    const dinningLoc = storage.locations.find((l) => l.name === "Dinning Room")!;
    await patchLocation(job.id, dinningLoc.id, {
      name: "Dining Room Extension",
      reviewStatus: "CONFIRMED",
    });
    assert.equal(storedJob.quotedAmount, REAL_SPENCER.formattedTotalPrice, "quotedAmount must remain unchanged after location rename");
  });
});

// ============================================================
// Test 4 — Admin Preview Correction & Metadata Override
// ============================================================
test("Admin preview correction: custom client & job metadata overrides parsed defaults on import", async () => {
  await withWordQuoteServer(async ({ postWordQuote, storage }) => {
    const buf = await createMaureenOrubebeDocxBuffer();

    // Admin corrects client name and site name before approving import
    const res = await postWordQuote({
      buffer: buf,
      filename: "Maureen Orubebe 2nd Floor Quote.docx",
      preview: false,
      metadataOverrides: {
        clientName: "Maureen Orubebe (Commercial Account)",
        projectSiteName: "2nd Floor Apartment Renovation",
        address: "3 Lingard Avenue, Flat 2B, London",
        postcode: "NW9 5YZ",
        projectType: "Full Refurbishment",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(storage.jobs.length, 1);

    const job = storage.jobs[0];
    assert.equal(job.clientName, "Maureen Orubebe (Commercial Account)", "Must use admin-corrected client name");
    assert.equal(job.title, "2nd Floor Apartment Renovation", "Must use admin-corrected job title");
    assert.equal(job.address, "3 Lingard Avenue, Flat 2B, London", "Must use admin-corrected address");
    assert.equal(storage.clients.length, 1);
    assert.equal(storage.clients[0].name, "Maureen Orubebe (Commercial Account)");
    assert.equal(job.clientId, storage.clients[0].id);
  });
});


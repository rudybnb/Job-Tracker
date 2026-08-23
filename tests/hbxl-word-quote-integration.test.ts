import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import multer from "multer";
import { parseHbxlWordQuote } from "../shared/hbxl-word-parser.ts";
import { createSpencerHouseDocxBuffer } from "./hbxl-word-quote-parser.test.ts";

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
  // Documents order of location headings
  locationNames: ["Customised Build", "Dining Room", "Dinning Room", "House", "Living Room"],
  // REVIEW_REQUIRED locations
  flaggedLocations: ["Customised Build", "Dining Room", "Dinning Room", "House"],
  // CONFIRMED locations
  confirmedLocations: ["Living Room"],
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
    "Emulsion paint to walls and ceiling",
    "Undercoat and gloss to skirting",
  ],
};

// ============================================================
// Test infrastructure
// ============================================================

interface MockJob {
  id: string;
  title: string;
  clientName?: string | null;
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
  quotedAmountAtAssignment: string | null; // Must remain unchanged
}

class MockWordQuoteStorage {
  jobs: MockJob[] = [];
  locations: MockLocation[] = [];
  tasks: MockTask[] = [];
  contractors: MockContractor[] = [];
  assignments: MockAssignment[] = [];
  uploads: Array<{ id: string; filename: string; status: string }> = [];
}

interface TestServerContext {
  readonly storage: MockWordQuoteStorage;
  postWordQuote(params: { buffer: Buffer; filename: string; preview?: boolean }): Promise<{ status: number; body: Record<string, unknown> }>;
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

    if (req.query.preview === "true" || req.body.preview === "true") {
      return res.json({ success: true, preview: true, metadata: parsed.metadata, locations: parsed.locations, stats: parsed.stats });
    }

    const uploadRecord = { id: `upload-${Date.now()}`, filename: req.file.originalname, status: "processed" };
    storage.uploads.push(uploadRecord);

    const jobRecord: MockJob = {
      id: `job-${Date.now()}`,
      title: parsed.metadata.projectSiteName,
      clientName: parsed.metadata.clientName,
      location: parsed.metadata.address,
      address: parsed.metadata.address,
      postcode: parsed.metadata.postcode,
      quotedAmount: parsed.metadata.formattedTotalPrice || null,
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

    res.json({ success: true, job: jobRecord, locations: storage.locations, tasksCount: taskSeq });
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
      buildPhases: [], // NOT used for worker assignment
      quotedAmountAtAssignment: job.quotedAmount,
    };
    storage.assignments.push(assignment);

    task.status = "assigned";
    task.assignedContractorId = contractor.id;
    task.assignedContractorName = contractor.name;

    // CRITICAL: job.quotedAmount must remain completely unchanged after assignment
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
      async postWordQuote({ buffer, filename, preview }) {
        const fd = new FormData();
        fd.append("quoteFile", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), filename);
        if (preview) fd.append("preview", "true");
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
// Test 1 — Preview mode: no DB records created, real metadata returned
// ============================================================
test("PHASE 1 — Preview mode returns REAL Spencer House structure without committing records", async () => {
  await withWordQuoteServer(async ({ postWordQuote, storage }) => {
    const buf = await createSpencerHouseDocxBuffer();
    const res = await postWordQuote({ buffer: buf, filename: "Job 2 Spencer House - Quote(1).docx", preview: true });

    assert.equal(res.status, 200, "Preview must return 200");
    assert.equal(res.body.preview, true);

    const meta = res.body.metadata as Record<string, unknown>;

    // ASSERTION 1: Real address from document
    assert.equal(meta.projectSiteName, REAL_SPENCER.projectSiteName);
    assert.equal(meta.postcode, REAL_SPENCER.postcode, `Postcode must be ${REAL_SPENCER.postcode}`);

    // ASSERTION 2: Real quote total (not invented)
    assert.equal(meta.totalQuotePrice, REAL_SPENCER.totalQuotePrice);
    assert.equal(meta.formattedTotalPrice, REAL_SPENCER.formattedTotalPrice);
    assert.notEqual(meta.totalQuotePrice, INVENTED_BANNED.prices[0], "Must not use invented £45,250");

    // Nothing committed
    assert.equal(storage.jobs.length, 0, "Preview must not create any jobs");
    assert.equal(storage.locations.length, 0, "Preview must not create any locations");
    assert.equal(storage.tasks.length, 0, "Preview must not create any tasks");
  });
});

// ============================================================
// Test 2 — Full import: real data, all phases, commercial safety
// ============================================================
test("PHASES 1-5 — Full import: real Spencer House data, review flags, worker assignment, commercial safety", async () => {
  await withWordQuoteServer(async ({ postWordQuote, storage, getLocations, patchLocation, getTasks, assignWorkerTask }) => {
    const buf = await createSpencerHouseDocxBuffer();
    const res = await postWordQuote({ buffer: buf, filename: "Job 2 Spencer House - Quote(1).docx", preview: false });

    assert.equal(res.status, 200, "Import must return 200");
    assert.equal(res.body.success, true);

    const job = res.body.job as MockJob;

    // ASSERTION 1: Real project metadata stored — not invented
    assert.equal(job.title, REAL_SPENCER.projectSiteName);
    assert.equal(job.clientName, REAL_SPENCER.clientName);
    assert.equal(job.postcode, REAL_SPENCER.postcode, `Postcode must be ${REAL_SPENCER.postcode}`);
    assert.notEqual(job.postcode, "SG1 1EH", "Must not store invented SG1 1EH postcode");
    if (job.address) {
      for (const banned of INVENTED_BANNED.addressFragments) {
        assert.ok(!job.address.includes(banned), `Address must not contain invented fragment: "${banned}"`);
      }
    }

    // ASSERTION 2: Quote total = real amount only (not invented)
    assert.equal(job.quotedAmount, REAL_SPENCER.formattedTotalPrice, `Quote must be ${REAL_SPENCER.formattedTotalPrice}`);
    assert.notEqual(job.quotedAmount, "£45,250.00", "Must not store invented £45,250.00");

    // ASSERTION 3: Exact locations extracted in document order
    assert.equal(storage.locations.length, 5, "Must have exactly 5 locations");
    const locationNames = storage.locations.map((l) => l.name);
    assert.deepEqual(locationNames, REAL_SPENCER.locationNames as unknown as string[], "Locations must match real document order");

    // ASSERTION 4: No invented tasks in any location
    for (const task of storage.tasks) {
      for (const banned of INVENTED_BANNED.tasks) {
        assert.notEqual(task.taskName, banned, `Invented task "${banned}" must not appear`);
      }
    }

    // ASSERTION 5: Source wording preserved — check key real tasks exist
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
    // Living Room Room Decoration has ONLY 'ceiling' — no more
    const livingRoomDecorTasks = storage.tasks.filter((t) => {
      const loc = storage.locations.find((l) => l.id === t.locationId);
      return loc?.name === "Living Room" && t.workCategory === "Room Decoration";
    });
    assert.deepEqual(livingRoomDecorTasks.map((t) => t.taskName), ["ceiling"], "Living Room → Room Decoration must have only 'ceiling'");

    // ASSERTION 6: Generic/ambiguous locations flagged REVIEW_REQUIRED
    for (const flaggedName of REAL_SPENCER.flaggedLocations) {
      const loc = storage.locations.find((l) => l.name === flaggedName)!;
      assert.ok(loc, `Location "${flaggedName}" must exist`);
      assert.equal(loc.reviewStatus, "REVIEW_REQUIRED", `"${flaggedName}" must be REVIEW_REQUIRED`);
    }
    // Living Room confirmed
    const livingLoc = storage.locations.find((l) => l.name === "Living Room")!;
    assert.equal(livingLoc.reviewStatus, "CONFIRMED", "Living Room must be CONFIRMED");

    // Dining Room and Dinning Room: separate and both flagged (NOT merged)
    const diningLoc = storage.locations.find((l) => l.name === "Dining Room")!;
    const dinningLoc = storage.locations.find((l) => l.name === "Dinning Room")!;
    assert.ok(diningLoc && dinningLoc, "Both Dining Room AND Dinning Room must exist separately");
    assert.equal(diningLoc.reviewStatus, "REVIEW_REQUIRED", "Dining Room must be REVIEW_REQUIRED (spelling variant)");
    assert.equal(dinningLoc.reviewStatus, "REVIEW_REQUIRED", "Dinning Room must be REVIEW_REQUIRED (spelling variant)");

    // ASSERTION 7: Worker allocation — Job → Location → Work Item → Worker
    const diningTasks = await getTasks(job.id, diningLoc.id);
    assert.ok(diningTasks.body.length > 0, "Dining Room must have tasks for allocation");

    // Find the specific Vinyl flooring task
    const vinylTask = diningTasks.body.find((t) => t.taskName === "Vinyl flooring")!;
    assert.ok(vinylTask, "Must find 'Vinyl flooring' task in Dining Room");
    assert.equal(vinylTask.workCategory, "Vinyl Flooring");

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

    // Assignment must reference Location & Task — NOT build phases
    const savedAssignment = storage.assignments[0];
    assert.equal(savedAssignment.locationId, diningLoc.id);
    assert.equal(savedAssignment.locationName, "Dining Room");
    assert.equal(savedAssignment.locationTaskId, vinylTask.id);
    assert.equal(savedAssignment.workCategory, "Vinyl Flooring");
    assert.equal(savedAssignment.taskName, "Vinyl flooring");
    assert.deepEqual(savedAssignment.buildPhases, [], "Build phases MUST be empty — not used for worker assignment");

    // Task marked assigned
    const updatedTask = storage.tasks.find((t) => t.id === vinylTask.id)!;
    assert.equal(updatedTask.status, "assigned");
    assert.equal(updatedTask.assignedContractorName, "Ahmed Gouda");

    // ASSERTION 8: Existing CSV import paths are untouched — verified in separate csv-uploads-route.test.ts

    // ASSERTION 9: Quote amount is NEVER altered by worker/location operations
    const storedJob = storage.jobs.find((j) => j.id === job.id)!;
    assert.equal(storedJob.quotedAmount, REAL_SPENCER.formattedTotalPrice, "quotedAmount must remain unchanged after assignment");
    assert.equal(savedAssignment.quotedAmountAtAssignment, REAL_SPENCER.formattedTotalPrice, "Assignment must record the original quote amount (not modify it)");

    // Admin review — rename Dinning Room
    const renameRes = await patchLocation(job.id, dinningLoc.id, {
      name: "Dining Room Extension",
      reviewStatus: "CONFIRMED",
    });
    assert.equal(renameRes.status, 200);
    assert.equal(dinningLoc.name, "Dining Room Extension");
    assert.equal(dinningLoc.reviewStatus, "CONFIRMED");

    // Quoted amount STILL unchanged after location rename
    assert.equal(storedJob.quotedAmount, REAL_SPENCER.formattedTotalPrice, "quotedAmount must remain unchanged after location rename");
  });
});

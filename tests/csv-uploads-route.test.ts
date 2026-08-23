import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express, { type Request, type Response, type NextFunction } from "express";
import { formatUploadDate } from "../shared/job-upload-import.ts";
import { requireAdmin, type ReviewRouteSession } from "../server/integration-review-route.ts";

interface MockUpload {
  id: string;
  filename: string;
  status: "processing" | "processed" | "failed";
  jobsCount: string;
  uploadedAt: Date;
}

interface MockJob {
  id: string;
  title: string;
  uploadId?: string | null;
}

class MockStorage {
  uploads: MockUpload[] = [];
  jobs: MockJob[] = [];

  async getCsvUploads(): Promise<MockUpload[]> {
    return [...this.uploads];
  }

  async deleteCsvUpload(id: string): Promise<boolean> {
    const initialUploadCount = this.uploads.length;
    // Delete jobs associated with this upload only
    this.jobs = this.jobs.filter((job) => job.uploadId !== id);
    // Delete upload record
    this.uploads = this.uploads.filter((u) => u.id !== id);
    return this.uploads.length < initialUploadCount;
  }
}

interface TestRouteContext {
  readonly storage: MockStorage;
  setSession(session: ReviewRouteSession | undefined): void;
  deleteUpload(path: string): Promise<{ status: number; contentType: string; body: Record<string, unknown>; rawText: string }>;
  getUploads(path: string): Promise<{ status: number; contentType: string; body: unknown }>;
}

async function withTestRoute(
  run: (context: TestRouteContext) => Promise<void>,
): Promise<void> {
  const storage = new MockStorage();
  const app = express();
  app.use(express.json());

  let session: ReviewRouteSession | undefined = { role: "admin", username: "admin" };
  app.use((request: Request, _response: Response, next: NextFunction) => {
    (request as unknown as { session?: ReviewRouteSession }).session = session;
    next();
  });

  // GET /api/csv-uploads
  app.get("/api/csv-uploads", async (_req, res) => {
    try {
      const uploads = await storage.getCsvUploads();
      res.json(uploads);
    } catch {
      res.status(500).json({ error: "Failed to fetch uploads" });
    }
  });

  // DELETE /api/csv-uploads/:id
  app.delete("/api/csv-uploads/:id", requireAdmin as unknown as express.RequestHandler, async (req, res) => {
    try {
      const uploadId = req.params.id;
      if (!uploadId) {
        return res.status(400).json({ error: "Upload ID is required" });
      }

      const success = await storage.deleteCsvUpload(uploadId);
      if (!success) {
        return res.status(404).json({ error: "CSV upload record not found" });
      }

      res.json({
        success: true,
        message: "CSV upload record and associated jobs deleted successfully",
        id: uploadId,
      });
    } catch {
      res.status(500).json({ error: "Failed to delete CSV upload" });
    }
  });

  // SPA fallback catch-all simulation (returns HTML)
  app.use((_req, res) => {
    res.type("html").send("<!DOCTYPE html><html><body>React App</body></html>");
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address !== null);
    const base = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const sendDelete = async (path: string) => {
      const response = await fetch(base + path, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();
      let body: Record<string, unknown> = {};
      try {
        body = rawText.length === 0 ? {} : JSON.parse(rawText);
      } catch {
        // raw non-json
      }
      return { status: response.status, contentType, body, rawText };
    };

    const sendGet = async (path: string) => {
      const response = await fetch(base + path, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      return {
        status: response.status,
        contentType,
        body: text.length === 0 ? {} : JSON.parse(text),
      };
    };

    await run({
      storage,
      setSession: (nextSession) => {
        session = nextSession;
      },
      deleteUpload: (path) => sendDelete(path),
      getUploads: (path) => sendGet(path),
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

test("formatUploadDate: parses UTC timestamp and formats in Europe/London timezone", () => {
  // Summer time (BST, UTC+1)
  const bstDate = "2026-08-23T06:42:20.000Z";
  const formattedBst = formatUploadDate(bstDate);
  assert.equal(formattedBst, "23/08/2026, 07:42:20");

  // Winter time (GMT, UTC+0)
  const gmtDate = "2026-01-15T12:30:45.000Z";
  const formattedGmt = formatUploadDate(gmtDate);
  assert.equal(formattedGmt, "15/01/2026, 12:30:45");
});

test("formatUploadDate: returns '—' for missing or invalid dates without inventing a date", () => {
  assert.equal(formatUploadDate(undefined), "—");
  assert.equal(formatUploadDate(null), "—");
  assert.equal(formatUploadDate(""), "—");
  assert.equal(formatUploadDate("not-a-date"), "—");
});

test("DELETE /api/csv-uploads/:id: unauthenticated requests receive 401 JSON and never HTML", async () => {
  await withTestRoute(async ({ storage, setSession, deleteUpload }) => {
    storage.uploads.push({
      id: "upload-1",
      filename: "test.csv",
      status: "processed",
      jobsCount: "1",
      uploadedAt: new Date("2026-08-23T06:00:00Z"),
    });

    setSession(undefined);
    const res = await deleteUpload("/api/csv-uploads/upload-1");

    assert.equal(res.status, 401);
    assert.match(res.contentType, /application\/json/);
    assert.deepEqual(res.body, { error: "Unauthorized" });
    assert.doesNotMatch(res.rawText, /<!DOCTYPE/);
    assert.equal(storage.uploads.length, 1);
  });
});

test("DELETE /api/csv-uploads/:id: contractor role receives 401 JSON", async () => {
  await withTestRoute(async ({ storage, setSession, deleteUpload }) => {
    storage.uploads.push({
      id: "upload-1",
      filename: "test.csv",
      status: "processed",
      jobsCount: "1",
      uploadedAt: new Date("2026-08-23T06:00:00Z"),
    });

    setSession({ role: "contractor", username: "contractor" });
    const res = await deleteUpload("/api/csv-uploads/upload-1");

    assert.equal(res.status, 401);
    assert.match(res.contentType, /application\/json/);
    assert.deepEqual(res.body, { error: "Unauthorized" });
    assert.equal(storage.uploads.length, 1);
  });
});

test("DELETE /api/csv-uploads/:id: admin request for nonexistent upload returns 404 JSON", async () => {
  await withTestRoute(async ({ setSession, deleteUpload }) => {
    setSession({ role: "admin", username: "admin" });
    const res = await deleteUpload("/api/csv-uploads/nonexistent-id");

    assert.equal(res.status, 404);
    assert.match(res.contentType, /application\/json/);
    assert.deepEqual(res.body, { error: "CSV upload record not found" });
    assert.doesNotMatch(res.rawText, /<!DOCTYPE/);
  });
});

test("DELETE /api/csv-uploads/:id: admin request safely removes only targeted upload and its created jobs", async () => {
  await withTestRoute(async ({ storage, setSession, deleteUpload }) => {
    storage.uploads.push(
      {
        id: "upload-to-delete",
        filename: "delete-me.csv",
        status: "processed",
        jobsCount: "2",
        uploadedAt: new Date("2026-08-23T06:00:00Z"),
      },
      {
        id: "upload-to-keep",
        filename: "keep-me.csv",
        status: "processed",
        jobsCount: "1",
        uploadedAt: new Date("2026-08-23T06:30:00Z"),
      }
    );

    storage.jobs.push(
      { id: "job-1", title: "Job from upload 1", uploadId: "upload-to-delete" },
      { id: "job-2", title: "Job 2 from upload 1", uploadId: "upload-to-delete" },
      { id: "job-3", title: "Job from upload 2 (KEEP)", uploadId: "upload-to-keep" },
      { id: "job-4", title: "Manual Job without upload (KEEP)", uploadId: null }
    );

    setSession({ role: "admin", username: "admin" });
    const res = await deleteUpload("/api/csv-uploads/upload-to-delete");

    assert.equal(res.status, 200);
    assert.match(res.contentType, /application\/json/);
    assert.equal(res.body.success, true);
    assert.equal(res.body.id, "upload-to-delete");
    assert.doesNotMatch(res.rawText, /<!DOCTYPE/);

    // Verify only the targeted upload was removed
    assert.equal(storage.uploads.length, 1);
    assert.equal(storage.uploads[0].id, "upload-to-keep");

    // Verify only jobs from the deleted upload were removed; other jobs remain untouched
    assert.equal(storage.jobs.length, 2);
    assert.deepEqual(
      storage.jobs.map((j) => j.id),
      ["job-3", "job-4"]
    );
  });
});

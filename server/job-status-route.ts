import { Router, type RequestHandler } from "express";
import { requireAdmin } from "./integration-review-route.ts";

type JobStatus = "pending" | "assigned" | "completed";

export interface JobStatusRepository {
  transitionJobStatus(id: string, from: JobStatus, to: JobStatus): Promise<{ id: string; status: JobStatus } | undefined>;
  getJob(id: string): Promise<{ id: string; status: JobStatus } | undefined>;
}

// General edits must not bypass the explicit, authenticated lifecycle action.
export const rejectJobStatusEdit: RequestHandler = (req, res, next) => {
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "status")) {
    res.status(400).json({ error: "Use the job status action to activate or complete a job." });
    return;
  }
  next();
};

export function createJobStatusRouter(repository: JobStatusRepository) {
  const router = Router();
  router.patch("/api/jobs/:id/status", requireAdmin, async (req, res) => {
    const status = req.body?.status;
    if (status !== "assigned" && status !== "completed") {
      res.status(400).json({ error: "Status must be assigned or completed." });
      return;
    }
    const from = status === "assigned" ? "pending" : "assigned";
    try {
      // Compare-and-set prevents stale clicks or concurrent requests reopening jobs.
      const job = await repository.transitionJobStatus(req.params.id, from, status);
      if (!job) {
        const current = await repository.getJob(req.params.id);
        res.status(current ? 409 : 404).json({
          error: current ? "Job status has changed or this transition is not allowed. Refresh and try again." : "Job not found",
        });
        return;
      }
      res.json({ id: job.id, status: job.status });
    } catch {
      res.status(500).json({ error: "Failed to update job status" });
    }
  });
  return router;
}

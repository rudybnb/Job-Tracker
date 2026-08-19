import express, { type Request, type Response, type Router } from "express";
import { WorkerService, normalizePhoneE164 } from "./worker-service.ts";

export const WORKERS_ADMIN_API_PREFIX = "/api/admin/workers";

export function createWorkerRouter(workerService = new WorkerService()): Router {
  const router = express.Router();

  // GET /api/admin/workers - List all workers from operational records
  router.get(WORKERS_ADMIN_API_PREFIX, async (_req: Request, res: Response) => {
    try {
      const list = await workerService.listWorkers();
      return res.status(200).json(list);
    } catch (error) {
      console.error("Error listing workers:", error);
      return res.status(500).json({ error: "Failed to list workers" });
    }
  });

  // GET /api/admin/workers/:id - Get worker details
  router.get(`${WORKERS_ADMIN_API_PREFIX}/:id`, async (req: Request, res: Response) => {
    try {
      const worker = await workerService.getWorkerById(req.params.id);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }
      return res.status(200).json(worker);
    } catch (error) {
      console.error("Error getting worker:", error);
      return res.status(500).json({ error: "Failed to get worker" });
    }
  });

  // POST /api/admin/workers - Create new site worker
  router.post(WORKERS_ADMIN_API_PREFIX, async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
      const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : null;
      const workerType = body.workerType === "AGENCY" ? "AGENCY" : "DIRECT_SELF_EMPLOYED";
      const isActive = body.isActive !== false;
      const jobId = typeof body.jobId === "string" && body.jobId.trim() ? body.jobId.trim() : null;

      let newSiteData = null;
      if (body.newSiteData && typeof body.newSiteData === "object") {
        newSiteData = {
          title: typeof body.newSiteData.title === "string" ? body.newSiteData.title.trim() : "",
          address: typeof body.newSiteData.address === "string" ? body.newSiteData.address.trim() : null,
          townArea: typeof body.newSiteData.townArea === "string" ? body.newSiteData.townArea.trim() : null,
          postcode: typeof body.newSiteData.postcode === "string" ? body.newSiteData.postcode.trim() : null,
        };
      }

      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First name and last name are required", code: "INVALID_INPUT" });
      }

      if (!phone) {
        return res.status(400).json({ error: "Mobile number is required", code: "INVALID_INPUT" });
      }

      if (jobId === "NEW_SITE" && (!newSiteData || !newSiteData.title)) {
        return res.status(400).json({ error: "Site / Job name is required for new site", code: "INVALID_INPUT" });
      }

      const created = await workerService.createWorker({
        firstName,
        lastName,
        phone,
        email,
        workerType,
        isActive,
        jobId,
        newSiteData,
      });

      return res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === "DUPLICATE_MOBILE") {
        return res.status(409).json({ error: error.message, code: "DUPLICATE_MOBILE" });
      }
      console.error("Error creating worker:", error);
      return res.status(500).json({ error: error.message || "Failed to create worker" });
    }
  });

  // PATCH /api/admin/workers/:id - Update worker
  router.patch(`${WORKERS_ADMIN_API_PREFIX}/:id`, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const body = req.body ?? {};

      const updates: any = {};
      if (typeof body.firstName === "string") updates.firstName = body.firstName;
      if (typeof body.lastName === "string") updates.lastName = body.lastName;
      if (typeof body.phone === "string") updates.phone = body.phone;
      if (typeof body.email === "string" || body.email === null) updates.email = body.email;
      if (body.workerType === "AGENCY" || body.workerType === "DIRECT_SELF_EMPLOYED") updates.workerType = body.workerType;
      if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
      if (typeof body.jobId === "string" || body.jobId === null) updates.jobId = body.jobId;

      if (body.newSiteData && typeof body.newSiteData === "object") {
        updates.newSiteData = {
          title: typeof body.newSiteData.title === "string" ? body.newSiteData.title.trim() : "",
          address: typeof body.newSiteData.address === "string" ? body.newSiteData.address.trim() : null,
          townArea: typeof body.newSiteData.townArea === "string" ? body.newSiteData.townArea.trim() : null,
          postcode: typeof body.newSiteData.postcode === "string" ? body.newSiteData.postcode.trim() : null,
        };
      }

      if (updates.jobId === "NEW_SITE" && (!updates.newSiteData || !updates.newSiteData.title)) {
        return res.status(400).json({ error: "Site / Job name is required for new site", code: "INVALID_INPUT" });
      }

      const updated = await workerService.updateWorker(id, updates);
      return res.status(200).json(updated);
    } catch (error: any) {
      if (error?.code === "DUPLICATE_MOBILE") {
        return res.status(409).json({ error: error.message, code: "DUPLICATE_MOBILE" });
      }
      if (error?.message === "Worker not found") {
        return res.status(404).json({ error: "Worker not found" });
      }
      console.error("Error updating worker:", error);
      return res.status(500).json({ error: error.message || "Failed to update worker" });
    }
  });

  // DELETE /api/admin/workers/:id - Remove worker from active list while preserving all historical records
  router.delete(`${WORKERS_ADMIN_API_PREFIX}/:id`, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const result = await workerService.deleteWorker(id);
      return res.status(200).json({
        success: true,
        message: "Worker removed from active directory. All historical attendance, timesheet, and payroll records have been preserved.",
        worker: result.worker,
      });
    } catch (error: any) {
      if (error?.message === "Worker not found") {
        return res.status(404).json({ error: "Worker not found" });
      }
      console.error("Error deleting worker:", error);
      return res.status(500).json({ error: error.message || "Failed to delete worker" });
    }
  });

  return router;
}

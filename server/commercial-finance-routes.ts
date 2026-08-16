import express, { type Request, type Router } from "express";
import { requireAdmin } from "./integration-review-route.ts";
import { CommercialFinanceError, CommercialFinanceRepository } from "./commercial-finance.ts";

export interface CommercialFinanceRouteSession {
  readonly username?: string;
}

function sessionUsername(request: Request): string {
  const session = (request as unknown as { session?: CommercialFinanceRouteSession }).session;
  return typeof session?.username === "string" ? session.username : "admin";
}

export function createCommercialFinanceRouter(repository: CommercialFinanceRepository): Router {
  const router = express.Router();
  router.use(requireAdmin as express.RequestHandler);

  router.get("/api/commercial-finance/payables", async (request, response) => {
    try {
      const jobId = typeof request.query.jobId === "string" && request.query.jobId.length > 0 ? request.query.jobId : undefined;
      response.json({ payables: await repository.listPayables(jobId) });
    } catch (error) {
      console.error("Error listing commercial payables:", error);
      response.status(500).json({ error: "Failed to list payables" });
    }
  });

  router.get("/api/commercial-finance/receivables", async (request, response) => {
    try {
      const jobId = typeof request.query.jobId === "string" && request.query.jobId.length > 0 ? request.query.jobId : undefined;
      response.json({ receivables: await repository.listReceivables(jobId) });
    } catch (error) {
      console.error("Error listing client receivables:", error);
      response.status(500).json({ error: "Failed to list receivables" });
    }
  });

  router.post("/api/commercial-finance/receivables", async (request, response) => {
    try {
      const body = request.body ?? {};
      const receivable = await repository.createReceivable({
        clientId: typeof body.clientId === "string" && body.clientId.trim().length > 0 ? body.clientId.trim() : null,
        jobId: typeof body.jobId === "string" ? body.jobId.trim() : "",
        reference: typeof body.reference === "string" ? body.reference.trim() : "",
        invoiceDate: typeof body.invoiceDate === "string" ? body.invoiceDate.trim() : "",
        dueDate: typeof body.dueDate === "string" && body.dueDate.trim().length > 0 ? body.dueDate.trim() : null,
        netAmount: typeof body.netAmount === "string" ? body.netAmount.trim() : "",
        grossAmount: typeof body.grossAmount === "string" ? body.grossAmount.trim() : "",
        amountReceived: typeof body.amountReceived === "string" && body.amountReceived.trim().length > 0 ? body.amountReceived.trim() : "0.00",
        sourceEvidence: typeof body.sourceEvidence === "string" && body.sourceEvidence.trim().length > 0 ? body.sourceEvidence.trim() : null,
        notes: typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null,
        createdBy: sessionUsername(request),
      });
      response.status(201).json({ receivable });
    } catch (error) {
      if (error instanceof CommercialFinanceError) {
        response.status(400).json({ error: error.message, code: error.code });
        return;
      }
      console.error("Error creating client receivable:", error);
      response.status(500).json({ error: "Failed to create receivable" });
    }
  });

  router.get("/api/commercial-finance/job-summary", async (request, response) => {
    try {
      const jobId = typeof request.query.jobId === "string" && request.query.jobId.length > 0 ? request.query.jobId : undefined;
      response.json({ jobs: await repository.listJobSummaries(jobId) });
    } catch (error) {
      console.error("Error listing job commercial summaries:", error);
      response.status(500).json({ error: "Failed to list job summaries" });
    }
  });

  return router;
}

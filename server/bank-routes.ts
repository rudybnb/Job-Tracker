import express, { type Request, type Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "./integration-review-route.ts";
import { BankIntegrationError, BankReconciliationRepository, type BankDirection, type ReconciliationTargetType } from "./monzo-bank.ts";

interface BankRouteSession {
  readonly username?: string;
  monzoOAuthState?: string;
}

function sessionUsername(request: Request): string {
  const session = (request as unknown as { session?: BankRouteSession }).session;
  return typeof session?.username === "string" ? session.username : "admin";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function bankSession(request: Request): BankRouteSession | undefined {
  return (request as unknown as { session?: BankRouteSession }).session;
}

export function createBankRouter(repository: BankReconciliationRepository): Router {
  const router = express.Router();
  router.use(requireAdmin as express.RequestHandler);

  router.get("/api/bank/monzo/status", async (_request, response) => {
    try {
      response.json({ monzo: await repository.status() });
    } catch (error) {
      handleBankError(response, error, "Failed to load Monzo status");
    }
  });

  router.post("/api/bank/monzo/connect", async (request, response) => {
    try {
      const state = randomUUID();
      const session = bankSession(request);
      if (session === undefined) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }
      session.monzoOAuthState = state;
      response.json({ authorizationUrl: repository.buildMonzoAuthorizationUrl(state) });
    } catch (error) {
      handleBankError(response, error, "Failed to start Monzo OAuth");
    }
  });

  router.get("/api/bank/monzo/callback", async (request, response) => {
    try {
      const session = bankSession(request);
      const expectedState = session?.monzoOAuthState;
      const receivedState = optionalString(request.query.state);
      const code = optionalString(request.query.code);
      if (!expectedState || !receivedState || expectedState !== receivedState) {
        response.status(400).send("Invalid Monzo OAuth state");
        return;
      }
      if (!code) {
        response.status(400).send("Missing Monzo OAuth code");
        return;
      }
      delete session.monzoOAuthState;
      await repository.completeMonzoAuthorization({ code, authorizedBy: sessionUsername(request) });
      response.redirect("/admin-bank-reconciliation?monzo=connected");
    } catch (error) {
      if (bankSession(request)) delete bankSession(request)!.monzoOAuthState;
      handleBankError(response, error, "Failed to complete Monzo OAuth");
    }
  });

  router.post("/api/bank/monzo/disconnect", async (_request, response) => {
    try {
      response.json({ monzo: await repository.disconnectMonzo() });
    } catch (error) {
      handleBankError(response, error, "Failed to disconnect Monzo");
    }
  });

  router.get("/api/bank/monzo/accounts", async (_request, response) => {
    try {
      response.json({ accounts: await repository.listMonzoAccounts() });
    } catch (error) {
      handleBankError(response, error, "Failed to list Monzo accounts");
    }
  });

  router.get("/api/bank/monzo/balance", async (request, response) => {
    try {
      response.json({ balance: await repository.readBankBalance(optionalString(request.query.accountId)) });
    } catch (error) {
      handleBankError(response, error, "Failed to read Monzo balance");
    }
  });

  router.post("/api/bank/monzo/sync", async (request, response) => {
    try {
      const body = request.body ?? {};
      const result = await repository.syncMonzo({
        accountId: optionalString(body.accountId),
        since: optionalString(body.since),
        before: optionalString(body.before),
        limit: typeof body.limit === "number" ? body.limit : undefined,
      });
      response.json({ sync: result });
    } catch (error) {
      handleBankError(response, error, "Failed to sync Monzo transactions");
    }
  });

  router.get("/api/bank/transactions", async (request, response) => {
    try {
      const direction = optionalString(request.query.direction) as BankDirection | undefined;
      if (direction !== undefined && direction !== "INCOMING" && direction !== "OUTGOING") {
        response.status(400).json({ error: "Invalid direction" });
        return;
      }
      response.json({
        transactions: await repository.listBankTransactions({
          direction,
          since: optionalString(request.query.since),
          before: optionalString(request.query.before),
          limit: optionalString(request.query.limit) ? Number(request.query.limit) : undefined,
        }),
      });
    } catch (error) {
      handleBankError(response, error, "Failed to list bank transactions");
    }
  });

  router.get("/api/bank/transactions/:id/candidates", async (request, response) => {
    try {
      response.json({ candidates: await repository.getCandidates(request.params.id) });
    } catch (error) {
      handleBankError(response, error, "Failed to list reconciliation candidates");
    }
  });

  router.post("/api/bank/reconciliation/confirm", async (request, response) => {
    try {
      const body = request.body ?? {};
      const matches = Array.isArray(body.matches) ? body.matches : [];
      const confirmed = await repository.confirmMatches({
        bankTransactionId: typeof body.bankTransactionId === "string" ? body.bankTransactionId : "",
        confirmedBy: sessionUsername(request),
        matches: matches.map((match: Record<string, unknown>) => ({
          targetType: match.targetType as ReconciliationTargetType,
          targetId: typeof match.targetId === "string" ? match.targetId : "",
          jobId: typeof match.jobId === "string" && match.jobId.length > 0 ? match.jobId : null,
          counterpartyName: typeof match.counterpartyName === "string" && match.counterpartyName.length > 0 ? match.counterpartyName : null,
          matchedAmount: typeof match.matchedAmount === "string" ? match.matchedAmount : "",
          evidence: typeof match.evidence === "string" && match.evidence.length > 0 ? match.evidence : null,
        })),
      });
      response.status(201).json({ matches: confirmed });
    } catch (error) {
      handleBankError(response, error, "Failed to confirm reconciliation match");
    }
  });

  router.get("/api/bank/jarvis-finance-read-model", async (_request, response) => {
    try {
      response.json({ finance: await repository.jarvisFinanceReadModel() });
    } catch (error) {
      handleBankError(response, error, "Failed to load finance read model");
    }
  });

  router.get("/api/jarvis/finance/read-model", async (_request, response) => {
    try {
      response.json({ finance: await repository.jarvisFinanceReadModel() });
    } catch (error) {
      handleBankError(response, error, "Failed to load Jarvis finance read model");
    }
  });

  return router;
}

function handleBankError(response: express.Response, error: unknown, fallback: string): void {
  if (error instanceof BankIntegrationError) {
    const status = error.code === "BANK_TRANSACTION_NOT_FOUND" ? 404 : error.code === "MONZO_NOT_CONNECTED" || error.code === "MONZO_OAUTH_NOT_CONFIGURED" ? 503 : 400;
    response.status(status).json({ error: error.message, code: error.code });
    return;
  }
  console.error(fallback, error instanceof Error ? error.message : error);
  response.status(500).json({ error: fallback });
}

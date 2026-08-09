import express, { type NextFunction, type Request, type Response, type Router } from "express";
import type {
  IntegrationReviewRepository,
  ReviewDecision,
} from "./integration-review-repository.ts";

export const JARVIS_REVIEW_LIST_ROUTE = "/api/integrations/review/change-orders";

const REVIEW_DECISIONS: readonly ReviewDecision[] = ["approved", "rejected", "sent_back"];
const MAX_NOTE_LENGTH = 2000;

export interface ReviewRouteSession {
  readonly userId?: unknown;
  readonly username?: string;
  readonly role?: string;
}

interface AdminSessionRequest extends Request {
  session?: ReviewRouteSession;
}

/**
 * Server-side admin guard. The frontend ProtectedRoute is NOT sufficient:
 * every review endpoint re-verifies the session carries the admin role.
 */
export function requireAdmin(
  request: AdminSessionRequest,
  response: Response,
  next: NextFunction,
): void {
  const session = request.session;
  if (
    session === undefined ||
    session.role !== "admin" ||
    typeof session.username !== "string" ||
    session.username.trim().length === 0
  ) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export interface JarvisReviewRouteOptions {
  readonly repository: IntegrationReviewRepository;
  readonly now?: () => string;
  readonly reviewId?: () => string;
}

function parseRevision(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return undefined;
  return value;
}

type DecisionBodyResult =
  | { readonly success: true; readonly decision: ReviewDecision; readonly note?: string }
  | { readonly success: false; readonly error: string };

function parseDecisionBody(body: unknown): DecisionBodyResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Invalid request body" };
  }
  const candidate = body as Record<string, unknown>;
  const decision = candidate.decision;
  if (typeof decision !== "string" || !REVIEW_DECISIONS.includes(decision as ReviewDecision)) {
    return { success: false, error: "Invalid decision" };
  }

  let note: string | undefined;
  if (candidate.note !== undefined) {
    if (typeof candidate.note !== "string") {
      return { success: false, error: "Invalid note" };
    }
    const trimmed = candidate.note.trim();
    if (trimmed.length > MAX_NOTE_LENGTH) {
      return { success: false, error: "Note is too long" };
    }
    if (trimmed.length > 0) note = trimmed;
  }

  return { success: true, decision: decision as ReviewDecision, note };
}

/**
 * Admin-only review inbox for accepted Jarvis shadow changes.
 * Records human decisions ONLY. Never creates or modifies operational Job Tracker data.
 */
export function createJarvisReviewRouter(options: JarvisReviewRouteOptions): Router {
  const router = express.Router();
  const now = options.now ?? (() => new Date().toISOString());

  router.use(requireAdmin);

  router.get(JARVIS_REVIEW_LIST_ROUTE, async (_request: AdminSessionRequest, response) => {
    try {
      const changes = await options.repository.listReviewableChanges();
      response.json({ changes });
    } catch (error) {
      console.error("Error listing Jarvis review changes:", error);
      response.status(500).json({ error: "Failed to list review changes" });
    }
  });

  router.get(
    `${JARVIS_REVIEW_LIST_ROUTE}/:changeOrderId/revisions/:revision`,
    async (request: AdminSessionRequest, response) => {
      try {
        const revision = parseRevision(request.params.revision);
        if (revision === undefined) {
          response.status(400).json({ error: "Invalid revision" });
          return;
        }
        const detail = await options.repository.getReviewableChange(
          request.params.changeOrderId,
          revision,
        );
        if (detail === undefined) {
          response.status(404).json({ error: "Change not found" });
          return;
        }
        response.json(detail);
      } catch (error) {
        console.error("Error loading Jarvis review change:", error);
        response.status(500).json({ error: "Failed to load review change" });
      }
    },
  );

  router.post(
    `${JARVIS_REVIEW_LIST_ROUTE}/:changeOrderId/revisions/:revision/decision`,
    async (request: AdminSessionRequest, response) => {
      try {
        const revision = parseRevision(request.params.revision);
        if (revision === undefined) {
          response.status(400).json({ error: "Invalid revision" });
          return;
        }
        const parsed = parseDecisionBody(request.body);
        if (!parsed.success) {
          response.status(400).json({ error: parsed.error });
          return;
        }

        const reviewer = (request.session?.username ?? "").trim();
        const result = await options.repository.recordReviewDecision({
          change_order_id: request.params.changeOrderId,
          revision,
          decision: parsed.decision,
          reviewed_by: reviewer,
          note: parsed.note,
          reviewed_at: now(),
          review_id: options.reviewId?.(),
        });

        if (result.outcome === "change_not_found") {
          response.status(404).json({ error: "Change not found" });
          return;
        }

        response.json({
          status: "recorded",
          change_order_id: request.params.changeOrderId,
          revision,
          decision: parsed.decision,
        });
      } catch (error) {
        console.error("Error recording Jarvis review decision:", error);
        response.status(500).json({ error: "Failed to record review decision" });
      }
    },
  );

  return router;
}

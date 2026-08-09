import express, { type NextFunction, type Request, type Response, type Router } from "express";
import type { IntegrationChangeOrderApplicationRepository } from "./integration-change-order-applications.ts";
import { requireAdmin } from "./integration-review-route.ts";

export const JARVIS_APPLICATION_ROUTE = "/api/integrations/applications";

const MAX_ID_LENGTH = 200;

export interface ApplicationRouteSession {
  readonly userId?: unknown;
  readonly username?: string;
  readonly role?: string;
}

interface AdminSessionRequest extends Request {
  session?: ApplicationRouteSession;
}

export interface JarvisApplicationRouteOptions {
  readonly repository: IntegrationChangeOrderApplicationRepository;
  readonly now?: () => string;
}

function parseRevision(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return undefined;
  return value;
}

function trimmedId(value: unknown, label: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return undefined;
  return trimmed;
}

type MappingBodyResult =
  | { readonly success: true; readonly project_integration_id: string; readonly job_id: string }
  | { readonly success: false; readonly error: string };

function parseMappingBody(body: unknown): MappingBodyResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Invalid request body" };
  }
  const candidate = body as Record<string, unknown>;
  const projectIntegrationId = trimmedId(candidate.project_integration_id, "project_integration_id");
  if (projectIntegrationId === undefined) {
    return { success: false, error: "Invalid project_integration_id" };
  }
  const jobId = trimmedId(candidate.job_id, "job_id");
  if (jobId === undefined) {
    return { success: false, error: "Invalid job_id" };
  }
  return { success: true, project_integration_id: projectIntegrationId, job_id: jobId };
}

/**
 * Admin-only mapping and application-readiness endpoints.
 * Mapping links a Jarvis project_integration_id to an EXISTING jobs.id only.
 * Never auto-matches, never auto-creates a job, never writes operational job/task data.
 */
export function createJarvisApplicationRouter(options: JarvisApplicationRouteOptions): Router {
  const router = express.Router();
  const now = options.now ?? (() => new Date().toISOString());

  router.use(requireAdmin);

  router.get(
    `${JARVIS_APPLICATION_ROUTE}/change-orders/:changeOrderId/revisions/:revision/readiness`,
    async (request: AdminSessionRequest, response) => {
      try {
        const revision = parseRevision(request.params.revision);
        if (revision === undefined) {
          response.status(400).json({ error: "Invalid revision" });
          return;
        }
        const readiness = await options.repository.getReadiness(
          request.params.changeOrderId,
          revision,
        );
        if (readiness === undefined) {
          response.status(404).json({ error: "Change not found" });
          return;
        }
        response.json(readiness);
      } catch (error) {
        console.error("Error reading Jarvis application readiness:", error);
        response.status(500).json({ error: "Failed to read application readiness" });
      }
    },
  );

  router.post(
    `${JARVIS_APPLICATION_ROUTE}/mappings`,
    async (request: AdminSessionRequest, response) => {
      try {
        const parsed = parseMappingBody(request.body);
        if (!parsed.success) {
          response.status(400).json({ error: parsed.error });
          return;
        }
        const mappedBy = (request.session?.username ?? "").trim();
        const result = await options.repository.createProjectMapping({
          project_integration_id: parsed.project_integration_id,
          job_id: parsed.job_id,
          mapped_by: mappedBy,
          mapped_at: now(),
        });

        if (result.outcome === "invalid_input") {
          response.status(400).json({ error: "Invalid mapping input" });
          return;
        }
        if (result.outcome === "job_not_found") {
          response.status(400).json({ error: "Job not found" });
          return;
        }
        if (result.outcome === "already_exists") {
          response.json({ status: "already_exists", mapping: result.mapping });
          return;
        }
        response.status(201).json({ status: "created", mapping: result.mapping });
      } catch (error) {
        console.error("Error creating Jarvis project mapping:", error);
        response.status(500).json({ error: "Failed to create project mapping" });
      }
    },
  );

  return router;
}

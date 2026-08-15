import express, { type Router } from "express";
import type {
  IntegrationKeyLookup,
  IntegrationNonceLookup,
  MachineAuthHeaders,
} from "./integration-auth.ts";
import { verifyMachineAuthentication } from "./integration-auth.ts";
import type { IntegrationSqlExecutor, IntegrationSqlRow } from "./integration-shadow-sql-repository.ts";

export const JARVIS_IDENTITY_RESOLVER_ROUTE = "/api/integrations/jarvis/v1/identity/resolve-whatsapp-sender";

export type IdentityResolutionStatus = "NO_MATCH" | "UNIQUE_CLIENT" | "AMBIGUOUS";
export type JobResolutionStatus = "UNIQUE_JOB" | "JOB_REVIEW_REQUIRED";

export interface WhatsAppIdentityResolveInput {
  readonly sourceProvider: string;
  readonly senderWaId?: string;
  readonly normalizedPhone?: string;
}

export interface ResolvedClientContactEvidence {
  readonly contactMethodId: string;
  readonly methodType: "PHONE" | "WHATSAPP";
  readonly valueNormalized: string;
  readonly contactName?: string;
  readonly verificationStatus: "VERIFIED";
  readonly verifiedAt: string;
  readonly verifiedBy: string;
  readonly source?: string;
  readonly evidence?: string;
}

export interface ResolvedActiveJob {
  readonly jobId: string;
  readonly title: string;
  readonly status: "pending" | "assigned";
}

export type WhatsAppIdentityResolveResult =
  | {
      readonly status: "NO_MATCH";
      readonly reason: string;
    }
  | {
      readonly status: "AMBIGUOUS";
      readonly reason: string;
      readonly candidateClientIds: readonly string[];
    }
  | {
      readonly status: "UNIQUE_CLIENT";
      readonly clientId: string;
      readonly contact: ResolvedClientContactEvidence;
      readonly activeJobs: readonly ResolvedActiveJob[];
      readonly jobResolution: JobResolutionStatus;
      readonly jobId?: string;
      readonly matchMethod: "VERIFIED_WHATSAPP" | "VERIFIED_PHONE";
      readonly confidence: 1;
      readonly reason: string;
    };

export interface JarvisIdentityResolver {
  resolveWhatsAppSender(input: WhatsAppIdentityResolveInput): Promise<WhatsAppIdentityResolveResult>;
}

export interface JarvisIdentityResolverRouteOptions {
  readonly enabled: boolean;
  readonly resolver: JarvisIdentityResolver;
  readonly keyLookup: IntegrationKeyLookup;
  readonly nonceLookup: IntegrationNonceLookup;
  readonly nonceStore: (keyId: string, nonce: string) => void | Promise<void>;
  readonly now?: () => number;
}

const ACTIVE_JOB_STATUSES = ["pending", "assigned"] as const;

const CONTACT_LOOKUP_SQL = `
  SELECT cm.id AS contact_method_id,
         cm.client_id,
         cm.contact_name,
         cm.method_type,
         cm.value_normalized,
         cm.verification_status,
         cm.verified_at,
         cm.verified_by,
         cm.source,
         cm.evidence
  FROM client_contact_methods cm
  WHERE cm.is_active = true
    AND cm.verification_status = 'VERIFIED'
    AND (
      (cm.method_type = 'WHATSAPP' AND cm.value_normalized = $1)
      OR (cm.method_type = 'PHONE' AND cm.value_normalized = $2)
    )
  ORDER BY CASE WHEN cm.method_type = 'WHATSAPP' THEN 0 ELSE 1 END,
           cm.verified_at DESC NULLS LAST,
           cm.id
`;

const ACTIVE_JOBS_SQL = `
  SELECT id, title, status
  FROM jobs
  WHERE client_id = $1
    AND status IN ('pending', 'assigned')
  ORDER BY CASE status WHEN 'assigned' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
           id
`;

export class SqlJarvisIdentityResolver implements JarvisIdentityResolver {
  private readonly executor: IntegrationSqlExecutor;

  constructor(executor: IntegrationSqlExecutor) {
    this.executor = executor;
  }

  async resolveWhatsAppSender(input: WhatsAppIdentityResolveInput): Promise<WhatsAppIdentityResolveResult> {
    if (input.sourceProvider !== "meta_whatsapp") {
      return { status: "NO_MATCH", reason: "unsupported_source_provider" };
    }

    const whatsappPhone = normalizeWhatsAppSender(input.senderWaId);
    const normalizedPhone = normalizeE164(input.normalizedPhone);
    if (whatsappPhone === undefined && normalizedPhone === undefined) {
      return { status: "NO_MATCH", reason: "no_verified_phone_identity_input" };
    }

    const contactRows = await this.executor.query(CONTACT_LOOKUP_SQL, [
      whatsappPhone ?? "",
      normalizedPhone ?? "",
    ]);
    if (contactRows.rows.length === 0) {
      return { status: "NO_MATCH", reason: "no_verified_contact_method_match" };
    }

    const clientIds: string[] = [];
    for (const row of contactRows.rows) {
      const clientId = requiredString(row, "client_id");
      if (!clientIds.includes(clientId)) clientIds.push(clientId);
    }
    if (clientIds.length !== 1) {
      return {
        status: "AMBIGUOUS",
        reason: "verified_contact_method_matches_multiple_clients",
        candidateClientIds: clientIds,
      };
    }

    const preferredContact = contactRows.rows[0];
    const clientId = clientIds[0];
    const activeJobs = (await this.executor.query(ACTIVE_JOBS_SQL, [clientId])).rows.map(toActiveJob);
    const jobResolution: JobResolutionStatus = activeJobs.length === 1 ? "UNIQUE_JOB" : "JOB_REVIEW_REQUIRED";
    const methodType = requiredString(preferredContact, "method_type");

    return {
      status: "UNIQUE_CLIENT",
      clientId,
      contact: toContactEvidence(preferredContact),
      activeJobs,
      jobResolution,
      ...(activeJobs.length === 1 ? { jobId: activeJobs[0].jobId } : {}),
      matchMethod: methodType === "WHATSAPP" ? "VERIFIED_WHATSAPP" : "VERIFIED_PHONE",
      confidence: 1,
      reason: activeJobs.length === 1
        ? "exact_verified_contact_method_matched_one_client_and_one_active_job"
        : "exact_verified_contact_method_matched_one_client_but_job_requires_review",
    };
  }
}

export function createJarvisIdentityResolverRouter(options: JarvisIdentityResolverRouteOptions): Router {
  const router = express.Router();
  if (!options.enabled) return router;

  router.post(
    JARVIS_IDENTITY_RESOLVER_ROUTE,
    express.raw({ type: "application/json", limit: "64kb" }),
    async (request, response) => {
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
      const authenticated = await verifyMachineAuthentication({
        headers: request.headers as MachineAuthHeaders,
        rawBody,
        keyLookup: options.keyLookup,
        nonceLookup: options.nonceLookup,
        now: options.now,
      });
      if (!authenticated.authenticated) {
        response.status(401).json({ error: "Unauthorized", code: authenticated.code });
        return;
      }
      await options.nonceStore(authenticated.keyId, authenticated.nonce);

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString("utf8"));
      } catch {
        response.status(400).json({ error: "Invalid JSON" });
        return;
      }

      const parsed = parseResolveInput(body);
      if (parsed === undefined) {
        response.status(400).json({ error: "Invalid resolver input" });
        return;
      }

      response.json(await options.resolver.resolveWhatsAppSender(parsed));
    },
  );

  return router;
}

export function normalizeWhatsAppSender(senderWaId: unknown): string | undefined {
  if (typeof senderWaId !== "string") return undefined;
  const digits = senderWaId.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return undefined;
  return `+${digits}`;
}

function normalizeE164(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^\+[0-9]{8,15}$/.test(trimmed) ? trimmed : undefined;
}

function parseResolveInput(body: unknown): WhatsAppIdentityResolveInput | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return undefined;
  const candidate = body as Record<string, unknown>;
  if (candidate.sourceProvider !== "meta_whatsapp") return undefined;
  return {
    sourceProvider: "meta_whatsapp",
    ...(typeof candidate.senderWaId === "string" ? { senderWaId: candidate.senderWaId } : {}),
    ...(typeof candidate.normalizedPhone === "string" ? { normalizedPhone: candidate.normalizedPhone } : {}),
  };
}

function requiredString(row: IntegrationSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid identity resolver column: ${column}`);
  }
  return value;
}

function optionalString(row: IntegrationSqlRow, column: string): string | undefined {
  const value = row[column];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function timestampString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return new Date(value).toISOString();
  throw new Error("Invalid verified_at timestamp");
}

function toContactEvidence(row: IntegrationSqlRow): ResolvedClientContactEvidence {
  const methodType = requiredString(row, "method_type");
  if (methodType !== "PHONE" && methodType !== "WHATSAPP") {
    throw new Error("Invalid contact method type");
  }
  return {
    contactMethodId: requiredString(row, "contact_method_id"),
    methodType,
    valueNormalized: requiredString(row, "value_normalized"),
    ...(optionalString(row, "contact_name") === undefined ? {} : { contactName: optionalString(row, "contact_name") }),
    verificationStatus: "VERIFIED",
    verifiedAt: timestampString(row.verified_at),
    verifiedBy: requiredString(row, "verified_by"),
    ...(optionalString(row, "source") === undefined ? {} : { source: optionalString(row, "source") }),
    ...(optionalString(row, "evidence") === undefined ? {} : { evidence: optionalString(row, "evidence") }),
  };
}

function toActiveJob(row: IntegrationSqlRow): ResolvedActiveJob {
  const status = requiredString(row, "status");
  if (!ACTIVE_JOB_STATUSES.includes(status as any)) {
    throw new Error("Invalid active job status");
  }
  return {
    jobId: requiredString(row, "id"),
    title: requiredString(row, "title"),
    status: status as "pending" | "assigned",
  };
}

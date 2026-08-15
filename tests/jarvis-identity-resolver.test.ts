import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import {
  JARVIS_IDENTITY_RESOLVER_ROUTE,
  SqlJarvisIdentityResolver,
  createJarvisIdentityResolverRouter,
} from "../server/jarvis-identity-resolver.ts";
import { buildMachineAuthSigningInput } from "../server/integration-auth.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlTransaction,
} from "../server/integration-shadow-sql-repository.ts";

interface ContactMethodRow {
  contact_method_id: string;
  client_id: string;
  contact_name: string | null;
  method_type: "PHONE" | "WHATSAPP";
  value_normalized: string;
  verification_status: "VERIFIED" | "UNVERIFIED";
  verified_at: string | Date | null;
  verified_by: string | null;
  source: string | null;
  evidence: string | null;
  is_active: boolean;
}

interface JobRow {
  id: string;
  client_id: string;
  title: string;
  status: "pending" | "assigned" | "completed";
}

class InMemoryIdentityExecutor implements IntegrationSqlExecutor {
  contacts: ContactMethodRow[] = [];
  jobs: JobRow[] = [];

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from client_contact_methods")) {
      const [whatsappPhone, phone] = parameters;
      return {
        rows: this.contacts
          .filter((row) => row.is_active)
          .filter((row) => row.verification_status === "VERIFIED")
          .filter((row) => row.verified_at !== null && row.verified_by !== null)
          .filter((row) =>
            (row.method_type === "WHATSAPP" && row.value_normalized === whatsappPhone) ||
            (row.method_type === "PHONE" && row.value_normalized === phone),
          )
          .sort((a, b) => a.method_type === b.method_type ? a.contact_method_id.localeCompare(b.contact_method_id) : a.method_type === "WHATSAPP" ? -1 : 1),
      };
    }

    if (normalized.includes("from jobs")) {
      const [clientId] = parameters;
      return {
        rows: this.jobs
          .filter((row) => row.client_id === clientId)
          .filter((row) => row.status === "pending" || row.status === "assigned")
          .map(({ id, title, status }) => ({ id, title, status })),
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }

  async transaction<T>(_work: (transaction: IntegrationSqlTransaction) => Promise<T>): Promise<T> {
    throw new Error("transactions are not used by identity resolver tests");
  }
}

function verifiedContact(overrides: Partial<ContactMethodRow> = {}): ContactMethodRow {
  return {
    contact_method_id: "contact-method-1",
    client_id: "11111111-1111-4111-8111-111111111111",
    contact_name: "Site contact",
    method_type: "PHONE",
    value_normalized: "+447539593155",
    verification_status: "VERIFIED",
    verified_at: "2026-08-15T12:00:00.000Z",
    verified_by: "admin",
    source: "manual_admin_review",
    evidence: "confirmed by owner",
    is_active: true,
    ...overrides,
  };
}

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    client_id: "11111111-1111-4111-8111-111111111111",
    title: "Spencer House",
    status: "assigned",
    ...overrides,
  };
}

test("exact verified phone resolves one client and one active job", async () => {
  const executor = new InMemoryIdentityExecutor();
  executor.contacts.push(verifiedContact());
  executor.jobs.push(job());

  const result = await new SqlJarvisIdentityResolver(executor).resolveWhatsAppSender({
    sourceProvider: "meta_whatsapp",
    normalizedPhone: "+447539593155",
  });

  assert.equal(result.status, "UNIQUE_CLIENT");
  assert.equal(result.clientId, "11111111-1111-4111-8111-111111111111");
  assert.equal(result.jobResolution, "UNIQUE_JOB");
  assert.equal(result.jobId, "job-1");
  assert.equal(result.matchMethod, "VERIFIED_PHONE");
});

test("exact verified phone resolves client only when active jobs are ambiguous", async () => {
  const executor = new InMemoryIdentityExecutor();
  executor.contacts.push(verifiedContact());
  executor.jobs.push(job({ id: "job-1" }), job({ id: "job-2", status: "pending" }));

  const result = await new SqlJarvisIdentityResolver(executor).resolveWhatsAppSender({
    sourceProvider: "meta_whatsapp",
    normalizedPhone: "+447539593155",
  });

  assert.equal(result.status, "UNIQUE_CLIENT");
  assert.equal(result.jobResolution, "JOB_REVIEW_REQUIRED");
  assert.equal("jobId" in result, false);
  assert.equal(result.activeJobs.length, 2);
});

test("same verified phone across multiple clients is ambiguous", async () => {
  const executor = new InMemoryIdentityExecutor();
  executor.contacts.push(
    verifiedContact({ contact_method_id: "contact-method-1", client_id: "11111111-1111-4111-8111-111111111111" }),
    verifiedContact({ contact_method_id: "contact-method-2", client_id: "22222222-2222-4222-8222-222222222222" }),
  );

  const result = await new SqlJarvisIdentityResolver(executor).resolveWhatsAppSender({
    sourceProvider: "meta_whatsapp",
    normalizedPhone: "+447539593155",
  });

  assert.equal(result.status, "AMBIGUOUS");
  assert.deepEqual(result.candidateClientIds.sort(), [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);
});

test("unknown phone and name-only input do not match", async () => {
  const resolver = new SqlJarvisIdentityResolver(new InMemoryIdentityExecutor());

  assert.deepEqual(await resolver.resolveWhatsAppSender({
    sourceProvider: "meta_whatsapp",
    normalizedPhone: "+447000000000",
  }), { status: "NO_MATCH", reason: "no_verified_contact_method_match" });

  assert.deepEqual(await resolver.resolveWhatsAppSender({
    sourceProvider: "meta_whatsapp",
  }), { status: "NO_MATCH", reason: "no_verified_phone_identity_input" });
});

test("resolver route requires existing Jarvis machine authentication", async () => {
  const executor = new InMemoryIdentityExecutor();
  executor.contacts.push(verifiedContact({ method_type: "WHATSAPP" }));
  executor.jobs.push(job());
  const usedNonces = new Set<string>();
  const app = express();
  app.use(createJarvisIdentityResolverRouter({
    enabled: true,
    resolver: new SqlJarvisIdentityResolver(executor),
    keyLookup: (keyId) => keyId === "jarvis" ? "secret" : undefined,
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => Date.parse("2026-08-15T12:00:00.000Z"),
  }));
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const rawBody = JSON.stringify({ sourceProvider: "meta_whatsapp", senderWaId: "447539593155" });
    const response = await fetch(`http://127.0.0.1:${port}${JARVIS_IDENTITY_RESOLVER_ROUTE}`, {
      method: "POST",
      body: rawBody,
      headers: signedHeaders(rawBody),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { status: string; jobId?: string };
    assert.equal(body.status, "UNIQUE_CLIENT");
    assert.equal(body.jobId, "job-1");

    const replay = await fetch(`http://127.0.0.1:${port}${JARVIS_IDENTITY_RESOLVER_ROUTE}`, {
      method: "POST",
      body: rawBody,
      headers: signedHeaders(rawBody, "route-test-nonce-1"),
    });
    assert.equal(replay.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function signedHeaders(rawBody: string, nonce = "route-test-nonce-1"): Record<string, string> {
  const timestamp = String(Math.floor(Date.parse("2026-08-15T12:00:00.000Z") / 1000));
  const contentSha256 = createHash("sha256").update(rawBody).digest("hex");
  const signingInput = buildMachineAuthSigningInput("jarvis", timestamp, nonce, contentSha256);
  return {
    "content-type": "application/json",
    "x-api-key-id": "jarvis",
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-content-sha256": contentSha256,
    "x-signature": createHmac("sha256", "secret").update(signingInput).digest("hex"),
  };
}

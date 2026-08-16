/**
 * Phase 3N — read-only Monzo bank import and reconciliation.
 *
 * Uses only read endpoints from the Monzo API: GET /accounts and
 * GET /transactions. This module must not initiate bank payments, transfers,
 * standing orders, transaction annotations, feed items, webhooks or receipts.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { LabourCostExecutor, LabourCostRow } from "./labour-cost-repository.ts";

export type BankDirection = "INCOMING" | "OUTGOING";
export type ReconciliationTargetType = "LABOUR_SETTLEMENT" | "CONTRACTOR_VALUATION" | "SUPPLIER_INVOICE" | "CLIENT_RECEIVABLE";

export interface MonzoAccount {
  readonly id: string;
  readonly description?: string;
  readonly type?: string;
  readonly currency?: string;
  readonly created?: string;
}

export interface MonzoTransaction {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly created: string;
  readonly description: string;
  readonly notes?: string;
  readonly metadata?: Record<string, unknown>;
  readonly merchant?: string | { readonly name?: string; readonly id?: string } | null;
}

export interface MonzoBalance {
  readonly balance: number;
  readonly total_balance?: number;
  readonly currency: string;
  readonly spend_today?: number;
}

export interface MonzoApi {
  listAccounts(): Promise<readonly MonzoAccount[]>;
  readBalance(input: { readonly accountId: string }): Promise<MonzoBalance>;
  listTransactions(input: { readonly accountId: string; readonly since?: string; readonly before?: string; readonly limit?: number }): Promise<readonly MonzoTransaction[]>;
}

export interface MonzoTokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly token_type: string;
  readonly user_id?: string;
  readonly client_id?: string;
}

interface StoredMonzoTokenPayload {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  readonly userId: string | null;
  readonly expiresAt: string;
}

export interface MonzoOAuthApi {
  exchangeAuthorizationCode(input: { readonly code: string; readonly clientId: string; readonly clientSecret: string; readonly redirectUri: string }): Promise<MonzoTokenResponse>;
  refreshAccessToken(input: { readonly refreshToken: string; readonly clientId: string; readonly clientSecret: string }): Promise<MonzoTokenResponse>;
}

export interface BankSyncInput {
  readonly accountId?: string;
  readonly since?: string;
  readonly before?: string;
  readonly limit?: number;
}

export interface BankSyncResult {
  readonly accountId: string;
  readonly accountsImported: number;
  readonly transactionsSeen: number;
  readonly transactionsInserted: number;
  readonly duplicatesSkipped: number;
}

export interface BankBalanceResult {
  readonly provider: "MONZO";
  readonly providerAccountId: string;
  readonly balance: string;
  readonly totalBalance: string;
  readonly currency: string;
  readonly spendToday: string;
}

export interface MonzoConnectionStatus {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly status: string | null;
  readonly selectedProviderAccountId: string | null;
  readonly tokenExpiresAt: string | null;
  readonly authorizedAt: string | null;
  readonly lastSyncAt: string | null;
  readonly disconnectedAt: string | null;
}

export interface ConfirmBankMatchLine {
  readonly targetType: ReconciliationTargetType;
  readonly targetId: string;
  readonly jobId: string | null;
  readonly counterpartyName: string | null;
  readonly matchedAmount: string;
  readonly evidence: string | null;
}

export interface ConfirmBankMatchInput {
  readonly bankTransactionId: string;
  readonly matches: readonly ConfirmBankMatchLine[];
  readonly confirmedBy: string;
}

export class BankIntegrationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BankIntegrationError";
    this.code = code;
  }
}

export class MonzoApiClient implements MonzoApi {
  private readonly accessToken: string;
  private readonly apiBaseUrl: string;

  constructor(options: { readonly accessToken: string; readonly apiBaseUrl?: string }) {
    this.accessToken = options.accessToken;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.monzo.com";
  }

  async listAccounts(): Promise<readonly MonzoAccount[]> {
    const payload = await this.getJson<{ accounts?: MonzoAccount[] }>("/accounts");
    return payload.accounts ?? [];
  }

  async readBalance(input: { readonly accountId: string }): Promise<MonzoBalance> {
    const params = new URLSearchParams({ account_id: input.accountId });
    return this.getJson<MonzoBalance>(`/balance?${params.toString()}`);
  }

  async listTransactions(input: { readonly accountId: string; readonly since?: string; readonly before?: string; readonly limit?: number }): Promise<readonly MonzoTransaction[]> {
    const params = new URLSearchParams({ account_id: input.accountId });
    if (input.since) params.set("since", input.since);
    if (input.before) params.set("before", input.before);
    if (input.limit !== undefined) params.set("limit", String(Math.min(Math.max(input.limit, 1), 100)));
    const payload = await this.getJson<{ transactions?: MonzoTransaction[] }>(`/transactions?${params.toString()}`);
    return payload.transactions ?? [];
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      throw new BankIntegrationError("MONZO_REQUEST_FAILED", `Monzo read request failed with HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}

export class MonzoOAuthHttpClient implements MonzoOAuthApi {
  private readonly apiBaseUrl: string;

  constructor(apiBaseUrl = "https://api.monzo.com") {
    this.apiBaseUrl = apiBaseUrl;
  }

  async exchangeAuthorizationCode(input: { readonly code: string; readonly clientId: string; readonly clientSecret: string; readonly redirectUri: string }): Promise<MonzoTokenResponse> {
    return this.postToken(new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
    }));
  }

  async refreshAccessToken(input: { readonly refreshToken: string; readonly clientId: string; readonly clientSecret: string }): Promise<MonzoTokenResponse> {
    return this.postToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    }));
  }

  private async postToken(body: URLSearchParams): Promise<MonzoTokenResponse> {
    const response = await fetch(`${this.apiBaseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new BankIntegrationError("MONZO_OAUTH_FAILED", `Monzo OAuth request failed with HTTP ${response.status}`);
    }
    return response.json() as Promise<MonzoTokenResponse>;
  }
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new BankIntegrationError("MONZO_OAUTH_NOT_CONFIGURED", `${key} is not configured`);
  }
  return value.trim();
}

function monzoOAuthConfig(env: NodeJS.ProcessEnv): { clientId: string; clientSecret: string; redirectUri: string; encryptionKey: string; keyVersion: string; authBaseUrl: string; apiBaseUrl: string } {
  return {
    clientId: requiredEnv(env, "MONZO_CLIENT_ID"),
    clientSecret: requiredEnv(env, "MONZO_CLIENT_SECRET"),
    redirectUri: requiredEnv(env, "MONZO_REDIRECT_URI"),
    encryptionKey: requiredEnv(env, "MONZO_TOKEN_ENCRYPTION_KEY"),
    keyVersion: env.MONZO_TOKEN_KEY_VERSION?.trim() || "v1",
    authBaseUrl: env.MONZO_AUTH_BASE_URL?.trim() || "https://auth.monzo.com/",
    apiBaseUrl: env.MONZO_API_BASE_URL?.trim() || "https://api.monzo.com",
  };
}

function decodeEncryptionKey(value: string): Buffer {
  const trimmed = value.trim();
  const hexCandidate = /^[a-fA-F0-9]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : null;
  if (hexCandidate?.length === 32) return hexCandidate;
  const base64Candidate = Buffer.from(trimmed, "base64");
  if (base64Candidate.length === 32) return base64Candidate;
  return createHash("sha256").update(trimmed, "utf8").digest();
}

function encryptTokenPayload(payload: StoredMonzoTokenPayload, keySecret: string): string {
  const key = decodeEncryptionKey(keySecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("MONZO_TOKEN_PAYLOAD", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

function decryptTokenPayload(encrypted: string, keySecret: string): StoredMonzoTokenPayload {
  const envelope = JSON.parse(encrypted) as { v: number; iv: string; tag: string; ciphertext: string };
  if (envelope.v !== 1) throw new BankIntegrationError("MONZO_TOKEN_DECRYPT_FAILED", "Unsupported Monzo token envelope version");
  const decipher = createDecipheriv("aes-256-gcm", decodeEncryptionKey(keySecret), Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from("MONZO_TOKEN_PAYLOAD", "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as StoredMonzoTokenPayload;
}

function tokenPayloadFromResponse(response: MonzoTokenResponse, fallbackRefreshToken: string | null, now = new Date()): StoredMonzoTokenPayload {
  if (!response.refresh_token && !fallbackRefreshToken) throw new BankIntegrationError("MONZO_REFRESH_TOKEN_MISSING", "Monzo did not return a refresh token");
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? fallbackRefreshToken ?? "",
    tokenType: response.token_type,
    userId: response.user_id ?? null,
    expiresAt: new Date(now.getTime() + response.expires_in * 1000).toISOString(),
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function amountFromMinorUnits(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

function directionFromMinorUnits(amountMinor: number): BankDirection {
  if (amountMinor > 0) return "INCOMING";
  if (amountMinor < 0) return "OUTGOING";
  throw new BankIntegrationError("ZERO_AMOUNT_TRANSACTION", "Zero amount bank transactions are not imported");
}

function parseAmount(value: string): number | null {
  return /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : null;
}

function merchantName(transaction: MonzoTransaction): string | null {
  return typeof transaction.merchant === "object" && transaction.merchant !== null && typeof transaction.merchant.name === "string"
    ? transaction.merchant.name
    : null;
}

function counterpartyName(transaction: MonzoTransaction): string | null {
  const merchant = merchantName(transaction);
  if (merchant !== null && merchant.trim().length > 0) return merchant;
  const metadata = transaction.metadata ?? {};
  for (const key of ["counterparty", "payee", "payer", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function reference(transaction: MonzoTransaction): string | null {
  const metadata = transaction.metadata ?? {};
  for (const key of ["reference", "payment_reference", "faster_payment", "notes"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return transaction.notes?.trim() || null;
}

const UPSERT_ACCOUNT_SQL = `
  INSERT INTO bank_accounts (id, provider, provider_account_id, description, account_type, currency_code, raw_provider_payload, imported_at, last_seen_at)
  VALUES ($1, 'MONZO', $2, $3, $4, $5, $6::jsonb, now(), now())
  ON CONFLICT (provider, provider_account_id)
  DO UPDATE SET description = EXCLUDED.description,
                account_type = EXCLUDED.account_type,
                currency_code = EXCLUDED.currency_code,
                raw_provider_payload = EXCLUDED.raw_provider_payload,
                last_seen_at = now()
  RETURNING id
`;

const INSERT_TRANSACTION_SQL = `
  INSERT INTO bank_transactions (
    id, bank_account_id, provider, provider_account_id, provider_transaction_id,
    amount, amount_minor, currency_code, direction, transaction_at, description,
    reference, counterparty_name, merchant_name, raw_provider_payload, imported_at, last_seen_at
  ) VALUES ($1, $2, 'MONZO', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now(), now())
  ON CONFLICT (provider, provider_transaction_id) DO NOTHING
  RETURNING id
`;

const TOUCH_TRANSACTION_SQL = `
  UPDATE bank_transactions
  SET last_seen_at = now(), raw_provider_payload = $3::jsonb
  WHERE provider = 'MONZO' AND provider_transaction_id = $1 AND provider_account_id = $2
`;

const LATEST_CONNECTION_SQL = `
  SELECT id, provider, status, provider_user_id, selected_provider_account_id, encrypted_token_payload,
         token_key_version, token_expires_at, authorized_at, disconnected_at, last_sync_at
  FROM bank_provider_connections
  WHERE provider = 'MONZO'
  ORDER BY created_at DESC
  LIMIT 1
`;

const CONNECTED_CONNECTION_SQL = `
  SELECT id, provider, status, provider_user_id, selected_provider_account_id, encrypted_token_payload,
         token_key_version, token_expires_at, authorized_at, disconnected_at, last_sync_at
  FROM bank_provider_connections
  WHERE provider = 'MONZO' AND status = 'CONNECTED'
  ORDER BY authorized_at DESC
  LIMIT 1
`;

const DISCONNECT_CONNECTED_SQL = `
  UPDATE bank_provider_connections
  SET status = 'DISCONNECTED', encrypted_token_payload = NULL, disconnected_at = now(), updated_at = now()
  WHERE provider = 'MONZO' AND status = 'CONNECTED'
`;

const INSERT_CONNECTED_CONNECTION_SQL = `
  INSERT INTO bank_provider_connections (
    id, provider, status, provider_user_id, provider_client_id_hash, encrypted_token_payload,
    token_key_version, token_expires_at, authorized_at, created_by
  ) VALUES ($1, 'MONZO', 'CONNECTED', $2, $3, $4, $5, $6, now(), $7)
  RETURNING id, status, provider_user_id, selected_provider_account_id, token_expires_at, authorized_at, last_sync_at, disconnected_at
`;

const UPDATE_CONNECTION_TOKEN_SQL = `
  UPDATE bank_provider_connections
  SET encrypted_token_payload = $2,
      token_key_version = $3,
      token_expires_at = $4,
      status = 'CONNECTED',
      updated_at = now()
  WHERE id = $1
`;

const MARK_CONNECTION_REAUTH_REQUIRED_SQL = `
  UPDATE bank_provider_connections
  SET status = 'REAUTH_REQUIRED', updated_at = now()
  WHERE id = $1
`;

const UPDATE_CONNECTION_SYNC_SQL = `
  UPDATE bank_provider_connections
  SET selected_provider_account_id = $2,
      last_sync_at = now(),
      updated_at = now()
  WHERE id = $1
`;

const LIST_TRANSACTIONS_SQL = `
  WITH confirmed AS (
    SELECT bank_transaction_id, SUM(matched_amount) AS matched_amount
    FROM bank_reconciliation_matches
    WHERE match_status = 'CONFIRMED'
    GROUP BY bank_transaction_id
  ), proposed AS (
    SELECT bank_transaction_id, SUM(matched_amount) AS proposed_amount
    FROM bank_reconciliation_matches
    WHERE match_status = 'PROPOSED'
    GROUP BY bank_transaction_id
  )
  SELECT tx.*,
         account.description AS account_description,
         COALESCE(confirmed.matched_amount, 0) AS confirmed_amount,
         COALESCE(proposed.proposed_amount, 0) AS proposed_amount,
         ABS(tx.amount) - COALESCE(confirmed.matched_amount, 0) AS remaining_amount,
         CASE
           WHEN COALESCE(confirmed.matched_amount, 0) >= ABS(tx.amount) THEN 'CONFIRMED'
           WHEN COALESCE(confirmed.matched_amount, 0) > 0 THEN 'PART_CONFIRMED'
           WHEN COALESCE(proposed.proposed_amount, 0) > 0 THEN 'PROPOSED'
           ELSE 'UNMATCHED'
         END AS reconciliation_status
  FROM bank_transactions tx
  LEFT JOIN bank_accounts account ON account.id = tx.bank_account_id
  LEFT JOIN confirmed ON confirmed.bank_transaction_id = tx.id
  LEFT JOIN proposed ON proposed.bank_transaction_id = tx.id
  WHERE ($1::text IS NULL OR tx.direction = $1)
    AND ($2::timestamptz IS NULL OR tx.transaction_at >= $2)
    AND ($3::timestamptz IS NULL OR tx.transaction_at < $3)
  ORDER BY tx.transaction_at DESC, tx.id
  LIMIT $4
`;

const GET_TRANSACTION_SQL = `
  SELECT *, ABS(amount) AS absolute_amount
  FROM bank_transactions
  WHERE id = $1
`;

const OUTGOING_CANDIDATES_SQL = `
  WITH target_matches AS (
    SELECT target_type, target_id, SUM(matched_amount) AS confirmed_amount
    FROM bank_reconciliation_matches
    WHERE match_status = 'CONFIRMED'
    GROUP BY target_type, target_id
  ), subcontractor_paid AS (
    SELECT contractor_valuation_id,
           SUM(CASE WHEN payment_status = 'PAID' THEN payment_amount WHEN payment_status = 'REVERSED' THEN -payment_amount ELSE 0 END) AS paid_amount
    FROM contractor_payments
    WHERE contractor_valuation_id IS NOT NULL AND payment_status IN ('PAID', 'REVERSED')
    GROUP BY contractor_valuation_id
  ), subcontractor_values AS (
    SELECT valuation.id,
           SUM(line.current_value) AS gross_amount
    FROM contractor_valuation valuation
    JOIN contractor_valuation_line line ON line.contractor_valuation_id = valuation.id
    WHERE valuation.status = 'APPROVED'
    GROUP BY valuation.id
  ), supplier_invoice_values AS (
    SELECT invoice.id,
           SUM(line.actual_line_value) AS gross_amount
    FROM supplier_invoice invoice
    JOIN supplier_invoice_line line ON line.supplier_invoice_id = invoice.id
    WHERE invoice.status = 'APPROVED'
    GROUP BY invoice.id
  ), payable AS (
    SELECT 'LABOUR_SETTLEMENT'::text AS target_type,
           settlement.id::text AS target_id,
           settlement.job_id,
           job.title AS job_title,
           payee.name AS counterparty_name,
           settlement.net_amount AS total_amount,
           settlement.id::text AS source_reference
    FROM labour_settlements settlement
    JOIN payees payee ON payee.id = settlement.payee_id
    JOIN jobs job ON job.id = settlement.job_id
    WHERE settlement.status = 'APPROVED'

    UNION ALL

    SELECT 'CONTRACTOR_VALUATION'::text AS target_type,
           valuation.id::text AS target_id,
           valuation.job_id,
           job.title AS job_title,
           contractor.name AS counterparty_name,
           valuation_values.gross_amount - COALESCE(paid.paid_amount, 0) AS total_amount,
           valuation.valuation_number AS source_reference
    FROM contractor_valuation valuation
    JOIN subcontractor_values valuation_values ON valuation_values.id = valuation.id
    JOIN contractors contractor ON contractor.id = valuation.contractor_id
    JOIN jobs job ON job.id = valuation.job_id
    LEFT JOIN subcontractor_paid paid ON paid.contractor_valuation_id = valuation.id

    UNION ALL

    SELECT 'SUPPLIER_INVOICE'::text AS target_type,
           invoice.id::text AS target_id,
           invoice.job_id,
           job.title AS job_title,
           invoice.supplier_name AS counterparty_name,
           invoice_values.gross_amount AS total_amount,
           invoice.invoice_number AS source_reference
    FROM supplier_invoice invoice
    JOIN supplier_invoice_values invoice_values ON invoice_values.id = invoice.id
    JOIN jobs job ON job.id = invoice.job_id
  )
  SELECT payable.*,
         payable.total_amount - COALESCE(target_matches.confirmed_amount, 0) AS remaining_amount,
         CASE WHEN payable.total_amount - COALESCE(target_matches.confirmed_amount, 0) = $1::numeric THEN 'EXACT' ELSE 'PARTIAL' END AS proposed_match_type
  FROM payable
  LEFT JOIN target_matches ON target_matches.target_type = payable.target_type AND target_matches.target_id = payable.target_id
  WHERE payable.total_amount - COALESCE(target_matches.confirmed_amount, 0) > 0
    AND payable.total_amount - COALESCE(target_matches.confirmed_amount, 0) >= $1::numeric
  ORDER BY CASE WHEN payable.total_amount - COALESCE(target_matches.confirmed_amount, 0) = $1::numeric THEN 0 ELSE 1 END,
           payable.counterparty_name,
           payable.source_reference
  LIMIT 20
`;

const INCOMING_CANDIDATES_SQL = `
  WITH target_matches AS (
    SELECT target_type, target_id, SUM(matched_amount) AS confirmed_amount
    FROM bank_reconciliation_matches
    WHERE match_status = 'CONFIRMED'
    GROUP BY target_type, target_id
  )
  SELECT 'CLIENT_RECEIVABLE'::text AS target_type,
         receivable.id::text AS target_id,
         receivable.job_id,
         job.title AS job_title,
         COALESCE(client.name, job.client_name) AS counterparty_name,
         receivable.gross_amount AS total_amount,
         receivable.reference AS source_reference,
         receivable.gross_amount - receivable.amount_received - COALESCE(target_matches.confirmed_amount, 0) AS remaining_amount,
         CASE WHEN receivable.gross_amount - receivable.amount_received - COALESCE(target_matches.confirmed_amount, 0) = $1::numeric THEN 'EXACT' ELSE 'PARTIAL' END AS proposed_match_type
  FROM client_receivable receivable
  JOIN jobs job ON job.id = receivable.job_id
  LEFT JOIN clients client ON client.id = receivable.client_id
  LEFT JOIN target_matches ON target_matches.target_type = 'CLIENT_RECEIVABLE' AND target_matches.target_id = receivable.id::text
  WHERE receivable.status <> 'CANCELLED'
    AND receivable.gross_amount - receivable.amount_received - COALESCE(target_matches.confirmed_amount, 0) > 0
    AND receivable.gross_amount - receivable.amount_received - COALESCE(target_matches.confirmed_amount, 0) >= $1::numeric
  ORDER BY CASE WHEN receivable.gross_amount - receivable.amount_received - COALESCE(target_matches.confirmed_amount, 0) = $1::numeric THEN 0 ELSE 1 END,
           counterparty_name,
           receivable.reference
  LIMIT 20
`;

const INSERT_MATCH_SQL = `
  INSERT INTO bank_reconciliation_matches (
    id, bank_transaction_id, direction, target_type, target_id, job_id, counterparty_name,
    matched_amount, match_status, match_type, evidence, confirmed_by, confirmed_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED', $9, $10, $11, now())
  RETURNING *
`;

const JARVIS_FINANCE_READ_MODEL_SQL = `
  WITH today_bank AS (
    SELECT direction, COALESCE(SUM(ABS(amount)), 0) AS amount
    FROM bank_transactions
    WHERE transaction_at >= date_trunc('day', now())
    GROUP BY direction
  ), week_bank AS (
    SELECT direction, COALESCE(SUM(ABS(amount)), 0) AS amount
    FROM bank_transactions
    WHERE transaction_at >= date_trunc('week', now())
    GROUP BY direction
  ), unmatched AS (
    SELECT tx.id, ABS(tx.amount) - COALESCE(SUM(match.matched_amount), 0) AS remaining_amount
    FROM bank_transactions tx
    LEFT JOIN bank_reconciliation_matches match ON match.bank_transaction_id = tx.id AND match.match_status = 'CONFIRMED'
    GROUP BY tx.id, tx.amount
    HAVING COALESCE(SUM(match.matched_amount), 0) < ABS(tx.amount)
  )
  SELECT
    COALESCE((SELECT amount FROM today_bank WHERE direction = 'INCOMING'), 0) AS bank_in_today,
    COALESCE((SELECT amount FROM today_bank WHERE direction = 'OUTGOING'), 0) AS bank_out_today,
    COALESCE((SELECT amount FROM week_bank WHERE direction = 'OUTGOING'), 0) AS bank_out_this_week,
    COALESCE((SELECT COUNT(*) FROM unmatched), 0) AS unmatched_transaction_count,
    COALESCE((SELECT SUM(remaining_amount) FROM unmatched), 0) AS unmatched_transaction_amount,
    COALESCE((SELECT SUM(gross_amount - amount_received) FROM client_receivable WHERE status <> 'CANCELLED'), 0) AS client_receivable_outstanding,
    COALESCE((SELECT SUM(net_amount) FROM labour_settlements WHERE status = 'APPROVED' AND settlement_kind = 'DIRECT_SELF_EMPLOYED'), 0) AS direct_self_employed_labour_owed,
    COALESCE((SELECT SUM(net_amount) FROM labour_settlements WHERE status = 'APPROVED' AND settlement_kind = 'AGENCY'), 0) AS agency_labour_owed,
    COALESCE((SELECT SUM(line.current_value) FROM contractor_valuation valuation JOIN contractor_valuation_line line ON line.contractor_valuation_id = valuation.id WHERE valuation.status = 'APPROVED'), 0) AS supply_and_fit_subcontractor_owed,
    COALESCE((SELECT SUM(line.actual_line_value) FROM supplier_invoice invoice JOIN supplier_invoice_line line ON line.supplier_invoice_id = invoice.id WHERE invoice.status = 'APPROVED'), 0) AS supplier_invoice_owed,
    COALESCE((SELECT SUM(gross_amount) FROM client_receivable WHERE status <> 'CANCELLED' AND invoice_date >= current_date - INTERVAL '12 months'), 0) AS vat_taxable_turnover_monitor_amount,
    'NOT_REGISTERED_INACTIVE'::text AS vat_status
`;

export class BankReconciliationRepository {
  private readonly executor: LabourCostExecutor;
  private readonly monzo: MonzoApi | null;
  private readonly oauthClient: MonzoOAuthApi;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: { readonly executor: LabourCostExecutor; readonly monzo?: MonzoApi | null; readonly oauthClient?: MonzoOAuthApi; readonly env?: NodeJS.ProcessEnv }) {
    this.executor = options.executor;
    this.monzo = options.monzo ?? null;
    this.env = options.env ?? process.env;
    this.oauthClient = options.oauthClient ?? new MonzoOAuthHttpClient(this.env.MONZO_API_BASE_URL?.trim() || "https://api.monzo.com");
  }

  buildMonzoAuthorizationUrl(state: string): string {
    const config = monzoOAuthConfig(this.env);
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      state,
    });
    return `${config.authBaseUrl}?${params.toString()}`;
  }

  async status(): Promise<MonzoConnectionStatus> {
    const configured = ["MONZO_CLIENT_ID", "MONZO_CLIENT_SECRET", "MONZO_REDIRECT_URI", "MONZO_TOKEN_ENCRYPTION_KEY"].every((key) => (this.env[key]?.trim() ?? "").length > 0);
    const result = await this.executor.query(LATEST_CONNECTION_SQL, []);
    const connection = result.rows[0];
    return {
      configured,
      connected: connection?.status === "CONNECTED",
      status: typeof connection?.status === "string" ? connection.status : null,
      selectedProviderAccountId: typeof connection?.selected_provider_account_id === "string" ? connection.selected_provider_account_id : null,
      tokenExpiresAt: typeof connection?.token_expires_at === "string" ? connection.token_expires_at : null,
      authorizedAt: typeof connection?.authorized_at === "string" ? connection.authorized_at : null,
      lastSyncAt: typeof connection?.last_sync_at === "string" ? connection.last_sync_at : null,
      disconnectedAt: typeof connection?.disconnected_at === "string" ? connection.disconnected_at : null,
    };
  }

  async completeMonzoAuthorization(input: { readonly code: string; readonly authorizedBy: string }): Promise<MonzoConnectionStatus> {
    const config = monzoOAuthConfig(this.env);
    const response = await this.oauthClient.exchangeAuthorizationCode({
      code: input.code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    const payload = tokenPayloadFromResponse(response, null);
    const encrypted = encryptTokenPayload(payload, config.encryptionKey);
    await this.executor.transaction(async (transaction) => {
      await transaction.query(DISCONNECT_CONNECTED_SQL, []);
      await transaction.query(INSERT_CONNECTED_CONNECTION_SQL, [
        randomUUID(),
        payload.userId,
        sha256Hex(config.clientId),
        encrypted,
        config.keyVersion,
        payload.expiresAt,
        input.authorizedBy,
      ]);
    });
    return this.status();
  }

  async disconnectMonzo(): Promise<MonzoConnectionStatus> {
    await this.executor.query(DISCONNECT_CONNECTED_SQL, []);
    return this.status();
  }

  async listMonzoAccounts(): Promise<readonly MonzoAccount[]> {
    const { client } = await this.readOnlyMonzoClient();
    return client.listAccounts();
  }

  async readBankBalance(accountId?: string): Promise<BankBalanceResult> {
    const { client, connection } = await this.readOnlyMonzoClient();
    const savedAccountId = typeof connection?.selected_provider_account_id === "string" ? connection.selected_provider_account_id : undefined;
    const selectedAccountId = accountId ?? savedAccountId;
    const account = selectedAccountId ? { id: selectedAccountId } : (await client.listAccounts())[0];
    if (!account) throw new BankIntegrationError("MONZO_NO_ACCOUNTS", "No Monzo accounts are available to this token");
    const providerAccountId = account.id;
    const balance = await client.readBalance({ accountId: providerAccountId });
    return {
      provider: "MONZO",
      providerAccountId,
      balance: amountFromMinorUnits(balance.balance),
      totalBalance: amountFromMinorUnits(balance.total_balance ?? balance.balance),
      currency: balance.currency,
      spendToday: amountFromMinorUnits(balance.spend_today ?? 0),
    };
  }

  async syncMonzo(input: BankSyncInput): Promise<BankSyncResult> {
    const { client, connection } = await this.readOnlyMonzoClient();
    const accounts = await client.listAccounts();
    if (accounts.length === 0) throw new BankIntegrationError("MONZO_NO_ACCOUNTS", "No Monzo accounts are available to this token");
    const configuredAccountId = input.accountId ?? connection?.selected_provider_account_id ?? this.env.MONZO_ACCOUNT_ID;
    const selectedAccount = configuredAccountId ? accounts.find((account) => account.id === configuredAccountId) : accounts[0];
    if (!selectedAccount) throw new BankIntegrationError("MONZO_ACCOUNT_NOT_FOUND", "Requested Monzo account was not returned by /accounts");

    let accountsImported = 0;
    let selectedBankAccountId = "";
    for (const account of accounts) {
      const result = await this.executor.query(UPSERT_ACCOUNT_SQL, [
        randomUUID(),
        account.id,
        account.description ?? null,
        account.type ?? null,
        account.currency ?? null,
        JSON.stringify(account),
      ]);
      accountsImported += 1;
      if (account.id === selectedAccount.id) selectedBankAccountId = String(result.rows[0].id);
    }

    const transactions = await client.listTransactions({
      accountId: selectedAccount.id,
      since: input.since,
      before: input.before,
      limit: input.limit ?? 100,
    });

    let transactionsInserted = 0;
    let duplicatesSkipped = 0;
    for (const transaction of transactions) {
      if (transaction.amount === 0) continue;
      const result = await this.executor.query(INSERT_TRANSACTION_SQL, [
        randomUUID(),
        selectedBankAccountId,
        selectedAccount.id,
        transaction.id,
        amountFromMinorUnits(transaction.amount),
        transaction.amount,
        transaction.currency,
        directionFromMinorUnits(transaction.amount),
        transaction.created,
        transaction.description,
        reference(transaction),
        counterpartyName(transaction),
        merchantName(transaction),
        JSON.stringify(transaction),
      ]);
      if (result.rows.length > 0) {
        transactionsInserted += 1;
      } else {
        duplicatesSkipped += 1;
        await this.executor.query(TOUCH_TRANSACTION_SQL, [transaction.id, selectedAccount.id, JSON.stringify(transaction)]);
      }
    }

    if (connection !== null) await this.executor.query(UPDATE_CONNECTION_SYNC_SQL, [connection.id, selectedAccount.id]);

    return {
      accountId: selectedAccount.id,
      accountsImported,
      transactionsSeen: transactions.length,
      transactionsInserted,
      duplicatesSkipped,
    };
  }

  async listBankTransactions(filter: { readonly direction?: BankDirection; readonly since?: string; readonly before?: string; readonly limit?: number }): Promise<readonly LabourCostRow[]> {
    const result = await this.executor.query(LIST_TRANSACTIONS_SQL, [filter.direction ?? null, filter.since ?? null, filter.before ?? null, filter.limit ?? 100]);
    return result.rows;
  }

  async getCandidates(bankTransactionId: string): Promise<readonly LabourCostRow[]> {
    const transaction = await this.getTransaction(bankTransactionId);
    const amount = String(transaction.absolute_amount);
    const sql = transaction.direction === "INCOMING" ? INCOMING_CANDIDATES_SQL : OUTGOING_CANDIDATES_SQL;
    const result = await this.executor.query(sql, [amount]);
    return result.rows;
  }

  async confirmMatches(input: ConfirmBankMatchInput): Promise<readonly LabourCostRow[]> {
    if (input.matches.length === 0) throw new BankIntegrationError("MATCH_REQUIRED", "At least one reconciliation match is required");
    const transaction = await this.getTransaction(input.bankTransactionId);
    const transactionRemaining = Number(transaction.absolute_amount);
    let totalMatched = 0;
    const rows: LabourCostRow[] = [];
    for (const line of input.matches) {
      const amount = parseAmount(line.matchedAmount);
      if (amount === null || amount <= 0) throw new BankIntegrationError("MATCH_AMOUNT_INVALID", "matchedAmount must be a positive decimal");
      totalMatched += amount;
      if (transaction.direction === "INCOMING" && line.targetType !== "CLIENT_RECEIVABLE") {
        throw new BankIntegrationError("MATCH_DIRECTION_INVALID", "Incoming bank transactions can only match client receivables");
      }
      if (transaction.direction === "OUTGOING" && line.targetType === "CLIENT_RECEIVABLE") {
        throw new BankIntegrationError("MATCH_DIRECTION_INVALID", "Outgoing bank transactions cannot match client receivables");
      }
    }
    if (totalMatched - transactionRemaining > 0.001) throw new BankIntegrationError("MATCH_EXCEEDS_TRANSACTION", "Confirmed matches exceed the bank transaction amount");

    const matchType = input.matches.length > 1 ? "MULTI_OBLIGATION" : totalMatched === transactionRemaining ? "EXACT" : "PARTIAL";
    for (const line of input.matches) {
      const result = await this.executor.query(INSERT_MATCH_SQL, [
        randomUUID(),
        input.bankTransactionId,
        transaction.direction,
        line.targetType,
        line.targetId,
        line.jobId,
        line.counterpartyName,
        line.matchedAmount,
        matchType,
        line.evidence,
        input.confirmedBy,
      ]);
      rows.push(result.rows[0]);
    }
    return rows;
  }

  async jarvisFinanceReadModel(): Promise<LabourCostRow> {
    const result = await this.executor.query(JARVIS_FINANCE_READ_MODEL_SQL, []);
    const model = result.rows[0] ?? {};
    try {
      const balance = await this.readBankBalance();
      return {
        ...model,
        bank_balance: balance.balance,
        bank_total_balance: balance.totalBalance,
        bank_balance_currency: balance.currency,
        bank_balance_provider: balance.provider,
        bank_balance_provider_account_id: balance.providerAccountId,
      };
    } catch (error) {
      if (error instanceof BankIntegrationError && ["MONZO_NOT_CONNECTED", "MONZO_OAUTH_NOT_CONFIGURED"].includes(error.code)) {
        return {
          ...model,
          bank_balance: null,
          bank_total_balance: null,
          bank_balance_currency: null,
          bank_balance_provider: "MONZO",
          bank_balance_provider_account_id: null,
        };
      }
      throw error;
    }
  }

  private async getTransaction(id: string): Promise<LabourCostRow> {
    const result = await this.executor.query(GET_TRANSACTION_SQL, [id]);
    if (result.rows.length === 0) throw new BankIntegrationError("BANK_TRANSACTION_NOT_FOUND", "Bank transaction not found");
    return result.rows[0];
  }

  private async readOnlyMonzoClient(): Promise<{ client: MonzoApi; connection: LabourCostRow | null }> {
    if (this.monzo !== null) return { client: this.monzo, connection: null };
    const connection = await this.connectedConnection();
    const config = monzoOAuthConfig(this.env);
    const encrypted = String(connection.encrypted_token_payload ?? "");
    if (encrypted.length === 0) throw new BankIntegrationError("MONZO_NOT_CONNECTED", "Monzo is not connected");
    let payload = decryptTokenPayload(encrypted, config.encryptionKey);
    const expiresAt = new Date(payload.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000) {
      payload = await this.refreshStoredToken(connection, payload, config);
    }
    return { client: new MonzoApiClient({ accessToken: payload.accessToken, apiBaseUrl: config.apiBaseUrl }), connection };
  }

  private async connectedConnection(): Promise<LabourCostRow> {
    const result = await this.executor.query(CONNECTED_CONNECTION_SQL, []);
    if (result.rows.length === 0) throw new BankIntegrationError("MONZO_NOT_CONNECTED", "Monzo is not connected");
    return result.rows[0];
  }

  private async refreshStoredToken(connection: LabourCostRow, payload: StoredMonzoTokenPayload, config: ReturnType<typeof monzoOAuthConfig>): Promise<StoredMonzoTokenPayload> {
    try {
      const response = await this.oauthClient.refreshAccessToken({
        refreshToken: payload.refreshToken,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      });
      const refreshed = tokenPayloadFromResponse(response, payload.refreshToken);
      await this.executor.query(UPDATE_CONNECTION_TOKEN_SQL, [
        connection.id,
        encryptTokenPayload(refreshed, config.encryptionKey),
        config.keyVersion,
        refreshed.expiresAt,
      ]);
      return refreshed;
    } catch (error) {
      await this.executor.query(MARK_CONNECTION_REAUTH_REQUIRED_SQL, [connection.id]);
      throw error;
    }
  }
}

export const monzoInternalsForTest = {
  amountFromMinorUnits,
  directionFromMinorUnits,
  counterpartyName,
  reference,
  encryptTokenPayload,
  decryptTokenPayload,
  tokenPayloadFromResponse,
};

import { test } from "node:test";
import assert from "node:assert/strict";
import { BankIntegrationError, BankReconciliationRepository, monzoInternalsForTest, type MonzoApi, type MonzoOAuthApi } from "../server/monzo-bank.ts";
import type { LabourCostExecutor, LabourCostRow, LabourCostTransaction } from "../server/labour-cost-repository.ts";

interface QueryCall {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function createExecutor(seed: { readonly duplicateTransactionIds?: readonly string[]; readonly transaction?: LabourCostRow; readonly connection?: LabourCostRow } = {}) {
  const calls: QueryCall[] = [];
  const duplicateTransactionIds = new Set(seed.duplicateTransactionIds ?? []);
  const matches: LabourCostRow[] = [];
  let connection: LabourCostRow | undefined = seed.connection;
  const query = async (sql: string, parameters: readonly unknown[]) => {
    calls.push({ sql, parameters });
    if (/FROM bank_provider_connections/i.test(sql) && /status = 'CONNECTED'/i.test(sql)) return { rows: connection?.status === "CONNECTED" ? [connection] : [] };
    if (/FROM bank_provider_connections/i.test(sql)) return { rows: connection ? [connection] : [] };
    if (/UPDATE bank_provider_connections\s+SET status = 'DISCONNECTED'/i.test(sql)) {
      if (connection?.status === "CONNECTED") connection = { ...connection, status: "DISCONNECTED", encrypted_token_payload: null, disconnected_at: new Date().toISOString() };
      return { rows: [] };
    }
    if (/INSERT INTO bank_provider_connections/i.test(sql)) {
      connection = {
        id: parameters[0],
        status: "CONNECTED",
        provider_user_id: parameters[1],
        provider_client_id_hash: parameters[2],
        encrypted_token_payload: parameters[3],
        token_key_version: parameters[4],
        token_expires_at: parameters[5],
        authorized_at: new Date().toISOString(),
        created_by: parameters[6],
      };
      return { rows: [connection] };
    }
    if (/UPDATE bank_provider_connections\s+SET encrypted_token_payload/i.test(sql)) {
      connection = { ...connection, encrypted_token_payload: parameters[1], token_key_version: parameters[2], token_expires_at: parameters[3], status: "CONNECTED" };
      return { rows: [] };
    }
    if (/UPDATE bank_provider_connections\s+SET selected_provider_account_id/i.test(sql)) {
      connection = { ...connection, selected_provider_account_id: parameters[1], last_sync_at: new Date().toISOString() };
      return { rows: [] };
    }
    if (/INSERT INTO bank_accounts/i.test(sql)) return { rows: [{ id: "bank-account-1" }] };
    if (/INSERT INTO bank_transactions/i.test(sql)) {
      if (duplicateTransactionIds.has(String(parameters[3]))) return { rows: [] };
      return { rows: [{ id: parameters[0] }] };
    }
    if (/UPDATE bank_transactions/i.test(sql)) return { rows: [] };
    if (/SELECT \*, ABS\(amount\) AS absolute_amount/i.test(sql)) return { rows: [seed.transaction ?? { id: parameters[0], direction: "OUTGOING", absolute_amount: "125.50" }] };
    if (/INSERT INTO bank_reconciliation_matches/i.test(sql)) {
      const row = { id: parameters[0], bank_transaction_id: parameters[1], direction: parameters[2], target_type: parameters[3], target_id: parameters[4], matched_amount: parameters[7], match_status: "CONFIRMED", match_type: parameters[8] };
      matches.push(row);
      return { rows: [row] };
    }
    if (/vat_taxable_turnover_monitor_amount/i.test(sql)) {
      return {
        rows: [{
          bank_in_today: "500.00",
          bank_out_this_week: "125.00",
          unmatched_transaction_count: "2",
          client_receivable_outstanding: "1500.00",
          direct_self_employed_labour_owed: "100.00",
          agency_labour_owed: "200.00",
          supply_and_fit_subcontractor_owed: "300.00",
          supplier_invoice_owed: "400.00",
          vat_taxable_turnover_monitor_amount: "1500.00",
          vat_status: "NOT_REGISTERED_INACTIVE",
        }],
      };
    }
    if (/FROM bank_transactions tx/i.test(sql)) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const executor: LabourCostExecutor = {
    query,
    async transaction<T>(work: (transaction: LabourCostTransaction) => Promise<T>): Promise<T> {
      return work({ query });
    },
  };
  return { executor, calls, matches, getConnection: () => connection };
}

function fakeMonzo(): MonzoApi {
  return {
    async listAccounts() {
      return [{ id: "acc_1", description: "Sculpt Projects", type: "uk_business", currency: "GBP" }];
    },
    async readBalance() {
      return { balance: 123456, total_balance: 123456, currency: "GBP", spend_today: -1200 };
    },
    async listTransactions() {
      return [
        { id: "tx_out", amount: -12550, currency: "GBP", created: "2026-08-14T09:00:00Z", description: "SUPPLIER LTD", metadata: { reference: "INV-7" } },
        { id: "tx_in", amount: 200000, currency: "GBP", created: "2026-08-14T10:00:00Z", description: "CLIENT RECEIPT", metadata: { payer: "Spencer House Client" } },
      ];
    },
  };
}

function fakeOAuth(): MonzoOAuthApi {
  return {
    async exchangeAuthorizationCode() {
      return { access_token: "access-token-secret", refresh_token: "refresh-token-secret", expires_in: 3600, token_type: "Bearer", user_id: "user_1", client_id: "client_1" };
    },
    async refreshAccessToken() {
      return { access_token: "rotated-access-token-secret", refresh_token: "rotated-refresh-token-secret", expires_in: 3600, token_type: "Bearer", user_id: "user_1", client_id: "client_1" };
    },
  };
}

const oauthEnv = {
  MONZO_CLIENT_ID: "client_1",
  MONZO_CLIENT_SECRET: "client-secret",
  MONZO_REDIRECT_URI: "https://example.com/api/bank/monzo/callback",
  MONZO_TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  MONZO_AUTH_BASE_URL: "https://auth.monzo.com/",
  MONZO_API_BASE_URL: "https://api.monzo.test",
} as NodeJS.ProcessEnv;

test("Monzo transactions are normalized from signed minor units without payment side effects", () => {
  assert.equal(monzoInternalsForTest.amountFromMinorUnits(-12550), "-125.50");
  assert.equal(monzoInternalsForTest.amountFromMinorUnits(200000), "2000.00");
  assert.equal(monzoInternalsForTest.directionFromMinorUnits(-1), "OUTGOING");
  assert.equal(monzoInternalsForTest.directionFromMinorUnits(1), "INCOMING");
  assert.throws(() => monzoInternalsForTest.directionFromMinorUnits(0), BankIntegrationError);
});

test("Monzo sync imports accounts and skips duplicate provider transaction ids", async () => {
  const { executor, calls } = createExecutor({ duplicateTransactionIds: ["tx_in"] });
  const repository = new BankReconciliationRepository({ executor, monzo: fakeMonzo() });

  const result = await repository.syncMonzo({ accountId: "acc_1" });

  assert.equal(result.accountsImported, 1);
  assert.equal(result.transactionsSeen, 2);
  assert.equal(result.transactionsInserted, 1);
  assert.equal(result.duplicatesSkipped, 1);
  assert.equal(calls.some((call) => /INSERT INTO bank_transactions/i.test(call.sql) && call.parameters[3] === "tx_out"), true);
  assert.equal(calls.some((call) => /UPDATE bank_transactions/i.test(call.sql) && call.parameters[0] === "tx_in"), true);
  assert.equal(calls.some((call) => /deposit|withdraw|payment|transfer/i.test(call.sql)), false);
});

test("Monzo OAuth URL includes state and does not expose client secret", () => {
  const { executor } = createExecutor();
  const repository = new BankReconciliationRepository({ executor, oauthClient: fakeOAuth(), env: oauthEnv });

  const url = repository.buildMonzoAuthorizationUrl("state-123");

  assert.match(url, /^https:\/\/auth\.monzo\.com\//);
  assert.match(url, /state=state-123/);
  assert.match(url, /response_type=code/);
  assert.doesNotMatch(url, /client-secret/);
});

test("Monzo OAuth callback stores encrypted tokens without plaintext reusable credentials", async () => {
  const { executor, getConnection } = createExecutor();
  const repository = new BankReconciliationRepository({ executor, oauthClient: fakeOAuth(), env: oauthEnv });

  const status = await repository.completeMonzoAuthorization({ code: "auth-code", authorizedBy: "admin" });
  const connection = getConnection();

  assert.equal(status.connected, true);
  assert.equal(connection?.status, "CONNECTED");
  assert.equal(typeof connection?.encrypted_token_payload, "string");
  assert.doesNotMatch(String(connection?.encrypted_token_payload), /access-token-secret|refresh-token-secret/);
  const decrypted = monzoInternalsForTest.decryptTokenPayload(String(connection?.encrypted_token_payload), oauthEnv.MONZO_TOKEN_ENCRYPTION_KEY!);
  assert.equal(decrypted.accessToken, "access-token-secret");
  assert.equal(decrypted.refreshToken, "refresh-token-secret");
});

test("expired Monzo access token is refreshed and rotated before read-only account access", async () => {
  const expiredPayload = monzoInternalsForTest.tokenPayloadFromResponse({ access_token: "old-access", refresh_token: "old-refresh", expires_in: -60, token_type: "Bearer", user_id: "user_1" }, null);
  const encrypted = monzoInternalsForTest.encryptTokenPayload(expiredPayload, oauthEnv.MONZO_TOKEN_ENCRYPTION_KEY!);
  const { executor, getConnection } = createExecutor({
    connection: {
      id: "connection-1",
      status: "CONNECTED",
      encrypted_token_payload: encrypted,
      token_expires_at: expiredPayload.expiresAt,
      selected_provider_account_id: "acc_1",
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ accounts: [{ id: "acc_1", description: "Sculpt Projects" }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const repository = new BankReconciliationRepository({ executor, oauthClient: fakeOAuth(), env: oauthEnv });

    const accounts = await repository.listMonzoAccounts();

    assert.equal(accounts.length, 1);
    const rotated = monzoInternalsForTest.decryptTokenPayload(String(getConnection()?.encrypted_token_payload), oauthEnv.MONZO_TOKEN_ENCRYPTION_KEY!);
    assert.equal(rotated.accessToken, "rotated-access-token-secret");
    assert.equal(rotated.refreshToken, "rotated-refresh-token-secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirmed reconciliation supports one outgoing bank transaction against multiple obligations", async () => {
  const { executor, matches } = createExecutor({ transaction: { id: "bank-tx-1", direction: "OUTGOING", absolute_amount: "300.00" } });
  const repository = new BankReconciliationRepository({ executor, monzo: fakeMonzo() });

  const confirmed = await repository.confirmMatches({
    bankTransactionId: "bank-tx-1",
    confirmedBy: "admin",
    matches: [
      { targetType: "LABOUR_SETTLEMENT", targetId: "settlement-1", jobId: "job-1", counterpartyName: "Worker A", matchedAmount: "100.00", evidence: "Bank batch" },
      { targetType: "SUPPLIER_INVOICE", targetId: "invoice-1", jobId: "job-1", counterpartyName: "Supplier B", matchedAmount: "200.00", evidence: "Bank batch" },
    ],
  });

  assert.equal(confirmed.length, 2);
  assert.equal(matches.every((match) => match.match_type === "MULTI_OBLIGATION"), true);
});

test("incoming transactions cannot be matched to outgoing obligations", async () => {
  const { executor } = createExecutor({ transaction: { id: "bank-tx-2", direction: "INCOMING", absolute_amount: "100.00" } });
  const repository = new BankReconciliationRepository({ executor, monzo: fakeMonzo() });

  await assert.rejects(
    () => repository.confirmMatches({
      bankTransactionId: "bank-tx-2",
      confirmedBy: "admin",
      matches: [{ targetType: "SUPPLIER_INVOICE", targetId: "invoice-1", jobId: "job-1", counterpartyName: "Supplier B", matchedAmount: "100.00", evidence: null }],
    }),
    (error) => error instanceof BankIntegrationError && error.code === "MATCH_DIRECTION_INVALID",
  );
});

test("Jarvis finance read model distinguishes labour types and keeps VAT inactive without fabricating bank balance", async () => {
  const { executor } = createExecutor();
  const repository = new BankReconciliationRepository({ executor, oauthClient: fakeOAuth(), env: oauthEnv });

  const model = await repository.jarvisFinanceReadModel();

  assert.equal(model.direct_self_employed_labour_owed, "100.00");
  assert.equal(model.agency_labour_owed, "200.00");
  assert.equal(model.supply_and_fit_subcontractor_owed, "300.00");
  assert.equal(model.supplier_invoice_owed, "400.00");
  assert.equal(model.vat_status, "NOT_REGISTERED_INACTIVE");
  assert.equal(model.bank_balance, null);
});

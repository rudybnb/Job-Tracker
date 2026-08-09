import { type Router } from "express";
import postgres from "postgres";
import type { IntegrationShadowRepository } from "./integration-shadow-repository.ts";
import {
  createJarvisShadowIntegrationRouter,
  type JarvisShadowRouteOptions,
} from "./integration-shadow-route.ts";
import {
  SqlIntegrationShadowRepository,
  type IntegrationSqlExecutor,
  type IntegrationSqlQueryResult,
  type IntegrationSqlRow,
  type IntegrationSqlTransaction,
} from "./integration-shadow-sql-repository.ts";

export const JARVIS_SHADOW_API_KEY_ID_ENV = "JARVIS_SHADOW_API_KEY_ID";
export const JARVIS_SHADOW_API_KEY_SECRET_ENV = "JARVIS_SHADOW_API_KEY_SECRET";

export class PostgresIntegrationSqlExecutor implements IntegrationSqlExecutor {
  private readonly sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    const rows = await this.sql.unsafe(sql, parameters as any[]);
    return { rows: rows as readonly IntegrationSqlRow[] };
  }

  async transaction<T>(work: (transaction: IntegrationSqlTransaction) => Promise<T>): Promise<T> {
    const result = await this.sql.begin(async (transaction) => {
      const adapter: IntegrationSqlTransaction = {
        query: (query, parameters) =>
          transaction
            .unsafe(query, parameters as any[])
            .then((rows) => ({ rows: rows as readonly IntegrationSqlRow[] })),
      };
      return work(adapter);
    });
    return result as T;
  }
}

const DISABLED_REPOSITORY: IntegrationShadowRepository = {
  findEventReceipt: async () => undefined,
  findChangeOrderRevision: async () => undefined,
  storeAcceptedChange: async () => ({ outcome: "stored" }),
};

function configuredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

export function createLocalJarvisShadowRouter(sql: postgres.Sql): Router {
  const keyId = configuredValue(process.env[JARVIS_SHADOW_API_KEY_ID_ENV]);
  const secret = configuredValue(process.env[JARVIS_SHADOW_API_KEY_SECRET_ENV]);

  if (keyId === undefined || secret === undefined) {
    return createJarvisShadowIntegrationRouter({
      enabled: false,
      repository: DISABLED_REPOSITORY,
      keyLookup: () => undefined,
      nonceLookup: () => false,
      nonceStore: () => undefined,
    });
  }

  const usedNonces = new Set<string>();
  const options: JarvisShadowRouteOptions = {
    enabled: true,
    repository: new SqlIntegrationShadowRepository({
      executor: new PostgresIntegrationSqlExecutor(sql),
    }),
    keyLookup: (candidate) => (candidate === keyId ? secret : undefined),
    nonceLookup: (candidateKeyId, nonce) => usedNonces.has(`${candidateKeyId}:${nonce}`),
    nonceStore: (candidateKeyId, nonce) => {
      usedNonces.add(`${candidateKeyId}:${nonce}`);
    },
  };
  return createJarvisShadowIntegrationRouter(options);
}

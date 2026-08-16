/**
 * Phase 3I — Postgres executor adapter for the labour cost engine/repository.
 *
 * Bridges the pure LabourCostExecutor/transaction interfaces used by
 * labour-cost-repository and labour-cost-review to the postgres-js client that
 * backs the live application, mirroring the integration executor adapter.
 */

import postgres from "postgres";
import type {
  LabourCostExecutor,
  LabourCostQueryResult,
  LabourCostRow,
  LabourCostTransaction,
} from "./labour-cost-repository.ts";

export class PostgresLabourCostExecutor implements LabourCostExecutor {
  private readonly sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  async query(sql: string, parameters: readonly unknown[]): Promise<LabourCostQueryResult> {
    const rows = await this.sql.unsafe(sql, parameters as never[]);
    return { rows: rows as readonly LabourCostRow[] };
  }

  async transaction<T>(work: (transaction: LabourCostTransaction) => Promise<T>): Promise<T> {
    const result = await this.sql.begin(async (transaction) => {
      const adapter: LabourCostTransaction = {
        query: (query, parameters) =>
          transaction
            .unsafe(query, parameters as never[])
            .then((rows) => ({ rows: rows as readonly LabourCostRow[] })),
      };
      return work(adapter);
    });
    return result as T;
  }
}
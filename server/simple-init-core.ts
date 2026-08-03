export type SqlExecutor = (query: string, params?: unknown[]) => Promise<unknown>;

export function simpleInitStatements(): ReadonlyArray<string> {
  return [
    `CREATE TABLE IF NOT EXISTS simple_users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contractor',
  full_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_simple_users_username_lower ON simple_users (LOWER(username));`,
    `CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  full_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username_lower ON staff (LOWER(username));`,
  ];
}

export interface SimpleInitSeedOptions {
  adminPasswordHash?: string;
}

export async function simpleInitCore(
  executor: SqlExecutor,
  options?: SimpleInitSeedOptions,
): Promise<void> {
  // 1. DDL Statements (Tables & Indexes)
  for (const statement of simpleInitStatements()) {
    await executor(statement);
  }

  // 2. Parameterized Idempotent Seed Inserts
  if (options?.adminPasswordHash) {
    await executor(
      `INSERT INTO staff (username, password, role, full_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING;`,
      ["admin", options.adminPasswordHash, "admin", "System Administrator"],
    );
  }
}

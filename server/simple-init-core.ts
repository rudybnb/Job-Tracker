export type SqlExecutor = (query: string) => Promise<unknown>;

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
    `CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  full_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);`,
    `INSERT INTO staff (username, password, role, full_name)
VALUES ('admin', 'admin123', 'admin', 'System Administrator')
ON CONFLICT (username) DO NOTHING;`,
    `INSERT INTO simple_users (username, password, role, full_name)
VALUES ('rudy', 'rudy123', 'contractor', 'Rudy Test')
ON CONFLICT (username) DO NOTHING;`,
  ];
}

export async function simpleInitCore(executor: SqlExecutor): Promise<void> {
  for (const statement of simpleInitStatements()) {
    await executor(statement);
  }
}

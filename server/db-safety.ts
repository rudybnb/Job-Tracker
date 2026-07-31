export interface DbSafetyResult {
  allowed: boolean;
  reason: string;
}

const PLACEHOLDER_HOST_PATTERNS: RegExp[] = [
  /your[-_.]/i,
  /placeholder/i,
  /changeme/i,
  /replace[-_.]me/i,
  /example/i,
  /xxxxxx/i,
  /connection[-_.]string/i,
];

const PLACEHOLDER_HOST_NAMES: ReadonlySet<string> = new Set([
  "host",
  "dbhost",
  "db-host",
  "db_host",
  "database",
  "db-name",
  "db_name",
  "dbname",
  "your-db",
  "your_db",
  "yourdb",
  "your-host",
  "your_host",
  "yourhost",
  "your-database",
  "your_database",
  "yourdatabase",
  "my-db",
  "my_db",
  "mydb",
  "app-db",
  "app_db",
  "appdb",
  "main-db",
  "main_db",
  "maindb",
  "postgres-host",
  "postgresql-host",
]);

const PLACEHOLDER_VALUE_PATTERNS: RegExp[] = [
  /^DATABASE_URL$/i,
  /connection[-_.]?string/i,
  /database[-_.]?url/i,
];

function isPlaceholderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return false;
  }
  for (const pattern of PLACEHOLDER_HOST_PATTERNS) {
    if (pattern.test(host)) {
      return true;
    }
  }
  return PLACEHOLDER_HOST_NAMES.has(host);
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function destructiveInitEnabled(): boolean {
  const flag = process.env.ALLOW_DESTRUCTIVE_INIT;
  return flag === "true" && !isProduction();
}

export function validateDatabaseUrl(url: string | undefined): DbSafetyResult {
  if (url === undefined || url === null) {
    return { allowed: false, reason: "DATABASE_URL is not set." };
  }

  const value = url.trim();
  if (value.length === 0) {
    return { allowed: false, reason: "DATABASE_URL is empty." };
  }

  if (/\s/.test(value)) {
    return { allowed: false, reason: "DATABASE_URL contains whitespace and is not a valid URL." };
  }

  if (!/^postgres(ql)?:\/\//i.test(value)) {
    return { allowed: false, reason: "DATABASE_URL must be a postgres:// or postgresql:// URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { allowed: false, reason: "DATABASE_URL is not a valid URL." };
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { allowed: false, reason: "DATABASE_URL must use the postgres:// or postgresql:// protocol." };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { allowed: false, reason: "DATABASE_URL has no host." };
  }

  if (parsed.port) {
    const portNumber = Number(parsed.port);
    if (!/^\d{1,5}$/.test(parsed.port) || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return { allowed: false, reason: "DATABASE_URL has an invalid port." };
    }
  }

  if (isPlaceholderHost(hostname)) {
    return { allowed: false, reason: "DATABASE_URL host looks like a placeholder." };
  }

  for (const pattern of PLACEHOLDER_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      return { allowed: false, reason: "DATABASE_URL looks like a placeholder rather than a real connection string." };
    }
  }

  return { allowed: true, reason: "OK" };
}

export async function runDestructiveInitialization(
  actions: ReadonlyArray<() => Promise<void>>,
): Promise<DbSafetyResult> {
  if (!destructiveInitEnabled()) {
    if (isProduction()) {
      console.log("🚫 Destructive database initialization refused: production always disables it.");
    } else {
      console.log(
        "⏭️  Destructive database initialization skipped: disabled by default. " +
        "It only runs when ALLOW_DESTRUCTIVE_INIT=true and NODE_ENV is not production.",
      );
    }
    return { allowed: false, reason: "Destructive initialization is disabled." };
  }

  const urlCheck = validateDatabaseUrl(process.env.DATABASE_URL);
  if (!urlCheck.allowed) {
    console.error(`🚫 Refusing destructive database initialization: ${urlCheck.reason}`);
    return { allowed: false, reason: urlCheck.reason };
  }

  console.log("⚠️  Destructive database initialization ENABLED (ALLOW_DESTRUCTIVE_INIT=true, non-production).");
  for (const action of actions) {
    await action();
  }
  return { allowed: true, reason: "Destructive initialization executed." };
}

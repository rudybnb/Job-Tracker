import "dotenv/config";
import postgres from "postgres";
import { validateDatabaseUrl, isProduction } from "../server/db-safety.ts";
import { schemaBootstrapCore } from "../server/schema-bootstrap-core.ts";

export function sanitizeLogMessage(msg: string): string {
  if (!msg) return "";
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://<redacted_credentials>")
    .replace(/password\s*=\s*['"]?[^'"\s]+['"]?/gi, "password=<redacted>")
    .replace(/secret-user/gi, "<redacted>")
    .replace(/SuperSecretPassword/gi, "<redacted>")
    .replace(/SensitiveToken/gi, "<redacted>");
}

export async function checkDatabaseEmptiness(client: postgres.Sql): Promise<{ isEmpty: boolean; foundObjects: string[] }> {
  const publicTables = await client`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `;
  const drizzleTables = await client`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'drizzle'
  `;
  const views = await client`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
  `;
  const matviews = await client`
    SELECT matviewname as table_name
    FROM pg_matviews
    WHERE schemaname = 'public'
  `;
  const sequences = await client`
    SELECT sequence_name as table_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  `;
  const enums = await client`
    SELECT typname as table_name
    FROM pg_type
    WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND typtype = 'e'
  `;

  const rawFound: string[] = [];

  for (const row of [...publicTables, ...drizzleTables, ...views, ...matviews, ...sequences, ...enums]) {
    const name = row.table_name;
    if (
      name &&
      !name.startsWith("pg_") &&
      name !== "spatial_ref_sys" &&
      name !== "pgcrypto"
    ) {
      rawFound.push(name);
    }
  }

  const foundObjects = Array.from(new Set(rawFound));

  return {
    isEmpty: foundObjects.length === 0,
    foundObjects,
  };
}

/**
 * Standalone Manual Schema Bootstrap Command (Phase 0C1)
 * MUST NEVER RUN AUTOMATICALLY ON APPLICATION STARTUP OR BUILD.
 * Usage:
 *   npm run db:bootstrap-empty -- --confirm-empty-database
 */
export async function runStandaloneBootstrap(args: string[] = process.argv): Promise<void> {
  const hasConfirmFlag = args.includes("--confirm-empty-database");
  const allowProduction = args.includes("--allow-production");

  if (!hasConfirmFlag) {
    const msg = "🚫 Refusing schema bootstrap: missing required '--confirm-empty-database' flag.";
    console.error(msg);
    throw new Error("Missing required '--confirm-empty-database' flag.");
  }

  if (isProduction() && !allowProduction) {
    const msg = "🚫 Refusing schema bootstrap: production execution refused without '--allow-production' flag.";
    console.error(msg);
    throw new Error("Production execution refused without '--allow-production' flag.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  const validation = validateDatabaseUrl(databaseUrl);

  if (!validation.allowed) {
    const sanitizedReason = sanitizeLogMessage(validation.reason);
    console.error(`🚫 Refusing schema bootstrap: ${sanitizedReason}`);
    throw new Error(`Invalid DATABASE_URL: ${sanitizedReason}`);
  }

  console.log("🔍 Running preflight empty-database check...");
  const client = postgres(databaseUrl!, { ssl: isProduction() ? "require" : false });

  try {
    const preflight = await checkDatabaseEmptiness(client);
    if (!preflight.isEmpty) {
      const msg = `🚫 Refusing schema bootstrap: target database is not empty. Found ${preflight.foundObjects.length} existing objects: [${preflight.foundObjects.slice(0, 5).join(", ")}${preflight.foundObjects.length > 5 ? ", ..." : ""}]`;
      console.error(msg);
      throw new Error(`Target database is not empty (${preflight.foundObjects.length} existing objects found).`);
    }

    console.log("🛠️ Starting single-client manual schema bootstrap sequence...");

    await schemaBootstrapCore(
      async (query: string) => {
        await client.unsafe(query);
      },
      async () => {
        const inTxCheck = await checkDatabaseEmptiness(client);
        return inTxCheck.isEmpty;
      },
    );

    console.log("✅ Schema bootstrap completed successfully.");
  } catch (error: any) {
    const sanitized = sanitizeLogMessage(error?.message ? String(error.message) : "Bootstrap failed.");
    console.error(`❌ Bootstrap command failed: ${sanitized}`);
    throw new Error(sanitized);
  } finally {
    await client.end();
  }
}

// CLI entrypoint execution check
if (import.meta.url.startsWith("file:") && process.argv[1] && process.argv[1].endsWith("bootstrap-schema.ts")) {
  runStandaloneBootstrap(process.argv).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

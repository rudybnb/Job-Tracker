import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

export interface MigrationJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface MigrationJournal {
  version: string;
  dialect: string;
  entries: MigrationJournalEntry[];
}

export interface CanonicalMigrationFile {
  idx: number;
  tag: string;
  filename: string;
  when: number;
  hash: string;
  statements: string[];
}

/**
 * Loads committed canonical Drizzle migrations following migrations/meta/_journal.json order (by idx).
 * Does NOT rely on naive filename sorting.
 */
export function getCanonicalMigrationJournal(customJournalPath?: string): MigrationJournal {
  const journalPath = customJournalPath ?? resolve(process.cwd(), "migrations", "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error(`Drizzle migration journal not found at ${journalPath}`);
  }
  const content = readFileSync(journalPath, "utf8");
  let journal: MigrationJournal;
  try {
    journal = JSON.parse(content) as MigrationJournal;
  } catch {
    throw new Error(`Invalid migration journal structure: failed to parse JSON at ${journalPath}`);
  }

  if (!journal || typeof journal !== "object" || !Array.isArray(journal.entries)) {
    throw new Error(`Invalid migration journal structure: missing 'entries' array at ${journalPath}`);
  }

  // Validate journal entries for duplicate indices and duplicate tags
  const seenIdx = new Set<number>();
  const seenTag = new Set<string>();
  for (const entry of journal.entries) {
    if (seenIdx.has(entry.idx)) {
      throw new Error(`Duplicate migration journal index detected: ${entry.idx}`);
    }
    seenIdx.add(entry.idx);

    if (seenTag.has(entry.tag)) {
      throw new Error(`Duplicate migration journal tag detected: ${entry.tag}`);
    }
    seenTag.add(entry.tag);
  }

  return journal;
}

/**
 * Returns canonical migration DDL statements in strict journal index order.
 * Calculates sha256 hash matching Drizzle's exact migrator hash requirement.
 * Rejects unjournalled, missing, or empty migration SQL files.
 */
export function getCanonicalMigrationFiles(customMigrationsDir?: string, customJournalPath?: string): CanonicalMigrationFile[] {
  const journal = getCanonicalMigrationJournal(customJournalPath);
  const sortedEntries = [...journal.entries].sort((a, b) => a.idx - b.idx);
  const migrationsDir = customMigrationsDir ?? resolve(process.cwd(), "migrations");

  // Validate no unjournalled .sql files exist in migrations directory
  const journalTags = new Set(journal.entries.map((e) => `${e.tag}.sql`));
  const dirFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const unjournalled = dirFiles.filter((f) => !journalTags.has(f));
  if (unjournalled.length > 0) {
    throw new Error(
      `Unjournalled migration SQL files detected in migrations directory: [${unjournalled.join(", ")}]. All migration files must be recorded in _journal.json.`,
    );
  }

  const result: CanonicalMigrationFile[] = [];

  for (const entry of sortedEntries) {
    const filename = `${entry.tag}.sql`;
    const filePath = join(migrationsDir, filename);

    if (!existsSync(filePath)) {
      throw new Error(`Migration SQL file referenced in journal not found: ${filePath}`);
    }

    const content = readFileSync(filePath, "utf8");
    if (content.trim().length === 0) {
      throw new Error(`Empty migration SQL file detected for journal entry '${entry.tag}': ${filePath}`);
    }

    const hash = createHash("sha256").update(content).digest("hex");
    const rawStatements = content
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    result.push({
      idx: entry.idx,
      tag: entry.tag,
      filename,
      when: entry.when,
      hash,
      statements: rawStatements,
    });
  }

  return result;
}

/**
 * Returns all canonical migration statements concatenated in strict journal order.
 */
export function getCanonicalMigrationStatements(): ReadonlyArray<string> {
  const files = getCanonicalMigrationFiles();
  const statements: string[] = [];
  for (const file of files) {
    statements.push(...file.statements);
  }
  return statements;
}

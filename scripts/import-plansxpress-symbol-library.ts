import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import {
  fingerprintBlock,
  parsePlansXpressDxf,
  type BlockFingerprint,
  type DxfBlockDefinition,
  type ElectricalObject,
} from "../shared/measurable-work/offline-electrical.ts";

interface CliOptions {
  symbolsDir: string;
  outDir: string;
  patrickBrookReview: string;
}

interface AuditedFile {
  path: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  readableNameFromFilename: string | null;
  readableNamesFromContent: string[];
  geometryParseable: boolean;
  parseNotes: string[];
  fingerprints: Array<{
    fingerprintId: string;
    blockName: string;
    geometry: ReturnType<typeof geometrySummary>;
  }>;
}

interface LibrarySymbol {
  canonicalPlansXpressName: string;
  sourcePath: string;
  sourceBlockName: string;
  fingerprintId: string;
  geometry: ReturnType<typeof geometrySummary>;
}

interface PatrickBrookUnknownGroup {
  symbol: string;
  fingerprintId: string;
  occurrenceCount: number;
  blockNames: string[];
  containedText: string[];
  suggestedHbxlCandidates: string[];
}

const DEFAULT_SYMBOLS_DIR = "C:\\ProgramData\\HBXL\\PlansXpress5\\Symbols";
const DEFAULT_OUT_DIR = "reports/plansxpress-symbol-library";
const DEFAULT_PATRICK_REVIEW = "reports/electrical-symbol-learning/phase-1c-patrick-brook-symbol-learning.json";

const KNOWN_PLANSXPRESS_SYMBOL_NAMES = [
  "DOUBLE LIGHT SWITCH ONE WAY",
  "DOUBLE SOCKET",
  "DOUBLE SOCKET USB",
  "ELECTRIC HOB",
  "EXTRACTOR FAN",
  "LIGHT FITTING",
  "MAINS DOWNLIGHT FIRE RATED",
  "MAINS VOLTAGE DOWNLIGHT",
  "OVEN CIRCUIT",
  "PULL LIGHT SWITCH",
  "SHAVER SOCKET",
  "SHOWER CIRCUIT",
  "SINGLE LIGHT SWITCH ONE WAY",
  "SINGLE LIGHT SWITCH TWO WAY",
  "SINGLE SOCKET OUTSIDE",
  "STRIP LIGHT",
  "WC LIGHT FITTING",
];

const HUMAN_CONFIRMED_FROM_LIBRARY = [
  { originalPatrickSymbol: "C", plansXpressName: "EXTRACTOR FAN", note: "visual confirmation from official PlansXpress library; not forced to HBXL product" },
  { originalPatrickSymbol: "J", plansXpressName: "ELECTRIC HOB", note: "explicit drawing label / circuit identity; not forced to HBXL product" },
  { originalPatrickSymbol: "L", plansXpressName: "SHOWER CIRCUIT", note: "explicit drawing label / circuit identity; not forced to HBXL product" },
  { originalPatrickSymbol: "M", plansXpressName: "SHAVER SOCKET", note: "exact drawing identity; already reconciles with HBXL Shaver Socket when mapped" },
  { originalPatrickSymbol: "O", plansXpressName: "OVEN CIRCUIT", note: "explicit drawing label / circuit identity; not forced to HBXL product" },
];

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    symbolsDir: DEFAULT_SYMBOLS_DIR,
    outDir: DEFAULT_OUT_DIR,
    patrickBrookReview: DEFAULT_PATRICK_REVIEW,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--help") throw new Error(usage());
    if (!next) throw new Error(`Missing value for ${arg}`);

    if (arg === "--symbols-dir") options.symbolsDir = next;
    else if (arg === "--out-dir") options.outDir = next;
    else if (arg === "--patrick-review") options.patrickBrookReview = next;
    else throw new Error(`Unknown option: ${arg}`);
    i++;
  }

  return options;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/import-plansxpress-symbol-library.ts --symbols-dir C:\\ProgramData\\HBXL\\PlansXpress5\\Symbols",
    "",
    "Read-only audit/import of the PlansXpress symbol library into stable offline fingerprints.",
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const audit = await auditSymbolsDirectory(options.symbolsDir, options.patrickBrookReview);
  await mkdir(options.outDir, { recursive: true });

  const jsonPath = join(options.outDir, "plansxpress-symbol-library-audit.json");
  const markdownPath = join(options.outDir, "plansxpress-symbol-library-audit.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderMarkdown(audit), "utf8"),
  ]);

  console.log([
    `PlansXpress symbol library audit complete`,
    `Symbols directory exists: ${audit.summary.symbolsDirectoryExists}`,
    `Files audited: ${audit.summary.fileCount}`,
    `Parseable geometry files: ${audit.summary.parseableGeometryFiles}`,
    `Library fingerprints: ${audit.summary.libraryFingerprints}`,
    `Patrick Brook fingerprint matches: ${audit.summary.patrickBrookFingerprintMatches}`,
    `JSON: ${jsonPath}`,
    `Markdown: ${markdownPath}`,
  ].join("\n"));
}

async function auditSymbolsDirectory(symbolsDir: string, patrickBrookReviewPath: string) {
  const directoryStat = await safeStat(symbolsDir);
  const patrickBrookUnknownGroups = await readPatrickBrookUnknownGroups(patrickBrookReviewPath);

  if (!directoryStat?.isDirectory()) {
    return {
      symbolsDir,
      summary: {
        symbolsDirectoryExists: false,
        directoryCount: 0,
        fileCount: 0,
        extensions: {},
        humanReadableNamesInFilenames: false,
        humanReadableNamesInMetadata: false,
        parseableGeometryFiles: 0,
        libraryFingerprints: 0,
        patrickBrookFingerprintMatches: 0,
      },
      structure: [],
      files: [] as AuditedFile[],
      librarySymbols: [] as LibrarySymbol[],
      patrickBrookFingerprintMatches: [],
      patrickBrookUnknownGroups,
      humanConfirmedFromLibrary: HUMAN_CONFIRMED_FROM_LIBRARY,
      practicality: "The importer is practical for DXF-like PlansXpress symbol files, but this machine cannot validate the official library because the supplied folder is not present/readable.",
    };
  }

  const entries = await walk(symbolsDir);
  const auditedFiles = await Promise.all(entries.files.map((filePath) => auditFile(symbolsDir, filePath)));
  const librarySymbols = auditedFiles.flatMap((file) => toLibrarySymbols(file));
  const patrickBrookFingerprintMatches = comparePatrickBrookUnknowns(librarySymbols, patrickBrookUnknownGroups);
  const extensions = auditedFiles.reduce<Record<string, number>>((counts, file) => {
    counts[file.extension] = (counts[file.extension] ?? 0) + 1;
    return counts;
  }, {});

  return {
    symbolsDir,
    summary: {
      symbolsDirectoryExists: true,
      directoryCount: entries.directories.length,
      fileCount: auditedFiles.length,
      extensions,
      humanReadableNamesInFilenames: auditedFiles.some((file) => !!file.readableNameFromFilename),
      humanReadableNamesInMetadata: auditedFiles.some((file) => file.readableNamesFromContent.length > 0),
      parseableGeometryFiles: auditedFiles.filter((file) => file.geometryParseable).length,
      libraryFingerprints: librarySymbols.length,
      patrickBrookFingerprintMatches: patrickBrookFingerprintMatches.length,
    },
    structure: entries.directories.map((path) => relative(symbolsDir, path) || ".").sort(),
    files: auditedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    librarySymbols,
    patrickBrookFingerprintMatches,
    patrickBrookUnknownGroups,
    humanConfirmedFromLibrary: HUMAN_CONFIRMED_FROM_LIBRARY,
    practicality: librarySymbols.length > 0
      ? "Automatic PlansXpress symbol-library learning is practical for the parseable symbol files found here. The importer can build canonical name -> stable fingerprint records without modifying PlansXpress files."
      : "The symbol directory exists, but no parseable DXF-like geometry was found. Additional file format decoding would be needed before automatic learning is practical.",
  };
}

async function walk(root: string): Promise<{ directories: string[]; files: string[] }> {
  const directories: string[] = [root];
  const files: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        directories.push(path);
        queue.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  return { directories, files };
}

async function auditFile(root: string, filePath: string): Promise<AuditedFile> {
  const fileStat = await stat(filePath);
  const extension = extname(filePath).toLowerCase() || "[none]";
  const relativePath = relative(root, filePath);
  const filenameName = readableNameFromFilename(filePath);
  const parseNotes: string[] = [];
  let readableNamesFromContent: string[] = [];
  let fingerprints: AuditedFile["fingerprints"] = [];

  try {
    const content = await readFile(filePath, "utf8");
    readableNamesFromContent = knownNamesInText(content);
    fingerprints = parseFingerprintsFromContent(content, filePath, parseNotes);
  } catch (error) {
    parseNotes.push(`not readable as UTF-8 text: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    path: filePath,
    relativePath,
    extension,
    sizeBytes: fileStat.size,
    readableNameFromFilename: filenameName,
    readableNamesFromContent,
    geometryParseable: fingerprints.length > 0,
    parseNotes,
    fingerprints,
  };
}

function parseFingerprintsFromContent(content: string, filePath: string, parseNotes: string[]): AuditedFile["fingerprints"] {
  if (!/\b(SECTION|BLOCKS|ENTITIES|LINE|CIRCLE|ARC|LWPOLYLINE|INSERT)\b/i.test(content)) {
    parseNotes.push("no DXF-like geometry tokens found");
    return [];
  }

  const dxf = parsePlansXpressDxf(content);
  const blocks = dxf.blocks.filter((block) => !/^\*(Model|Paper)_Space/i.test(block.name));
  const fingerprintBlocks: DxfBlockDefinition[] = blocks.length > 0 ? blocks : dxf.entities.length > 0 ? [{ name: basename(filePath, extname(filePath)), entities: dxf.entities }] : [];

  if (fingerprintBlocks.length === 0) {
    parseNotes.push("DXF-like file parsed, but no BLOCK or ENTITIES geometry was produced by the current parser");
    return [];
  }

  return fingerprintBlocks.map((block) => {
    const fingerprint = fingerprintBlock(block);
    return {
      fingerprintId: fingerprintIdFor(stableFingerprintKey(fingerprint)),
      blockName: block.name,
      geometry: geometrySummary(fingerprint),
    };
  });
}

function toLibrarySymbols(file: AuditedFile): LibrarySymbol[] {
  const canonicalName = file.readableNamesFromContent[0] ?? file.readableNameFromFilename;
  if (!canonicalName) return [];
  return file.fingerprints.map((fingerprint) => ({
    canonicalPlansXpressName: canonicalName,
    sourcePath: file.path,
    sourceBlockName: fingerprint.blockName,
    fingerprintId: fingerprint.fingerprintId,
    geometry: fingerprint.geometry,
  }));
}

function comparePatrickBrookUnknowns(librarySymbols: LibrarySymbol[], unknownGroups: PatrickBrookUnknownGroup[]) {
  const libraryByFingerprint = new Map(librarySymbols.map((symbol) => [symbol.fingerprintId, symbol]));
  return unknownGroups
    .map((group) => ({ group, librarySymbol: libraryByFingerprint.get(group.fingerprintId) }))
    .filter((match): match is { group: PatrickBrookUnknownGroup; librarySymbol: LibrarySymbol } => !!match.librarySymbol)
    .map(({ group, librarySymbol }) => ({
      patrickBrookSymbol: group.symbol,
      patrickBrookFingerprintId: group.fingerprintId,
      occurrenceCount: group.occurrenceCount,
      blockNames: group.blockNames,
      canonicalPlansXpressName: librarySymbol.canonicalPlansXpressName,
      sourcePath: librarySymbol.sourcePath,
      note: "PlansXpress drawing identity matched by stable geometry fingerprint; HBXL product mapping still requires separate reconciliation.",
    }));
}

async function readPatrickBrookUnknownGroups(path: string): Promise<PatrickBrookUnknownGroup[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { unknownSymbolGroups?: PatrickBrookUnknownGroup[]; reviewItems?: ElectricalObject[] };
    if (Array.isArray(parsed.unknownSymbolGroups)) return parsed.unknownSymbolGroups;
  } catch {
    return [];
  }
  return [];
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

function readableNameFromFilename(filePath: string): string | null {
  const normalized = basename(filePath, extname(filePath)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  return KNOWN_PLANSXPRESS_SYMBOL_NAMES.find((name) => normalized.includes(name)) ?? null;
}

function knownNamesInText(content: string): string[] {
  const normalized = content.toUpperCase().replace(/\s+/g, " ");
  return KNOWN_PLANSXPRESS_SYMBOL_NAMES.filter((name) => normalized.includes(name));
}

function stableFingerprintKey(fingerprint: BlockFingerprint): string {
  return JSON.stringify({
    typeCounts: Object.fromEntries(Object.entries(fingerprint.typeCounts).sort(([a], [b]) => a.localeCompare(b))),
    textTokens: fingerprint.textTokens,
    circleRadii: fingerprint.circleRadii,
    arcRadii: fingerprint.arcRadii,
    lineCount: fingerprint.lineCount,
    circleCount: fingerprint.circleCount,
    arcCount: fingerprint.arcCount,
    polylineCount: fingerprint.polylineCount,
    normalizedAspectRatio: fingerprint.aspectRatio ? Math.min(fingerprint.aspectRatio, round(1 / fingerprint.aspectRatio)) : null,
  });
}

function fingerprintIdFor(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function geometrySummary(fingerprint: BlockFingerprint) {
  return {
    typeCounts: Object.fromEntries(Object.entries(fingerprint.typeCounts).sort(([a], [b]) => a.localeCompare(b))),
    lineCount: fingerprint.lineCount,
    circleCount: fingerprint.circleCount,
    arcCount: fingerprint.arcCount,
    polylineCount: fingerprint.polylineCount,
    circleRadii: fingerprint.circleRadii,
    arcRadii: fingerprint.arcRadii,
    aspectRatio: fingerprint.aspectRatio,
    textTokens: fingerprint.textTokens,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function renderMarkdown(audit: Awaited<ReturnType<typeof auditSymbolsDirectory>>): string {
  const lines = [
    "# PlansXpress Symbol Library Audit",
    "",
    `Symbols directory: ${audit.symbolsDir}`,
    "",
    "## Summary",
    "",
    ...Object.entries(audit.summary).map(([key, value]) => `- ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`),
    "",
    "## Practicality",
    "",
    audit.practicality,
    "",
    "## Structure",
    "",
    ...(audit.structure.length > 0 ? audit.structure.map((entry) => `- ${entry}`) : ["- not available"]),
    "",
    "## Library Fingerprint Matches",
    "",
    ...(audit.patrickBrookFingerprintMatches.length > 0
      ? audit.patrickBrookFingerprintMatches.map((match) => `- ${match.patrickBrookSymbol} -> ${match.canonicalPlansXpressName} (${match.patrickBrookFingerprintId}), occurrences ${match.occurrenceCount}`)
      : ["- none from parsed library fingerprints"]),
    "",
    "## Human Confirmed From Library",
    "",
    ...audit.humanConfirmedFromLibrary.map((match) => `- Original Patrick Brook Symbol ${match.originalPatrickSymbol}: ${match.plansXpressName}. ${match.note}`),
    "",
    "## Files",
    "",
    ...(audit.files.length > 0 ? audit.files.map((file) => `- ${file.relativePath}: ${file.extension}, ${file.sizeBytes} bytes, parseable ${file.geometryParseable}, filename name ${file.readableNameFromFilename ?? "none"}, metadata names ${file.readableNamesFromContent.join(", ") || "none"}`) : ["- none"]),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

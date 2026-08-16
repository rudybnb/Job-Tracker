import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

type EstimatingStatus = "ESTIMATED" | "NON_ESTIMATED_VISUAL_ONLY" | "UNKNOWN_REVIEW";

interface CliOptions {
  pxd: string;
  jsonOut: string;
  markdownOut: string;
}

interface EntityAuditItem {
  index: number;
  handle: string;
  entityType: string;
  layer: string;
  pxid: string;
  spreadsheet: string;
  template: string;
  fileName: string;
  estimatedCategory: string | null;
  estimateRecordId: string | null;
  status: EstimatingStatus;
  rule: string;
  operationalMeaning: string;
}

interface EstimatingStatusAudit {
  source: {
    pxd: string;
    container: "gzip XML" | "unknown";
    plansXpressVersion: string | null;
    decompressedBytes: number;
  };
  rules: Array<{ status: EstimatingStatus; deterministicRule: string; operationalRule: string }>;
  estimateData: {
    estimatedRecordCounts: Record<string, number>;
    nonEstimatedRecordCounts: Record<string, number>;
    nonEstimatedCollectionsPresent: boolean;
  };
  libraryEvidence: {
    installedSymbolsRoot: string;
    estimatedSymbolPathReferencesInProject: string[];
    visualOnlyLibraryExamples: string[];
  };
  counts: {
    topLevelEntities: number;
    estimated: number;
    nonEstimatedVisualOnly: number;
    unknownReview: number;
    byEntityTypeAndStatus: Array<{ entityType: string; status: EstimatingStatus; count: number }>;
  };
  examples: Record<string, EntityAuditItem | null>;
  existingProposedDemolitionEvidence: {
    deterministicStatusAvailable: boolean;
    evidence: string[];
    conclusion: string;
  };
  unresolvedCases: EntityAuditItem[];
  entities: EntityAuditItem[];
}

const DEFAULT_OPTIONS: CliOptions = {
  pxd: "C:/Users/rudyb/Desktop/Patrick Brook.pxd",
  jsonOut: "reports/offline-project-model/patrick-brook-plansxpress-estimating-status-audit.json",
  markdownOut: "reports/offline-project-model/patrick-brook-plansxpress-estimating-status-audit.md",
};

function parseArgs(args: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--help") throw new Error(usage());
    if (!next) throw new Error(`Missing value for ${arg}`);

    if (arg === "--pxd") options.pxd = next;
    else if (arg === "--json-out") options.jsonOut = next;
    else if (arg === "--markdown-out") options.markdownOut = next;
    else throw new Error(`Unknown option: ${arg}`);
    i++;
  }
  return options;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/audit-patrick-brook-plansxpress-estimating-status.ts",
    "",
    "Builds a read-only PlansXpress estimating-status audit. No DB/API/UI changes are made.",
  ].join("\n");
}

function buildAudit(pxdPath: string, compressedPxd: Buffer): EstimatingStatusAudit {
  const xml = gunzipSync(compressedPxd).toString("utf8");
  const estimateIndexes = buildEstimateIndexes(xml);
  const nonEstimatedCounts = collectionCounts(xml);
  const entityBlocks = topLevelEntityBlocks(xml);
  const entities = entityBlocks.map((block, index) => classifyEntity(block, index + 1, estimateIndexes));
  const estimatedSymbolPathReferencesInProject = Array.from(new Set(Array.from(xml.matchAll(/C:\\PROGRAMDATA\\HBXL\\PLANSXPRESS5\\SYMBOLS[^<|~"]+/gi), (match) => match[0]))).sort((a, b) => a.localeCompare(b));
  const existingProposedDemolitionEvidence = existingProposedDemolition(xml);

  return {
    source: {
      pxd: pxdPath,
      container: compressedPxd[0] === 0x1f && compressedPxd[1] === 0x8b ? "gzip XML" : "unknown",
      plansXpressVersion: /<PlansXpress\b[^>]*\bVersion="([^"]+)"/i.exec(xml)?.[1] ?? null,
      decompressedBytes: Buffer.byteLength(xml, "utf8"),
    },
    rules: [
      {
        status: "ESTIMATED",
        deterministicRule: "Entity has ExtendedEntityData PXID and CADX_Spreadsheet that joins to a record in EstimateData.Estimated for its entity category.",
        operationalRule: "Can contribute quantities/resources/buying/cost, subject to normal Job Tracker operational rules.",
      },
      {
        status: "NON_ESTIMATED_VISUAL_ONLY",
        deterministicRule: "Entity is listed in EstimateData.NonEstimated, or is a top-level drawing/annotation/simple visual entity with no PXID/CADX_Spreadsheet estimating relationship.",
        operationalRule: "Retain as drawing/3D/reference context only. Do not create buying quantities, project cost, or mismatch flags.",
      },
      {
        status: "UNKNOWN_REVIEW",
        deterministicRule: "Entity has estimating-like fields but no deterministic join to EstimateData.Estimated or EstimateData.NonEstimated, or its entity type/category is not mapped.",
        operationalRule: "Make no assumptions; require review before quantities/resources/buying/cost.",
      },
    ],
    estimateData: {
      estimatedRecordCounts: Object.fromEntries(Array.from(estimateIndexes.counts.entries()).sort(([a], [b]) => a.localeCompare(b))),
      nonEstimatedRecordCounts: nonEstimatedCounts,
      nonEstimatedCollectionsPresent: /<NonEstimated>[\s\S]*?<\/NonEstimated>/i.test(xml),
    },
    libraryEvidence: {
      installedSymbolsRoot: "C:\\ProgramData\\HBXL\\PlansXpress5\\Symbols",
      estimatedSymbolPathReferencesInProject: estimatedSymbolPathReferencesInProject.slice(0, 40),
      visualOnlyLibraryExamples: [
        "C:\\ProgramData\\HBXL\\PlansXpress5\\Symbols\\Drawing Symbols\\Room Labels.pxd",
        "C:\\ProgramData\\HBXL\\PlansXpress5\\Symbols\\Drawing Symbols\\Electrical Symbol Key.pxd",
        "C:\\ProgramData\\HBXL\\PlansXpress5\\Symbols\\Drawing Symbols\\External ground level.pxd",
      ],
    },
    counts: {
      topLevelEntities: entities.length,
      estimated: entities.filter((entity) => entity.status === "ESTIMATED").length,
      nonEstimatedVisualOnly: entities.filter((entity) => entity.status === "NON_ESTIMATED_VISUAL_ONLY").length,
      unknownReview: entities.filter((entity) => entity.status === "UNKNOWN_REVIEW").length,
      byEntityTypeAndStatus: countByTypeAndStatus(entities),
    },
    examples: representativeExamples(entities),
    existingProposedDemolitionEvidence,
    unresolvedCases: entities.filter((entity) => entity.status === "UNKNOWN_REVIEW"),
    entities,
  };
}

function classifyEntity(block: string, index: number, estimateIndexes: ReturnType<typeof buildEstimateIndexes>): EntityAuditItem {
  const attrs = parseAttributes(entityStartTag(block));
  const entityType = attributeText(attrs, "EntityType");
  const data = entityData(block, entityType);
  const handle = attributeText(attrs, "Handle");
  const pxid = data.get("PXID") ?? "";
  const spreadsheet = data.get("CADX_Spreadsheet") ?? "";
  const template = data.get("CADX_Template") ?? "";
  const fileName = attributeText(attrs, "FileName");
  const category = categoryForEntityType(entityType, spreadsheet);
  const estimateKey = category && pxid && spreadsheet ? `${category}|${spreadsheet}|${pxid}` : "";
  const estimateRecordId = estimateKey ? estimateIndexes.records.get(estimateKey) ?? null : null;

  if (estimateRecordId) {
    return item("ESTIMATED", `Joined to EstimateData.Estimated.${category} by PXID ${pxid} and CADX_Spreadsheet ${spreadsheet}.`, "Can contribute quantities/resources/buying/cost.");
  }

  if (!pxid && !spreadsheet && visualOnlyEntityType(entityType)) {
    return item("NON_ESTIMATED_VISUAL_ONLY", "Top-level drawing/annotation/simple visual entity has no PXID or CADX_Spreadsheet estimating relationship.", "Reference context only; no quantities/cost/mismatch.");
  }

  return item("UNKNOWN_REVIEW", "Entity does not deterministically join to EstimateData.Estimated or a non-estimated collection.", "No assumptions; review required.");

  function item(status: EstimatingStatus, rule: string, operationalMeaning: string): EntityAuditItem {
    return {
      index,
      handle,
      entityType,
      layer: attributeText(attrs, "Layer"),
      pxid,
      spreadsheet,
      template,
      fileName,
      estimatedCategory: estimateRecordId ? category : null,
      estimateRecordId,
      status,
      rule,
      operationalMeaning,
    };
  }
}

function buildEstimateIndexes(xml: string): { records: Map<string, string>; counts: Map<string, number> } {
  const estimatedXml = /<Estimated\b[^>]*>([\s\S]*?)<\/Estimated>/i.exec(xml)?.[1] ?? "";
  const records = new Map<string, string>();
  const counts = new Map<string, number>();
  const categories = [
    ["Walls", "Wall"],
    ["Doors", "Door"],
    ["Windows", "Window"],
    ["Openings", "Opening"],
    ["Objects", "Object"],
    ["Areas", "Area"],
    ["Roofs", "Roof"],
  ] as const;

  for (const [collection, tag] of categories) {
    const collectionXml = collectionBlocks(estimatedXml, collection).join("\n");
    const blocks = Array.from(collectionXml.matchAll(new RegExp(`<${tag}\\b([^>]*)\\/?>(?:<\\/${tag}>)?`, "gi")), (match) => parseAttributes(match[1]));
    const estimateBlocks = blocks.filter((attrs) => attributeText(attrs, "ID") && attributeText(attrs, "Spreadsheet"));
    counts.set(collection, estimateBlocks.length);
    for (const attrs of estimateBlocks) {
      const id = attributeText(attrs, "ID");
      const pxid = id.split("-")[0];
      records.set(`${collection}|${attributeText(attrs, "Spreadsheet")}|${pxid}`, id);
    }
  }

  return { records, counts };
}

function collectionBlocks(xml: string, collectionName: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${collectionName}\\b[^>]*>[\\s\\S]*?<\\/${collectionName}>`, "gi")), (match) => match[0]);
}

function collectionCounts(xml: string): Record<string, number> {
  const block = /<NonEstimated>([\s\S]*?)<\/NonEstimated>/i.exec(xml)?.[1] ?? "";
  const result: Record<string, number> = {};
  for (const collection of ["Walls", "Doors", "Windows", "Openings", "Stairs", "Profiles", "DoubleLinears", "Rooflights", "Objects", "Areas", "Treatments", "Rooms"]) {
    const match = new RegExp(`<${collection}\\b[^>]*>([\\s\\S]*?)<\\/${collection}>|<${collection}\\s*\\/>`, "i").exec(block);
    const inner = match?.[1] ?? "";
    result[collection] = Array.from(inner.matchAll(/<[A-Za-z]+\b/g)).length;
  }
  return result;
}

function categoryForEntityType(entityType: string, spreadsheet: string): string | null {
  if (entityType === "5000") return "Walls";
  if (entityType === "5001") return "Windows";
  if (entityType === "5002") return "Doors";
  if (entityType === "6000") return "Areas";
  if (entityType === "3055") return "Roofs";
  if (entityType === "3009") return "Objects";
  if (spreadsheet) return null;
  return null;
}

function visualOnlyEntityType(entityType: string): boolean {
  return new Set(["3001", "3003", "3014", "3015"]).has(entityType);
}

function operationalStatus(status: EstimatingStatus): string {
  if (status === "ESTIMATED") return "Can contribute quantities/resources/buying/cost.";
  if (status === "NON_ESTIMATED_VISUAL_ONLY") return "Drawing/3D/reference only; no buying quantities, project cost, or mismatch.";
  return "No assumptions; review required.";
}

function countByTypeAndStatus(entities: EntityAuditItem[]): Array<{ entityType: string; status: EstimatingStatus; count: number }> {
  const counts = new Map<string, number>();
  for (const entity of entities) counts.set(`${entity.entityType}|${entity.status}`, (counts.get(`${entity.entityType}|${entity.status}`) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([key, count]) => {
      const [entityType, status] = key.split("|") as [string, EstimatingStatus];
      return { entityType, status, count };
    })
    .sort((a, b) => a.entityType.localeCompare(b.entityType) || a.status.localeCompare(b.status));
}

function representativeExamples(entities: EntityAuditItem[]): Record<string, EntityAuditItem | null> {
  return {
    estimatedExternalWall: entities.find((entity) => entity.status === "ESTIMATED" && entity.entityType === "5000" && entity.spreadsheet === "2 Leaf External Wall.xls") ?? null,
    estimatedInternalWall: entities.find((entity) => entity.status === "ESTIMATED" && entity.entityType === "5000" && entity.spreadsheet === "Single Leaf Internal Wall.xls") ?? null,
    estimatedElectricalSymbol: entities.find((entity) => entity.status === "ESTIMATED" && entity.entityType === "3009" && /socket|light|fan|switch|circuit|oven|hob/i.test(`${entity.spreadsheet} ${entity.template} ${entity.fileName}`)) ?? null,
    nonEstimatedPlanSymbol: entities.find((entity) => entity.status === "NON_ESTIMATED_VISUAL_ONLY" && ["3003", "3014", "3015", "3001"].includes(entity.entityType)) ?? null,
    nonEstimated3dSymbol: null,
    unknownReview: entities.find((entity) => entity.status === "UNKNOWN_REVIEW") ?? null,
  };
}

function existingProposedDemolition(xml: string): EstimatingStatusAudit["existingProposedDemolitionEvidence"] {
  const evidence = Array.from(new Set(Array.from(xml.matchAll(/[A-Za-z0-9_ -]*(?:Existing|Proposed|Demol|Renovation)[A-Za-z0-9_ -]*/gi), (match) => match[0].trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const deterministic = evidence.some((item) => /\b(existing|proposed|demolition)status\b/i.test(item));
  return {
    deterministicStatusAvailable: deterministic,
    evidence: evidence.slice(0, 60),
    conclusion: deterministic
      ? "A deterministic existing/proposed/demolition status field appears to be present and should be reviewed before operational use."
      : "No deterministic per-entity EXISTING / PROPOSED / DEMOLITION status field was found. Terms such as existing walls appear as estimator calculator inputs or layer names, not a reliable object lifecycle status.",
  };
}

function renderMarkdown(audit: EstimatingStatusAudit): string {
  return [
    "# Patrick Brook PlansXpress Estimating Status Audit",
    "",
    "Read-only audit. PlansXpress/EstimatorXpress remain the estimating system; Job Tracker only consumes deterministic HBXL evidence and applies operational logic.",
    "",
    "## Rules Found",
    "",
    ...audit.rules.map((rule) => `- ${rule.status}: ${rule.deterministicRule} Operational rule: ${rule.operationalRule}`),
    "",
    "## EstimateData Evidence",
    "",
    `- NonEstimated collections present: ${audit.estimateData.nonEstimatedCollectionsPresent ? "yes" : "no"}`,
    `- Estimated record counts: ${Object.entries(audit.estimateData.estimatedRecordCounts).map(([key, value]) => `${key} ${value}`).join(", ")}`,
    `- NonEstimated record counts: ${Object.entries(audit.estimateData.nonEstimatedRecordCounts).map(([key, value]) => `${key} ${value}`).join(", ")}`,
    "",
    "## Patrick Brook Entity Counts",
    "",
    `- Top-level drawing entities: ${audit.counts.topLevelEntities}`,
    `- ESTIMATED: ${audit.counts.estimated}`,
    `- NON_ESTIMATED_VISUAL_ONLY: ${audit.counts.nonEstimatedVisualOnly}`,
    `- UNKNOWN_REVIEW: ${audit.counts.unknownReview}`,
    "",
    "| Entity Type | Status | Count |",
    "| --- | --- | ---: |",
    ...audit.counts.byEntityTypeAndStatus.map((item) => `| ${item.entityType} | ${item.status} | ${item.count} |`),
    "",
    "## Representative Examples",
    "",
    "| Example | Status | Handle | Entity Type | PXID | Spreadsheet | Template | Rule |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...Object.entries(audit.examples).map(([name, item]) => item
      ? `| ${name} | ${item.status} | ${item.handle} | ${item.entityType} | ${item.pxid || "-"} | ${item.spreadsheet || "-"} | ${item.template || item.fileName || "-"} | ${item.rule} |`
      : `| ${name} | - | - | - | - | - | - | No representative item found in Patrick Brook. |`),
    "",
    "## Library Evidence",
    "",
    `- Installed symbol root: ${audit.libraryEvidence.installedSymbolsRoot}`,
    "- Estimated symbol path references embedded in Patrick Brook include:",
    ...audit.libraryEvidence.estimatedSymbolPathReferencesInProject.slice(0, 20).map((path) => `- ${path}`),
    "- Visual-only library examples present in installed symbols:",
    ...audit.libraryEvidence.visualOnlyLibraryExamples.map((path) => `- ${path}`),
    "",
    "## Existing / Proposed / Demolition",
    "",
    `- Deterministic per-entity status available: ${audit.existingProposedDemolitionEvidence.deterministicStatusAvailable ? "yes" : "no"}`,
    `- Conclusion: ${audit.existingProposedDemolitionEvidence.conclusion}`,
    "- Evidence terms found:",
    ...audit.existingProposedDemolitionEvidence.evidence.map((item) => `- ${item}`),
    "",
    "## Unresolved Cases",
    "",
    audit.unresolvedCases.length === 0 ? "No UNKNOWN_REVIEW entities in Patrick Brook under the current deterministic rules." : "| Handle | Entity Type | PXID | Spreadsheet | Rule |",
    audit.unresolvedCases.length === 0 ? "" : "| --- | --- | --- | --- | --- |",
    ...audit.unresolvedCases.map((item) => `| ${item.handle} | ${item.entityType} | ${item.pxid || "-"} | ${item.spreadsheet || "-"} | ${item.rule} |`),
    "",
    "## Business Rule Confirmation",
    "",
    "- ESTIMATED can contribute quantities/resources/buying/cost.",
    "- NON_ESTIMATED_VISUAL_ONLY remains drawing/3D/reference context and must not create buying quantities, project cost, or mismatch flags.",
    "- UNKNOWN_REVIEW makes no assumptions.",
    "- Smart Schedule absence is not used as the classifier when stronger PlansXpress evidence exists.",
    "",
  ].join("\n");
}

function topLevelEntityBlocks(xml: string): string[] {
  const entitiesMatch = /<Entities\b[^>]*>([\s\S]*?)<\/Entities>/i.exec(xml);
  if (!entitiesMatch) return [];
  const content = entitiesMatch[1];
  const tagRegex = /<\/?Entity\b[^>]*>/gi;
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  for (const match of content.matchAll(tagRegex)) {
    const tag = match[0];
    const index = match.index ?? 0;
    const closing = tag.startsWith("</");
    const selfClosing = tag.endsWith("/>");
    if (!closing && selfClosing && depth === 0) {
      blocks.push(tag);
      continue;
    }
    if (!closing && depth === 0) start = index;
    if (!closing && !selfClosing) depth++;
    if (closing) depth--;
    if (closing && depth === 0 && start >= 0) {
      blocks.push(content.slice(start, index + tag.length));
      start = -1;
    }
  }
  return blocks;
}

function entityStartTag(block: string): string {
  return /^<Entity\b([^>]*)>/i.exec(block)?.[1] ?? "";
}

function entityData(block: string, entityType: string): Map<string, string> {
  const dataMaps = Array.from(block.matchAll(/<ExtendedEntityData>([\s\S]*?)<\/ExtendedEntityData>/gi), (match) => dataMap(match[1]));
  if (entityType === "5000") {
    return dataMaps.find((data) => /Wall\.xls$/i.test(data.get("CADX_Spreadsheet") ?? "")) ?? new Map<string, string>();
  }
  return dataMaps[0] ?? new Map<string, string>();
}

function dataMap(extendedData: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of extendedData.matchAll(/<Data>([\s\S]*?)<\/Data>/gi)) {
    const value = decodeXml(match[1]);
    const separator = value.indexOf("|");
    if (separator < 0) continue;
    result.set(value.slice(0, separator), value.slice(separator + 1));
  }
  return result;
}

function parseAttributes(startTagContent: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of startTagContent.matchAll(/([A-Za-z0-9_-]+)="([^"]*)"/g)) {
    attributes.set(match[1].toLowerCase(), decodeXml(match[2]).trim());
  }
  return attributes;
}

function attributeText(attributes: Map<string, string>, name: string): string {
  return attributes.get(name.toLowerCase()) ?? "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const compressedPxd = await readFile(options.pxd);
  const audit = buildAudit(options.pxd, compressedPxd);

  await Promise.all([
    mkdir(dirname(options.jsonOut), { recursive: true }),
    mkdir(dirname(options.markdownOut), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(options.jsonOut, `${JSON.stringify(audit, null, 2)}\n`, "utf8"),
    writeFile(options.markdownOut, renderMarkdown(audit), "utf8"),
  ]);

  console.log([
    "PlansXpress estimating status audit built",
    `Top-level entities: ${audit.counts.topLevelEntities}`,
    `ESTIMATED: ${audit.counts.estimated}`,
    `NON_ESTIMATED_VISUAL_ONLY: ${audit.counts.nonEstimatedVisualOnly}`,
    `UNKNOWN_REVIEW: ${audit.counts.unknownReview}`,
    `JSON: ${options.jsonOut}`,
    `Markdown: ${options.markdownOut}`,
  ].join("\n"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

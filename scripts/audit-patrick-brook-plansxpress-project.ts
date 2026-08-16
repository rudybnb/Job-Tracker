import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseHbxlSmartSchedule, type HbxlResource } from "../shared/measurable-work/offline-project-model.ts";

interface CliOptions {
  pxd: string;
  hbxl: string;
  jsonOut: string;
  markdownOut: string;
}

interface DecoratedWallRecord {
  id: string;
  location: string;
  spreadsheet: string;
  lengthM: number;
  heightM: number;
  openingAreaM2: number;
  decoratedSides: number;
  grossAreaM2: number;
  netAreaOpeningsDeductedOnceM2: number;
  netAreaOpeningsDeductedPerSideM2: number;
  openingsList: string;
}

interface DecoratedCeilingRecord {
  id: string;
  location: string;
  spreadsheet: string;
  areaM2: number;
  perimeterM: number;
}

interface PlansXpressProjectAudit {
  source: {
    pxd: string;
    smartSchedule: string;
    container: "gzip XML" | "unknown";
    plansXpressVersion: string | null;
    decompressedBytes: number;
  };
  estimateDataCounts: {
    walls: number;
    doors: number;
    windows: number;
    objects: number;
    areas: number;
    treatments: number;
    rooms: number;
  };
  decoratedWallAggregate: {
    records: DecoratedWallRecord[];
    uniqueLocations: string[];
    grossAreaM2: number;
    netAreaOpeningsDeductedOnceM2: number;
    netAreaOpeningsDeductedPerSideM2: number;
  };
  decoratedCeilingAggregate: {
    records: DecoratedCeilingRecord[];
    totalAreaM2: number;
  };
  smartScheduleComparison: {
    internalDecorationRows: Pick<HbxlResource, "sourceRow" | "typeOfResource" | "resourceType" | "productCode" | "description" | "quantity" | "unit">[];
    internalDecorationRowsWithPositiveQuantity: number;
    wallDecorationQuantityRows: number;
    directWallDecorationQuantityFound: boolean;
  };
  conclusion: string;
}

const DEFAULT_OPTIONS: CliOptions = {
  pxd: "C:/Users/rudyb/Desktop/Patrick Brook.pxd",
  hbxl: "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv",
  jsonOut: "reports/offline-project-model/patrick-brook-plansxpress-project-audit.json",
  markdownOut: "reports/offline-project-model/patrick-brook-plansxpress-project-audit.md",
};

function parseArgs(args: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--help") throw new Error(usage());
    if (!next) throw new Error(`Missing value for ${arg}`);

    if (arg === "--pxd") options.pxd = next;
    else if (arg === "--hbxl") options.hbxl = next;
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
    "  tsx scripts/audit-patrick-brook-plansxpress-project.ts",
    "  tsx scripts/audit-patrick-brook-plansxpress-project.ts --pxd path/to/project.pxd --hbxl path/to/smart-schedule.csv",
    "",
    "Reads the PlansXpress project file and writes offline audit reports only. It does not modify HBXL files, the database, or APIs.",
  ].join("\n");
}

function buildAudit(pxdPath: string, compressedPxd: Buffer, hbxlPath: string, hbxlCsvContent: string): PlansXpressProjectAudit {
  const decompressed = gunzipSync(compressedPxd);
  const xml = decompressed.toString("utf8");
  const wallRecords = nodeStartTags(xml, "Wall").map(parseAttributes);
  const areaRecords = nodeStartTags(xml, "Area").map(parseAttributes);
  const internalDecorationRows = parseHbxlSmartSchedule(hbxlCsvContent).filter((resource) => resource.buildPhase === "Internal Decoration");

  const decoratedWallRecords = wallRecords.map(parseDecoratedWallRecord).filter((record): record is DecoratedWallRecord => !!record);
  const decoratedCeilingRecords = areaRecords.map(parseDecoratedCeilingRecord).filter((record): record is DecoratedCeilingRecord => !!record);
  const directWallDecorationRows = internalDecorationRows.filter((resource) => /wall decoration/i.test(`${resource.resourceType} ${resource.description}`));

  return {
    source: {
      pxd: pxdPath,
      smartSchedule: hbxlPath,
      container: compressedPxd[0] === 0x1f && compressedPxd[1] === 0x8b ? "gzip XML" : "unknown",
      plansXpressVersion: /<PlansXpress\b[^>]*\bVersion="([^"]+)"/i.exec(xml)?.[1] ?? null,
      decompressedBytes: decompressed.byteLength,
    },
    estimateDataCounts: {
      walls: wallRecords.length,
      doors: nodeStartTags(xml, "Door").length,
      windows: nodeStartTags(xml, "Window").length,
      objects: nodeStartTags(xml, "Object").length,
      areas: areaRecords.length,
      treatments: nodeStartTags(xml, "Treatment").length,
      rooms: nodeStartTags(xml, "Room").length,
    },
    decoratedWallAggregate: {
      records: decoratedWallRecords,
      uniqueLocations: Array.from(new Set(decoratedWallRecords.map((record) => record.location))).sort((a, b) => a.localeCompare(b)),
      grossAreaM2: round(sum(decoratedWallRecords, "grossAreaM2")),
      netAreaOpeningsDeductedOnceM2: round(sum(decoratedWallRecords, "netAreaOpeningsDeductedOnceM2")),
      netAreaOpeningsDeductedPerSideM2: round(sum(decoratedWallRecords, "netAreaOpeningsDeductedPerSideM2")),
    },
    decoratedCeilingAggregate: {
      records: decoratedCeilingRecords,
      totalAreaM2: round(sum(decoratedCeilingRecords, "areaM2")),
    },
    smartScheduleComparison: {
      internalDecorationRows: internalDecorationRows.map((resource) => ({
        sourceRow: resource.sourceRow,
        typeOfResource: resource.typeOfResource,
        resourceType: resource.resourceType,
        productCode: resource.productCode,
        description: resource.description,
        quantity: resource.quantity,
        unit: resource.unit,
      })),
      internalDecorationRowsWithPositiveQuantity: internalDecorationRows.filter((resource) => resource.quantity > 0).length,
      wallDecorationQuantityRows: directWallDecorationRows.length,
      directWallDecorationQuantityFound: directWallDecorationRows.length > 0,
    },
    conclusion: "PlansXpress project XML stores aggregate decorated wall and decorated ceiling geometry, but wall locations are broad project zones rather than room IDs. The Smart Schedule contains decoration labour/material resources, not a direct Wall Decoration m2 quantity row. Room-level Wall Decoration remains REVIEW REQUIRED.",
  };
}

function parseDecoratedWallRecord(attributes: Map<string, string>): DecoratedWallRecord | null {
  const decoratedSides = [
    attributeText(attributes, "Is_main_wall_decorated_internally"),
    attributeText(attributes, "Is_main_wall_decorated_to_side_1"),
    attributeText(attributes, "Is_main_wall_decorated_to_side_2"),
  ].filter((value) => value === "Y").length;
  if (decoratedSides === 0) return null;

  const lengthM = numberValue(attributeText(attributes, "Length_of_main_wall"));
  const heightM = numberValue(attributeText(attributes, "Height_of_main_wall"));
  const openingAreaM2 = numberValue(attributeText(attributes, "AREAOFOPENINGS"));
  const grossAreaM2 = lengthM * heightM * decoratedSides;

  return {
    id: attributeText(attributes, "ID"),
    location: attributeText(attributes, "Location"),
    spreadsheet: attributeText(attributes, "Spreadsheet"),
    lengthM,
    heightM,
    openingAreaM2,
    decoratedSides,
    grossAreaM2: round(grossAreaM2),
    netAreaOpeningsDeductedOnceM2: round(Math.max(0, grossAreaM2 - openingAreaM2)),
    netAreaOpeningsDeductedPerSideM2: round(Math.max(0, grossAreaM2 - openingAreaM2 * decoratedSides)),
    openingsList: attributeText(attributes, "Openings_in_wall"),
  };
}

function parseDecoratedCeilingRecord(attributes: Map<string, string>): DecoratedCeilingRecord | null {
  if (attributeText(attributes, "Are_ceilings_to_be_decorated") !== "Y") return null;
  if (!/ceiling/i.test(attributeText(attributes, "Spreadsheet"))) return null;

  return {
    id: attributeText(attributes, "ID"),
    location: attributeText(attributes, "Location"),
    spreadsheet: attributeText(attributes, "Spreadsheet"),
    areaM2: round(numberValue(attributeText(attributes, "PXAREA"))),
    perimeterM: round(numberValue(attributeText(attributes, "PXLENGTH"))),
  };
}

function renderAuditMarkdown(audit: PlansXpressProjectAudit): string {
  return [
    "# Patrick Brook PlansXpress Project Audit",
    "",
    "Read-only audit of the local PlansXpress `.pxd` project file against the exported HBXL Smart Schedule.",
    "",
    "## Source",
    "",
    `- PXD: ${audit.source.pxd}`,
    `- Container: ${audit.source.container}`,
    `- PlansXpress version: ${audit.source.plansXpressVersion ?? "unknown"}`,
    `- Decompressed XML bytes: ${audit.source.decompressedBytes}`,
    `- Smart Schedule: ${audit.source.smartSchedule}`,
    "",
    "## Estimate Data Counts",
    "",
    `- Walls: ${audit.estimateDataCounts.walls}`,
    `- Doors: ${audit.estimateDataCounts.doors}`,
    `- Windows: ${audit.estimateDataCounts.windows}`,
    `- Objects: ${audit.estimateDataCounts.objects}`,
    `- Areas: ${audit.estimateDataCounts.areas}`,
    `- Treatments: ${audit.estimateDataCounts.treatments}`,
    `- Rooms: ${audit.estimateDataCounts.rooms}`,
    "",
    "## Wall Decoration Aggregate",
    "",
    `- Decorated wall records: ${audit.decoratedWallAggregate.records.length}`,
    `- Stored wall locations: ${audit.decoratedWallAggregate.uniqueLocations.join(", ")}`,
    `- Gross decorated wall area: ${audit.decoratedWallAggregate.grossAreaM2} m2`,
    `- Net area, openings deducted once: ${audit.decoratedWallAggregate.netAreaOpeningsDeductedOnceM2} m2`,
    `- Net area, openings deducted per decorated side: ${audit.decoratedWallAggregate.netAreaOpeningsDeductedPerSideM2} m2`,
    "",
    "| ID | Location | Specification | Length m | Height m | Openings m2 | Sides | Gross m2 | Net m2, openings once | Net m2, openings per side |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...audit.decoratedWallAggregate.records.map((record) => `| ${record.id} | ${record.location} | ${record.spreadsheet} | ${record.lengthM} | ${record.heightM} | ${record.openingAreaM2} | ${record.decoratedSides} | ${record.grossAreaM2} | ${record.netAreaOpeningsDeductedOnceM2} | ${record.netAreaOpeningsDeductedPerSideM2} |`),
    "",
    "## Ceiling Decoration Aggregate",
    "",
    `- Decorated ceiling records: ${audit.decoratedCeilingAggregate.records.length}`,
    `- Decorated ceiling area: ${audit.decoratedCeilingAggregate.totalAreaM2} m2`,
    "",
    "| ID | Location | Specification | Area m2 | Perimeter m |",
    "| --- | --- | --- | ---: | ---: |",
    ...audit.decoratedCeilingAggregate.records.map((record) => `| ${record.id} | ${record.location} | ${record.spreadsheet} | ${record.areaM2} | ${record.perimeterM} |`),
    "",
    "## Smart Schedule Comparison",
    "",
    `- Internal Decoration rows: ${audit.smartScheduleComparison.internalDecorationRows.length}`,
    `- Internal Decoration rows with positive quantity: ${audit.smartScheduleComparison.internalDecorationRowsWithPositiveQuantity}`,
    `- Direct Wall Decoration m2 quantity rows: ${audit.smartScheduleComparison.wallDecorationQuantityRows}`,
    "",
    "| CSV Row | Kind | Resource Type | Product Code | Description | Quantity | Unit |",
    "| ---: | --- | --- | --- | --- | ---: | --- |",
    ...audit.smartScheduleComparison.internalDecorationRows.map((resource) => `| ${resource.sourceRow} | ${resource.typeOfResource} | ${resource.resourceType} | ${resource.productCode || "-"} | ${resource.description} | ${resource.quantity} | ${resource.unit || "-"} |`),
    "",
    "## Conclusion",
    "",
    audit.conclusion,
    "",
  ].join("\n");
}

function nodeStartTags(xml: string, tagName: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}\\b([^>]*)\\/?>(?:<\\/${tagName}>)?`, "gi")), (match) => match[1]);
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

function numberValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum<T>(records: T[], key: keyof T): number {
  return records.reduce((total, record) => total + Number(record[key] ?? 0), 0);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const [compressedPxd, hbxlCsvContent] = await Promise.all([
    readFile(options.pxd),
    readFile(options.hbxl, "utf8"),
  ]);
  const audit = buildAudit(options.pxd, compressedPxd, options.hbxl, hbxlCsvContent);

  await Promise.all([
    mkdir(dirname(options.jsonOut), { recursive: true }),
    mkdir(dirname(options.markdownOut), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(options.jsonOut, `${JSON.stringify(audit, null, 2)}\n`, "utf8"),
    writeFile(options.markdownOut, renderAuditMarkdown(audit), "utf8"),
  ]);

  console.log([
    "PlansXpress project audit built",
    `Walls: ${audit.estimateDataCounts.walls}`,
    `Decorated wall records: ${audit.decoratedWallAggregate.records.length}`,
    `Net decorated wall area, openings deducted once: ${audit.decoratedWallAggregate.netAreaOpeningsDeductedOnceM2} m2`,
    `Net decorated wall area, openings deducted per side: ${audit.decoratedWallAggregate.netAreaOpeningsDeductedPerSideM2} m2`,
    `Decorated ceiling area: ${audit.decoratedCeilingAggregate.totalAreaM2} m2`,
    `Direct Wall Decoration m2 Smart Schedule rows: ${audit.smartScheduleComparison.wallDecorationQuantityRows}`,
    `JSON: ${options.jsonOut}`,
    `Markdown: ${options.markdownOut}`,
  ].join("\n"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

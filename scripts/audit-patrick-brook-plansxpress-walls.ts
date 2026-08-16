import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

interface CliOptions {
  pxd: string;
  jsonOut: string;
  markdownOut: string;
}

interface Point2d {
  xMm: number;
  yMm: number;
}

interface OpeningRef {
  sourceId: string;
  plansXpressHandle: string;
  plansXpressPxid: string;
  entityType: string;
  type: string;
  template: string;
  widthMm: number;
  heightMm: number;
  distanceFromWallStartMm: number;
}

interface WallScheduleItem {
  wallId: string;
  entitySequence: number;
  estimateSequence: number | null;
  plansXpressHandle: string;
  plansXpressPxid: string;
  estimateWallId: string | null;
  wallType: string;
  startPoint: Point2d;
  endPoint: Point2d;
  rawLengthMm: number;
  rawLengthM: number;
  storedEstimateLengthM: number | null;
  lengthDeltaM: number | null;
  angleDeg: number;
  heightMm: number;
  storedEstimateHeightM: number | null;
  construction: string;
  estimatingCalculator: string;
  template: string;
  externalLeafConstruction: string;
  internalLeafConstruction: string;
  externalLeafThicknessMm: number;
  cavityThicknessMm: number;
  internalLeafThicknessMm: number;
  justification: string;
  externalSide: string;
  internalSide: string;
  openingIds: string[];
  openings: OpeningRef[];
  storedOpeningAreaM2: number;
  grossAreaM2: number;
  netAreaM2: number;
  location: string | null;
  adjacentWorkArea: string | null;
  reconciliationStatus: "MATCH" | "REVIEW REQUIRED";
  reconciliationReason: string;
}

interface WallScheduleAudit {
  source: {
    pxd: string;
    container: "gzip XML" | "unknown";
    plansXpressVersion: string | null;
    decompressedBytes: number;
  };
  schedule: WallScheduleItem[];
  reconciliation: {
    entityWallCount: number;
    estimateWallCount: number;
    matchedWalls: number;
    unmatchedEntityWalls: number;
    unmatchedEstimateWalls: number;
    totalStoredLengthM: number;
    totalRawEntityLengthM: number;
    totalLengthDeltaM: number;
    totalGrossAreaM2: number;
    totalOpeningAreaM2: number;
    totalNetAreaM2: number;
    externalStoredLengthM: number;
    internalStoredLengthM: number;
    status: "MATCH" | "REVIEW REQUIRED";
    proof: string[];
  };
}

const DEFAULT_OPTIONS: CliOptions = {
  pxd: "C:/Users/rudyb/Desktop/Patrick Brook.pxd",
  jsonOut: "reports/offline-project-model/patrick-brook-plansxpress-wall-schedule.json",
  markdownOut: "reports/offline-project-model/patrick-brook-plansxpress-wall-schedule.md",
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
    "  tsx scripts/audit-patrick-brook-plansxpress-walls.ts",
    "  tsx scripts/audit-patrick-brook-plansxpress-walls.ts --pxd path/to/project.pxd",
    "",
    "Reads PlansXpress wall entities and writes offline wall-schedule reports only.",
  ].join("\n");
}

function buildAudit(pxdPath: string, compressedPxd: Buffer): WallScheduleAudit {
  const decompressed = gunzipSync(compressedPxd);
  const xml = decompressed.toString("utf8");
  const wallEntityBlocks = topLevelEntityBlocks(xml)
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => attributeText(parseAttributes(entityStartTag(block)), "EntityType") === "5000");
  const estimateWalls = estimateWallRecords(xml);
  const estimatesByCalculatorAndPxid = new Map<string, { sequence: number; attributes: Map<string, string> }>();

  estimateWalls.forEach((attributes, index) => {
    const id = attributeText(attributes, "ID");
    const pxid = id.split("-")[0];
    const calculator = attributeText(attributes, "Spreadsheet");
    estimatesByCalculatorAndPxid.set(`${calculator}|${pxid}`, { sequence: index + 1, attributes });
  });

  const schedule = wallEntityBlocks.map(({ block }, index): WallScheduleItem => {
    const entityAttrs = parseAttributes(entityStartTag(block));
    const extendedData = wallExtendedData(block);
    const calculator = extendedData.get("CADX_Spreadsheet") ?? "";
    const pxid = extendedData.get("PXID") ?? "";
    const estimateMatch = estimatesByCalculatorAndPxid.get(`${calculator}|${pxid}`) ?? null;
    const estimateAttrs = estimateMatch?.attributes ?? null;
    const startPoint = { xMm: round3(numberValue(attributeText(entityAttrs, "Point1_x"))), yMm: round3(numberValue(attributeText(entityAttrs, "Point1_y"))) };
    const endPoint = { xMm: round3(numberValue(attributeText(entityAttrs, "Point2_x"))), yMm: round3(numberValue(attributeText(entityAttrs, "Point2_y"))) };
    const rawLengthMm = distance(startPoint, endPoint);
    const storedEstimateLengthM = estimateAttrs ? numberValue(attributeText(estimateAttrs, "Length_of_main_wall")) : null;
    const storedEstimateHeightM = estimateAttrs ? numberValue(attributeText(estimateAttrs, "Height_of_main_wall")) : null;
    const storedOpeningAreaM2 = estimateAttrs ? numberValue(attributeText(estimateAttrs, "AREAOFOPENINGS")) : 0;
    const grossAreaM2 = storedEstimateLengthM !== null && storedEstimateHeightM !== null ? storedEstimateLengthM * storedEstimateHeightM : (rawLengthMm / 1000) * (numberValue(attributeText(entityAttrs, "WallHeight")) / 1000);
    const wallId = `PX-WALL-${String(index + 1).padStart(3, "0")}`;
    const openings = openingRefs(block, wallId);

    return {
      wallId,
      entitySequence: index + 1,
      estimateSequence: estimateMatch?.sequence ?? null,
      plansXpressHandle: attributeText(entityAttrs, "Handle"),
      plansXpressPxid: pxid,
      estimateWallId: estimateAttrs ? attributeText(estimateAttrs, "ID") : null,
      wallType: wallType(entityAttrs, estimateAttrs),
      startPoint,
      endPoint,
      rawLengthMm: round3(rawLengthMm),
      rawLengthM: round3(rawLengthMm / 1000),
      storedEstimateLengthM,
      lengthDeltaM: storedEstimateLengthM === null ? null : round3(storedEstimateLengthM - rawLengthMm / 1000),
      angleDeg: round3(angleDegrees(startPoint, endPoint)),
      heightMm: numberValue(attributeText(entityAttrs, "WallHeight")),
      storedEstimateHeightM,
      construction: estimateAttrs ? attributeText(estimateAttrs, "Wall_Spec_Type") : wallConstruction(entityAttrs),
      estimatingCalculator: calculator,
      template: extendedData.get("CADX_Template") ?? "",
      externalLeafConstruction: leafConstruction(attributeText(entityAttrs, "ExtLeafType"), calculator),
      internalLeafConstruction: leafConstruction(attributeText(entityAttrs, "IntLeafType"), calculator),
      externalLeafThicknessMm: numberValue(attributeText(entityAttrs, "ExtThickness")),
      cavityThicknessMm: numberValue(attributeText(entityAttrs, "CavityThickness")),
      internalLeafThicknessMm: numberValue(attributeText(entityAttrs, "IntThickness")),
      justification: attributeText(entityAttrs, "Justification"),
      externalSide: attributeText(entityAttrs, "ExternalSide"),
      internalSide: attributeText(entityAttrs, "ExternalSide") === "0" ? "1" : "0",
      openingIds: openings.map((opening) => opening.sourceId),
      openings,
      storedOpeningAreaM2,
      grossAreaM2: round3(grossAreaM2),
      netAreaM2: round3(Math.max(0, grossAreaM2 - storedOpeningAreaM2)),
      location: estimateAttrs ? attributeText(estimateAttrs, "Location") : null,
      adjacentWorkArea: null,
      reconciliationStatus: estimateMatch ? "MATCH" : "REVIEW REQUIRED",
      reconciliationReason: estimateMatch
        ? "Matched by PlansXpress wall PXID plus estimating calculator. Raw entity length is centreline geometry; stored estimate length includes PlansXpress wall/junction adjustments."
        : "No EstimateData wall record matched this entity by PXID plus estimating calculator.",
    };
  });

  const matchedEstimateKeys = new Set(schedule.filter((wall) => wall.estimateWallId).map((wall) => `${wall.estimatingCalculator}|${wall.plansXpressPxid}`));
  const unmatchedEstimateWalls = estimateWalls.filter((attributes) => !matchedEstimateKeys.has(`${attributeText(attributes, "Spreadsheet")}|${attributeText(attributes, "ID").split("-")[0]}`));
  const matchedWalls = schedule.filter((wall) => wall.reconciliationStatus === "MATCH").length;
  const totalStoredLengthM = round3(sum(schedule, "storedEstimateLengthM"));
  const totalRawEntityLengthM = round3(sum(schedule, "rawLengthM"));
  const totalGrossAreaM2 = round3(sum(schedule, "grossAreaM2"));
  const totalOpeningAreaM2 = round3(sum(schedule, "storedOpeningAreaM2"));
  const totalNetAreaM2 = round3(sum(schedule, "netAreaM2"));
  const status = matchedWalls === wallEntityBlocks.length && unmatchedEstimateWalls.length === 0 ? "MATCH" : "REVIEW REQUIRED";

  return {
    source: {
      pxd: pxdPath,
      container: compressedPxd[0] === 0x1f && compressedPxd[1] === 0x8b ? "gzip XML" : "unknown",
      plansXpressVersion: /<PlansXpress\b[^>]*\bVersion="([^"]+)"/i.exec(xml)?.[1] ?? null,
      decompressedBytes: decompressed.byteLength,
    },
    schedule,
    reconciliation: {
      entityWallCount: wallEntityBlocks.length,
      estimateWallCount: estimateWalls.length,
      matchedWalls,
      unmatchedEntityWalls: schedule.length - matchedWalls,
      unmatchedEstimateWalls: unmatchedEstimateWalls.length,
      totalStoredLengthM,
      totalRawEntityLengthM,
      totalLengthDeltaM: round3(totalStoredLengthM - totalRawEntityLengthM),
      totalGrossAreaM2,
      totalOpeningAreaM2,
      totalNetAreaM2,
      externalStoredLengthM: round3(schedule.filter((wall) => wall.estimatingCalculator === "2 Leaf External Wall.xls").reduce((total, wall) => total + (wall.storedEstimateLengthM ?? 0), 0)),
      internalStoredLengthM: round3(schedule.filter((wall) => wall.estimatingCalculator === "Single Leaf Internal Wall.xls").reduce((total, wall) => total + (wall.storedEstimateLengthM ?? 0), 0)),
      status,
      proof: [
        `Top-level drawing wall entities are Entity records with EntityType=5000: ${wallEntityBlocks.length}.`,
        `Stored estimating wall records under EstimateData.Estimated.Walls.Wall: ${estimateWalls.length}.`,
        `Matched walls by ExtendedEntityData PXID plus CADX_Spreadsheet estimating calculator: ${matchedWalls}.`,
        "Each Job Tracker wall ID remains linked to the original PlansXpress Handle, PXID, start point, and end point.",
        "Stored estimate length, height, opening area, gross area, and net area reconcile by summing the individual matched wall records.",
      ],
    },
  };
}

function renderMarkdown(audit: WallScheduleAudit): string {
  return [
    "# Patrick Brook PlansXpress Wall Schedule",
    "",
    "Read-only wall entity schedule from the local PlansXpress `.pxd` project file. Decoration is intentionally excluded.",
    "",
    "## Source",
    "",
    `- PXD: ${audit.source.pxd}`,
    `- Container: ${audit.source.container}`,
    `- PlansXpress version: ${audit.source.plansXpressVersion ?? "unknown"}`,
    `- Decompressed XML bytes: ${audit.source.decompressedBytes}`,
    "",
    "## Reconciliation",
    "",
    `- Status: ${audit.reconciliation.status}`,
    `- EntityType=5000 wall entities: ${audit.reconciliation.entityWallCount}`,
    `- EstimateData wall records: ${audit.reconciliation.estimateWallCount}`,
    `- Matched walls: ${audit.reconciliation.matchedWalls}`,
    `- Unmatched entity walls: ${audit.reconciliation.unmatchedEntityWalls}`,
    `- Unmatched estimate walls: ${audit.reconciliation.unmatchedEstimateWalls}`,
    `- Raw entity centreline length total: ${audit.reconciliation.totalRawEntityLengthM} m`,
    `- Stored estimate length total: ${audit.reconciliation.totalStoredLengthM} m`,
    `- Stored minus raw length delta total: ${audit.reconciliation.totalLengthDeltaM} m`,
    `- External stored length total: ${audit.reconciliation.externalStoredLengthM} m`,
    `- Internal stored length total: ${audit.reconciliation.internalStoredLengthM} m`,
    `- Gross area total: ${audit.reconciliation.totalGrossAreaM2} m2`,
    `- Opening area total: ${audit.reconciliation.totalOpeningAreaM2} m2`,
    `- Net area total: ${audit.reconciliation.totalNetAreaM2} m2`,
    "",
    ...audit.reconciliation.proof.map((line) => `- ${line}`),
    "",
    "## Wall Schedule",
    "",
    "| Wall ID | PX Handle | PXID | Estimate ID | Type | Start mm | End mm | Raw Length m | Stored Length m | Height mm | Construction | Thickness ext/cav/int mm | Calculator | Opening IDs | Gross m2 | Net m2 | Location | Adjacent Work Area |",
    "| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | --- | --- |",
    ...audit.schedule.map((wall) => `| ${wall.wallId} | ${wall.plansXpressHandle} | ${wall.plansXpressPxid} | ${wall.estimateWallId ?? "-"} | ${wall.wallType} | (${wall.startPoint.xMm}, ${wall.startPoint.yMm}) | (${wall.endPoint.xMm}, ${wall.endPoint.yMm}) | ${wall.rawLengthM} | ${wall.storedEstimateLengthM ?? "-"} | ${wall.heightMm} | ${wall.construction} | ${wall.externalLeafThicknessMm}/${wall.cavityThicknessMm}/${wall.internalLeafThicknessMm} | ${wall.estimatingCalculator} | ${wall.openingIds.length ? wall.openingIds.join(", ") : "-"} | ${wall.grossAreaM2} | ${wall.netAreaM2} | ${wall.location ?? "-"} | ${wall.adjacentWorkArea ?? "Not deterministically exposed"} |`),
    "",
    "## Opening References",
    "",
    "| Wall ID | Opening ID | Type | PX Handle | PXID | Template | Width mm | Height mm | Distance From Wall Start mm |",
    "| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: |",
    ...audit.schedule.flatMap((wall) => wall.openings.map((opening) => `| ${wall.wallId} | ${opening.sourceId} | ${opening.type} | ${opening.plansXpressHandle} | ${opening.plansXpressPxid} | ${opening.template} | ${opening.widthMm} | ${opening.heightMm} | ${opening.distanceFromWallStartMm} |`)),
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

function estimateWallRecords(xml: string): Map<string, string>[] {
  const estimateWalls = /<Walls\b[^>]*>([\s\S]*?)<\/Walls>/i.exec(xml)?.[1] ?? "";
  return Array.from(estimateWalls.matchAll(/<Wall\b([^>]*)\/?>(?:<\/Wall>)?/gi), (match) => parseAttributes(match[1]));
}

function wallExtendedData(block: string): Map<string, string> {
  const allExtendedData = Array.from(block.matchAll(/<ExtendedEntityData>([\s\S]*?)<\/ExtendedEntityData>/gi), (match) => dataMap(match[1]));
  return allExtendedData.find((data) => /Wall\.xls$/i.test(data.get("CADX_Spreadsheet") ?? "")) ?? new Map<string, string>();
}

function openingRefs(block: string, wallId: string): OpeningRef[] {
  const wallBreaks = /<WallBreaks>([\s\S]*?)<\/WallBreaks>/i.exec(block)?.[1] ?? "";
  return Array.from(wallBreaks.matchAll(/<Break\b([^>]*)>([\s\S]*?)<\/Break>/gi), (match, index): OpeningRef => {
    const breakAttrs = parseAttributes(match[1]);
    const breakContent = match[2];
    const entityAttrs = parseAttributes(/<Entity\b([^>]*)>/i.exec(breakContent)?.[1] ?? "");
    const data = dataMap(/<ExtendedEntityData>([\s\S]*?)<\/ExtendedEntityData>/i.exec(breakContent)?.[1] ?? "");
    const pxid = data.get("PXID") ?? "";
    const handle = attributeText(entityAttrs, "Handle");
    const entityType = attributeText(entityAttrs, "EntityType");

    return {
      sourceId: `${wallId}-OPENING-${String(index + 1).padStart(3, "0")}`,
      plansXpressHandle: handle,
      plansXpressPxid: pxid,
      entityType,
      type: openingType(entityType, data.get("CADX_Spreadsheet") ?? ""),
      template: data.get("CADX_Template") ?? "",
      widthMm: numberValue(attributeText(entityAttrs, "WindowWidth") || attributeText(entityAttrs, "DoorWidth") || attributeText(breakAttrs, "Width")),
      heightMm: numberValue(attributeText(entityAttrs, "WindowHeight") || attributeText(entityAttrs, "DoorHeight")),
      distanceFromWallStartMm: numberValue(attributeText(breakAttrs, "DistFromWallStart")),
    };
  });
}

function dataMap(xml: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Data>([\s\S]*?)<\/Data>/gi)) {
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

function numberValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function distance(start: Point2d, end: Point2d): number {
  return Math.sqrt((end.xMm - start.xMm) ** 2 + (end.yMm - start.yMm) ** 2);
}

function angleDegrees(start: Point2d, end: Point2d): number {
  const angle = Math.atan2(end.yMm - start.yMm, end.xMm - start.xMm) * 180 / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

function wallType(entityAttrs: Map<string, string>, estimateAttrs: Map<string, string> | null): string {
  const calculator = estimateAttrs ? attributeText(estimateAttrs, "Spreadsheet") : "";
  if (/2 Leaf External Wall/i.test(calculator)) return "Cavity external wall";
  if (/Single Leaf Internal Wall/i.test(calculator)) return "Single leaf internal partition";
  return wallConstruction(entityAttrs);
}

function wallConstruction(entityAttrs: Map<string, string>): string {
  const wallConsType = attributeText(entityAttrs, "WallConsType");
  if (wallConsType === "0") return "Cavity";
  if (wallConsType === "1") return "Single leaf";
  return `Unknown wall construction ${wallConsType}`;
}

function leafConstruction(code: string, calculator: string): string {
  if (calculator === "2 Leaf External Wall.xls" && code === "0") return "Brick";
  if (calculator === "2 Leaf External Wall.xls" && code === "1") return "Block";
  if (calculator === "Single Leaf Internal Wall.xls" && code === "3") return "Internal metal stud/partition leaf";
  if (code === "") return "Not set";
  return `Raw leaf code ${code}`;
}

function openingType(entityType: string, spreadsheet: string): string {
  if (entityType === "5001" || /window/i.test(spreadsheet)) return "Window";
  if (entityType === "5002" || /door/i.test(spreadsheet)) return "Door";
  if (/opening/i.test(spreadsheet)) return "Structural opening";
  return `EntityType ${entityType}`;
}

function sum(records: WallScheduleItem[], key: keyof WallScheduleItem): number {
  return records.reduce((total, record) => total + Number(record[key] ?? 0), 0);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
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
    "PlansXpress wall schedule built",
    `Entity wall count: ${audit.reconciliation.entityWallCount}`,
    `Estimate wall count: ${audit.reconciliation.estimateWallCount}`,
    `Matched walls: ${audit.reconciliation.matchedWalls}`,
    `Stored length total: ${audit.reconciliation.totalStoredLengthM} m`,
    `Gross area total: ${audit.reconciliation.totalGrossAreaM2} m2`,
    `Net area total: ${audit.reconciliation.totalNetAreaM2} m2`,
    `Status: ${audit.reconciliation.status}`,
    `JSON: ${options.jsonOut}`,
    `Markdown: ${options.markdownOut}`,
  ].join("\n"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

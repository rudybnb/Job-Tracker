import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  analyseElectricalProject,
  detectRoomBoundaries,
  fingerprintBlock,
  parsePlansXpressDxf,
  type BlockFingerprint,
  type DxfBlockDefinition,
  type DxfCircleEntity,
  type DxfEntity,
  type DxfInsertEntity,
  type DxfLineEntity,
  type DxfPolylineEntity,
  type DxfTextEntity,
  type ElectricalObject,
  type Point2d,
  type RoomBoundary,
} from "../shared/measurable-work/offline-electrical.ts";

interface CliOptions {
  project: string;
  dxf: string;
  hbxl: string;
  outDir: string;
}

interface NearbyRoom {
  room: string;
  distance: number;
  relation: "inside" | "nearest-label" | "nearest-boundary";
}

interface WallSummary {
  layer: string;
  start: Point2d;
  end: Point2d;
  distance: number;
  orientation: string;
}

interface SymbolOccurrence {
  source: ElectricalObject["source"];
  label: string;
  layer: string;
  blockName: string | null;
  point: Point2d;
  rotation: number | null;
  workArea: string | null;
  nearbyRooms: NearbyRoom[];
  reason: string | null;
}

interface UnknownSymbolGroup {
  symbol: string;
  fingerprintId: string;
  layers: string[];
  blockNames: string[];
  geometry: GeometrySummary;
  occurrenceCount: number;
  coordinates: SymbolOccurrence[];
  containedText: string[];
  suggestedHbxlCandidates: string[];
  mappingNote: string;
}

interface RoomAllocationOccurrence extends SymbolOccurrence {
  identifiedItem: string;
  adjacentRooms: NearbyRoom[];
  nearestWalls: WallSummary[];
  crossingWallsToNearestRoom: WallSummary[];
}

interface RoomAllocationGroup {
  groupId: string;
  identifiedItem: string;
  reason: string;
  fingerprintId: string;
  occurrenceCount: number;
  occurrences: RoomAllocationOccurrence[];
}

interface GeometrySummary {
  typeCounts: Record<string, number>;
  lineCount: number;
  circleCount: number;
  arcCount: number;
  polylineCount: number;
  circleRadii: number[];
  arcRadii: number[];
  aspectRatio: number | null;
  textTokens: string[];
}

const DEFAULT_DXF = "test-fixtures/patrick-brook/Chat Test.dxf";
const DEFAULT_HBXL = "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv";
const DEFAULT_OUT_DIR = "reports/electrical-symbol-learning";
const REVIEW_MAPPING_NOTE = "Suggestions are for human PlansXpress symbol learning only. No automatic mapping was applied.";

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    project: "Patrick Brook / Chat Test",
    dxf: DEFAULT_DXF,
    hbxl: DEFAULT_HBXL,
    outDir: DEFAULT_OUT_DIR,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--help") throw new Error(usage());
    if (!next) throw new Error(`Missing value for ${arg}`);

    if (arg === "--project") options.project = next;
    else if (arg === "--dxf") options.dxf = next;
    else if (arg === "--hbxl") options.hbxl = next;
    else if (arg === "--out-dir") options.outDir = next;
    else throw new Error(`Unknown option: ${arg}`);
    i++;
  }

  return options;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/review-electrical-symbol-learning.ts --out-dir reports/electrical-symbol-learning",
    "",
    "Creates isolated human-review JSON, Markdown and SVG contact-sheet outputs from local DXF/HBXL files only.",
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const [dxfContent, hbxlCsvContent] = await Promise.all([
    readFile(options.dxf, "utf8"),
    readFile(options.hbxl, "utf8"),
  ]);

  const dxf = parsePlansXpressDxf(dxfContent);
  const rooms = detectRoomBoundaries(dxf);
  const report = analyseElectricalProject({ project: options.project, dxfContent, hbxlCsvContent });
  const blockMap = new Map(dxf.blocks.map((block) => [block.name, block]));
  const insertMap = new Map(dxf.entities.filter(isInsertEntity).map((insert) => [insertKey(insert.blockName, insert.point), insert]));
  const wallSegments = extractWallSegments(dxf, blockMap);
  const unresolvedHbxlItems = report.reconciliation.filter((item) => item.status === "REVIEW REQUIRED" && item.dxfTotal === 0).map((item) => item.item);
  const unknownGroups = groupUnknownSymbols(report.reviewItems.filter((item) => !item.item), blockMap, insertMap, rooms, unresolvedHbxlItems);
  const roomAllocationGroups = groupRoomAllocationReviews(report.reviewItems.filter((item) => !!item.item), insertMap, rooms, wallSegments);

  const output = {
    project: options.project,
    sourceFiles: { dxf: options.dxf, hbxl: options.hbxl },
    scope: "Phase 1C PlansXpress electrical symbol learning review. No dictionary mappings changed.",
    summary: {
      realElectricalDxfObjects: report.detected.electricalObjects,
      confidentlyClassified: report.detected.confidentlyIdentified,
      uniqueUnknownSymbolFingerprints: unknownGroups.length,
      unknownSymbolOccurrences: unknownGroups.reduce((total, group) => total + group.occurrenceCount, 0),
      roomAllocationReviewGroups: roomAllocationGroups.length,
      roomAllocationReviewOccurrences: roomAllocationGroups.reduce((total, group) => total + group.occurrenceCount, 0),
      fullyReconciledProjectElectricalItemTypes: report.reconciliation.filter((item) => item.status === "MATCH").length,
      unresolvedHbxlElectricalItemTypes: unresolvedHbxlItems.length,
    },
    unknownSymbolGroups: unknownGroups,
    roomAllocationReviewGroups: roomAllocationGroups,
    unresolvedHbxlItems,
  };

  await mkdir(options.outDir, { recursive: true });
  const jsonPath = join(options.outDir, "phase-1c-patrick-brook-symbol-learning.json");
  const markdownPath = join(options.outDir, "phase-1c-patrick-brook-symbol-learning.md");
  const svgPath = join(options.outDir, "phase-1c-patrick-brook-symbol-contact-sheet.svg");

  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderMarkdown(output), "utf8"),
    writeFile(svgPath, renderContactSheet(unknownGroups, blockMap), "utf8"),
  ]);

  console.log([
    `Phase 1C symbol-learning review written for ${options.project}`,
    `Unique unknown symbol fingerprints: ${unknownGroups.length}`,
    `Room-allocation review groups: ${roomAllocationGroups.length}`,
    `JSON: ${jsonPath}`,
    `Markdown: ${markdownPath}`,
    `SVG contact sheet: ${svgPath}`,
  ].join("\n"));
}

function groupUnknownSymbols(
  unknownItems: ElectricalObject[],
  blockMap: Map<string, DxfBlockDefinition>,
  insertMap: Map<string, DxfInsertEntity>,
  rooms: RoomBoundary[],
  unresolvedHbxlItems: string[],
): UnknownSymbolGroup[] {
  const groups = new Map<string, UnknownSymbolGroup & { representativeBlockName: string | null }>();

  for (const item of unknownItems) {
    const block = item.blockName ? blockMap.get(item.blockName) : undefined;
    const fingerprint = block ? fingerprintBlock(block) : item.fingerprint;
    const fingerprintKeyValue = fingerprint ? stableFingerprintKey(fingerprint) : `text-label:${item.label}`;
    const fingerprintId = fingerprintIdFor(fingerprintKeyValue);
    const existing = groups.get(fingerprintKeyValue);
    const insert = item.blockName ? insertMap.get(insertKey(item.blockName, item.point)) : undefined;
    const occurrence: SymbolOccurrence = {
      source: item.source,
      label: item.label,
      layer: item.layer,
      blockName: item.blockName ?? null,
      point: roundPoint(item.point),
      rotation: insert?.rotation ?? null,
      workArea: item.workArea,
      nearbyRooms: nearestRooms(item.point, rooms, 4),
      reason: item.reason ?? null,
    };

    if (!existing) {
      groups.set(fingerprintKeyValue, {
        symbol: "",
        fingerprintId,
        layers: [item.layer],
        blockNames: item.blockName ? [item.blockName] : [],
        geometry: fingerprint ? geometrySummary(fingerprint) : emptyGeometrySummary(),
        occurrenceCount: 1,
        coordinates: [occurrence],
        containedText: containedText(block, item.label),
        suggestedHbxlCandidates: suggestCandidates(item.label, fingerprint, unresolvedHbxlItems),
        mappingNote: REVIEW_MAPPING_NOTE,
        representativeBlockName: item.blockName ?? null,
      });
      continue;
    }

    if (!existing.layers.includes(item.layer)) existing.layers.push(item.layer);
    if (item.blockName && !existing.blockNames.includes(item.blockName)) existing.blockNames.push(item.blockName);
    for (const text of containedText(block, item.label)) {
      if (!existing.containedText.includes(text)) existing.containedText.push(text);
    }
    existing.occurrenceCount++;
    existing.coordinates.push(occurrence);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.fingerprintId.localeCompare(b.fingerprintId))
    .map((group, index) => {
      const { representativeBlockName: _representativeBlockName, ...publicGroup } = group;
      return {
        ...publicGroup,
        symbol: `Symbol ${letterLabel(index)}`,
        layers: publicGroup.layers.sort(),
        blockNames: publicGroup.blockNames.sort(),
        containedText: publicGroup.containedText.sort(),
      };
    });
}

function groupRoomAllocationReviews(
  reviewItems: ElectricalObject[],
  insertMap: Map<string, DxfInsertEntity>,
  rooms: RoomBoundary[],
  wallSegments: DxfLineEntity[],
): RoomAllocationGroup[] {
  const groups = new Map<string, RoomAllocationGroup>();

  for (const item of reviewItems) {
    const fingerprintId = item.fingerprint ? fingerprintIdFor(stableFingerprintKey(item.fingerprint)) : fingerprintIdFor(item.label);
    const reason = item.reason ?? "room allocation review required";
    const key = [item.item, reason, fingerprintId].join("|");
    const nearby = nearestRooms(item.point, rooms, 4);
    const nearestLabelRoom = nearby.find((room) => room.relation === "nearest-label") ?? nearby[0];
    const insert = item.blockName ? insertMap.get(insertKey(item.blockName, item.point)) : undefined;
    const occurrence: RoomAllocationOccurrence = {
      source: item.source,
      label: item.label,
      identifiedItem: item.item ?? item.label,
      layer: item.layer,
      blockName: item.blockName ?? null,
      point: roundPoint(item.point),
      rotation: insert?.rotation ?? null,
      workArea: item.workArea,
      nearbyRooms: nearby,
      adjacentRooms: nearby,
      nearestWalls: nearestWalls(item.point, wallSegments, 3),
      crossingWallsToNearestRoom: nearestLabelRoom ? crossingWalls(item.point, roomAnchor(nearestLabelRoom.room, rooms), wallSegments) : [],
      reason,
    };

    const existing = groups.get(key);
    if (existing) {
      existing.occurrenceCount++;
      existing.occurrences.push(occurrence);
    } else {
      groups.set(key, {
        groupId: fingerprintIdFor(key),
        identifiedItem: item.item ?? item.label,
        reason,
        fingerprintId,
        occurrenceCount: 1,
        occurrences: [occurrence],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.identifiedItem.localeCompare(b.identifiedItem));
}

function stableFingerprintKey(fingerprint: BlockFingerprint): string {
  return JSON.stringify({
    typeCounts: sortRecord(fingerprint.typeCounts),
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

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function fingerprintIdFor(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function geometrySummary(fingerprint: BlockFingerprint): GeometrySummary {
  return {
    typeCounts: sortRecord(fingerprint.typeCounts),
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

function emptyGeometrySummary(): GeometrySummary {
  return { typeCounts: {}, lineCount: 0, circleCount: 0, arcCount: 0, polylineCount: 0, circleRadii: [], arcRadii: [], aspectRatio: null, textTokens: [] };
}

function containedText(block: DxfBlockDefinition | undefined, fallbackLabel: string): string[] {
  const blockTexts = block?.entities.filter(isTextEntity).map((entity) => entity.text.replace(/\s+/g, " ").trim()).filter(Boolean) ?? [];
  if (blockTexts.length > 0) return Array.from(new Set(blockTexts));
  return /^[A-Z][A-Z\s]+$/.test(fallbackLabel) ? [fallbackLabel] : [];
}

function suggestCandidates(label: string, fingerprint: BlockFingerprint | undefined, unresolvedHbxlItems: string[]): string[] {
  const suggestions = new Set<string>();
  const text = [label, ...(fingerprint?.textTokens ?? [])].join(" ").toLowerCase();
  const addIfUnresolved = (...items: string[]) => items.filter((item) => unresolvedHbxlItems.includes(item)).forEach((item) => suggestions.add(item));

  if (/oven|hob|cooker/.test(text)) addIfUnresolved("Cooker Connection Plate", "Cooker Control Unit", "Fused Spur 13A");
  if (/shower/.test(text)) addIfUnresolved("Pull Cord Switch 45A", "Pull Cord Switch 6A");
  if (/fan|extract/.test(text) || (fingerprint && fingerprint.arcCount > 20 && fingerprint.circleCount >= 1)) addIfUnresolved("Bathroom Extractor Fan");
  if (fingerprint && fingerprint.circleCount === 2 && fingerprint.circleRadii.some((radius) => Math.abs(radius - 50) < 1)) {
    addIfUnresolved("Light Switch 6A 1G 1 Way", "Light Switch 10A 2 Gang 2 Way", "Light Switch 6A 1G 2 Way", "Pull Cord Switch 6A", "Shaver Socket", "WC Ceiling Light Fitting");
  }
  if (fingerprint && fingerprint.arcCount === 2 && fingerprint.lineCount <= 4) addIfUnresolved("Light Switch 6A 1G 1 Way", "Pull Cord Switch 6A");

  return Array.from(suggestions).sort();
}

function nearestRooms(point: Point2d, rooms: RoomBoundary[], limit: number): NearbyRoom[] {
  return rooms
    .map((room) => {
      if (room.polygon.length >= 3 && pointInPolygon(point, room.polygon)) return { room: room.name, distance: 0, relation: "inside" as const };
      if (room.labelPoint) return { room: room.name, distance: round(distance(point, room.labelPoint)), relation: "nearest-label" as const };
      return { room: room.name, distance: round(distanceToPolygon(point, room.polygon)), relation: "nearest-boundary" as const };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function roomAnchor(roomName: string, rooms: RoomBoundary[]): Point2d {
  const room = rooms.find((candidate) => candidate.name === roomName);
  if (room?.labelPoint) return room.labelPoint;
  if (room?.polygon.length) return centroid(room.polygon);
  return { x: 0, y: 0 };
}

function nearestWalls(point: Point2d, walls: DxfLineEntity[], limit: number): WallSummary[] {
  return walls
    .map((wall) => ({
      layer: wall.layer,
      start: roundPoint(wall.start),
      end: roundPoint(wall.end),
      distance: round(distanceToSegment(point, wall.start, wall.end)),
      orientation: lineOrientation(wall),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function crossingWalls(start: Point2d, end: Point2d, walls: DxfLineEntity[]): WallSummary[] {
  return walls
    .filter((wall) => segmentsIntersect(start, end, wall.start, wall.end))
    .map((wall) => ({
      layer: wall.layer,
      start: roundPoint(wall.start),
      end: roundPoint(wall.end),
      distance: round(distanceToSegment(start, wall.start, wall.end)),
      orientation: lineOrientation(wall),
    }))
    .sort((a, b) => a.distance - b.distance);
}

function extractWallSegments(dxf: ReturnType<typeof parsePlansXpressDxf>, blockMap: Map<string, DxfBlockDefinition>): DxfLineEntity[] {
  const result: DxfLineEntity[] = [];
  for (const entity of dxf.entities) {
    if (isLineEntity(entity) && /\b(wall|walls)\b/i.test(entity.layer)) result.push(entity);
    if (!isInsertEntity(entity) || !/\b(wall|walls)\b/i.test(entity.layer)) continue;

    const block = blockMap.get(entity.blockName);
    if (!block) continue;

    for (const child of block.entities) {
      if (!isLineEntity(child)) continue;
      result.push({
        type: "LINE",
        layer: entity.layer,
        start: transformPoint(child.start, entity),
        end: transformPoint(child.end, entity),
      });
    }
  }
  return result;
}

function renderMarkdown(output: {
  project: string;
  sourceFiles: { dxf: string; hbxl: string };
  summary: Record<string, number>;
  unknownSymbolGroups: UnknownSymbolGroup[];
  roomAllocationReviewGroups: RoomAllocationGroup[];
  unresolvedHbxlItems: string[];
}): string {
  const lines = [
    `# Phase 1C PlansXpress Electrical Symbol Learning Review`,
    "",
    `Project: ${output.project}`,
    `DXF: ${output.sourceFiles.dxf}`,
    `HBXL: ${output.sourceFiles.hbxl}`,
    "",
    "No permanent symbol dictionary mappings were changed. Suggestions are human-review prompts only.",
    "",
    "## Summary",
    "",
    ...Object.entries(output.summary).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Unknown Symbol Groups",
    "",
  ];

  for (const group of output.unknownSymbolGroups) {
    lines.push(
      `### ${group.symbol}`,
      "",
      `- Fingerprint ID: ${group.fingerprintId}`,
      `- Occurrences: ${group.occurrenceCount}`,
      `- Layers: ${group.layers.join(", ") || "none"}`,
      `- Block/insert names: ${group.blockNames.join(", ") || "none"}`,
      `- Geometry: ${geometryInline(group.geometry)}`,
      `- Contained text: ${group.containedText.join(", ") || "none"}`,
      `- Suggested HBXL candidates: ${group.suggestedHbxlCandidates.join(", ") || "none"}`,
      `- Mapping note: ${group.mappingNote}`,
      "",
      "Coordinates:",
      "",
      ...group.coordinates.map((occurrence) => `- (${occurrence.point.x}, ${occurrence.point.y}), rotation ${occurrence.rotation ?? "unknown"}, nearby ${occurrence.nearbyRooms.map((room) => `${room.room} ${room.distance}`).join("; ")}, reason ${occurrence.reason ?? "none"}`),
      "",
    );
  }

  lines.push("## Room Allocation Review Groups", "");
  for (const group of output.roomAllocationReviewGroups) {
    lines.push(
      `### ${group.identifiedItem}`,
      "",
      `- Group ID: ${group.groupId}`,
      `- Fingerprint ID: ${group.fingerprintId}`,
      `- Reason: ${group.reason}`,
      `- Occurrences: ${group.occurrenceCount}`,
      "",
      "Occurrences:",
      "",
      ...group.occurrences.map((occurrence) => `- (${occurrence.point.x}, ${occurrence.point.y}), rotation ${occurrence.rotation ?? "unknown"}, adjacent ${occurrence.adjacentRooms.map((room) => `${room.room} ${room.distance}`).join("; ")}, nearest walls ${occurrence.nearestWalls.map((wall) => `${wall.layer} ${wall.distance} ${wall.orientation}`).join("; ") || "none"}, crossing walls ${occurrence.crossingWallsToNearestRoom.length}`),
      "",
    );
  }

  lines.push("## Unresolved HBXL Items", "", ...output.unresolvedHbxlItems.map((item) => `- ${item}`), "");
  return `${lines.join("\n")}\n`;
}

function geometryInline(geometry: GeometrySummary): string {
  return `types ${JSON.stringify(geometry.typeCounts)}, lines ${geometry.lineCount}, circles ${geometry.circleCount}, arcs ${geometry.arcCount}, polylines ${geometry.polylineCount}, circle radii [${geometry.circleRadii.join(", ")}], arc radii [${geometry.arcRadii.join(", ")}], aspect ${geometry.aspectRatio ?? "n/a"}`;
}

function renderContactSheet(groups: UnknownSymbolGroup[], blockMap: Map<string, DxfBlockDefinition>): string {
  const cellWidth = 300;
  const cellHeight = 240;
  const columns = 3;
  const rows = Math.max(1, Math.ceil(groups.length / columns));
  const cards = groups.map((group, index) => renderSymbolCard(group, blockMap, index, cellWidth, cellHeight, columns));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth * columns}" height="${cellHeight * rows}" viewBox="0 0 ${cellWidth * columns} ${cellHeight * rows}">`,
    `<rect width="100%" height="100%" fill="#f8fafc"/>`,
    ...cards,
    `</svg>`,
  ].join("\n");
}

function renderSymbolCard(group: UnknownSymbolGroup, blockMap: Map<string, DxfBlockDefinition>, index: number, cellWidth: number, cellHeight: number, columns: number): string {
  const x = (index % columns) * cellWidth;
  const y = Math.floor(index / columns) * cellHeight;
  const block = group.blockNames.map((name) => blockMap.get(name)).find(Boolean);
  const drawing = block ? renderBlockGeometry(block, x + 20, y + 55, cellWidth - 40, cellHeight - 85) : `<text x="${x + 20}" y="${y + 120}" font-size="12">No block geometry</text>`;

  return [
    `<g>`,
    `<rect x="${x + 8}" y="${y + 8}" width="${cellWidth - 16}" height="${cellHeight - 16}" rx="10" fill="#ffffff" stroke="#cbd5e1"/>`,
    `<text x="${x + 20}" y="${y + 30}" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${escapeXml(group.symbol)}</text>`,
    `<text x="${x + 110}" y="${y + 30}" font-family="Arial, sans-serif" font-size="11" fill="#475569">${escapeXml(group.fingerprintId)} · ${group.occurrenceCount} occurrence(s)</text>`,
    drawing,
    `</g>`,
  ].join("\n");
}

function renderBlockGeometry(block: DxfBlockDefinition, offsetX: number, offsetY: number, width: number, height: number): string {
  const points = blockPoints(block);
  if (points.length === 0) return `<text x="${offsetX}" y="${offsetY + height / 2}" font-size="12">No drawable geometry</text>`;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = Math.min(width / Math.max(1, maxX - minX), height / Math.max(1, maxY - minY)) * 0.85;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const toSvg = (point: Point2d) => ({ x: round(offsetX + width / 2 + (point.x - centerX) * scale), y: round(offsetY + height / 2 - (point.y - centerY) * scale) });
  const parts: string[] = [];

  for (const entity of block.entities) {
    if (isLineEntity(entity)) {
      const start = toSvg(entity.start);
      const end = toSvg(entity.end);
      parts.push(`<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#0f172a" stroke-width="1"/>`);
    } else if (isCircleEntity(entity)) {
      const center = toSvg(entity.center);
      parts.push(`<circle cx="${center.x}" cy="${center.y}" r="${Math.max(1, round(entity.radius * scale))}" fill="none" stroke="#2563eb" stroke-width="1.5"/>`);
    } else if (isPolylineEntity(entity)) {
      const path = entity.points.map((point) => {
        const svgPoint = toSvg(point);
        return `${svgPoint.x},${svgPoint.y}`;
      }).join(" ");
      parts.push(`<polyline points="${path}" fill="none" stroke="#334155" stroke-width="1"${entity.closed ? "" : " stroke-dasharray=\"3 3\""}/>`);
    } else if (isArcEntity(entity)) {
      const start = toSvg(arcPoint(entity.center, entity.radius, entity.startAngle));
      const end = toSvg(arcPoint(entity.center, entity.radius, entity.endAngle));
      const largeArc = Math.abs(entity.endAngle - entity.startAngle) > 180 ? 1 : 0;
      parts.push(`<path d="M ${start.x} ${start.y} A ${round(entity.radius * scale)} ${round(entity.radius * scale)} 0 ${largeArc} 0 ${end.x} ${end.y}" fill="none" stroke="#dc2626" stroke-width="1"/>`);
    } else if (isTextEntity(entity)) {
      const point = toSvg(entity.point);
      parts.push(`<text x="${point.x}" y="${point.y}" font-family="Arial, sans-serif" font-size="10" fill="#166534">${escapeXml(entity.text)}</text>`);
    }
  }

  return parts.join("\n");
}

function blockPoints(block: DxfBlockDefinition): Point2d[] {
  return block.entities.flatMap((entity) => {
    if (isLineEntity(entity)) return [entity.start, entity.end];
    if (isCircleEntity(entity)) return [
      { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
      { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
    ];
    if (isArcEntity(entity)) return [arcPoint(entity.center, entity.radius, entity.startAngle), arcPoint(entity.center, entity.radius, entity.endAngle), entity.center];
    if (isPolylineEntity(entity)) return entity.points;
    if (isTextEntity(entity)) return [entity.point];
    return [];
  });
}

function arcPoint(center: Point2d, radius: number, angleDegrees: number): Point2d {
  const radians = (angleDegrees * Math.PI) / 180;
  return { x: center.x + Math.cos(radians) * radius, y: center.y + Math.sin(radians) * radius };
}

function transformPoint(point: Point2d, insert: DxfInsertEntity): Point2d {
  const radians = (insert.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: insert.point.x + point.x * cos - point.y * sin, y: insert.point.y + point.x * sin + point.y * cos };
}

function lineOrientation(line: DxfLineEntity): string {
  const dx = Math.abs(line.end.x - line.start.x);
  const dy = Math.abs(line.end.y - line.start.y);
  if (dx > dy * 2) return "horizontal";
  if (dy > dx * 2) return "vertical";
  return "diagonal";
}

function pointInPolygon(point: Point2d, polygon: Point2d[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point: Point2d, polygon: Point2d[]): number {
  if (polygon.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...polygon.map((start, index) => distanceToSegment(point, start, polygon[(index + 1) % polygon.length])));
}

function distanceToSegment(point: Point2d, start: Point2d, end: Point2d): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function segmentsIntersect(a: Point2d, b: Point2d, c: Point2d, d: Point2d): boolean {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 1e-9) return false;
  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / denominator;
  const ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / denominator;
  return ua > 0.01 && ua < 0.99 && ub > 0.01 && ub < 0.99;
}

function centroid(points: Point2d[]): Point2d {
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

function distance(a: Point2d, b: Point2d): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roundPoint(point: Point2d): Point2d {
  return { x: round(point.x), y: round(point.y) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function insertKey(blockName: string, point: Point2d): string {
  return `${blockName}|${round(point.x)}|${round(point.y)}`;
}

function letterLabel(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let label = "";
  let value = index;
  do {
    label = alphabet[value % alphabet.length] + label;
    value = Math.floor(value / alphabet.length) - 1;
  } while (value >= 0);
  return label;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isTextEntity(entity: DxfEntity): entity is DxfTextEntity {
  return entity.type === "TEXT" || entity.type === "MTEXT";
}

function isInsertEntity(entity: DxfEntity): entity is DxfInsertEntity {
  return entity.type === "INSERT";
}

function isPolylineEntity(entity: DxfEntity): entity is DxfPolylineEntity {
  return entity.type === "LWPOLYLINE" || entity.type === "POLYLINE";
}

function isCircleEntity(entity: DxfEntity): entity is DxfCircleEntity {
  return entity.type === "CIRCLE";
}

function isArcEntity(entity: DxfEntity): entity is Extract<DxfEntity, { type: "ARC" }> {
  return entity.type === "ARC";
}

function isLineEntity(entity: DxfEntity): entity is DxfLineEntity {
  return entity.type === "LINE";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

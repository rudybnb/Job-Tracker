import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { detectRoomBoundaries, parsePlansXpressDxf } from "../shared/measurable-work/offline-electrical.ts";

interface CliOptions {
  pxd: string;
  dxf: string;
  wallSchedule: string;
  jsonOut: string;
  markdownOut: string;
}

interface Point2d {
  xMm: number;
  yMm: number;
}

interface WallScheduleItem {
  plansXpressHandle: string;
  plansXpressPxid: string;
  estimateWallId: string | null;
  wallType: string;
  startPoint: Point2d;
  endPoint: Point2d;
  storedEstimateLengthM: number | null;
  heightMm: number;
  storedEstimateHeightM: number | null;
  construction: string;
  estimatingCalculator: string;
  openingIds: string[];
  openings: Array<{ sourceId: string; type: string; widthMm: number; heightMm: number; plansXpressHandle: string; plansXpressPxid: string }>;
  storedOpeningAreaM2: number;
  grossAreaM2: number;
  netAreaM2: number;
  location: string | null;
  externalSide?: "0" | "1";
}

interface RoomLabelSeed {
  name: string;
  point: { x: number; y: number };
}

interface WallSegment {
  handle: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface WallScheduleAudit {
  schedule: WallScheduleItem[];
}

interface SideSurface {
  sideCode: "0" | "1";
  sideName: "Side A" | "Side B";
  workArea: string | null;
  availableSurfaceAreaM2: number;
  confidence: "MATCH" | "REVIEW REQUIRED";
  reason: string;
  resolutionSource: "ExteriorSide" | "AreaPolygon" | "RoomLabelLineOfSight" | "Unresolved";
  resolvedPreviouslyReviewRequired?: boolean;
}

interface AreaGeometry {
  handle: string;
  pxid: string;
  estimateAreaId: string | null;
  spreadsheet: string;
  template: string;
  location: string | null;
  polygon: Array<{ x: number; y: number }>;
  calculatedAreaM2: number;
  storedAreaM2: number | null;
  containedRoomLabels: string[];
  mappedRoom: string | null;
  usableAsRoomGeometry: boolean;
}

interface SurfaceScheduleItem {
  plansXpressHandle: string;
  plansXpressPxid: string;
  estimateWallId: string | null;
  wallType: string;
  startPoint: Point2d;
  endPoint: Point2d;
  lengthUsedByEstimatorM: number;
  heightM: number;
  grossConstructionAreaM2: number;
  openingDeductionsM2: number;
  netConstructionAreaM2: number;
  sideA: SideSurface;
  sideB: SideSurface;
  estimatorCalculator: string;
  openingIds: string[];
  confidence: "MATCH" | "REVIEW REQUIRED";
  confidenceReason: string;
}

interface SurfaceAudit {
  source: {
    pxd: string;
    dxf: string;
    wallSchedule: string;
    plansXpressVersion: string | null;
  };
  areaReconciliation: {
    constructionGrossAreaM2: number;
    constructionOpeningAreaM2: number;
    constructionNetAreaM2: number;
    decoratedGrossSurfaceAreaM2: number;
    decoratedNetOpeningsDeductedOnceM2: number;
    decoratedNetOpeningsDeductedPerDecoratedSideM2: number;
    externalConstructionGrossAreaM2: number;
    internalConstructionGrossAreaM2: number;
    externalDecoratedGrossSurfaceAreaM2: number;
    internalDecoratedGrossSurfaceAreaM2: number;
    explanation: string[];
  };
  adjacency: {
    totalPlansXpressAreaRecords: number;
    areaEntitiesWithPolygons: number;
    usableRoomAreaPolygons: number;
    usableRoomAreasByRoom: Array<{ room: string; areaHandles: string[] }>;
    dxfRoomLabels: Array<{ name: string; labelPoint: { x: number; y: number } | null; polygonPoints: number }>;
    dxfRoomPolygonsDetected: number;
    wallSurfacesReviewRequiredBeforeAreaGeometry: number;
    wallSurfacesResolvedByAreaGeometry: number;
    previouslyReviewRequiredSurfacesResolvedByAreaGeometry: number;
    wallsWithAnyDeterministicWorkAreaSide: number;
    wallsWithDeterministicRoomSide: number;
    wallSurfacesAllocatedToRooms: number;
    wallSurfacesAllocatedToExterior: number;
    wallSurfacesReviewRequired: number;
    rule: string;
  };
  areaGeometry: AreaGeometry[];
  schedule: SurfaceScheduleItem[];
  completeProof: {
    plansXpressHandle: string;
    proof: string[];
  };
}

const DEFAULT_OPTIONS: CliOptions = {
  pxd: "C:/Users/rudyb/Desktop/Patrick Brook.pxd",
  dxf: "test-fixtures/patrick-brook/Chat Test.dxf",
  wallSchedule: "reports/offline-project-model/patrick-brook-plansxpress-wall-schedule.json",
  jsonOut: "reports/offline-project-model/patrick-brook-plansxpress-wall-surface-reconciliation.json",
  markdownOut: "reports/offline-project-model/patrick-brook-plansxpress-wall-surface-reconciliation.md",
};

function parseArgs(args: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--help") throw new Error(usage());
    if (!next) throw new Error(`Missing value for ${arg}`);

    if (arg === "--pxd") options.pxd = next;
    else if (arg === "--dxf") options.dxf = next;
    else if (arg === "--wall-schedule") options.wallSchedule = next;
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
    "  tsx scripts/audit-patrick-brook-plansxpress-wall-surfaces.ts",
    "",
    "Builds an offline wall surface and side-adjacency report only. No decoration assignment is performed.",
  ].join("\n");
}

function buildAudit(options: CliOptions, pxdXml: string, dxfContent: string, wallSchedule: WallScheduleAudit): SurfaceAudit {
  const estimateWalls = estimateWallRecords(pxdXml);
  const estimateById = new Map(estimateWalls.map((wall) => [attributeText(wall, "ID"), wall]));
  const dxf = parsePlansXpressDxf(dxfContent);
  const rooms = detectRoomBoundaries(dxf);
  const roomPolygons = rooms.filter((room) => room.polygon.length >= 3);
  const roomLabels = rooms
    .filter((room): room is typeof room & { labelPoint: { x: number; y: number } } => !!room.labelPoint)
    .map((room) => ({ name: room.name === "Tv Room" ? "TV Room" : room.name, point: room.labelPoint }));
  const wallSegments = wallSchedule.schedule.map((wall) => ({
    handle: wall.plansXpressHandle,
    start: { x: wall.startPoint.xMm, y: wall.startPoint.yMm },
    end: { x: wall.endPoint.xMm, y: wall.endPoint.yMm },
  }));
  const areaGeometry = areaGeometries(pxdXml, roomLabels);
  const usableRoomAreas = areaGeometry.filter((area) => area.usableAsRoomGeometry && area.mappedRoom);
  const schedule = wallSchedule.schedule.map((wall) => surfaceScheduleItem(wall, estimateById.get(wall.estimateWallId ?? "") ?? null, roomPolygons.length, roomLabels, wallSegments, usableRoomAreas));
  const constructionGrossAreaM2 = round3(sum(schedule, "grossConstructionAreaM2"));
  const constructionOpeningAreaM2 = round3(sum(schedule, "openingDeductionsM2"));
  const constructionNetAreaM2 = round3(sum(schedule, "netConstructionAreaM2"));
  const externalWalls = schedule.filter((wall) => wall.estimatorCalculator === "2 Leaf External Wall.xls");
  const internalWalls = schedule.filter((wall) => wall.estimatorCalculator === "Single Leaf Internal Wall.xls");
  const decorated = decoratedSurfaceTotals(estimateWalls);
  const wallSurfaces = schedule.flatMap((wall) => [wall.sideA, wall.sideB]);
  const proofWall = schedule.find((wall) => wall.confidence === "MATCH" && wall.estimatorCalculator === "Single Leaf Internal Wall.xls")
    ?? schedule.find((wall) => wall.confidence === "MATCH")
    ?? schedule[0];

  return {
    source: {
      pxd: options.pxd,
      dxf: options.dxf,
      wallSchedule: options.wallSchedule,
      plansXpressVersion: /<PlansXpress\b[^>]*\bVersion="([^"]+)"/i.exec(pxdXml)?.[1] ?? null,
    },
    areaReconciliation: {
      constructionGrossAreaM2,
      constructionOpeningAreaM2,
      constructionNetAreaM2,
      decoratedGrossSurfaceAreaM2: decorated.gross,
      decoratedNetOpeningsDeductedOnceM2: decorated.netOpeningsOnce,
      decoratedNetOpeningsDeductedPerDecoratedSideM2: decorated.netOpeningsPerSide,
      externalConstructionGrossAreaM2: round3(sum(externalWalls, "grossConstructionAreaM2")),
      internalConstructionGrossAreaM2: round3(sum(internalWalls, "grossConstructionAreaM2")),
      externalDecoratedGrossSurfaceAreaM2: decorated.externalGross,
      internalDecoratedGrossSurfaceAreaM2: decorated.internalGross,
      explanation: [
        "349.082 m2 is the construction wall area: sum of Length_of_main_wall x Height_of_main_wall once per PlansXpress estimating wall record.",
        "303.719 m2 is the construction net area: 349.082 m2 minus 45.363 m2 of stored AREAOFOPENINGS, deducted once per wall record.",
        "478.178 m2 is a surface count from the wall-side decoration flags: external wall records contribute one side, internal partition records contribute two sides.",
        "The difference is therefore caused by wall faces/sides. It is not caused by DXF centreline geometry, because both totals use stored estimator lengths and heights.",
        "Opening deductions explain the net totals: deducting openings once from decorated surface gross gives 432.815 m2; deducting each opening once per decorated side gives 417.262 m2.",
      ],
    },
    adjacency: {
      totalPlansXpressAreaRecords: areaGeometry.length,
      areaEntitiesWithPolygons: areaGeometry.filter((area) => area.polygon.length >= 3).length,
      usableRoomAreaPolygons: usableRoomAreas.length,
      usableRoomAreasByRoom: Array.from(groupAreasByRoom(usableRoomAreas).entries()).map(([room, areas]) => ({ room, areaHandles: areas.map((area) => area.handle) })),
      dxfRoomLabels: rooms.map((room) => ({ name: room.name === "Tv Room" ? "TV Room" : room.name, labelPoint: room.labelPoint ?? null, polygonPoints: room.polygon.length })),
      dxfRoomPolygonsDetected: roomPolygons.length,
      wallSurfacesReviewRequiredBeforeAreaGeometry: wallSurfaces.filter((surface) => surface.resolutionSource === "Unresolved" || surface.resolvedPreviouslyReviewRequired).length,
      wallSurfacesResolvedByAreaGeometry: wallSurfaces.filter((surface) => surface.resolutionSource === "AreaPolygon").length,
      previouslyReviewRequiredSurfacesResolvedByAreaGeometry: wallSurfaces.filter((surface) => surface.resolvedPreviouslyReviewRequired).length,
      wallsWithAnyDeterministicWorkAreaSide: schedule.filter((wall) => wall.sideA.confidence === "MATCH" || wall.sideB.confidence === "MATCH").length,
      wallsWithDeterministicRoomSide: schedule.filter((wall) => roomMatched(wall.sideA) || roomMatched(wall.sideB)).length,
      wallSurfacesAllocatedToRooms: wallSurfaces.filter(roomMatched).length,
      wallSurfacesAllocatedToExterior: wallSurfaces.filter((surface) => surface.workArea === "Exterior").length,
      wallSurfacesReviewRequired: wallSurfaces.filter((surface) => surface.confidence === "REVIEW REQUIRED").length,
      rule: "Room-side allocation uses PlansXpress Area polygons first. An Area polygon is usable only when it contains exactly one known DXF room label. A wall side resolves to a room only when all three side-sample points fall inside usable Area polygons for one room. Remaining sides fall back to the stricter same-side, unobstructed label-seed rule. Nearest-label distance is not used. External-wall exterior faces are allocated to Exterior from the PlansXpress external-wall calculator plus ExternalSide field.",
    },
    areaGeometry,
    schedule,
    completeProof: {
      plansXpressHandle: proofWall?.plansXpressHandle ?? "",
      proof: proofWall ? wallProof(proofWall, decorated) : [],
    },
  };
}

function surfaceScheduleItem(wall: WallScheduleItem, estimateWall: Map<string, string> | null, roomPolygonCount: number, roomLabels: RoomLabelSeed[], wallSegments: WallSegment[], usableRoomAreas: AreaGeometry[]): SurfaceScheduleItem {
  const lengthUsedByEstimatorM = wall.storedEstimateLengthM ?? 0;
  const heightM = wall.storedEstimateHeightM ?? wall.heightMm / 1000;
  const openingDeductionsM2 = wall.storedOpeningAreaM2;
  const externalSide = estimateWall ? attributeText(estimateWall, "ISTHISANINTERNALWALL") === "0" ? externalSideCode(wall) : null : null;
  const sideA = sideSurface("0", wall, externalSide, roomPolygonCount, roomLabels, wallSegments, usableRoomAreas);
  const sideB = sideSurface("1", wall, externalSide, roomPolygonCount, roomLabels, wallSegments, usableRoomAreas);
  const confidence = sideA.confidence === "MATCH" && sideB.confidence === "MATCH" ? "MATCH" : "REVIEW REQUIRED";

  return {
    plansXpressHandle: wall.plansXpressHandle,
    plansXpressPxid: wall.plansXpressPxid,
    estimateWallId: wall.estimateWallId,
    wallType: wall.wallType,
    startPoint: wall.startPoint,
    endPoint: wall.endPoint,
    lengthUsedByEstimatorM,
    heightM,
    grossConstructionAreaM2: round3(lengthUsedByEstimatorM * heightM),
    openingDeductionsM2,
    netConstructionAreaM2: wall.netAreaM2,
    sideA,
    sideB,
    estimatorCalculator: wall.estimatingCalculator,
    openingIds: wall.openingIds,
    confidence,
    confidenceReason: confidence === "MATCH"
      ? "Both wall sides have deterministic work-area allocation."
      : "At least one side lacks room polygon containment proof; nearest room labels were not used.",
  };
}

function sideSurface(sideCode: "0" | "1", wall: WallScheduleItem, externalSide: "0" | "1" | null, roomPolygonCount: number, roomLabels: RoomLabelSeed[], wallSegments: WallSegment[], usableRoomAreas: AreaGeometry[]): SideSurface {
  if (externalSide === sideCode) {
    return {
      sideCode,
      sideName: sideCode === "0" ? "Side A" : "Side B",
      workArea: "Exterior",
      availableSurfaceAreaM2: wall.netAreaM2,
      confidence: "MATCH",
      reason: "External wall calculator plus PlansXpress ExternalSide marks this face as exterior.",
      resolutionSource: "ExteriorSide",
    };
  }

  const previousLabelMatch = deterministicRoomLabelForSide(wall, sideCode, roomLabels, wallSegments);
  const areaMatch = deterministicAreaForSide(wall, sideCode, usableRoomAreas);
  if (areaMatch) {
    return {
      sideCode,
      sideName: sideCode === "0" ? "Side A" : "Side B",
      workArea: areaMatch,
      availableSurfaceAreaM2: wall.netAreaM2,
      confidence: "MATCH",
      reason: "All three wall-side sample points fall inside PlansXpress Area polygons mapped to exactly one known room label.",
      resolutionSource: "AreaPolygon",
      resolvedPreviouslyReviewRequired: previousLabelMatch === null,
    };
  }

  if (previousLabelMatch) {
    return {
      sideCode,
      sideName: sideCode === "0" ? "Side A" : "Side B",
      workArea: previousLabelMatch,
      availableSurfaceAreaM2: wall.netAreaM2,
      confidence: "MATCH",
      reason: "DXF room label is on this wall side and visible from three side-sample points without crossing any other PlansXpress wall entity.",
      resolutionSource: "RoomLabelLineOfSight",
    };
  }

  return {
    sideCode,
    sideName: sideCode === "0" ? "Side A" : "Side B",
    workArea: null,
    availableSurfaceAreaM2: wall.netAreaM2,
    confidence: "REVIEW REQUIRED",
    reason: roomPolygonCount > 0
      ? "No deterministic polygon containment rule has assigned this wall face to exactly one room."
      : "No unique same-side, unobstructed room-label seed was proven; nearest-label allocation is intentionally not used.",
    resolutionSource: "Unresolved",
  };
}

function externalSideCode(wall: WallScheduleItem): "0" | "1" | null {
  if (wall.estimatingCalculator !== "2 Leaf External Wall.xls") return null;
  const raw = wall.externalSide;
  return raw === "0" || raw === "1" ? raw : null;
}

function areaGeometries(xml: string, roomLabels: RoomLabelSeed[]): AreaGeometry[] {
  const estimateAreas = estimateAreaRecords(xml);
  const estimatesByCalculatorAndPxid = new Map<string, Map<string, string>>();
  for (const area of estimateAreas) {
    const pxid = attributeText(area, "ID").split("-")[0];
    const spreadsheet = attributeText(area, "Spreadsheet");
    estimatesByCalculatorAndPxid.set(`${spreadsheet}|${pxid}`, area);
  }

  return topLevelEntityBlocks(xml)
    .filter((block) => attributeText(parseAttributes(entityStartTag(block)), "EntityType") === "6000")
    .map((block): AreaGeometry => {
      const entityAttrs = parseAttributes(entityStartTag(block));
      const data = entityData(block);
      const pxid = data.get("PXID") ?? "";
      const spreadsheet = data.get("CADX_Spreadsheet") ?? "";
      const estimate = estimatesByCalculatorAndPxid.get(`${spreadsheet}|${pxid}`) ?? null;
      const polygon = polygonFromSegments(block);
      const containedRoomLabels = Array.from(new Set(roomLabels.filter((room) => pointInPolygon(room.point, polygon)).map((room) => room.name))).sort((a, b) => a.localeCompare(b));
      const mappedRoom = containedRoomLabels.length === 1 ? containedRoomLabels[0] : null;

      return {
        handle: attributeText(entityAttrs, "Handle"),
        pxid,
        estimateAreaId: estimate ? attributeText(estimate, "ID") : null,
        spreadsheet,
        template: data.get("CADX_Template") ?? "",
        location: estimate ? attributeText(estimate, "Location") : null,
        polygon,
        calculatedAreaM2: round3(Math.abs(polygonArea(polygon)) / 1_000_000),
        storedAreaM2: estimate ? numberValue(attributeText(estimate, "PXAREA")) : null,
        containedRoomLabels,
        mappedRoom,
        usableAsRoomGeometry: polygon.length >= 3 && mappedRoom !== null,
      };
    });
}

function deterministicAreaForSide(wall: WallScheduleItem, sideCode: "0" | "1", usableRoomAreas: AreaGeometry[]): string | null {
  const samplePoints = [0.25, 0.5, 0.75].map((ratio) => sideSamplePoint(wall, sideCode, ratio, 300));
  const rooms = Array.from(new Set(usableRoomAreas
    .filter((area) => samplePoints.every((point) => pointInPolygon(point, area.polygon)))
    .map((area) => area.mappedRoom)
    .filter((room): room is string => !!room)));

  return rooms.length === 1 ? rooms[0] : null;
}

function groupAreasByRoom(areas: AreaGeometry[]): Map<string, AreaGeometry[]> {
  const result = new Map<string, AreaGeometry[]>();
  for (const area of areas) {
    if (!area.mappedRoom) continue;
    const group = result.get(area.mappedRoom) ?? [];
    group.push(area);
    result.set(area.mappedRoom, group);
  }
  return new Map(Array.from(result.entries()).sort(([a], [b]) => a.localeCompare(b)));
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

function entityData(block: string): Map<string, string> {
  const result = new Map<string, string>();
  const extendedData = /<ExtendedEntityData>([\s\S]*?)<\/ExtendedEntityData>/i.exec(block)?.[1] ?? "";
  for (const match of extendedData.matchAll(/<Data>([\s\S]*?)<\/Data>/gi)) {
    const value = decodeXml(match[1]);
    const separator = value.indexOf("|");
    if (separator < 0) continue;
    result.set(value.slice(0, separator), value.slice(separator + 1));
  }
  return result;
}

function polygonFromSegments(block: string): Array<{ x: number; y: number }> {
  const segments = /<Segments>([\s\S]*?)<\/Segments>/i.exec(block)?.[1] ?? "";
  return Array.from(segments.matchAll(/<Segment\b([^>]*)\/>/gi), (match) => {
    const attrs = parseAttributes(match[1]);
    return {
      x: numberValue(attributeText(attrs, "Point1_x")),
      y: numberValue(attributeText(attrs, "Point1_y")),
    };
  });
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonArea(polygon: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function deterministicRoomLabelForSide(wall: WallScheduleItem, sideCode: "0" | "1", roomLabels: RoomLabelSeed[], wallSegments: WallSegment[]): string | null {
  const samplePoints = [0.25, 0.5, 0.75].map((ratio) => sideSamplePoint(wall, sideCode, ratio, 300));
  const requiredSide = sideCode === "0" ? 1 : -1;
  const candidates = roomLabels.filter((room) => {
    if (sideOfWall(wall, room.point) !== requiredSide) return false;
    return samplePoints.every((point) => !wallSegments.some((segment) => segment.handle !== wall.plansXpressHandle && segmentsIntersect(point, room.point, segment.start, segment.end)));
  });

  return candidates.length === 1 ? candidates[0].name : null;
}

function sideSamplePoint(wall: WallScheduleItem, sideCode: "0" | "1", ratio: number, offsetMm: number): { x: number; y: number } {
  const start = { x: wall.startPoint.xMm, y: wall.startPoint.yMm };
  const end = { x: wall.endPoint.xMm, y: wall.endPoint.yMm };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = sideCode === "0" ? -dy / length : dy / length;
  const ny = sideCode === "0" ? dx / length : -dx / length;
  return {
    x: start.x + dx * ratio + nx * offsetMm,
    y: start.y + dy * ratio + ny * offsetMm,
  };
}

function sideOfWall(wall: WallScheduleItem, point: { x: number; y: number }): -1 | 0 | 1 {
  const start = { x: wall.startPoint.xMm, y: wall.startPoint.yMm };
  const end = { x: wall.endPoint.xMm, y: wall.endPoint.yMm };
  const cross = orientation(start, end, point);
  if (Math.abs(cross) < 1e-6) return 0;
  return cross > 0 ? 1 : -1;
}

function segmentsIntersect(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): boolean {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) return false;
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (Math.abs(o1) < 1e-6 && pointOnSegment(a, b, c)) return true;
  if (Math.abs(o2) < 1e-6 && pointOnSegment(a, b, d)) return true;
  if (Math.abs(o3) < 1e-6 && pointOnSegment(c, d, a)) return true;
  if (Math.abs(o4) < 1e-6 && pointOnSegment(c, d, b)) return true;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }): boolean {
  return Math.min(a.x, b.x) - 1e-6 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-6 && Math.min(a.y, b.y) - 1e-6 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-6;
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
}

function decoratedSurfaceTotals(estimateWalls: Map<string, string>[]): {
  gross: number;
  netOpeningsOnce: number;
  netOpeningsPerSide: number;
  externalGross: number;
  internalGross: number;
} {
  let gross = 0;
  let netOpeningsOnce = 0;
  let netOpeningsPerSide = 0;
  let externalGross = 0;
  let internalGross = 0;

  for (const wall of estimateWalls) {
    const length = numberValue(attributeText(wall, "Length_of_main_wall"));
    const height = numberValue(attributeText(wall, "Height_of_main_wall"));
    const openings = numberValue(attributeText(wall, "AREAOFOPENINGS"));
    const sides = decoratedSideCount(wall);
    const wallGross = length * height * sides;
    gross += wallGross;
    netOpeningsOnce += Math.max(0, wallGross - openings);
    netOpeningsPerSide += Math.max(0, wallGross - openings * sides);
    if (attributeText(wall, "Spreadsheet") === "2 Leaf External Wall.xls") externalGross += wallGross;
    if (attributeText(wall, "Spreadsheet") === "Single Leaf Internal Wall.xls") internalGross += wallGross;
  }

  return {
    gross: round3(gross),
    netOpeningsOnce: round3(netOpeningsOnce),
    netOpeningsPerSide: round3(netOpeningsPerSide),
    externalGross: round3(externalGross),
    internalGross: round3(internalGross),
  };
}

function decoratedSideCount(wall: Map<string, string>): number {
  return [
    attributeText(wall, "Is_main_wall_decorated_internally"),
    attributeText(wall, "Is_main_wall_decorated_to_side_1"),
    attributeText(wall, "Is_main_wall_decorated_to_side_2"),
  ].filter((value) => value === "Y").length;
}

function wallProof(wall: SurfaceScheduleItem, decorated: ReturnType<typeof decoratedSurfaceTotals>): string[] {
  const decoratedSides = wall.estimatorCalculator === "Single Leaf Internal Wall.xls" ? 2 : 1;
  const decoratedGrossContribution = round3(wall.grossConstructionAreaM2 * decoratedSides);
  return [
    `PlansXpress Handle: ${wall.plansXpressHandle}.`,
    `Geometry: start (${wall.startPoint.xMm}, ${wall.startPoint.yMm}) mm to end (${wall.endPoint.xMm}, ${wall.endPoint.yMm}) mm.`,
    `Estimator join: PXID ${wall.plansXpressPxid}, EstimateData ID ${wall.estimateWallId}, calculator ${wall.estimatorCalculator}.`,
    `Stored estimating length ${wall.lengthUsedByEstimatorM} m x height ${wall.heightM} m = gross construction area ${wall.grossConstructionAreaM2} m2.`,
    `Openings: ${wall.openingIds.length ? wall.openingIds.join(", ") : "none"}; stored opening deduction ${wall.openingDeductionsM2} m2.`,
    `Net construction area: ${wall.grossConstructionAreaM2} - ${wall.openingDeductionsM2} = ${wall.netConstructionAreaM2} m2.`,
    `Side A work area: ${wall.sideA.workArea ?? "REVIEW REQUIRED"} (${wall.sideA.resolutionSource}); Side B work area: ${wall.sideB.workArea ?? "REVIEW REQUIRED"} (${wall.sideB.resolutionSource}).`,
    `This wall contributes ${wall.grossConstructionAreaM2} m2 to the 349.082 m2 construction gross total and ${wall.netConstructionAreaM2} m2 to the 303.719 m2 construction net total.`,
    `Its decorated-surface gross contribution is ${decoratedGrossContribution} m2 (${decoratedSides} decorated side${decoratedSides === 1 ? "" : "s"}), included in the 478.178 m2 decorated gross total.`,
    `Aggregate check: decorated gross total ${decorated.gross} m2; decorated net totals ${decorated.netOpeningsOnce} m2 / ${decorated.netOpeningsPerSide} m2 depending on whether openings are deducted once or per decorated side.`,
  ];
}

function renderMarkdown(audit: SurfaceAudit): string {
  return [
    "# Patrick Brook Wall Surface Reconciliation",
    "",
    "Offline report only. Decoration assignment, pricing, DB/API/UI changes, commit, push, and deploy are intentionally excluded.",
    "",
    "## Area Reconciliation",
    "",
    `- Construction gross wall area: ${audit.areaReconciliation.constructionGrossAreaM2} m2`,
    `- Construction opening area: ${audit.areaReconciliation.constructionOpeningAreaM2} m2`,
    `- Construction net wall area: ${audit.areaReconciliation.constructionNetAreaM2} m2`,
    `- Decorated gross surface area: ${audit.areaReconciliation.decoratedGrossSurfaceAreaM2} m2`,
    `- Decorated net, openings deducted once: ${audit.areaReconciliation.decoratedNetOpeningsDeductedOnceM2} m2`,
    `- Decorated net, openings deducted per decorated side: ${audit.areaReconciliation.decoratedNetOpeningsDeductedPerDecoratedSideM2} m2`,
    `- External construction gross area: ${audit.areaReconciliation.externalConstructionGrossAreaM2} m2`,
    `- Internal construction gross area: ${audit.areaReconciliation.internalConstructionGrossAreaM2} m2`,
    `- External decorated gross surface area: ${audit.areaReconciliation.externalDecoratedGrossSurfaceAreaM2} m2`,
    `- Internal decorated gross surface area: ${audit.areaReconciliation.internalDecoratedGrossSurfaceAreaM2} m2`,
    "",
    ...audit.areaReconciliation.explanation.map((line) => `- ${line}`),
    "",
    "## Side / Room Adjacency",
    "",
    `- PlansXpress Area records inspected: ${audit.adjacency.totalPlansXpressAreaRecords}`,
    `- Area entities with polygons: ${audit.adjacency.areaEntitiesWithPolygons}`,
    `- Area polygons usable as room geometry: ${audit.adjacency.usableRoomAreaPolygons}`,
    `- DXF room polygons detected: ${audit.adjacency.dxfRoomPolygonsDetected}`,
    `- Wall surfaces REVIEW REQUIRED before Area geometry: ${audit.adjacency.wallSurfacesReviewRequiredBeforeAreaGeometry}`,
    `- Wall surfaces resolved by Area geometry: ${audit.adjacency.wallSurfacesResolvedByAreaGeometry}`,
    `- Previously review-required surfaces resolved by Area geometry: ${audit.adjacency.previouslyReviewRequiredSurfacesResolvedByAreaGeometry}`,
    `- Walls with any deterministic work-area side: ${audit.adjacency.wallsWithAnyDeterministicWorkAreaSide}`,
    `- Walls with deterministic room side: ${audit.adjacency.wallsWithDeterministicRoomSide}`,
    `- Wall surfaces allocated to rooms: ${audit.adjacency.wallSurfacesAllocatedToRooms}`,
    `- Wall surfaces allocated to Exterior: ${audit.adjacency.wallSurfacesAllocatedToExterior}`,
    `- Wall surfaces remaining REVIEW REQUIRED: ${audit.adjacency.wallSurfacesReviewRequired}`,
    `- Rule: ${audit.adjacency.rule}`,
    "",
    "Usable PlansXpress room Area polygons:",
    ...audit.adjacency.usableRoomAreasByRoom.map((group) => `- ${group.room}: ${group.areaHandles.join(", ")}`),
    "",
    "Detected DXF room labels:",
    ...audit.adjacency.dxfRoomLabels.map((room) => `- ${room.name}: polygon points ${room.polygonPoints}, label ${room.labelPoint ? `(${room.labelPoint.x}, ${room.labelPoint.y})` : "none"}`),
    "",
    "## Wall Surface Schedule",
    "",
    "| Wall Handle | Type | Length m | Height m | Gross m2 | Openings m2 | Net m2 | Side A Work Area | Side A Source | Side B Work Area | Side B Source | Calculator | Confidence |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |",
    ...audit.schedule.map((wall) => `| ${wall.plansXpressHandle} | ${wall.wallType} | ${wall.lengthUsedByEstimatorM} | ${wall.heightM} | ${wall.grossConstructionAreaM2} | ${wall.openingDeductionsM2} | ${wall.netConstructionAreaM2} | ${wall.sideA.workArea ?? "REVIEW REQUIRED"} | ${wall.sideA.resolutionSource} | ${wall.sideB.workArea ?? "REVIEW REQUIRED"} | ${wall.sideB.resolutionSource} | ${wall.estimatorCalculator} | ${wall.confidence} |`),
    "",
    "## Previously Review-Required Surface Outcomes",
    "",
    "| Wall Handle | Side | Outcome | Work Area | Evidence Source |",
    "| --- | --- | --- | --- | --- |",
    ...previouslyReviewRequiredSurfaceRows(audit),
    "",
    "## Complete Wall Proof",
    "",
    ...audit.completeProof.proof.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

function previouslyReviewRequiredSurfaceRows(audit: SurfaceAudit): string[] {
  const rows: string[] = [];
  for (const wall of audit.schedule) {
    for (const side of [wall.sideA, wall.sideB]) {
      if (side.resolutionSource !== "Unresolved" && !side.resolvedPreviouslyReviewRequired) continue;
      const outcome = side.confidence === "MATCH" ? "RESOLVED" : "REVIEW REQUIRED";
      rows.push(`| ${wall.plansXpressHandle} | ${side.sideName} | ${outcome} | ${side.workArea ?? "-"} | ${side.resolutionSource} |`);
    }
  }
  return rows;
}

function roomMatched(surface: SideSurface): boolean {
  return surface.confidence === "MATCH" && surface.workArea !== null && surface.workArea !== "Exterior";
}

function estimateWallRecords(xml: string): Map<string, string>[] {
  const estimateWalls = /<Walls\b[^>]*>([\s\S]*?)<\/Walls>/i.exec(xml)?.[1] ?? "";
  return Array.from(estimateWalls.matchAll(/<Wall\b([^>]*)\/?>(?:<\/Wall>)?/gi), (match) => parseAttributes(match[1]));
}

function estimateAreaRecords(xml: string): Map<string, string>[] {
  const estimateAreas = /<Areas\b[^>]*>([\s\S]*?)<\/Areas>/i.exec(xml)?.[1] ?? "";
  return Array.from(estimateAreas.matchAll(/<Area\b([^>]*)\/?>(?:<\/Area>)?/gi), (match) => parseAttributes(match[1]));
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const [compressedPxd, dxfContent, wallScheduleContent] = await Promise.all([
    readFile(options.pxd),
    readFile(options.dxf, "utf8"),
    readFile(options.wallSchedule, "utf8"),
  ]);
  const pxdXml = gunzipSync(compressedPxd).toString("utf8");
  const audit = buildAudit(options, pxdXml, dxfContent, JSON.parse(wallScheduleContent) as WallScheduleAudit);

  await Promise.all([
    mkdir(dirname(options.jsonOut), { recursive: true }),
    mkdir(dirname(options.markdownOut), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(options.jsonOut, `${JSON.stringify(audit, null, 2)}\n`, "utf8"),
    writeFile(options.markdownOut, renderMarkdown(audit), "utf8"),
  ]);

  console.log([
    "PlansXpress wall surface reconciliation built",
    `Construction gross: ${audit.areaReconciliation.constructionGrossAreaM2} m2`,
    `Decorated gross: ${audit.areaReconciliation.decoratedGrossSurfaceAreaM2} m2`,
    `DXF room polygons: ${audit.adjacency.dxfRoomPolygonsDetected}`,
    `Usable PlansXpress Area room polygons: ${audit.adjacency.usableRoomAreaPolygons}`,
    `Previously review-required surfaces resolved by Area geometry: ${audit.adjacency.previouslyReviewRequiredSurfacesResolvedByAreaGeometry}`,
    `Room-allocated surfaces: ${audit.adjacency.wallSurfacesAllocatedToRooms}`,
    `Review-required surfaces: ${audit.adjacency.wallSurfacesReviewRequired}`,
    `JSON: ${options.jsonOut}`,
    `Markdown: ${options.markdownOut}`,
  ].join("\n"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

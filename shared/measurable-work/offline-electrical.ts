export type ReviewStatus = "MATCH" | "REVIEW REQUIRED";

export interface Point2d {
  x: number;
  y: number;
}

export interface DxfTextEntity {
  type: "TEXT" | "MTEXT";
  layer: string;
  text: string;
  point: Point2d;
}

export interface DxfInsertEntity {
  type: "INSERT";
  layer: string;
  blockName: string;
  point: Point2d;
  rotation: number;
}

export interface DxfPolylineEntity {
  type: "LWPOLYLINE" | "POLYLINE";
  layer: string;
  points: Point2d[];
  closed: boolean;
}

export interface DxfLineEntity {
  type: "LINE";
  layer: string;
  start: Point2d;
  end: Point2d;
}

export interface DxfCircleEntity {
  type: "CIRCLE";
  layer: string;
  center: Point2d;
  radius: number;
}

export interface DxfArcEntity {
  type: "ARC";
  layer: string;
  center: Point2d;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export type DxfEntity = DxfTextEntity | DxfInsertEntity | DxfPolylineEntity | DxfLineEntity | DxfCircleEntity | DxfArcEntity | { type: string; layer: string };

export interface DxfBlockDefinition {
  name: string;
  entities: DxfEntity[];
}

export interface ParsedDxf {
  layers: string[];
  blocks: DxfBlockDefinition[];
  entities: DxfEntity[];
}

export interface RoomBoundary {
  name: string;
  layer: string;
  polygon: Point2d[];
  labelPoint?: Point2d;
}

export interface ElectricalObject {
  source: "DXF_INSERT" | "DXF_TEXT_LABEL";
  item: string | null;
  label: string;
  layer: string;
  blockName?: string;
  fingerprint?: BlockFingerprint;
  point: Point2d;
  workArea: string | null;
  status: ReviewStatus;
  reason?: string;
}

export interface HbxlMeasurableItem {
  item: string;
  quantity: number;
  sourceRows: number[];
  descriptions: string[];
}

export interface HbxlMaterialBuildUpItem {
  description: string;
  quantity: number;
  unit: string;
  sourceRow: number;
  relatedItem: string | null;
}

export interface ParsedHbxlElectrical {
  measurableItems: HbxlMeasurableItem[];
  materialBuildUp: HbxlMaterialBuildUpItem[];
  unknownElectricalRows: Array<{ sourceRow: number; description: string; quantity: number }>;
}

export interface WorkAreaElectricalItemReport {
  item: string;
  dxfQuantity: number;
  hbxlProjectQuantity: number;
  status: ReviewStatus;
}

export interface WorkAreaReport {
  name: string;
  packages: Array<{
    trade: "Electrical";
    items: WorkAreaElectricalItemReport[];
  }>;
}

export interface ReconciliationItem {
  item: string;
  dxfTotal: number;
  hbxlTotal: number;
  status: ReviewStatus;
}

export interface ElectricalAnalysisReport {
  project: string;
  detected: {
    layers: string[];
    blocks: string[];
    rooms: string[];
    electricalObjects: number;
    confidentlyIdentified: number;
    reviewRequired: number;
  };
  workAreas: WorkAreaReport[];
  reconciliation: ReconciliationItem[];
  reviewItems: ElectricalObject[];
  hbxl: ParsedHbxlElectrical;
}

interface DxfPair {
  code: number;
  value: string;
}

export interface BlockFingerprint {
  blockName: string;
  typeCounts: Record<string, number>;
  textTokens: string[];
  circleRadii: number[];
  arcRadii: number[];
  lineOrientations: string[];
  aspectRatio: number | null;
  lineCount: number;
  circleCount: number;
  arcCount: number;
  polylineCount: number;
}

interface SymbolDefinition {
  item: string;
  match: (candidate: string, fingerprint: BlockFingerprint) => boolean;
}

const KNOWN_ROOM_NAMES = new Set([
  "main bedroom",
  "bedroom 2",
  "bedroom 3",
  "lounge",
  "kitchen",
  "laundry",
  "passage",
  "bathroom",
  "tv room",
]);

const EXPLICIT_ELECTRICAL_LABELS = new Set(["OVEN", "ELECTRIC HOB", "ELECTRIC SHOWER"]);

const MATERIAL_BUILD_UP_PATTERN = /\b(back\s*box|box\b|cable|clip|clips|fixing|fixings|screw|screws|conduit|capping|trunking|connector|terminal|grommet|socket\s*front|plate\s*screw)\b/i;

const ELECTRICAL_PHASE_PATTERN = /\b(electrical|electrician|power|lighting)\b/i;

const ELECTRICAL_SYMBOL_DICTIONARY: SymbolDefinition[] = [
  {
    item: "Single Light Switch",
    // Phase 1C human-confirmed PlansXpress Symbol A: generic single switch, way not specified.
    match: (_candidate, fp) => fp.lineCount === 2 && fp.circleCount === 2 && fp.arcCount === 0 && hasCircleRadii(fp, [50, 56.76]) && fp.aspectRatio !== null && fp.aspectRatio >= 2.65 && fp.aspectRatio <= 2.75,
  },
  {
    item: "Single Light Switch - One Way",
    // Phase 1C human-confirmed PlansXpress Symbols B and F.
    match: (_candidate, fp) =>
      fp.lineCount === 2 && fp.circleCount === 2 && fp.arcCount === 0 && hasCircleRadii(fp, [50, 56.76]) && fp.aspectRatio !== null &&
      ((fp.aspectRatio >= 0.72 && fp.aspectRatio <= 0.74) || (fp.aspectRatio >= 0.27 && fp.aspectRatio <= 0.29)),
  },
  {
    item: "Single Light Switch - Two Way",
    // Phase 1C human-confirmed PlansXpress Symbol D.
    match: (_candidate, fp) => fp.lineCount === 36 && fp.circleCount === 2 && fp.arcCount === 0 && hasCircleRadii(fp, [50, 56.76]) && fp.aspectRatio !== null && fp.aspectRatio >= 0.52 && fp.aspectRatio <= 0.54,
  },
  {
    item: "Double Light Switch - One Way",
    // Phase 1C human-confirmed PlansXpress Symbol E; preserve one-way identity even if HBXL has a different 2-gang specification.
    match: (_candidate, fp) => fp.lineCount === 3 && fp.circleCount === 2 && fp.arcCount === 0 && hasCircleRadii(fp, [50, 56.76]) && fp.aspectRatio !== null && fp.aspectRatio >= 0.67 && fp.aspectRatio <= 0.69,
  },
  {
    item: "Pull Light Switch",
    // Phase 1C human-confirmed PlansXpress Symbol G; do not choose between HBXL 6A and 45A pull cords yet.
    match: (_candidate, fp) => fp.lineCount === 34 && fp.circleCount === 1 && fp.arcCount === 72 && hasCircleRadii(fp, [50]) && fp.aspectRatio !== null && fp.aspectRatio >= 0.18 && fp.aspectRatio <= 0.2,
  },
  {
    item: "WC Light Fitting",
    // Phase 1C human-confirmed PlansXpress Symbol H; do not force to a ceiling-specific HBXL product.
    match: (_candidate, fp) => fp.lineCount === 4 && fp.circleCount === 0 && fp.arcCount === 2 && hasArcRadii(fp, [141.42, 141.42]) && fp.aspectRatio !== null && fp.aspectRatio >= 1.95 && fp.aspectRatio <= 1.99,
  },
  {
    item: "Shaver Socket",
    // Phase 1C human-confirmed PlansXpress Symbol M.
    match: (_candidate, fp) => fp.lineCount === 1 && fp.circleCount === 0 && fp.arcCount === 3 && hasArcRadii(fp, [150, 150, 150]) && fp.aspectRatio === null,
  },
  {
    item: "Double Socket 13A with Twin USB",
    match: (candidate, fp) =>
      /\b(usb|twin usb)\b/i.test(candidate) && (/double|socket|ds/i.test(candidate) || fp.circleCount >= 2) ||
      (fp.circleCount === 4 && fp.polylineCount >= 7 && fp.lineCount >= 120),
  },
  {
    item: "Weatherproof Outdoor Socket 1G",
    match: (candidate, fp) =>
      /\b(weatherproof|outdoor|external|wp).*(socket|sock)|\bwp_socket\b/i.test(candidate) ||
      (fp.lineCount === 62 && fp.arcCount === 1 && fp.circleCount === 1 && fp.polylineCount === 1 && fp.circleRadii.length === 1 && Math.abs(fp.circleRadii[0] - 17.5) < 0.2 && fp.arcRadii.length === 1 && Math.abs(fp.arcRadii[0] - 75) < 0.2),
  },
  {
    item: "Double Socket 13A",
    match: (candidate, fp) =>
      /\b(double|ds)\b.*\b(socket|sock|13a)\b/i.test(candidate) && !/usb|weatherproof|outdoor|external|wp/i.test(candidate) && fp.circleCount >= 1 ||
      (fp.circleCount === 2 && fp.arcCount === 2 && fp.lineCount >= 100 && fp.lineCount < 120 && fp.circleRadii.every((radius) => Math.abs(radius - 17.5) < 0.2)),
  },
  {
    item: "Mains Downlight Fire Rated",
    match: (candidate, fp) => /\b(downlight|dl)\b/i.test(candidate) && /\b(fire|rated|fr)\b/i.test(candidate) && fp.circleCount >= 1,
  },
  {
    item: "Mains Downlight Standard",
    match: (candidate, fp) => /\b(downlight|dl)\b/i.test(candidate) && !/fire|rated|fr/i.test(candidate) && fp.circleCount >= 1,
  },
  {
    item: "Ceiling Rose and Pendant",
    match: (candidate, fp) => /\b(ceiling rose|pendant|rose)\b/i.test(candidate) || (fp.circleCount === 1 && fp.lineCount === 2 && fp.circleRadii.some((radius) => Math.abs(radius - 125) < 1)),
  },
  {
    item: "Fluorescent Light 1500mm",
    match: (candidate, fp) => /\b(fluorescent|1500)\b/i.test(candidate) || (fp.lineCount === 3 && fp.circleCount === 0 && fp.aspectRatio !== null && fp.aspectRatio > 3),
  },
  {
    item: "Light Switch 10A 2 Gang 2 Way",
    match: (candidate) => /\b(10a|2g2w|2\s*gang\s*2\s*way)\b/i.test(candidate),
  },
  {
    item: "Light Switch 6A 1G 2 Way",
    match: (candidate) => /\b(1g2w|1\s*g\s*2\s*way|1\s*gang\s*2\s*way)\b/i.test(candidate),
  },
  {
    item: "Pull Cord Switch 45A",
    match: (candidate) => /\b(pull cord|pullcord)\b/i.test(candidate) && /\b45a\b/i.test(candidate),
  },
  {
    item: "Pull Cord Switch 6A",
    match: (candidate) => /\b(pull cord|pullcord)\b/i.test(candidate) && !/\b45a\b/i.test(candidate),
  },
  {
    item: "Light Switch 6A 1G 1 Way",
    match: (candidate) => /\b(switch|sw|1g1w|1 gang 1 way|1gang 1way)\b/i.test(candidate) && !/2g2w|1g2w|2 way|10a|45a|double pole/i.test(candidate),
  },
  {
    item: "Bathroom Extractor Fan",
    match: (candidate) => /\b(extractor|fan)\b/i.test(candidate),
  },
  {
    item: "Cooker Connection Plate",
    match: (candidate) => /\b(cooker connection|connection plate|ccp)\b/i.test(candidate),
  },
  {
    item: "Cooker Control Unit",
    match: (candidate) => /\b(cooker control|control unit|ccu)\b/i.test(candidate),
  },
  {
    item: "Fused Spur 13A",
    match: (candidate) => /\b(fused spur|spur|fcu)\b/i.test(candidate),
  },
  {
    item: "Shaver Socket",
    match: (candidate) => /\bshaver\b/i.test(candidate),
  },
  {
    item: "WC Ceiling Light Fitting",
    match: (candidate) => /\b(wc ceiling|wc light|toilet light)\b/i.test(candidate),
  },
];

export function parsePlansXpressDxf(content: string): ParsedDxf {
  const pairs = toDxfPairs(content);
  const entities: DxfEntity[] = [];
  const blocks: DxfBlockDefinition[] = [];

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]?.code !== 0 || pairs[i]?.value !== "SECTION") continue;
    const sectionName = pairs[i + 1]?.code === 2 ? pairs[i + 1].value.toUpperCase() : "";

    if (sectionName === "ENTITIES") {
      const result = parseEntitySequence(pairs, i + 2, new Set(["ENDSEC"]));
      entities.push(...result.entities);
      i = result.nextIndex;
    }

    if (sectionName === "BLOCKS") {
      const result = parseBlocks(pairs, i + 2);
      blocks.push(...result.blocks);
      i = result.nextIndex;
    }
  }

  return {
    layers: collectLayers([...entities, ...blocks.flatMap((block) => block.entities)]),
    blocks,
    entities,
  };
}

export function parseHbxlElectricalCsv(content: string): ParsedHbxlElectrical {
  const rows = parseCsv(content);
  if (rows.length < 2) return { measurableItems: [], materialBuildUp: [], unknownElectricalRows: [] };

  const headers = rows[0].map(normalizeHeader);
  const quantities = new Map<string, HbxlMeasurableItem>();
  const materialBuildUp: HbxlMaterialBuildUpItem[] = [];
  const unknownElectricalRows: Array<{ sourceRow: number; description: string; quantity: number }> = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const sourceRow = index + 1;
    const buildPhase = csvValue(row, headers, ["buildphase", "phase"]);
    const resourceType = csvValue(row, headers, ["typeofresource", "resourcetype", "type"]);
    const description = csvValue(row, headers, ["resourcedescriptionwithoutprice", "resourcedescription", "description", "item"]);
    const unit = csvValue(row, headers, ["unit", "uom"]);
    const quantity = parseQuantity(csvValue(row, headers, ["orderquantity", "quantity", "qty"]));

    if (!description || quantity <= 0) continue;

    const rowLooksElectrical = ELECTRICAL_PHASE_PATTERN.test(buildPhase) || ELECTRICAL_PHASE_PATTERN.test(resourceType) || ELECTRICAL_PHASE_PATTERN.test(description) || !!canonicalElectricalItem(description);
    if (!rowLooksElectrical) continue;

    if (MATERIAL_BUILD_UP_PATTERN.test(description) && !canonicalElectricalItem(description)) {
      materialBuildUp.push({
        description,
        quantity,
        unit,
        sourceRow,
        relatedItem: inferMaterialRelationship(description),
      });
      continue;
    }

    const item = ELECTRICAL_PHASE_PATTERN.test(buildPhase) || ELECTRICAL_PHASE_PATTERN.test(resourceType) ? canonicalElectricalItem(description) : null;
    if (!item) {
      unknownElectricalRows.push({ sourceRow, description, quantity });
      continue;
    }

    const existing = quantities.get(item) ?? { item, quantity: 0, sourceRows: [], descriptions: [] };
    existing.quantity += quantity;
    existing.sourceRows.push(sourceRow);
    if (!existing.descriptions.includes(description)) existing.descriptions.push(description);
    quantities.set(item, existing);
  }

  return {
    measurableItems: Array.from(quantities.values()).sort((a, b) => a.item.localeCompare(b.item)),
    materialBuildUp,
    unknownElectricalRows,
  };
}

export function analyseElectricalProject(input: { project: string; dxfContent: string; hbxlCsvContent: string }): ElectricalAnalysisReport {
  const dxf = parsePlansXpressDxf(input.dxfContent);
  const hbxl = parseHbxlElectricalCsv(input.hbxlCsvContent);
  const rooms = detectRoomBoundaries(dxf);
  const electricalObjects = extractElectricalObjects(dxf, rooms);
  const hbxlTotals = new Map(hbxl.measurableItems.map((item) => [item.item, item.quantity]));
  const dxfTotals = new Map<string, number>();
  const workAreaItemCounts = new Map<string, Map<string, number>>();

  for (const object of electricalObjects) {
    if (!object.item) continue;
    dxfTotals.set(object.item, (dxfTotals.get(object.item) ?? 0) + 1);

    if (object.status === "MATCH" && object.workArea) {
      const areaCounts = workAreaItemCounts.get(object.workArea) ?? new Map<string, number>();
      areaCounts.set(object.item, (areaCounts.get(object.item) ?? 0) + 1);
      workAreaItemCounts.set(object.workArea, areaCounts);
    }
  }

  const allItems = Array.from(new Set([...Array.from(dxfTotals.keys()), ...Array.from(hbxlTotals.keys())])).sort((a, b) => a.localeCompare(b));
  const reconciliation = allItems.map((item) => {
    const dxfTotal = dxfTotals.get(item) ?? 0;
    const hbxlTotal = hbxlTotals.get(item) ?? 0;
    return {
      item,
      dxfTotal,
      hbxlTotal,
      status: dxfTotal === hbxlTotal ? "MATCH" as const : "REVIEW REQUIRED" as const,
    };
  });
  const statusByItem = new Map(reconciliation.map((item) => [item.item, item.status]));

  const workAreas = Array.from(workAreaItemCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, counts]) => ({
      name,
      packages: [{
        trade: "Electrical" as const,
        items: Array.from(counts.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([item, dxfQuantity]) => ({
            item,
            dxfQuantity,
            hbxlProjectQuantity: hbxlTotals.get(item) ?? 0,
            status: statusByItem.get(item) ?? "REVIEW REQUIRED" as ReviewStatus,
          })),
      }],
    }));

  const reviewItems = electricalObjects.filter((object) => object.status === "REVIEW REQUIRED");

  return {
    project: input.project,
    detected: {
      layers: dxf.layers,
      blocks: dxf.blocks.map((block) => block.name).sort((a, b) => a.localeCompare(b)),
      rooms: rooms.map((room) => room.name),
      electricalObjects: electricalObjects.length,
      confidentlyIdentified: electricalObjects.filter((object) => object.item).length,
      reviewRequired: reviewItems.length,
    },
    workAreas,
    reconciliation,
    reviewItems,
    hbxl,
  };
}

export function formatElectricalConsoleSummary(report: ElectricalAnalysisReport): string {
  const lines = [
    `Project: ${report.project}`,
    `Rooms/work areas: ${report.detected.rooms.join(", ") || "none"}`,
    `Electrical objects: ${report.detected.electricalObjects}`,
    `Confident: ${report.detected.confidentlyIdentified}`,
    `Review required: ${report.detected.reviewRequired}`,
    "",
    "Item | DXF Total | HBXL Total | Status",
    "--- | ---: | ---: | ---",
    ...report.reconciliation.map((item) => `${item.item} | ${item.dxfTotal} | ${item.hbxlTotal} | ${item.status}`),
  ];

  return lines.join("\n");
}

export function detectRoomBoundaries(dxf: ParsedDxf): RoomBoundary[] {
  const textEntities = [...dxf.entities.filter(isTextEntity), ...extractInsertedTexts(dxf)];
  const roomPolygons = dxf.entities
    .filter(isPolylineEntity)
    .filter((entity) => entity.closed && entity.points.length >= 3 && polygonArea(entity.points) > 1)
    .filter((entity) => /\b(room|area|wall|boundary)\b/i.test(entity.layer));

  if (roomPolygons.length > 0) return roomPolygons.map((polygon, index) => {
    const label = textEntities.find((text) => {
      const normalized = normalizeText(text.text);
      return KNOWN_ROOM_NAMES.has(normalized) && pointInPolygon(text.point, polygon.points);
    });

    return {
      name: label ? toTitleCase(normalizeText(label.text)) : `Room ${index + 1}`,
      layer: polygon.layer,
      polygon: polygon.points,
      labelPoint: label?.point,
    };
  });

  return textEntities
    .filter((text) => KNOWN_ROOM_NAMES.has(normalizeText(text.text)))
    .map((text) => ({
      name: toTitleCase(normalizeText(text.text)),
      layer: text.layer,
      polygon: [],
      labelPoint: text.point,
    }));
}

export function extractElectricalObjects(dxf: ParsedDxf, rooms = detectRoomBoundaries(dxf)): ElectricalObject[] {
  const blockMap = new Map(dxf.blocks.map((block) => [block.name, block]));
  const wallSegments = extractWallSegments(dxf);
  const objects: ElectricalObject[] = [];

  for (const entity of dxf.entities) {
    if (isInsertEntity(entity)) {
      const block = blockMap.get(entity.blockName);
      const match = block ? matchElectricalSymbol(entity.blockName, block) : null;
      const fingerprint = block ? fingerprintBlock(block) : undefined;
      const insertedLabel = block ? explicitElectricalLabelFromBlock(block) : null;
      const electricalLayer = /\b(elec|electrical|power|lighting|lights?)\b/i.test(entity.layer);
      if (!match && !insertedLabel && !electricalLayer) continue;

      const allocationPoint = block ? symbolAllocationPoint(block, entity) : entity.point;
      const allocation = allocatePointToWorkArea(allocationPoint, rooms, entity.layer, match?.item ?? null, wallSegments);
      objects.push({
        source: "DXF_INSERT",
        item: match?.item ?? null,
        label: match?.item ?? insertedLabel ?? entity.blockName,
        layer: entity.layer,
        blockName: entity.blockName,
        fingerprint,
        point: entity.point,
        workArea: allocation.workArea,
        status: match && allocation.status === "MATCH" ? "MATCH" : "REVIEW REQUIRED",
        reason: match ? allocation.reason : insertedLabel ? "explicit drawing label has no safe HBXL measurable item mapping" : "unknown electrical symbol",
      });
    }

    if (isTextEntity(entity) && EXPLICIT_ELECTRICAL_LABELS.has(normalizeExplicitLabel(entity.text))) {
      const allocation = allocatePointToWorkArea(entity.point, rooms, entity.layer, null, wallSegments);
      objects.push({
        source: "DXF_TEXT_LABEL",
        item: null,
        label: normalizeExplicitLabel(entity.text),
        layer: entity.layer,
        point: entity.point,
        workArea: allocation.workArea,
        status: "REVIEW REQUIRED",
        reason: "explicit drawing label has no safe HBXL measurable item mapping",
      });
    }
  }

  return objects;
}

export function fingerprintBlock(block: DxfBlockDefinition): BlockFingerprint {
  const points: Point2d[] = [];
  const typeCounts: Record<string, number> = {};
  const textTokens: string[] = [];
  const circleRadii: number[] = [];
  const arcRadii: number[] = [];
  const lineOrientations: string[] = [];

  for (const entity of block.entities) {
    typeCounts[entity.type] = (typeCounts[entity.type] ?? 0) + 1;

    if (isTextEntity(entity)) {
      textTokens.push(...normalizeText(entity.text).split(" ").filter(Boolean));
      points.push(entity.point);
    } else if (isCircleEntity(entity)) {
      points.push(entity.center);
      circleRadii.push(round(entity.radius));
    } else if (isArcEntity(entity)) {
      points.push(entity.center);
      arcRadii.push(round(entity.radius));
    } else if (isLineEntity(entity)) {
      points.push(entity.start, entity.end);
      lineOrientations.push(lineOrientation(entity));
    } else if (isPolylineEntity(entity)) {
      points.push(...entity.points);
    }
  }

  const extents = boundingBox(points);
  const aspectRatio = extents && extents.height > 0 ? round(extents.width / extents.height) : null;

  return {
    blockName: block.name,
    typeCounts,
    textTokens: Array.from(new Set(textTokens)).sort(),
    circleRadii: circleRadii.sort((a, b) => a - b),
    arcRadii: arcRadii.sort((a, b) => a - b),
    lineOrientations: lineOrientations.sort(),
    aspectRatio,
    lineCount: typeCounts.LINE ?? 0,
    circleCount: typeCounts.CIRCLE ?? 0,
    arcCount: typeCounts.ARC ?? 0,
    polylineCount: typeCounts.LWPOLYLINE ?? 0,
  };
}

function matchElectricalSymbol(blockName: string, block: DxfBlockDefinition): { item: string } | null {
  const fingerprint = fingerprintBlock(block);
  const candidate = normalizeCandidate([blockName, ...fingerprint.textTokens].join(" "));
  const definition = ELECTRICAL_SYMBOL_DICTIONARY.find((entry) => entry.match(candidate, fingerprint));
  return definition ? { item: definition.item } : null;
}

function canonicalElectricalItem(description: string): string | null {
  const text = description.replace(/\s+/g, " ").trim();
  if (/\b(back\s*box|socket\s*front|cable|clips?|fixings?)\b/i.test(text)) return null;
  const syntheticBlock: DxfBlockDefinition = { name: text, entities: [{ type: "CIRCLE", layer: "0", center: { x: 0, y: 0 }, radius: 1 }] };
  const match = matchElectricalSymbol(text, syntheticBlock);
  return match?.item ?? null;
}

function inferMaterialRelationship(description: string): string | null {
  if (/socket/i.test(description)) return "Socket point material build-up";
  if (/downlight|light/i.test(description)) return "Lighting material build-up";
  if (/switch/i.test(description)) return "Switch material build-up";
  return null;
}

function hasCircleRadii(fingerprint: BlockFingerprint, expected: number[]): boolean {
  return hasRadii(fingerprint.circleRadii, expected);
}

function hasArcRadii(fingerprint: BlockFingerprint, expected: number[]): boolean {
  return hasRadii(fingerprint.arcRadii, expected);
}

function hasRadii(actual: number[], expected: number[]): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every((radius, index) => Math.abs((actual[index] ?? Number.NaN) - radius) < 0.2);
}

function allocatePointToWorkArea(point: Point2d, rooms: RoomBoundary[], layer: string, item: string | null, wallSegments: DxfLineEntity[] = []): { workArea: string | null; status: ReviewStatus; reason?: string } {
  const boundaryHits = rooms.filter((room) => pointOnPolygonBoundary(point, room.polygon, 0.05));
  if (boundaryHits.length > 0) {
    return { workArea: null, status: "REVIEW REQUIRED", reason: "boundary / ambiguous room association" };
  }

  const matches = rooms.filter((room) => pointInPolygon(point, room.polygon));
  if (matches.length === 1) return { workArea: matches[0].name, status: "MATCH" };
  if (matches.length > 1) return { workArea: null, status: "REVIEW REQUIRED", reason: "overlapping room boundaries" };

  if (/\b(ext|external|exterior|outside|outdoor)\b/i.test(layer) || /Weatherproof Outdoor Socket/i.test(item ?? "")) {
    return { workArea: "Exterior", status: "MATCH" };
  }

  const labelRooms = rooms.filter((room) => room.labelPoint && room.polygon.length === 0);
  if (labelRooms.length > 0) {
    const nearest = labelRooms
      .map((room) => ({ room, distance: Math.hypot(point.x - room.labelPoint!.x, point.y - room.labelPoint!.y) }))
      .sort((a, b) => a.distance - b.distance);
    const first = nearest[0];
    const second = nearest[1];

    if (!first || (second && second.distance - first.distance < 250)) {
      return { workArea: null, status: "REVIEW REQUIRED", reason: "ambiguous nearest room label" };
    }

    if (!segmentCrossesAnyWall(point, first.room.labelPoint!, wallSegments)) {
      return { workArea: first.room.name, status: "MATCH" };
    }

    return { workArea: null, status: "REVIEW REQUIRED", reason: "wall blocks direct association to nearest room label" };
  }

  return { workArea: null, status: "REVIEW REQUIRED", reason: "outside detected room boundaries" };
}

function extractInsertedTexts(dxf: ParsedDxf): DxfTextEntity[] {
  const blockMap = new Map(dxf.blocks.map((block) => [block.name, block]));
  const result: DxfTextEntity[] = [];

  for (const entity of dxf.entities) {
    if (!isInsertEntity(entity)) continue;
    const block = blockMap.get(entity.blockName);
    if (!block) continue;

    for (const child of block.entities) {
      if (!isTextEntity(child)) continue;
      result.push({ ...child, layer: entity.layer, point: transformPoint(child.point, entity) });
    }
  }

  return result;
}

function extractWallSegments(dxf: ParsedDxf): DxfLineEntity[] {
  const blockMap = new Map(dxf.blocks.map((block) => [block.name, block]));
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

function explicitElectricalLabelFromBlock(block: DxfBlockDefinition): string | null {
  const label = block.entities
    .filter(isTextEntity)
    .map((entity) => normalizeExplicitLabel(entity.text))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return EXPLICIT_ELECTRICAL_LABELS.has(label) ? label : null;
}

function transformPoint(point: Point2d, insert: DxfInsertEntity): Point2d {
  const radians = (insert.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: insert.point.x + point.x * cos - point.y * sin,
    y: insert.point.y + point.x * sin + point.y * cos,
  };
}

function symbolAllocationPoint(block: DxfBlockDefinition, insert: DxfInsertEntity): Point2d {
  const points = block.entities.flatMap((entity) => {
    if (isLineEntity(entity)) return [entity.start, entity.end];
    if (isCircleEntity(entity)) return [entity.center];
    if (isArcEntity(entity)) return [entity.center];
    if (isPolylineEntity(entity)) return entity.points;
    if (isTextEntity(entity)) return [entity.point];
    return [];
  });
  const box = boundingBox(points);
  if (!box) return insert.point;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return transformPoint({
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  }, insert);
}

function segmentCrossesAnyWall(start: Point2d, end: Point2d, wallSegments: DxfLineEntity[]): boolean {
  return wallSegments.some((wall) => segmentsIntersect(start, end, wall.start, wall.end));
}

function segmentsIntersect(a: Point2d, b: Point2d, c: Point2d, d: Point2d): boolean {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) return false;
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 1e-9) return false;
  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / denominator;
  const ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / denominator;
  return ua > 0.01 && ua < 0.99 && ub > 0.01 && ub < 0.99;
}

function parseBlocks(pairs: DxfPair[], startIndex: number): { blocks: DxfBlockDefinition[]; nextIndex: number } {
  const blocks: DxfBlockDefinition[] = [];
  let i = startIndex;

  while (i < pairs.length) {
    if (pairs[i]?.code === 0 && pairs[i].value === "ENDSEC") return { blocks, nextIndex: i };
    if (pairs[i]?.code !== 0 || pairs[i].value !== "BLOCK") {
      i++;
      continue;
    }

    let name = "UNNAMED_BLOCK";
    i++;
    while (i < pairs.length && !(pairs[i].code === 0 && pairs[i].value !== "")) {
      if (pairs[i].code === 2) name = pairs[i].value;
      i++;
    }

    const result = parseEntitySequence(pairs, i, new Set(["ENDBLK"]));
    blocks.push({ name, entities: result.entities });
    i = result.nextIndex + 1;
  }

  return { blocks, nextIndex: i };
}

function parseEntitySequence(pairs: DxfPair[], startIndex: number, endTypes: Set<string>): { entities: DxfEntity[]; nextIndex: number } {
  const entities: DxfEntity[] = [];
  let i = startIndex;

  while (i < pairs.length) {
    const pair = pairs[i];
    if (pair.code === 0 && endTypes.has(pair.value)) return { entities, nextIndex: i };
    if (pair.code !== 0) {
      i++;
      continue;
    }

    const type = pair.value;
    const entityPairs: DxfPair[] = [];
    i++;
    while (i < pairs.length && pairs[i].code !== 0) {
      entityPairs.push(pairs[i]);
      i++;
    }

    const entity = parseEntity(type, entityPairs);
    if (entity) entities.push(entity);
  }

  return { entities, nextIndex: i };
}

function parseEntity(type: string, pairs: DxfPair[]): DxfEntity | null {
  const layer = firstString(pairs, 8) || "0";
  if (type === "INSERT") {
    return { type, layer, blockName: firstString(pairs, 2) || "", point: { x: firstNumber(pairs, 10), y: firstNumber(pairs, 20) }, rotation: firstNumber(pairs, 50) };
  }

  if (type === "TEXT" || type === "MTEXT") {
    return { type, layer, text: firstString(pairs, 1) || "", point: { x: firstNumber(pairs, 10), y: firstNumber(pairs, 20) } };
  }

  if (type === "LWPOLYLINE") {
    const points: Point2d[] = [];
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i].code === 10) points.push({ x: Number(pairs[i].value), y: Number(pairs.slice(i + 1).find((pair) => pair.code === 20)?.value ?? 0) });
    }
    const flags = firstNumber(pairs, 70);
    return { type, layer, points, closed: (flags & 1) === 1 || samePoint(points[0], points[points.length - 1]) };
  }

  if (type === "LINE") {
    return { type, layer, start: { x: firstNumber(pairs, 10), y: firstNumber(pairs, 20) }, end: { x: firstNumber(pairs, 11), y: firstNumber(pairs, 21) } };
  }

  if (type === "CIRCLE") {
    return { type, layer, center: { x: firstNumber(pairs, 10), y: firstNumber(pairs, 20) }, radius: firstNumber(pairs, 40) };
  }

  if (type === "ARC") {
    return {
      type,
      layer,
      center: { x: firstNumber(pairs, 10), y: firstNumber(pairs, 20) },
      radius: firstNumber(pairs, 40),
      startAngle: firstNumber(pairs, 50),
      endAngle: firstNumber(pairs, 51),
    };
  }

  return { type, layer };
}

function toDxfPairs(content: string): DxfPair[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim());
  const pairs: DxfPair[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number.parseInt(lines[i], 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1] });
  }
  return pairs;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function csvValue(row: string[], headers: string[], possibleHeaders: string[]): string {
  const index = possibleHeaders.map((header) => headers.indexOf(header)).find((headerIndex) => headerIndex >= 0) ?? -1;
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectLayers(entities: DxfEntity[]): string[] {
  return Array.from(new Set(entities.map((entity) => entity.layer).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function firstString(pairs: DxfPair[], code: number): string | undefined {
  return pairs.find((pair) => pair.code === code)?.value;
}

function firstNumber(pairs: DxfPair[], code: number): number {
  const value = Number.parseFloat(firstString(pairs, code) ?? "0");
  return Number.isFinite(value) ? value : 0;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\^[a-z]/gi, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeCandidate(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeExplicitLabel(value: string): string {
  return value.toUpperCase().replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string): string {
  return value.split(" ").map((part) => part.length <= 2 && /\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
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

function pointOnPolygonBoundary(point: Point2d, polygon: Point2d[], tolerance: number): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    if (distanceToSegment(point, start, end) <= tolerance) return true;
  }
  return false;
}

function distanceToSegment(point: Point2d, start: Point2d, end: Point2d): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function polygonArea(points: Point2d[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area / 2);
}

function samePoint(a: Point2d | undefined, b: Point2d | undefined): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function boundingBox(points: Point2d[]): { width: number; height: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function lineOrientation(line: DxfLineEntity): string {
  const dx = Math.abs(line.end.x - line.start.x);
  const dy = Math.abs(line.end.y - line.start.y);
  if (dx > dy * 2) return "horizontal";
  if (dy > dx * 2) return "vertical";
  return "diagonal";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
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

function isArcEntity(entity: DxfEntity): entity is DxfArcEntity {
  return entity.type === "ARC";
}

function isLineEntity(entity: DxfEntity): entity is DxfLineEntity {
  return entity.type === "LINE";
}

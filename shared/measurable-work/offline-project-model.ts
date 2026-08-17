import {
  analyseElectricalProject,
  detectRoomBoundaries,
  extractElectricalObjects,
  parsePlansXpressDxf,
  type ElectricalObject,
  type ParsedDxf,
  type ReviewStatus,
} from "./offline-electrical.ts";

export type ResourceKind = "Material" | "Labour" | "Plant" | "Subcontractor" | "Other";

export interface OfflineWorkArea {
  id: string;
  name: string;
  kind: "room" | "non-room";
  classification: "DXF_DETECTED_PHYSICAL_WORK_AREA" | "DERIVED_PROJECT_PACKAGE_ZONE";
  source: "DXF_ROOM_LABEL" | "DXF_OBJECT_ALLOCATION" | "HBXL_BUILD_PHASE" | "SUPPORTED_PLACEHOLDER";
}

export interface PlansXpressTreatmentEvidence {
  treatmentName: string;
  sourcePath: string;
  evidence: string[];
}

export interface WallDecorationProof {
  officialPlansXpressTreatment: PlansXpressTreatmentEvidence;
  dxfEvidence: {
    roomLabels: string[];
    roomPolygonsDetected: boolean;
    wallGeometryDetected: boolean;
    wallDecorationTreatmentDetectedInProjectDxf: boolean;
    wallHeightDetected: boolean;
    openingsDetectedForDecoration: boolean;
  };
  conclusion: string;
}

export interface OfflineDrawingObject {
  id: string;
  source: ElectricalObject["source"];
  canonicalDrawingIdentity: string | null;
  label: string;
  layer: string;
  blockName?: string;
  point: { x: number; y: number };
  workAreaId: string | null;
  status: ReviewStatus;
  reason?: string;
}

export interface HbxlResource {
  id: string;
  sourceRow: number;
  orderDate: string;
  dateRequired: string;
  buildPhase: string;
  typeOfResource: ResourceKind;
  resourceType: string;
  supplier: string;
  productCode: string;
  descriptionWithPrice: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number | null;
  rateUnit: string | null;
}

export interface OfflineMeasurableWorkItem {
  id: string;
  workAreaId: string;
  tradePackage: string;
  measurableItem: string;
  plannedQuantity: number | null;
  unit: string;
  drawingObjectIds: string[];
  hbxlResourceIds: string[];
  hbxlProjectQuantity: number | null;
  reconciliationStatus: ReviewStatus;
  statusReason: string;
}

export interface OfflineProjectModel {
  project: {
    name: string;
    sourceDxf: string;
    sourceSmartSchedule: string;
  };
  summary: {
    workAreasDetected: number;
    tradesDetected: number;
    measurableItemsCreated: number;
    drawingObjectsLinked: number;
    hbxlResourcesLinked: number;
    exactMatches: number;
    reviewRequired: number;
  };
  physicalWorkAreas: OfflineWorkArea[];
  derivedPackageZones: OfflineWorkArea[];
  supportedNonRoomAreas: string[];
  workAreas: OfflineWorkArea[];
  wallDecorationProof: WallDecorationProof;
  trades: string[];
  drawingObjects: OfflineDrawingObject[];
  hbxlResources: HbxlResource[];
  measurableItems: OfflineMeasurableWorkItem[];
}

interface BuildInput {
  project: string;
  dxfContent: string;
  hbxlCsvContent: string;
  sourceDxf: string;
  sourceSmartSchedule: string;
}

interface CsvRow {
  sourceRow: number;
  values: string[];
}

const SUPPORTED_NON_ROOM_AREAS = [
  "Foundation",
  "Roof",
  "Elevation",
  "Structural Zone",
  "External Works",
  "Other",
];

export function buildOfflineProjectModel(input: BuildInput): OfflineProjectModel {
  const dxf = parsePlansXpressDxf(input.dxfContent);
  const roomBoundaries = detectRoomBoundaries(dxf);
  const electricalObjects = extractElectricalObjects(dxf, roomBoundaries);
  const electricalReport = analyseElectricalProject({ project: input.project, dxfContent: input.dxfContent, hbxlCsvContent: input.hbxlCsvContent });
  const hbxlResources = parseHbxlSmartSchedule(input.hbxlCsvContent);
  const resourceBySourceRow = new Map(hbxlResources.map((resource) => [resource.sourceRow, resource]));
  const workAreas = new Map<string, OfflineWorkArea>();
  const wallDecorationProof = analyseWallDecorationProof(input.dxfContent, dxf);

  for (const room of roomBoundaries) addWorkArea(workAreas, canonicalWorkAreaName(room.name), "room", "DXF_ROOM_LABEL");
  for (const object of electricalObjects) {
    if (object.workArea) addWorkArea(workAreas, canonicalWorkAreaName(object.workArea), object.workArea === "Exterior" ? "non-room" : "room", "DXF_OBJECT_ALLOCATION");
  }

  for (const areaName of SUPPORTED_NON_ROOM_AREAS) addWorkArea(workAreas, areaName, "non-room", "SUPPORTED_PLACEHOLDER");

  const drawingObjects = electricalObjects.map((object, index): OfflineDrawingObject => ({
    id: `drawing-${String(index + 1).padStart(4, "0")}`,
    source: object.source,
    canonicalDrawingIdentity: object.item,
    label: object.label,
    layer: object.layer,
    blockName: object.blockName,
    point: object.point,
    workAreaId: object.workArea ? workAreaId(canonicalWorkAreaName(object.workArea)) : null,
    status: object.status,
    reason: object.reason,
  }));

  const measurableItems: OfflineMeasurableWorkItem[] = [];
  const reconciliationByItem = new Map(electricalReport.reconciliation.map((item) => [item.item, item]));
  const hbxlElectricalByItem = new Map(electricalReport.hbxl.measurableItems.map((item) => [item.item, item]));
  const objectsByAreaAndItem = new Map<string, OfflineDrawingObject[]>();

  for (const object of drawingObjects) {
    if (!object.workAreaId || !object.canonicalDrawingIdentity || object.status !== "MATCH") continue;
    const key = `${object.workAreaId}|${object.canonicalDrawingIdentity}`;
    const group = objectsByAreaAndItem.get(key) ?? [];
    group.push(object);
    objectsByAreaAndItem.set(key, group);
  }

  for (const [key, objects] of objectsByAreaAndItem) {
    const [areaId, item] = key.split("|");
    const hbxlItem = hbxlElectricalByItem.get(item);
    const exactResourceIds = (hbxlItem?.sourceRows ?? [])
      .map((sourceRow) => resourceBySourceRow.get(sourceRow)?.id)
      .filter((id): id is string => !!id);
    const supportResourceIds = findElectricalSupportResourceIds(item, hbxlResources);
    const resourceIds = Array.from(new Set([...exactResourceIds, ...supportResourceIds]));
    const reconciliation = reconciliationByItem.get(item);
    const status = reconciliation?.status ?? "REVIEW REQUIRED";

    measurableItems.push({
      id: measurableItemId(areaId, "Electrical", item),
      workAreaId: areaId,
      tradePackage: "Electrical",
      measurableItem: item,
      plannedQuantity: objects.length,
      unit: "Each",
      drawingObjectIds: objects.map((object: OfflineDrawingObject) => object.id),
      hbxlResourceIds: resourceIds,
      hbxlProjectQuantity: hbxlItem?.quantity ?? null,
      reconciliationStatus: status,
      statusReason: status === "MATCH"
        ? "Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived."
        : "Project-wide DXF quantity does not equal exact HBXL Smart Schedule resource quantity.",
    });
  }

  for (const object of drawingObjects.filter((object) => object.status === "REVIEW REQUIRED")) {
    const areaId = object.workAreaId ?? workAreaId("Other");
    measurableItems.push({
      id: measurableItemId(areaId, "Electrical", `Review Required ${object.id}`),
      workAreaId: areaId,
      tradePackage: "Electrical",
      measurableItem: `Review Required: ${object.label}`,
      plannedQuantity: 1,
      unit: "Each",
      drawingObjectIds: [object.id],
      hbxlResourceIds: [],
      hbxlProjectQuantity: null,
      reconciliationStatus: "REVIEW REQUIRED",
      statusReason: object.reason ?? "Drawing object is not safely mapped to an HBXL measurable item.",
    });
  }

  const wallDecorationResources = hbxlResources.filter((resource) => resource.buildPhase === "Internal Decoration");
  for (const area of Array.from(workAreas.values()).filter((area) => area.classification === "DXF_DETECTED_PHYSICAL_WORK_AREA" && area.kind === "room")) {
    measurableItems.push({
      id: measurableItemId(area.id, "Decoration", "Wall Decoration"),
      workAreaId: area.id,
      tradePackage: "Decoration",
      measurableItem: "Wall Decoration",
      plannedQuantity: null,
      unit: "m2",
      drawingObjectIds: [],
      hbxlResourceIds: wallDecorationResources.map((resource) => resource.id),
      hbxlProjectQuantity: null,
      reconciliationStatus: "REVIEW REQUIRED",
      statusReason: wallDecorationProof.dxfEvidence.wallDecorationTreatmentDetectedInProjectDxf
        ? "Wall Decoration treatment is present, but deterministic room wall area calculation still requires room polygons, wall height, and openings."
        : "Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.",
    });
  }

  const nonElectricalPhaseGroups = groupNonElectricalResourcesByPhase(hbxlResources);
  for (const [buildPhase, resources] of nonElectricalPhaseGroups) {
    const trade = tradeForBuildPhase(buildPhase, resources);
    const areaName = workAreaForBuildPhase(buildPhase);
    addWorkArea(workAreas, areaName, "non-room", "HBXL_BUILD_PHASE");
    measurableItems.push({
      id: measurableItemId(workAreaId(areaName), trade, buildPhase),
      workAreaId: workAreaId(areaName),
      tradePackage: trade,
      measurableItem: `HBXL Baseline: ${buildPhase}`,
      plannedQuantity: null,
      unit: "package",
      drawingObjectIds: [],
      hbxlResourceIds: resources.map((resource: HbxlResource) => resource.id),
      hbxlProjectQuantity: resources.filter((resource: HbxlResource) => resource.quantity > 0).length,
      reconciliationStatus: "REVIEW REQUIRED",
      statusReason: "HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.",
    });
  }

  const linkedDrawingObjects = new Set(measurableItems.flatMap((item) => item.drawingObjectIds));
  const linkedHbxlResources = new Set(measurableItems.flatMap((item) => item.hbxlResourceIds));
  const trades = Array.from(new Set(measurableItems.map((item) => item.tradePackage))).sort((a, b) => a.localeCompare(b));
  const sortedWorkAreas = Array.from(workAreas.values()).sort((a, b) => a.name.localeCompare(b.name));
  const physicalWorkAreas = sortedWorkAreas.filter((area) => area.classification === "DXF_DETECTED_PHYSICAL_WORK_AREA");
  const derivedPackageZones = sortedWorkAreas.filter((area) => area.classification === "DERIVED_PROJECT_PACKAGE_ZONE");
  const sortedItems = measurableItems.sort((a, b) => {
    const areaCompare = areaNameById(sortedWorkAreas, a.workAreaId).localeCompare(areaNameById(sortedWorkAreas, b.workAreaId));
    if (areaCompare !== 0) return areaCompare;
    const tradeCompare = a.tradePackage.localeCompare(b.tradePackage);
    return tradeCompare !== 0 ? tradeCompare : a.measurableItem.localeCompare(b.measurableItem);
  });

  return {
    project: {
      name: input.project,
      sourceDxf: input.sourceDxf,
      sourceSmartSchedule: input.sourceSmartSchedule,
    },
    summary: {
      workAreasDetected: physicalWorkAreas.length,
      tradesDetected: trades.length,
      measurableItemsCreated: sortedItems.length,
      drawingObjectsLinked: linkedDrawingObjects.size,
      hbxlResourcesLinked: linkedHbxlResources.size,
      exactMatches: sortedItems.filter((item) => item.reconciliationStatus === "MATCH").length,
      reviewRequired: sortedItems.filter((item) => item.reconciliationStatus === "REVIEW REQUIRED").length,
    },
    physicalWorkAreas,
    derivedPackageZones,
    supportedNonRoomAreas: SUPPORTED_NON_ROOM_AREAS,
    workAreas: sortedWorkAreas,
    wallDecorationProof,
    trades,
    drawingObjects,
    hbxlResources,
    measurableItems: sortedItems,
  };
}

export function parseHbxlSmartSchedule(content: string): HbxlResource[] {
  const rows = parseCsv(content);
  if (rows.length < 2) return [];

  const headers = rows[0].values.map(normalizeHeader);
  return rows.slice(1).map((row): HbxlResource => {
    const descriptionWithPrice = csvValue(row.values, headers, ["resourcedescription", "description"]);
    const description = csvValue(row.values, headers, ["resourcedescriptionwithoutprice", "descriptionwithoutprice"]) || stripPrice(descriptionWithPrice);
    const rate = parseRate(descriptionWithPrice);
    return {
      id: `hbxl-row-${row.sourceRow}`,
      sourceRow: row.sourceRow,
      orderDate: csvValue(row.values, headers, ["orderdate"]),
      dateRequired: csvValue(row.values, headers, ["daterequired"]),
      buildPhase: csvValue(row.values, headers, ["buildphase"]),
      typeOfResource: normalizeResourceKind(csvValue(row.values, headers, ["typeofresource"])),
      resourceType: csvValue(row.values, headers, ["resourcetype"]),
      supplier: csvValue(row.values, headers, ["supplier"]),
      productCode: csvValue(row.values, headers, ["productcode"]),
      descriptionWithPrice,
      description,
      quantity: parseQuantity(csvValue(row.values, headers, ["orderquantity", "quantity", "qty"])),
      unit: parseUnit(description) ?? rate?.unit ?? "",
      rate: rate?.amount ?? null,
      rateUnit: rate?.unit ?? null,
    };
  });
}

export function renderOfflineProjectMarkdown(model: OfflineProjectModel): string {
  const resourceById = new Map(model.hbxlResources.map((resource) => [resource.id, resource]));
  const areaById = new Map(model.workAreas.map((area) => [area.id, area]));
  const lines: string[] = [
    `# ${model.project.name} Offline HBXL Project Model`,
    "",
    "Offline report only. No database, API, UI, assignment, buying, payment, commit, push, or deploy action is performed by this model.",
    "",
    "## Summary",
    "",
    `- DXF-detected physical work areas: ${model.summary.workAreasDetected}`,
    `- Derived project/package zones: ${model.derivedPackageZones.length}`,
    `- Trades/packages detected: ${model.summary.tradesDetected}`,
    `- Measurable items created: ${model.summary.measurableItemsCreated}`,
    `- Drawing objects linked: ${model.summary.drawingObjectsLinked}`,
    `- HBXL resources linked: ${model.summary.hbxlResourcesLinked}`,
    `- Exact matches: ${model.summary.exactMatches}`,
    `- Review-required items: ${model.summary.reviewRequired}`,
    "",
    "## DXF-Detected Physical Work Areas",
    "",
    ...model.physicalWorkAreas.map((area) => `- ${area.name} (${area.kind}, ${area.source})`),
    "",
    "## Derived Project / Package Zones",
    "",
    ...model.derivedPackageZones.map((area) => `- ${area.name} (${area.source})`),
    "",
    "## Wall Decoration Proof",
    "",
    `Official PlansXpress treatment: ${model.wallDecorationProof.officialPlansXpressTreatment.treatmentName}`,
    "",
    `Treatment source: ${model.wallDecorationProof.officialPlansXpressTreatment.sourcePath}`,
    "",
    ...model.wallDecorationProof.officialPlansXpressTreatment.evidence.map((evidence) => `- ${evidence}`),
    "",
    `DXF room labels: ${model.wallDecorationProof.dxfEvidence.roomLabels.join(", ")}`,
    "",
    `Room polygons detected: ${yesNo(model.wallDecorationProof.dxfEvidence.roomPolygonsDetected)}`,
    "",
    `Wall geometry detected: ${yesNo(model.wallDecorationProof.dxfEvidence.wallGeometryDetected)}`,
    "",
    `Wall Decoration treatment detected in project DXF: ${yesNo(model.wallDecorationProof.dxfEvidence.wallDecorationTreatmentDetectedInProjectDxf)}`,
    "",
    `Wall height detected: ${yesNo(model.wallDecorationProof.dxfEvidence.wallHeightDetected)}`,
    "",
    `Decoration openings detected: ${yesNo(model.wallDecorationProof.dxfEvidence.openingsDetectedForDecoration)}`,
    "",
    `Conclusion: ${model.wallDecorationProof.conclusion}`,
    "",
    "## Trades / Packages",
    "",
    ...model.trades.map((trade) => `- ${trade}`),
    "",
    "## Reconciliation Table",
    "",
    "| Work Area | Trade / Package | Measurable Item | Drawing Qty | HBXL Related Qty / Resources | Match / Review |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...model.measurableItems.map((item) => {
      const area = areaById.get(item.workAreaId)?.name ?? item.workAreaId;
      const resources = item.hbxlResourceIds.map((id) => resourceById.get(id)).filter((resource): resource is HbxlResource => !!resource);
      const exactResource = resources.find((resource) => resource.description === item.measurableItem);
      const hbxlQuantity = item.hbxlProjectQuantity === null ? "-" : `${item.hbxlProjectQuantity}`;
      const resourceSummary = exactResource
        ? `${hbxlQuantity} ${exactResource.unit || item.unit}; ${resources.length} resource rows`
        : `${hbxlQuantity}; ${resources.length} resource rows`;
      return `| ${area} | ${item.tradePackage} | ${item.measurableItem} | ${item.plannedQuantity ?? "-"} | ${resourceSummary} | ${item.reconciliationStatus} |`;
    }),
    "",
    "## Resource Detail",
    "",
  ];

  for (const item of model.measurableItems) {
    const area = areaById.get(item.workAreaId)?.name ?? item.workAreaId;
    const resources = item.hbxlResourceIds.map((id) => resourceById.get(id)).filter((resource): resource is HbxlResource => !!resource);
    lines.push(`### ${area} / ${item.tradePackage} / ${item.measurableItem}`);
    lines.push("");
    lines.push(`Status: ${item.reconciliationStatus}. ${item.statusReason}`);
    lines.push("");
    lines.push(`Drawing references: ${item.drawingObjectIds.length > 0 ? item.drawingObjectIds.join(", ") : "none"}`);
    lines.push("");

    for (const kind of ["Material", "Labour", "Plant", "Subcontractor", "Other"] as ResourceKind[]) {
      const group = resources.filter((resource) => resource.typeOfResource === kind);
      if (group.length === 0) continue;
      lines.push(`${kind}:`);
      for (const resource of group) {
        const code = resource.productCode ? `${resource.productCode} - ` : "";
        const rate = resource.rate === null ? "" : ` @ £${resource.rate}/${resource.rateUnit}`;
        lines.push(`- Row ${resource.sourceRow}: ${code}${resource.description} | Qty ${resource.quantity} ${resource.unit}${rate} | Phase ${resource.buildPhase}`);
      }
      lines.push("");
    }

    if (resources.length === 0) {
      lines.push("No HBXL resource rows safely linked.");
      lines.push("");
    }
  }

  lines.push("## Review Required");
  lines.push("");
  for (const item of model.measurableItems.filter((item) => item.reconciliationStatus === "REVIEW REQUIRED")) {
    const area = areaById.get(item.workAreaId)?.name ?? item.workAreaId;
    lines.push(`- ${area} / ${item.tradePackage} / ${item.measurableItem}: ${item.statusReason}`);
  }

  return `${lines.join("\n")}\n`;
}

function findElectricalSupportResourceIds(item: string, resources: HbxlResource[]): string[] {
  const electricalRows = resources.filter((resource) => /electrical/i.test(resource.buildPhase));
  const result = electricalRows
    .filter((resource) => resource.typeOfResource === "Labour")
    .map((resource) => resource.id);

  const materialPatterns: RegExp[] = [];
  if (/socket/i.test(item)) materialPatterns.push(/Back Box Metal 2G|Twin & Earth Cable 2\.5mm|Cable Clips 2\.5mm|Wood Screws Steel CSK Twin Thread 8 x 1\.5/i);
  if (/downlight|light|pendant|fluorescent|ceiling/i.test(item)) materialPatterns.push(/3 Core & Earth Cable 1mm|Twin & Earth Cable 1\.5mm|Twin & Earth Cable 1mm|Cable Clips 1mm|Sheathing Metal|Fire Hood|Insulation Guard|Wood Screws Steel CSK Twin Thread 8 x 1\.5/i);
  if (/switch|spur|shaver|cooker|extractor/i.test(item)) materialPatterns.push(/Back Box Metal 1G|Twin & Earth Cable|Cable Clips|Wood Screws Steel CSK Twin Thread 8 x 1\.5/i);

  for (const resource of electricalRows) {
    if (resource.typeOfResource !== "Material") continue;
    if (materialPatterns.some((pattern) => pattern.test(resource.description))) result.push(resource.id);
  }

  return Array.from(new Set(result));
}

function groupNonElectricalResourcesByPhase(resources: HbxlResource[]): Map<string, HbxlResource[]> {
  const groups = new Map<string, HbxlResource[]>();
  for (const resource of resources) {
    if (/electrical/i.test(resource.buildPhase)) continue;
    const group = groups.get(resource.buildPhase) ?? [];
    group.push(resource);
    groups.set(resource.buildPhase, group);
  }
  return groups;
}

function tradeForBuildPhase(buildPhase: string, resources: HbxlResource[]): string {
  if (/roof/i.test(buildPhase)) return "Roofing";
  if (/footing|foundation|oversite|slab/i.test(buildPhase)) return "Groundworks";
  if (/masonry|icf|sips|timber frame|shell/i.test(buildPhase)) return "Masonry / Structure";
  if (/structural|steel/i.test(buildPhase)) return "Structural";
  if (/decoration|preparation/i.test(buildPhase)) return "Decoration";
  if (/plaster/i.test(buildPhase)) return "Plastering";
  if (/joinery/i.test(buildPhase)) return "Joinery";
  if (resources.some((resource) => /floor|til/i.test(resource.resourceType))) return "Flooring / Tiling";
  return "Other";
}

function workAreaForBuildPhase(buildPhase: string): string {
  if (/footing|foundation|oversite|slab/i.test(buildPhase)) return "Foundation";
  if (/roof/i.test(buildPhase)) return "Roof";
  if (/external/i.test(buildPhase)) return "External Works";
  if (/structural|steel|masonry|shell|frame/i.test(buildPhase)) return "Structural Zone";
  return "Other";
}

function addWorkArea(areas: Map<string, OfflineWorkArea>, name: string, kind: OfflineWorkArea["kind"], source: OfflineWorkArea["source"]): void {
  name = canonicalWorkAreaName(name);
  const id = workAreaId(name);
  if (areas.has(id)) return;
  areas.set(id, {
    id,
    name,
    kind,
    classification: source === "DXF_ROOM_LABEL" || source === "DXF_OBJECT_ALLOCATION" ? "DXF_DETECTED_PHYSICAL_WORK_AREA" : "DERIVED_PROJECT_PACKAGE_ZONE",
    source,
  });
}

function analyseWallDecorationProof(dxfContent: string, dxf: ParsedDxf): WallDecorationProof {
  const roomLabels = detectRoomBoundaries(dxf).map((room) => canonicalWorkAreaName(room.name));
  const hasRoomPolygons = dxf.entities.some((entity) => (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") && /\b(room|area|boundary)\b/i.test(entity.layer));
  const wallGeometryDetected = dxf.entities.some((entity) => /wall/i.test(entity.layer));
  const wallDecorationTreatmentDetected = /wall\s+decoration/i.test(dxfContent);
  const wallHeightDetected = /\b(wall height|height of wall|ceiling height|height of ceiling)\b/i.test(dxfContent);
  const openingsDetected = /\b(area of openings|opening area|openings in main wall)\b/i.test(dxfContent);

  return {
    officialPlansXpressTreatment: {
      treatmentName: "Wall Decoration",
      sourcePath: "C:\\ProgramData\\HBXL\\PlansXpress5\\Symbols\\Treatment Labels\\Wall Decoration.pxd",
      evidence: [
        "Official PlansXpress treatment label file exists in the treatment-label library.",
        "The decompressed PXD contains a text entity with Text=\"Wall Decoration\".",
      ],
    },
    dxfEvidence: {
      roomLabels,
      roomPolygonsDetected: hasRoomPolygons,
      wallGeometryDetected,
      wallDecorationTreatmentDetectedInProjectDxf: wallDecorationTreatmentDetected,
      wallHeightDetected,
      openingsDetectedForDecoration: openingsDetected,
    },
    conclusion: wallDecorationTreatmentDetected && hasRoomPolygons && wallHeightDetected && openingsDetected
      ? "Wall Decoration appears calculable from deterministic drawing data."
      : "Wall Decoration cannot be quantity-matched safely from the current DXF alone: the official treatment is known, but the project DXF does not expose all required treatment, room polygon, wall height, and opening data needed for a deterministic per-room wall-decoration area.",
  };
}

function canonicalWorkAreaName(name: string): string {
  return name === "Tv Room" ? "TV Room" : name;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function areaNameById(areas: OfflineWorkArea[], id: string): string {
  return areas.find((area) => area.id === id)?.name ?? id;
}

function workAreaId(name: string): string {
  return `work-area-${slugify(name)}`;
}

function measurableItemId(areaId: string, trade: string, item: string): string {
  return `${areaId}-${slugify(trade)}-${slugify(item)}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function parseCsv(content: string): CsvRow[] {
  const parsedRows: string[][] = [];
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
      if (row.some((value) => value.length > 0)) parsedRows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) parsedRows.push(row);
  return parsedRows.map((values, index) => ({ sourceRow: index + 1, values }));
}

function csvValue(row: string[], headers: string[], possibleHeaders: string[]): string {
  const index = possibleHeaders.map((header) => headers.indexOf(header)).find((headerIndex) => headerIndex >= 0) ?? -1;
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeResourceKind(value: string): ResourceKind {
  if (value === "Material" || value === "Labour" || value === "Plant" || value === "Subcontractor") return value;
  return "Other";
}

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseUnit(description: string): string | null {
  const match = description.match(/\(([^()]+)\)\s*$/);
  return match?.[1] ?? null;
}

function parseRate(description: string): { amount: number; unit: string } | null {
  const match = description.match(/£([0-9,]+(?:\.\d+)?)\/([^\s,]+)/);
  if (!match) return null;
  return { amount: parseQuantity(match[1]), unit: match[2] };
}

function stripPrice(description: string): string {
  return description.replace(/\s+£[0-9,]+(?:\.\d+)?\/[^\s,]+/, "").trim();
}

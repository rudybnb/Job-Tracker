import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  analyseElectricalProject,
  detectRoomBoundaries,
  extractElectricalObjects,
  fingerprintBlock,
  formatElectricalConsoleSummary,
  parseHbxlElectricalCsv,
  parsePlansXpressDxf,
} from "../shared/measurable-work/offline-electrical.ts";

const patrickBrookHbxlElectricalCsv = `Order Date,Date Required,Build Phase,Type of Resource,Resource Type,Supplier,Product Code,Resource Description,Resource Description Without Price,Order Quantity,Unit
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-001,Double Socket 13A,Double Socket 13A,5,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-002,Double Socket 13A with Twin USB,Double Socket 13A with Twin USB,11,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-003,Mains Downlight Fire Rated,Mains Downlight Fire Rated,11,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-004,Mains Downlight Standard,Mains Downlight Standard,6,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-005,Ceiling Rose and Pendant,Ceiling Rose and Pendant,6,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-006,Fluorescent Light 1500mm,Fluorescent Light 1500mm,3,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-007,Light Switch 6A 1G 1 Way,Light Switch 6A 1G 1 Way,7,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-008,Light Switch 10A 2 Gang 2 Way,Light Switch 10A 2 Gang 2 Way,2,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-009,Light Switch 6A 1G 2 Way,Light Switch 6A 1G 2 Way,1,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-010,Weatherproof Outdoor Socket 1G,Weatherproof Outdoor Socket 1G,6,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-011,Bathroom Extractor Fan,Bathroom Extractor Fan,1,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-012,Cooker Connection Plate,Cooker Connection Plate,2,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-013,Cooker Control Unit,Cooker Control Unit,1,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-014,Fused Spur 13A,Fused Spur 13A,1,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-015,Pull Cord Switch 45A,Pull Cord Switch 45A,1,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-016,Pull Cord Switch 6A,Pull Cord Switch 6A,1,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-017,Shaver Socket,Shaver Socket,1,Each
2026-01-05,2026-01-05,Electrical,Labour,Electrician,Sculpt,EL-018,WC Ceiling Light Fitting,WC Ceiling Light Fitting,2,Each
2026-01-05,2026-01-05,Electrical,Material,Materials,Supplier,MAT-001,35mm Double Socket Back Box,35mm Double Socket Back Box,16,Each
2026-01-05,2026-01-05,Electrical,Material,Materials,Supplier,MAT-002,2.5mm Twin and Earth Cable,2.5mm Twin and Earth Cable,100,Metres`;

function dxfPair(code: number, value: string | number): string {
  return `${code}\n${value}`;
}

function text(layer: string, value: string, x: number, y: number): string {
  return [dxfPair(0, "TEXT"), dxfPair(8, layer), dxfPair(10, x), dxfPair(20, y), dxfPair(1, value)].join("\n");
}

function insert(layer: string, blockName: string, x: number, y: number): string {
  return [dxfPair(0, "INSERT"), dxfPair(8, layer), dxfPair(2, blockName), dxfPair(10, x), dxfPair(20, y)].join("\n");
}

function room(name: string, x1: number, y1: number, x2: number, y2: number): string {
  return [
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(8, "A-ROOM-BOUNDARY"),
    dxfPair(70, 1),
    dxfPair(10, x1), dxfPair(20, y1),
    dxfPair(10, x2), dxfPair(20, y1),
    dxfPair(10, x2), dxfPair(20, y2),
    dxfPair(10, x1), dxfPair(20, y2),
    text("A-ROOM-NAME", name, (x1 + x2) / 2, (y1 + y2) / 2),
  ].join("\n");
}

function block(name: string, marker: string): string {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(2, name),
    dxfPair(70, 0),
    dxfPair(0, "CIRCLE"),
    dxfPair(8, "0"),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(40, 0.15),
    dxfPair(0, "TEXT"),
    dxfPair(8, "0"),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(1, marker),
    dxfPair(0, "ENDBLK"),
  ].join("\n");
}

function buildPatrickBrookDxf(options: { includeUnknown?: boolean; includeBoundary?: boolean } = {}): string {
  const blocks = [
    block("PB_DOUBLE_SOCKET_13A", "double socket 13a"),
    block("PB_DOUBLE_SOCKET_USB", "double socket usb"),
    block("PB_DOWNLIGHT_FIRE_RATED", "downlight fire rated"),
    block("PB_DOWNLIGHT_STANDARD", "downlight standard"),
    block("PB_CEILING_ROSE_PENDANT", "ceiling rose pendant"),
    block("PB_FLUORESCENT_1500", "fluorescent 1500"),
    block("PB_LIGHT_SWITCH_6A_1G_1WAY", "switch 1g1w"),
    block("PB_LIGHT_SWITCH_10A_2G_2WAY", "switch 10a 2g2w"),
    block("PB_LIGHT_SWITCH_6A_1G_2WAY", "switch 1g2w"),
    block("PB_WEATHERPROOF_OUTDOOR_SOCKET", "weatherproof outdoor socket"),
    block("PB_EXTRACTOR_FAN", "extractor fan"),
    block("PB_COOKER_CONNECTION_PLATE", "cooker connection plate"),
    block("PB_COOKER_CONTROL_UNIT", "cooker control unit"),
    block("PB_FUSED_SPUR_13A", "fused spur"),
    block("PB_PULL_CORD_45A", "pull cord 45a"),
    block("PB_PULL_CORD_6A", "pull cord 6a"),
    block("PB_SHAVER_SOCKET", "shaver socket"),
    block("PB_WC_CEILING_LIGHT", "wc ceiling light"),
    block("PB_UNKNOWN_ELECTRICAL", "mystery power point"),
  ];

  const rooms = [
    room("Main Bedroom", 0, 10, 10, 20),
    room("Bedroom 2", 10, 10, 20, 20),
    room("Bedroom 3", 20, 10, 30, 20),
    room("Lounge", 0, 0, 10, 10),
    room("Kitchen", 10, 0, 20, 10),
    room("Laundry", 20, 0, 30, 10),
    room("Passage", 0, -5, 30, 0),
    room("Bathroom", 30, 0, 40, 10),
    room("TV Room", 30, 10, 40, 20),
  ];

  const inserts = [
    ...points("PB_DOUBLE_SOCKET_13A", [[1, 12], [2, 12], [11, 12], [12, 12], [31, 12]]),
    ...points("PB_DOUBLE_SOCKET_USB", [[13, 2], [14, 2], [15, 2], [16, 2], [17, 2], [21, 2], [22, 2], [1, 2], [2, 2], [32, 12], [33, 12]]),
    ...points("PB_DOWNLIGHT_FIRE_RATED", [[11, 4], [12, 4], [13, 4], [14, 4], [15, 4], [31, 4], [32, 4], [33, 4], [34, 4], [35, 4], [36, 4]]),
    ...points("PB_DOWNLIGHT_STANDARD", [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4]]),
    ...points("PB_CEILING_ROSE_PENDANT", [[1, 15], [11, 15], [21, 15], [25, 4], [5, -2], [15, -2]]),
    ...points("PB_FLUORESCENT_1500", [[21, 4], [22, 4], [23, 4]]),
    ...points("PB_LIGHT_SWITCH_6A_1G_1WAY", [[9, 1], [11, 1], [21, 1], [31, 1], [1, -1], [11, -1], [21, -1]]),
    ...points("PB_LIGHT_SWITCH_10A_2G_2WAY", [[9, 9], [19, 9]]),
    ...points("PB_LIGHT_SWITCH_6A_1G_2WAY", [[29, 9]]),
    ...points("PB_WEATHERPROOF_OUTDOOR_SOCKET", [[-2, 2], [-3, 3], [42, 4], [43, 5], [5, 22], [15, 22]], "E-EXTERIOR"),
    ...points("PB_EXTRACTOR_FAN", [[35, 6]]),
    ...points("PB_COOKER_CONNECTION_PLATE", [[18, 6], [18, 7]]),
    ...points("PB_COOKER_CONTROL_UNIT", [[17, 7]]),
    ...points("PB_FUSED_SPUR_13A", [[18, 8]]),
    ...points("PB_PULL_CORD_45A", [[35, 2]]),
    ...points("PB_PULL_CORD_6A", [[36, 2]]),
    ...points("PB_SHAVER_SOCKET", [[37, 2]]),
    ...points("PB_WC_CEILING_LIGHT", [[7, -2], [17, -2]]),
    text("E-LABEL", "OVEN", 16, 6),
    text("E-LABEL", "ELECTRIC HOB", 16, 7),
    text("E-LABEL", "ELECTRIC SHOWER", 36, 3),
  ];

  if (options.includeUnknown) inserts.push(insert("E-POWER", "PB_UNKNOWN_ELECTRICAL", 4, 12));
  if (options.includeBoundary) inserts.push(insert("E-POWER", "PB_DOUBLE_SOCKET_13A", 10, 12));

  return [
    dxfPair(0, "SECTION"),
    dxfPair(2, "BLOCKS"),
    blocks.join("\n"),
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "ENTITIES"),
    rooms.join("\n"),
    inserts.join("\n"),
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "EOF"),
  ].join("\n");
}

function points(blockName: string, coordinates: Array<[number, number]>, layer = "E-POWER"): string[] {
  return coordinates.map(([x, y]) => insert(layer, blockName, x, y));
}

test("parses HBXL electrical CSV into measurable work items and material build-up", () => {
  const parsed = parseHbxlElectricalCsv(patrickBrookHbxlElectricalCsv);

  assert.equal(parsed.measurableItems.find((item) => item.item === "Double Socket 13A")?.quantity, 5);
  assert.equal(parsed.measurableItems.find((item) => item.item === "Double Socket 13A with Twin USB")?.quantity, 11);
  assert.equal(parsed.materialBuildUp.length, 2);
  assert.equal(parsed.unknownElectricalRows.length, 0);
});

test("parses DXF layers, blocks, text, inserts and room boundaries as structured CAD data", () => {
  const dxf = parsePlansXpressDxf(buildPatrickBrookDxf());
  const rooms = detectRoomBoundaries(dxf);

  assert.ok(dxf.layers.includes("A-ROOM-BOUNDARY"));
  assert.ok(dxf.layers.includes("E-POWER"));
  assert.ok(dxf.blocks.some((block) => block.name === "PB_DOUBLE_SOCKET_USB"));
  assert.equal(rooms.length, 9);
  assert.ok(rooms.some((area) => area.name === "Kitchen"));
});

test("matches electrical symbols by reusable block fingerprint instead of coordinates", () => {
  const dxf = parsePlansXpressDxf(buildPatrickBrookDxf());
  const socketUsbBlock = dxf.blocks.find((block) => block.name === "PB_DOUBLE_SOCKET_USB");

  assert.ok(socketUsbBlock);
  const fingerprint = fingerprintBlock(socketUsbBlock);
  assert.equal(fingerprint.typeCounts.CIRCLE, 1);
  assert.ok(fingerprint.textTokens.includes("usb"));

  const objects = extractElectricalObjects(dxf);
  assert.equal(objects.filter((object) => object.item === "Double Socket 13A with Twin USB").length, 11);
});

test("allocates electrical objects to rooms and marks boundary objects as review required", () => {
  const dxf = parsePlansXpressDxf(buildPatrickBrookDxf({ includeBoundary: true }));
  const objects = extractElectricalObjects(dxf);

  assert.ok(objects.some((object) => object.item === "Cooker Control Unit" && object.workArea === "Kitchen"));
  assert.ok(objects.some((object) => object.item === "Weatherproof Outdoor Socket 1G" && object.workArea === "Exterior"));
  assert.ok(objects.some((object) => object.reason === "boundary / ambiguous room association"));
});

test("marks unknown electrical symbols and explicit labels as review required", () => {
  const dxf = parsePlansXpressDxf(buildPatrickBrookDxf({ includeUnknown: true }));
  const objects = extractElectricalObjects(dxf);

  assert.ok(objects.some((object) => object.blockName === "PB_UNKNOWN_ELECTRICAL" && object.status === "REVIEW REQUIRED"));
  assert.ok(objects.some((object) => object.label === "OVEN" && object.status === "REVIEW REQUIRED"));
  assert.ok(objects.some((object) => object.label === "ELECTRIC HOB" && object.status === "REVIEW REQUIRED"));
  assert.ok(objects.some((object) => object.label === "ELECTRIC SHOWER" && object.status === "REVIEW REQUIRED"));
});

test("reconciles Patrick Brook electrical project quantities project-wide", () => {
  const report = analyseElectricalProject({
    project: "Patrick Brook / Chat Test",
    dxfContent: buildPatrickBrookDxf(),
    hbxlCsvContent: patrickBrookHbxlElectricalCsv,
  });

  assert.equal(report.detected.rooms.length, 9);
  assert.equal(report.detected.electricalObjects, 71);
  assert.equal(report.detected.confidentlyIdentified, 68);
  assert.equal(report.detected.reviewRequired, 3);
  assert.equal(report.reconciliation.every((item) => item.status === "MATCH"), true);
  assert.equal(report.reconciliation.find((item) => item.item === "Mains Downlight Standard")?.dxfTotal, 6);
  assert.equal(report.reconciliation.find((item) => item.item === "Mains Downlight Standard")?.hbxlTotal, 6);
  assert.ok(report.workAreas.find((area) => area.name === "Kitchen")?.packages[0].items.some((item) => item.item === "Cooker Control Unit"));
  assert.match(formatElectricalConsoleSummary(report), /Item \| DXF Total \| HBXL Total \| Status/);
});

test("loads and analyses real Patrick Brook DXF and HBXL CSV without seeded DXF objects", () => {
  const dxfContent = readFileSync("test-fixtures/patrick-brook/Chat Test.dxf", "utf8");
  const hbxlCsvContent = readFileSync("test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv", "utf8");
  const report = analyseElectricalProject({ project: "Patrick Brook / Chat Test", dxfContent, hbxlCsvContent });

  assert.ok(dxfContent.length > 1_000_000, "real DXF should be opened, not the synthetic fixture");
  assert.ok(hbxlCsvContent.length > 10_000, "real HBXL CSV should be opened, not the synthetic fixture");
  assert.ok(report.detected.layers.includes("Electrical"));
  assert.ok(report.detected.rooms.includes("Kitchen"));
  assert.ok(report.detected.rooms.includes("Main Bedroom"));
  assert.equal(report.detected.electricalObjects, 67);
  assert.ok(report.detected.confidentlyIdentified >= 48);
  assert.equal(report.reconciliation.find((item) => item.item === "Double Socket 13A")?.status, "MATCH");
  assert.equal(report.reconciliation.find((item) => item.item === "Double Socket 13A with Twin USB")?.status, "MATCH");
  assert.equal(report.reconciliation.find((item) => item.item === "Mains Downlight Fire Rated")?.status, "MATCH");
  assert.equal(report.reconciliation.find((item) => item.item === "Weatherproof Outdoor Socket 1G")?.dxfTotal, 6);
  assert.equal(report.reconciliation.find((item) => item.item === "Weatherproof Outdoor Socket 1G")?.status, "MATCH");
  assert.equal(report.reconciliation.find((item) => item.item === "Light Switch 6A 1G 1 Way")?.status, "REVIEW REQUIRED");
  assert.ok(report.reviewItems.some((item) => item.label === "OVEN" || item.label === "ELECTRIC HOB" || item.label === "ELECTRIC SHOWER"));
});

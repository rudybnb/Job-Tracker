import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  parseHbxlWordQuote,
  isGenericLocation,
  calculateLevenshteinDistance,
  extractParagraphsFromDocumentXml,
} from "../shared/hbxl-word-parser.ts";

/**
 * Helper to build a valid minimal Word (.docx) file buffer containing the specified paragraphs.
 */
export async function createMockDocxBuffer(paragraphsXml: string): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
  </w:body>
</w:document>`
  );

  return await zip.generateAsync({ type: "nodebuffer" });
}

// ===========================================================================
// GOLDEN FIXTURE — Built from the real "Job 2 Spencer House - Quote(1).docx"
// All content below is derived ONLY from the actual document.
// DO NOT add, enrich or invent any tasks, addresses, prices, or descriptions
// not present in the source file.
// ===========================================================================
//
// Real Document Facts:
//   Project/Site : Spencer House
//   Address      : Spencer House, Spencer Road, Birchington, CT7 9EZ
//   Postcode     : CT7 9EZ
//   Client       : Promise Igbinedion
//   Quote Total  : £17,350.46 (excl. VAT)
//
// Locations extracted:
//   Customised Build   (REVIEW_REQUIRED — generic heading)
//   Dining Room        (REVIEW_REQUIRED — spelling variant of "Dinning Room")
//   Dinning Room       (REVIEW_REQUIRED — spelling variant of "Dining Room")
//   House              (REVIEW_REQUIRED — generic heading)
//   Living Room        (CONFIRMED)
//
// Source task content (HBXL WORDING PRESERVED EXACTLY):
//
//   Customised Build → Internal Door
//     Internal Door 6 Panel Smooth 838 x 1981mm
//     Door casing
//     Architrave
//     Door former
//     associated decorating/fixings
//
//   Customised Build → Structural Openings to Existing Wall
//     Universal Beam 178 x 102 x 19kg per m
//     Padstones
//     making-good materials
//
//   Dining Room → Vinyl Flooring
//     Vinyl flooring
//     2nd layer levelling compound
//     vinyl adhesive
//     threshold
//     sundry materials
//     skirting fixings
//
//   Dinning Room → Structural Openings to Existing Wall
//     Universal Beam 203 x 133 x 25kg per m
//     padstones
//     making-good materials
//
//   Dinning Room → Room Decoration
//     walls/plaster
//     ceiling
//     architraves/casings
//     skirtings
//
//   House → Structural Opening
//     Lintel Number 1 RSJ 178 x 102 x 19kg per m
//     Lintel Number 2 RSJ 178 x 102 x 19kg per m
//     associated padstones/making good
//
//   Living Room → Room Decoration
//     ceiling
//
//   Living Room → Vinyl Flooring
//     vinyl flooring
//     levelling compound
//     threshold
//     adhesive
//     sundry materials
//     skirting fixings
// ===========================================================================

export async function createSpencerHouseDocxBuffer(): Promise<Buffer> {
  const xml = `
    <!-- Header block — real document metadata -->
    <w:p><w:r><w:t>HBXL Estimator</w:t></w:r></w:p>
    <w:p><w:r><w:t>Quotation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Client: Promise Igbinedion</w:t></w:r></w:p>
    <w:p><w:r><w:t>Address: Spencer House</w:t></w:r></w:p>
    <w:p><w:r><w:t>Spencer Road</w:t></w:r></w:p>
    <w:p><w:r><w:t>Birchington</w:t></w:r></w:p>
    <w:p><w:r><w:t>CT7 9EZ</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total (excl. VAT): £17,350.46</w:t></w:r></w:p>

    <!-- Customised Build — Internal Door -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Customised Build</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Internal Door</w:t></w:r></w:p>
    <w:p><w:r><w:t>Internal Door 6 Panel Smooth 838 x 1981mm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Door casing</w:t></w:r></w:p>
    <w:p><w:r><w:t>Architrave</w:t></w:r></w:p>
    <w:p><w:r><w:t>Door former</w:t></w:r></w:p>
    <w:p><w:r><w:t>associated decorating/fixings</w:t></w:r></w:p>

    <!-- Customised Build — Structural Openings to Existing Wall -->
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Openings to Existing Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Universal Beam 178 x 102 x 19kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>Padstones</w:t></w:r></w:p>
    <w:p><w:r><w:t>making-good materials</w:t></w:r></w:p>

    <!-- Dining Room — Vinyl Flooring -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Dining Room</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>Vinyl flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>2nd layer levelling compound</w:t></w:r></w:p>
    <w:p><w:r><w:t>vinyl adhesive</w:t></w:r></w:p>
    <w:p><w:r><w:t>threshold</w:t></w:r></w:p>
    <w:p><w:r><w:t>sundry materials</w:t></w:r></w:p>
    <w:p><w:r><w:t>skirting fixings</w:t></w:r></w:p>

    <!-- Dinning Room — Structural Openings to Existing Wall -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Dinning Room</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Openings to Existing Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Universal Beam 203 x 133 x 25kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>padstones</w:t></w:r></w:p>
    <w:p><w:r><w:t>making-good materials</w:t></w:r></w:p>

    <!-- Dinning Room — Room Decoration -->
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Room Decoration</w:t></w:r></w:p>
    <w:p><w:r><w:t>walls/plaster</w:t></w:r></w:p>
    <w:p><w:r><w:t>ceiling</w:t></w:r></w:p>
    <w:p><w:r><w:t>architraves/casings</w:t></w:r></w:p>
    <w:p><w:r><w:t>skirtings</w:t></w:r></w:p>

    <!-- House — Structural Opening -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>House</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Opening</w:t></w:r></w:p>
    <w:p><w:r><w:t>Lintel Number 1 RSJ 178 x 102 x 19kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>Lintel Number 2 RSJ 178 x 102 x 19kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>associated padstones/making good</w:t></w:r></w:p>

    <!-- Living Room — Room Decoration -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Living Room</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Room Decoration</w:t></w:r></w:p>
    <w:p><w:r><w:t>ceiling</w:t></w:r></w:p>

    <!-- Living Room — Vinyl Flooring -->
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>vinyl flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>levelling compound</w:t></w:r></w:p>
    <w:p><w:r><w:t>threshold</w:t></w:r></w:p>
    <w:p><w:r><w:t>adhesive</w:t></w:r></w:p>
    <w:p><w:r><w:t>sundry materials</w:t></w:r></w:p>
    <w:p><w:r><w:t>skirting fixings</w:t></w:r></w:p>
  `;

  return await createMockDocxBuffer(xml);
}

// ===========================================================================
// Tests
// ===========================================================================

test("Levenshtein distance calculation", () => {
  assert.equal(calculateLevenshteinDistance("dining room", "dinning room"), 1);
  assert.equal(calculateLevenshteinDistance("kitchen", "kitchen"), 0);
  assert.equal(calculateLevenshteinDistance("living room", "lounge"), 8);
});

test("Generic location recognition", () => {
  assert.equal(isGenericLocation("Customised Build"), true);
  assert.equal(isGenericLocation("House"), true);
  assert.equal(isGenericLocation("Main House"), true);
  assert.equal(isGenericLocation("Dining Room"), false);
  assert.equal(isGenericLocation("Living Room"), false);
});

test("Spencer House Word quote parser: extracts metadata exactly from real document — no invented data", async () => {
  const docxBuffer = await createSpencerHouseDocxBuffer();
  const result = await parseHbxlWordQuote(docxBuffer, "Job 2 Spencer House - Quote(1).docx");

  assert.equal(result.valid, true, "Result must be valid");
  assert.equal(result.format, "hbxl-word-quote");

  // ASSERTION 1: Address = Spencer House / Spencer Road / Birchington / CT7 9EZ
  // Note: projectSiteName comes from the filename extraction; the full address comes from body
  assert.equal(result.metadata.projectSiteName, "Spencer House", "Project/site name must be 'Spencer House'");
  assert.ok(
    result.metadata.address.includes("Spencer House") || result.metadata.address.includes("Spencer Road"),
    `Address must include real address lines, got: "${result.metadata.address}"`
  );
  assert.ok(result.metadata.address.includes("Birchington"), `Address must include 'Birchington', got: "${result.metadata.address}"`);
  assert.equal(result.metadata.postcode, "CT7 9EZ", `Postcode must be CT7 9EZ, got: "${result.metadata.postcode}"`);

  // ASSERTION 2: Client = Promise Igbinedion (from document, not invented)
  assert.equal(result.metadata.clientName, "Promise Igbinedion", "Client must be Promise Igbinedion from document");

  // ASSERTION 3: Quote total = £17,350.46
  assert.equal(result.metadata.totalQuotePrice, 17350.46, `Quote total must be 17350.46, got: ${result.metadata.totalQuotePrice}`);
  assert.equal(result.metadata.formattedTotalPrice, "£17,350.46", `Formatted price must be £17,350.46, got: "${result.metadata.formattedTotalPrice}"`);

  // No invented values from the old fixture must exist
  assert.notEqual(result.metadata.totalQuotePrice, 45250, "Must NOT use invented £45,250.00");
  assert.notEqual(result.metadata.postcode, "SG1 1EH", "Must NOT use invented SG1 1EH");
  assert.ok(!result.metadata.address.includes("10 High Street"), "Must NOT invent '10 High Street'");
  assert.ok(!result.metadata.address.includes("Stevenage"), "Must NOT invent 'Stevenage'");

  // ASSERTION 3: Exact locations extracted (5 total, in document order)
  const locationNames = result.locations.map((l) => l.name);
  assert.deepEqual(locationNames, [
    "Customised Build",
    "Dining Room",
    "Dinning Room",
    "House",
    "Living Room",
  ], "Locations must match document order exactly");

  assert.equal(result.locations.length, 5, "Must have exactly 5 locations");

  const custBuild = result.locations.find((l) => l.name === "Customised Build")!;
  const dining = result.locations.find((l) => l.name === "Dining Room")!;
  const dinning = result.locations.find((l) => l.name === "Dinning Room")!;
  const house = result.locations.find((l) => l.name === "House")!;
  const living = result.locations.find((l) => l.name === "Living Room")!;

  // ASSERTION 4: No invented tasks — check all exact HBXL source wording

  // Customised Build → Internal Door
  assert.equal(custBuild.categories.length, 2, "Customised Build must have 2 categories");
  assert.equal(custBuild.categories[0].name, "Internal Door");
  const internalDoorTasks = custBuild.categories[0].tasks.map((t) => t.name);
  assert.ok(internalDoorTasks.includes("Internal Door 6 Panel Smooth 838 x 1981mm"), "Must have exact HBXL door spec");
  assert.ok(internalDoorTasks.includes("Door casing"), "Must have 'Door casing'");
  assert.ok(internalDoorTasks.includes("Architrave"), "Must have 'Architrave'");
  assert.ok(internalDoorTasks.includes("Door former"), "Must have 'Door former'");
  assert.ok(internalDoorTasks.includes("associated decorating/fixings"), "Must have 'associated decorating/fixings'");

  // Invented tasks from old fixture that must NOT appear
  assert.ok(!internalDoorTasks.includes("Oak veneer internal door"), "Must NOT have invented 'Oak veneer internal door'");
  assert.ok(!internalDoorTasks.includes("Stainless steel handles and hinges"), "Must NOT have invented 'Stainless steel handles and hinges'");

  // Customised Build → Structural Openings to Existing Wall
  assert.equal(custBuild.categories[1].name, "Structural Openings to Existing Wall");
  const custStructTasks = custBuild.categories[1].tasks.map((t) => t.name);
  assert.ok(custStructTasks.includes("Universal Beam 178 x 102 x 19kg per m"), "Must have exact beam spec");
  assert.ok(custStructTasks.includes("Padstones"), "Must have 'Padstones'");
  assert.ok(custStructTasks.includes("making-good materials"), "Must have 'making-good materials'");
  assert.ok(!custStructTasks.includes("Lintel installation"), "Must NOT have invented 'Lintel installation'");

  // Dining Room → Vinyl Flooring
  assert.equal(dining.categories.length, 1, "Dining Room must have 1 category");
  assert.equal(dining.categories[0].name, "Vinyl Flooring");
  const diningFloorTasks = dining.categories[0].tasks.map((t) => t.name);
  assert.ok(diningFloorTasks.includes("Vinyl flooring"), "Must have 'Vinyl flooring'");
  assert.ok(diningFloorTasks.includes("2nd layer levelling compound"), "Must have '2nd layer levelling compound'");
  assert.ok(diningFloorTasks.includes("vinyl adhesive"), "Must have 'vinyl adhesive'");
  assert.ok(diningFloorTasks.includes("threshold"), "Must have 'threshold'");
  assert.ok(diningFloorTasks.includes("sundry materials"), "Must have 'sundry materials'");
  assert.ok(diningFloorTasks.includes("skirting fixings"), "Must have 'skirting fixings'");

  // Old invented tasks that must NOT appear
  assert.ok(!diningFloorTasks.includes("levelling compound"), "Must NOT have generic 'levelling compound' — real wording is '2nd layer levelling compound'");
  assert.ok(!diningFloorTasks.includes("adhesive"), "Must NOT have plain 'adhesive' — real wording is 'vinyl adhesive'");
  assert.ok(!diningFloorTasks.includes("Luxury vinyl tiles"), "Must NOT have invented 'Luxury vinyl tiles'");
  assert.ok(!diningFloorTasks.includes("Underlay and acoustic matting"), "Must NOT have invented 'Underlay and acoustic matting'");

  // Dinning Room → Structural Openings to Existing Wall
  assert.equal(dinning.categories.length, 2, "Dinning Room must have 2 categories");
  assert.equal(dinning.categories[0].name, "Structural Openings to Existing Wall");
  const dinningStructTasks = dinning.categories[0].tasks.map((t) => t.name);
  assert.ok(dinningStructTasks.includes("Universal Beam 203 x 133 x 25kg per m"), "Must have exact beam spec for Dinning Room");
  assert.ok(dinningStructTasks.includes("padstones"), "Must have 'padstones'");
  assert.ok(dinningStructTasks.includes("making-good materials"), "Must have 'making-good materials'");

  // Old invented tasks that must NOT appear
  assert.ok(!dinningStructTasks.includes("Steel beam installation"), "Must NOT have invented 'Steel beam installation'");
  assert.ok(!dinningStructTasks.includes("Padstones 440 x 140 x 100mm"), "Must NOT have invented 'Padstones 440 x 140 x 100mm'");
  assert.ok(!dinningStructTasks.includes("Temporary propping and demolition"), "Must NOT have invented 'Temporary propping and demolition'");

  // Dinning Room → Room Decoration
  assert.equal(dinning.categories[1].name, "Room Decoration");
  const dinningDecorTasks = dinning.categories[1].tasks.map((t) => t.name);
  assert.ok(dinningDecorTasks.includes("walls/plaster"), "Must have 'walls/plaster'");
  assert.ok(dinningDecorTasks.includes("ceiling"), "Must have 'ceiling'");
  assert.ok(dinningDecorTasks.includes("architraves/casings"), "Must have 'architraves/casings'");
  assert.ok(dinningDecorTasks.includes("skirtings"), "Must have 'skirtings'");

  // Old invented tasks that must NOT appear
  assert.ok(!dinningDecorTasks.includes("Emulsion paint to walls and ceiling"), "Must NOT have invented paint spec");
  assert.ok(!dinningDecorTasks.includes("Undercoat and gloss to skirting"), "Must NOT have invented gloss spec");

  // House → Structural Opening
  assert.equal(house.categories.length, 1, "House must have 1 category");
  assert.equal(house.categories[0].name, "Structural Opening");
  const houseStructTasks = house.categories[0].tasks.map((t) => t.name);
  assert.ok(houseStructTasks.includes("Lintel Number 1 RSJ 178 x 102 x 19kg per m"), "Must have exact lintel spec 1");
  assert.ok(houseStructTasks.includes("Lintel Number 2 RSJ 178 x 102 x 19kg per m"), "Must have exact lintel spec 2");
  assert.ok(houseStructTasks.includes("associated padstones/making good"), "Must have 'associated padstones/making good'");

  // Old invented tasks that must NOT appear
  assert.ok(!houseStructTasks.includes("Masonry opening alterations"), "Must NOT have invented 'Masonry opening alterations'");

  // Living Room → Room Decoration (only 'ceiling' — not invented 'Preparation and filling')
  assert.equal(living.categories.length, 2, "Living Room must have 2 categories");
  assert.equal(living.categories[0].name, "Room Decoration");
  const livingDecorTasks = living.categories[0].tasks.map((t) => t.name);
  assert.deepEqual(livingDecorTasks, ["ceiling"], "Living Room Room Decoration must contain only 'ceiling'");
  assert.ok(!livingDecorTasks.includes("Preparation and filling"), "Must NOT have invented 'Preparation and filling'");
  assert.ok(!livingDecorTasks.includes("Emulsion paint to walls and ceiling"), "Must NOT have invented paint spec in Living Room");

  // Living Room → Vinyl Flooring
  assert.equal(living.categories[1].name, "Vinyl Flooring");
  const livingFloorTasks = living.categories[1].tasks.map((t) => t.name);
  assert.ok(livingFloorTasks.includes("vinyl flooring"), "Must have 'vinyl flooring'");
  assert.ok(livingFloorTasks.includes("levelling compound"), "Must have 'levelling compound'");
  assert.ok(livingFloorTasks.includes("threshold"), "Must have 'threshold'");
  assert.ok(livingFloorTasks.includes("adhesive"), "Must have 'adhesive'");
  assert.ok(livingFloorTasks.includes("sundry materials"), "Must have 'sundry materials'");
  assert.ok(livingFloorTasks.includes("skirting fixings"), "Must have 'skirting fixings'");

  // Old invented tasks that must NOT appear
  assert.ok(!livingFloorTasks.includes("Luxury vinyl tiles"), "Must NOT have invented 'Luxury vinyl tiles'");
  assert.ok(!livingFloorTasks.includes("Underlay and acoustic matting"), "Must NOT have invented 'Underlay and acoustic matting'");

  // ASSERTION 5: Source wording is preserved (checked above via exact string assertions)

  // ASSERTION 6: Generic/ambiguous locations are flagged REVIEW_REQUIRED
  assert.equal(custBuild.reviewStatus, "REVIEW_REQUIRED", "Customised Build must be REVIEW_REQUIRED");
  assert.match(custBuild.reviewReason ?? "", /generic location/i, "Customised Build review reason must mention generic location");

  assert.equal(house.reviewStatus, "REVIEW_REQUIRED", "House must be REVIEW_REQUIRED");
  assert.match(house.reviewReason ?? "", /generic location/i, "House review reason must mention generic location");

  // Dining Room and Dinning Room are both REVIEW_REQUIRED (spelling variants — NOT merged)
  assert.equal(dining.reviewStatus, "REVIEW_REQUIRED", "Dining Room must be REVIEW_REQUIRED (spelling variant of Dinning Room)");
  assert.equal(dinning.reviewStatus, "REVIEW_REQUIRED", "Dinning Room must be REVIEW_REQUIRED (spelling variant of Dining Room)");
  assert.match(dinning.reviewReason ?? "", /spelling variant/i, "Dinning Room review reason must mention spelling variant");

  // Living Room is unambiguous — should be CONFIRMED
  assert.equal(living.reviewStatus, "CONFIRMED", "Living Room must be CONFIRMED (no duplicates, not generic)");

  // ASSERTION 9: Quote total not altered — it is reference-only data on the parsed metadata
  assert.equal(result.metadata.totalQuotePrice, 17350.46, "Quote price must match document total exactly");
  // (Worker assignment logic must never touch this value — tested in integration tests)
});

test("Table-based HBXL Word quote parser extracts rooms and tasks from tables", async () => {
  const xml = `
    <w:p><w:r><w:t>HBXL Quotation: Test House</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total (excl. VAT): £32,500.00</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Kitchen</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Electrics</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>6x LED downlights</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  `;
  const buf = await createMockDocxBuffer(xml);
  const result = await parseHbxlWordQuote(buf, "Job 50 Test House.docx");

  assert.equal(result.valid, true);
  assert.equal(result.metadata.totalQuotePrice, 32500);
  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].name, "Kitchen");
  assert.equal(result.locations[0].categories[0].name, "Electrics");
  assert.equal(result.locations[0].categories[0].tasks[0].name, "6x LED downlights");
});

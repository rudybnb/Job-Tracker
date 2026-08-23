import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  parseHbxlWordQuote,
  isGenericLocation,
  calculateLevenshteinDistance,
  extractParagraphsFromDocumentXml,
  isBannedTaskOrCategory,
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

/**
 * Builds the Maureen Orubebe 2nd Floor HBXL Word quote fixture.
 * REAL DOCUMENT EXTRACTION:
 * - 2nd bathroom → Replace Existing Floorboards (3 tasks)
 * - 2nd floor bedroom 4 → Removal of Floorboards (1 task), Replace Existing Floorboards (2 tasks)
 * - 2nd main bedroom → Removal of Floorboards (1 task), Replace Existing Floorboards (2 tasks)
 * - 2nd Passage → Removal of Floorboards (1 task), Replace Existing Floorboards (2 tasks)
 * - Bathroom Wall → Ceramic Wall Tiling (1 task)
 * - Bathrooms → Internal Lighting (1 task), Bathroom Electrics (1 task)
 */
export async function createMaureenOrubebeDocxBuffer(): Promise<Buffer> {
  const xml = `
    <!-- Header Block -->
    <w:p><w:r><w:t>HBXL EstimatorXpress Quotation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Project: 2nd Floor</w:t></w:r></w:p>
    <w:p><w:r><w:t>Client: Maureen Orubebe</w:t></w:r></w:p>
    <w:p><w:r><w:t>Address: Flat 2, 2nd Floor, London</w:t></w:r></w:p>
    <w:p><w:r><w:t>SE1 1AA</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total (excl. VAT): £28,450.00</w:t></w:r></w:p>

    <!-- SUMMARY SECTION (Must NEVER create locations or tasks) -->
    <w:p><w:r><w:t>Summary of Estimate</w:t></w:r></w:p>
    <w:p><w:r><w:t>2nd bathroom</w:t></w:r></w:p>
    <w:p><w:r><w:t>Material</w:t></w:r><w:r><w:t>Labour</w:t></w:r><w:r><w:t>Plant</w:t></w:r><w:r><w:t>Other</w:t></w:r><w:r><w:t>Total</w:t></w:r></w:p>
    <w:p><w:r><w:t>£1,200.00</w:t></w:r><w:r><w:t>£2,500.00</w:t></w:r><w:r><w:t>£300.00</w:t></w:r><w:r><w:t>£200.00</w:t></w:r><w:r><w:t>£4,200.00</w:t></w:r></w:p>
    <w:p><w:r><w:t>2nd floor bedroom 4</w:t></w:r></w:p>
    <w:p><w:r><w:t>2nd main bedroom</w:t></w:r></w:p>
    <w:p><w:r><w:t>2nd Passage</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bathroom Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bathrooms</w:t></w:r></w:p>

    <!-- DETAILED SECTION 1: 2nd bathroom -->
    <w:p><w:r><w:t>Carry out work in 2nd bathroom comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove 3.13m² floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 3.13m² insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 3.13m² replacement floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Material</w:t></w:r></w:p>
    <w:p><w:r><w:t>Labour</w:t></w:r></w:p>
    <w:p><w:r><w:t>Resources to include:</w:t></w:r></w:p>
    <w:p><w:r><w:t>£ 145.20</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total cost excluding VAT £1,250.00</w:t></w:r></w:p>

    <!-- DETAILED SECTION 2: 2nd floor bedroom 4 -->
    <w:p><w:r><w:t>Carry out work in 2nd floor bedroom 4 comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Removal of Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove existing floorboards</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install replacement floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total cost: £2,400.00</w:t></w:r></w:p>

    <!-- DETAILED SECTION 3: 2nd main bedroom -->
    <w:p><w:r><w:t>Carry out work in 2nd main bedroom comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Removal of Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove existing floorboards</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install replacement floorboards</w:t></w:r></w:p>

    <!-- DETAILED SECTION 4: 2nd Passage -->
    <w:p><w:r><w:t>Carry out work in 2nd Passage comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Removal of Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove existing floorboards</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install replacement floorboards</w:t></w:r></w:p>

    <!-- DETAILED SECTION 5: Bathroom Wall -->
    <w:p><w:r><w:t>Carry out work in Bathroom Wall comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Ceramic Wall Tiling</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 14.40m² ceramic wall tiling</w:t></w:r></w:p>
    <w:p><w:r><w:t>Resources to include:</w:t></w:r></w:p>
    <w:p><w:r><w:t>£ 320.00</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total: £850.00</w:t></w:r></w:p>

    <!-- DETAILED SECTION 6: Bathrooms -->
    <w:p><w:r><w:t>Carry out work in Bathrooms comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Internal Lighting</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install LED downlights</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Bathroom Electrics</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install extractor fan</w:t></w:r></w:p>

    <!-- LEGAL / SIGNING SECTION -->
    <w:p><w:r><w:t>Acceptance of Estimate</w:t></w:r></w:p>
    <w:p><w:r><w:t>I/We accept the quotation above.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Signed: ........................</w:t></w:r></w:p>
    <w:p><w:r><w:t>Date: ........................</w:t></w:r></w:p>
    <w:p><w:r><w:t>Print Name: Maureen Orubebe</w:t></w:r></w:p>
    <w:p><w:r><w:t>Terms and Conditions</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Payment terms are 14 days from invoice date.</w:t></w:r></w:p>
    <w:p><w:r><w:t>2. All materials remain property of contractor until paid in full.</w:t></w:r></w:p>
  `;

  return await createMockDocxBuffer(xml);
}

/**
 * Builds the canonical Spencer House HBXL Word Quote docx fixture.
 */
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

    <!-- Summary Section (Must be skipped) -->
    <w:p><w:r><w:t>Summary of Estimate</w:t></w:r></w:p>
    <w:p><w:r><w:t>Customised Build</w:t></w:r></w:p>
    <w:p><w:r><w:t>Dining Room</w:t></w:r></w:p>
    <w:p><w:r><w:t>Dinning Room</w:t></w:r></w:p>
    <w:p><w:r><w:t>House</w:t></w:r></w:p>
    <w:p><w:r><w:t>Living Room</w:t></w:r></w:p>

    <!-- Customised Build — Internal Door & Structural Openings (8 tasks) -->
    <w:p><w:r><w:t>Carry out work in Customised Build comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Internal Door</w:t></w:r></w:p>
    <w:p><w:r><w:t>Internal Door 6 Panel Smooth 838 x 1981mm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Door casing</w:t></w:r></w:p>
    <w:p><w:r><w:t>Architrave</w:t></w:r></w:p>
    <w:p><w:r><w:t>Door former</w:t></w:r></w:p>
    <w:p><w:r><w:t>associated decorating/fixings</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Openings to Existing Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Universal Beam 178 x 102 x 19kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>Padstones</w:t></w:r></w:p>
    <w:p><w:r><w:t>making-good materials</w:t></w:r></w:p>

    <!-- Dining Room — Vinyl Flooring (6 tasks) -->
    <w:p><w:r><w:t>Carry out work in Dining Room comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>Vinyl flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>2nd layer levelling compound</w:t></w:r></w:p>
    <w:p><w:r><w:t>vinyl adhesive</w:t></w:r></w:p>
    <w:p><w:r><w:t>threshold</w:t></w:r></w:p>
    <w:p><w:r><w:t>sundry materials</w:t></w:r></w:p>
    <w:p><w:r><w:t>skirting fixings</w:t></w:r></w:p>

    <!-- Dinning Room — Structural Openings & Decoration (7 tasks) -->
    <w:p><w:r><w:t>Carry out work in Dinning Room comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Openings to Existing Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Universal Beam 203 x 133 x 25kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>padstones</w:t></w:r></w:p>
    <w:p><w:r><w:t>making-good materials</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Room Decoration</w:t></w:r></w:p>
    <w:p><w:r><w:t>walls/plaster</w:t></w:r></w:p>
    <w:p><w:r><w:t>ceiling</w:t></w:r></w:p>
    <w:p><w:r><w:t>architraves/casings</w:t></w:r></w:p>
    <w:p><w:r><w:t>skirtings</w:t></w:r></w:p>

    <!-- House — Structural Opening (3 tasks) -->
    <w:p><w:r><w:t>Carry out work in House comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Opening</w:t></w:r></w:p>
    <w:p><w:r><w:t>Lintel Number 1 RSJ 178 x 102 x 19kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>Lintel Number 2 RSJ 178 x 102 x 19kg per m</w:t></w:r></w:p>
    <w:p><w:r><w:t>associated padstones/making good</w:t></w:r></w:p>

    <!-- Living Room — Room Decoration & Vinyl Flooring (7 tasks) -->
    <w:p><w:r><w:t>Carry out work in Living Room comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Room Decoration</w:t></w:r></w:p>
    <w:p><w:r><w:t>ceiling</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>vinyl flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>levelling compound</w:t></w:r></w:p>
    <w:p><w:r><w:t>threshold</w:t></w:r></w:p>
    <w:p><w:r><w:t>adhesive</w:t></w:r></w:p>
    <w:p><w:r><w:t>sundry materials</w:t></w:r></w:p>
    <w:p><w:r><w:t>skirting fixings</w:t></w:r></w:p>

    <!-- Acceptance / Terms -->
    <w:p><w:r><w:t>Acceptance of Estimate</w:t></w:r></w:p>
    <w:p><w:r><w:t>Terms and Conditions</w:t></w:r></w:p>
  `;

  return await createMockDocxBuffer(xml);
}

// ===========================================================
// Tests
// ===========================================================

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

test("isBannedTaskOrCategory rejects table headers, prices, acceptance text, and resource labels", () => {
  assert.equal(isBannedTaskOrCategory("Material"), true);
  assert.equal(isBannedTaskOrCategory("Labour"), true);
  assert.equal(isBannedTaskOrCategory("Plant"), true);
  assert.equal(isBannedTaskOrCategory("Other"), true);
  assert.equal(isBannedTaskOrCategory("Total"), true);
  assert.equal(isBannedTaskOrCategory("Total cost excluding VAT"), true);
  assert.equal(isBannedTaskOrCategory("Total VAT"), true);
  assert.equal(isBannedTaskOrCategory("Resources to include:"), true);
  assert.equal(isBannedTaskOrCategory("£ 145.20"), true);
  assert.equal(isBannedTaskOrCategory("Acceptance of Estimate"), true);
  assert.equal(isBannedTaskOrCategory("Terms and Conditions"), true);
  assert.equal(isBannedTaskOrCategory("Signed:"), true);
  assert.equal(isBannedTaskOrCategory("Date:"), true);

  // Legitimate tasks must NOT be banned
  assert.equal(isBannedTaskOrCategory("Remove 3.13m² floorboards"), false);
  assert.equal(isBannedTaskOrCategory("Install 14.40m² ceramic wall tiling"), false);
  assert.equal(isBannedTaskOrCategory("Internal Door 6 Panel Smooth 838 x 1981mm"), false);
  assert.equal(isBannedTaskOrCategory("Universal Beam 178 x 102 x 19kg per m"), false);
});

test("Maureen Orubebe 2nd Floor quote parser: extracts clean rooms and tasks, ignores summary, table headers, prices, acceptance", async () => {
  const docxBuffer = await createMaureenOrubebeDocxBuffer();
  const result = await parseHbxlWordQuote(docxBuffer, "Maureen Orubebe 2nd Floor Quote.docx");

  assert.equal(result.valid, true, "Result must be valid");
  assert.equal(result.format, "hbxl-word-quote");

  // Metadata
  assert.equal(result.metadata.projectSiteName, "2nd Floor");
  assert.equal(result.metadata.clientName, "Maureen Orubebe");
  assert.equal(result.metadata.postcode, "SE1 1AA");
  assert.equal(result.metadata.totalQuotePrice, 28450);
  assert.equal(result.metadata.formattedTotalPrice, "£28,450.00");

  // Exact 6 locations extracted
  assert.equal(result.locations.length, 6, "Must have exactly 6 locations");
  assert.deepEqual(
    result.locations.map(l => l.name),
    [
      "2nd bathroom",
      "2nd floor bedroom 4",
      "2nd main bedroom",
      "2nd Passage",
      "Bathroom Wall",
      "Bathrooms",
    ],
    "Locations must match 'Carry out work in' detail anchors exactly"
  );

  // Assert counts: 6 locations, 10 categories, 15 tasks
  assert.equal(result.stats.locationCount, 6, "Location count must be 6");
  assert.equal(result.stats.categoryCount, 10, "Work category count must be 10");
  assert.equal(result.stats.taskCount, 15, "Individual task count must be 15");

  // Check 2nd floor bedroom 4 has Removal of Floorboards & Replace Existing Floorboards (NOT Room Decoration)
  const bedroom4 = result.locations.find(l => l.name === "2nd floor bedroom 4")!;
  assert.equal(bedroom4.categories.length, 2);
  assert.deepEqual(bedroom4.categories.map(c => c.name), [
    "Removal of Floorboards",
    "Replace Existing Floorboards",
  ]);

  // Check Bathrooms has Internal Lighting & Bathroom Electrics
  const bathrooms = result.locations.find(l => l.name === "Bathrooms")!;
  assert.equal(bathrooms.categories.length, 2);
  assert.deepEqual(bathrooms.categories.map(c => c.name), [
    "Internal Lighting",
    "Bathroom Electrics",
  ]);
});

test("Spencer House Word quote parser: extracts metadata, locations, categories and tasks exactly", async () => {
  const docxBuffer = await createSpencerHouseDocxBuffer();
  const result = await parseHbxlWordQuote(docxBuffer, "Job 2 Spencer House - Quote(1).docx");

  assert.equal(result.valid, true, "Result must be valid");
  assert.equal(result.format, "hbxl-word-quote");

  // Metadata
  assert.equal(result.metadata.projectSiteName, "Spencer House");
  assert.ok(result.metadata.address.includes("Birchington"));
  assert.equal(result.metadata.postcode, "CT7 9EZ");
  assert.equal(result.metadata.clientName, "Promise Igbinedion");
  assert.equal(result.metadata.totalQuotePrice, 17350.46);
  assert.equal(result.metadata.formattedTotalPrice, "£17,350.46");

  // Locations: exactly 5
  assert.equal(result.locations.length, 5);
  const locationNames = result.locations.map((l) => l.name);
  assert.deepEqual(locationNames, [
    "Customised Build",
    "Dining Room",
    "Dinning Room",
    "House",
    "Living Room",
  ]);

  // Clear Counts breakdown:
  // - Locations: 5
  // - Work Categories: 8 (2 + 1 + 2 + 1 + 2)
  // - Individual Tasks: 31 (8 + 6 + 7 + 3 + 7)
  assert.equal(result.stats.locationCount, 5, "Spencer House has 5 locations");
  assert.equal(result.stats.categoryCount, 8, "Spencer House has 8 work categories");
  assert.equal(result.stats.taskCount, 31, "Spencer House has 31 individual tasks");

  const custBuild = result.locations.find((l) => l.name === "Customised Build")!;
  const dining = result.locations.find((l) => l.name === "Dining Room")!;
  const dinning = result.locations.find((l) => l.name === "Dinning Room")!;
  const house = result.locations.find((l) => l.name === "House")!;
  const living = result.locations.find((l) => l.name === "Living Room")!;

  // Review status
  assert.equal(custBuild.reviewStatus, "REVIEW_REQUIRED");
  assert.equal(house.reviewStatus, "REVIEW_REQUIRED");
  assert.equal(dining.reviewStatus, "REVIEW_REQUIRED");
  assert.equal(dinning.reviewStatus, "REVIEW_REQUIRED");
  assert.equal(living.reviewStatus, "CONFIRMED");

  // Category & task assertions
  assert.equal(custBuild.categories.length, 2);
  assert.equal(custBuild.categories[0].tasks.length + custBuild.categories[1].tasks.length, 8);

  assert.equal(dining.categories.length, 1);
  assert.equal(dining.categories[0].tasks.length, 6);

  assert.equal(dinning.categories.length, 2);
  assert.equal(dinning.categories[0].tasks.length + dinning.categories[1].tasks.length, 7);

  assert.equal(house.categories.length, 1);
  assert.equal(house.categories[0].tasks.length, 3);

  assert.equal(living.categories.length, 2);
  assert.equal(living.categories[0].tasks.length + living.categories[1].tasks.length, 7);
});

test("Table-based fallback extracts rooms and tasks when no carry-out anchors exist", async () => {
  const xml = `
    <w:p><w:r><w:t>HBXL Quotation: Test House</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total (excl. VAT): £32,500.00</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Kitchen</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Electrics</w:t></w:r></w:p>
    <w:p><w:r><w:t>6x LED downlights</w:t></w:r></w:p>
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

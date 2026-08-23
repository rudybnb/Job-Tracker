import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  parseHbxlWordQuote,
  isGenericLocation,
  calculateLevenshteinDistance,
  isSpellingVariant,
  extractParagraphsFromDocumentXml,
  extractDocumentElements,
  isBannedTaskOrCategory,
  traceHbxlDocumentRoles,
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
 * Builds the Maureen Orubebe 2nd Floor HBXL Word quote fixture with complete source fidelity:
 * - Cover page with Client: Maureen Orubebe, Address: 3 Lingard Avenue / Colindale / NW9 5YZ
 * - 14 source location sections:
 *   • 2nd bathroom
 *   • 2nd floor bedroom 4
 *   • 2nd main bedroom
 *   • 2nd main Bedroom (merged into 2nd main bedroom)
 *   • 2nd Passage
 *   • Bathroom Wall
 *   • Bathrooms
 *   • Downstairs (Generic container -> REVIEW_REQUIRED)
 *   • External Walls (Building element -> REVIEW_REQUIRED)
 *   • Floor (Generic container -> REVIEW_REQUIRED)
 *   • Ground Floor (Generic container -> REVIEW_REQUIRED)
 *   • House (Generic container -> REVIEW_REQUIRED)
 *   • Internal Walls (Building element -> REVIEW_REQUIRED)
 *   • Upstairs (Generic container -> REVIEW_REQUIRED)
 */
export async function createMaureenOrubebeDocxBuffer(): Promise<Buffer> {
  const xml = `
    <!-- Header Block -->
    <w:p><w:r><w:t>HBXL EstimatorXpress Quotation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Project: 2nd Floor</w:t></w:r></w:p>
    <w:p><w:r><w:t>Client: Maureen Orubebe</w:t></w:r></w:p>
    <w:p><w:r><w:t>Address: 3 Lingard Avenue</w:t></w:r></w:p>
    <w:p><w:r><w:t>Colindale</w:t></w:r></w:p>
    <w:p><w:r><w:t>NW9 5YZ</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total cost excluding VAT: £38,822.47</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total VAT: £7,764.49</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total cost including VAT: £46,586.96</w:t></w:r></w:p>

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
    <w:p><w:r><w:t>Downstairs</w:t></w:r></w:p>
    <w:p><w:r><w:t>External Walls</w:t></w:r></w:p>
    <w:p><w:r><w:t>Floor</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ground Floor</w:t></w:r></w:p>
    <w:p><w:r><w:t>House</w:t></w:r></w:p>
    <w:p><w:r><w:t>Internal Walls</w:t></w:r></w:p>
    <w:p><w:r><w:t>Upstairs</w:t></w:r></w:p>

    <!-- DETAILED SECTION 1: 2nd bathroom -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>2nd bathroom</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in 2nd bathroom comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove 3.13m² of floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 3.13m² insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>GP Fibreglass Insulation Roll 150mm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 3.13m² replacement floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Whitewood Tongue &amp; Grooved Flooring 22 x 125mm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Material</w:t></w:r></w:p>
    <w:p><w:r><w:t>Labour</w:t></w:r></w:p>
    <w:p><w:r><w:t>Resources to include:</w:t></w:r></w:p>
    <w:p><w:r><w:t>£ 145.20</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total cost excluding VAT £1,250.00</w:t></w:r></w:p>

    <!-- DETAILED SECTION 2: 2nd floor bedroom 4 -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>2nd floor bedroom 4</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in 2nd floor bedroom 4 comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Removal of Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove existing floorboards</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install replacement floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total cost: £2,400.00</w:t></w:r></w:p>

    <!-- DETAILED SECTION 3: 2nd main bedroom (Part A) -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>2nd main bedroom</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in 2nd main bedroom comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Removal of Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove existing floorboards</w:t></w:r></w:p>

    <!-- DETAILED SECTION 3b: 2nd main Bedroom (Part B - Duplicate heading to merge) -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>2nd main Bedroom</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in 2nd main Bedroom comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install replacement floorboards</w:t></w:r></w:p>

    <!-- DETAILED SECTION 4: 2nd Passage -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>2nd Passage</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in 2nd Passage comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Removal of Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remove existing floorboards</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Replace Existing Floorboards</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install insulation</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install replacement floorboards</w:t></w:r></w:p>

    <!-- DETAILED SECTION 5: Bathroom Wall -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Bathroom Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in Bathroom Wall comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Ceramic Wall Tiling</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 14.40m² ceramic wall tiling</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ceramic plain / border / decorative tile allowances</w:t></w:r></w:p>
    <w:p><w:r><w:t>Waterproof Wall Tile Adhesive</w:t></w:r></w:p>
    <w:p><w:r><w:t>Wall Tile Grout White</w:t></w:r></w:p>
    <w:p><w:r><w:t>Resources to include:</w:t></w:r></w:p>
    <w:p><w:r><w:t>£ 320.00</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total: £850.00</w:t></w:r></w:p>

    <!-- DETAILED SECTION 6: Bathrooms -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Bathrooms</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in Bathrooms comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Internal Lighting</w:t></w:r></w:p>
    <w:p><w:r><w:t>Pull Light Switch</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install cable for 1 pull light switch</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 1 pull light switch</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Bathroom Electrics</w:t></w:r></w:p>
    <w:p><w:r><w:t>Extractor Fan</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install cable for 1 bathroom extractor fan</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 1 bathroom extractor fan</w:t></w:r></w:p>

    <!-- DETAILED SECTION 7: Downstairs -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Downstairs</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in Downstairs comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Electrical Sockets</w:t></w:r></w:p>
    <w:p><w:r><w:t>Double Socket Downstairs</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install back boxes for 6 double sockets and connect to circuit</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 6 sockets</w:t></w:r></w:p>

    <!-- DETAILED SECTION 8: External Walls -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>External Walls</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in External Walls comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Brick and Block Cavity Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Construct 63.98m² brick and block cavity wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 25.59m skirting board</w:t></w:r></w:p>
    <w:p><w:r><w:t>Decorate 63.98m² plastered wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Decorate 25.59m skirting board</w:t></w:r></w:p>

    <!-- DETAILED SECTION 9: Floor -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Floor</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in Floor comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Domestic Carpeting</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 21.12m² carpet including underlay and carpet</w:t></w:r></w:p>

    <!-- DETAILED SECTION 10: Ground Floor -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Ground Floor</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in Ground Floor comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Removal of Floor Tiles</w:t></w:r></w:p>
    <w:p><w:r><w:t>Removal and disposal of 6.46m² floor tiles</w:t></w:r></w:p>

    <!-- DETAILED SECTION 11: House -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>House</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in House comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Solid Wood Flooring</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 21.12m² solid wood flooring including levelling compound, underlay and skirting removal/refit</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>K2 Double Panel Radiator</w:t></w:r></w:p>
    <w:p><w:r><w:t>Hang 2 radiators</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Internal Lighting</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ceiling Rose</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install cable for 3 ceiling roses</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 3 ceiling roses</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Mains Downlight IP and Fire Rated</w:t></w:r></w:p>
    <w:p><w:r><w:t>First fix 4 downlights including cable</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 4 downlights</w:t></w:r></w:p>

    <!-- DETAILED SECTION 12: Internal Walls -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Internal Walls</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in Internal Walls comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Internal Door</w:t></w:r></w:p>
    <w:p><w:r><w:t>Form opening for 1 internal door</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install casing for 1 internal door</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 1 internal door</w:t></w:r></w:p>
    <w:p><w:r><w:t>Decorate 1 internal door and frame</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Fire Door</w:t></w:r></w:p>
    <w:p><w:r><w:t>Form opening for 2 fire doors</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install casing for 2 fire doors</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 2 fire doors</w:t></w:r></w:p>
    <w:p><w:r><w:t>Plaster reveals to 2 fire doors</w:t></w:r></w:p>
    <w:p><w:r><w:t>Decorate 2 fire doors</w:t></w:r></w:p>

    <!-- DETAILED SECTION 13: Upstairs -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Upstairs</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carry out work in Upstairs comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Stud Wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Construct 10.87m timber stud wall</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 21.75m skirting</w:t></w:r></w:p>
    <w:p><w:r><w:t>Decorate 21.75m skirting</w:t></w:r></w:p>

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
    <!-- Header title -->
    <w:p><w:r><w:t>HBXL EstimatorXpress Quotation</w:t></w:r></w:p>

    <!-- Table 1: Client & Project Details -->
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Client:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Promise Igbinedion</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Project / Site:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Spencer House</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Site Address:</w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p><w:r><w:t>Spencer House</w:t></w:r></w:p>
          <w:p><w:r><w:t>Spencer Road</w:t></w:r></w:p>
          <w:p><w:r><w:t>Birchington</w:t></w:r></w:p>
          <w:p><w:r><w:t>CT7 9EZ</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Total cost excluding VAT:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£17,350.46</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Summary of Estimate Section (Must be skipped) -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Summary of Estimate</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Location</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Material</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Labour</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Customised Build</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£1,500.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£1,500.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£3,000.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Dining Room</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£600.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£900.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£1,500.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Dinning Room</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£2,000.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£3,000.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£5,000.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>House</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£500.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£1,000.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£1,500.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Living Room</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£2,000.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£4,350.46</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£6,350.46</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Detailed Section 1: Customised Build (8 tasks) -->
    <w:p><w:r><w:t>Carry out work in Customised Build comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Internal Door</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>General Works</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Material</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Labour</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Internal Door 6 Panel Smooth 838 x 1981mm</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£150.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£100.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£250.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Door casing</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£50.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£60.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£110.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Architrave</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£30.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£40.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£70.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Door former</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£20.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£50.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£70.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>associated decorating/fixings</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£15.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£35.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£50.00</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Openings to Existing Wall</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Universal Beam 178 x 102 x 19kg per m</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£350.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£400.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£750.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Padstones</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£40.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£60.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£100.00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>making-good materials</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£30.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£70.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>£100.00</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Detailed Section 2: Dining Room (6 tasks) -->
    <w:p><w:r><w:t>Carry out work in Dining Room comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Vinyl flooring</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>2nd layer levelling compound</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>vinyl adhesive</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>threshold</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>sundry materials</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>skirting fixings</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>

    <!-- Detailed Section 3: Dinning Room (7 tasks) -->
    <w:p><w:r><w:t>Carry out work in Dinning Room comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Openings to Existing Wall</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Universal Beam 203 x 133 x 25kg per m</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>padstones</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>making-good materials</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Room Decoration</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>walls/plaster</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>ceiling</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>architraves/casings</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>skirtings</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>

    <!-- Detailed Section 4: House (3 tasks) -->
    <w:p><w:r><w:t>Carry out work in House comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Structural Opening</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Lintel Number 1 RSJ 178 x 102 x 19kg per m</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Lintel Number 2 RSJ 178 x 102 x 19kg per m</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>associated padstones/making good</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>

    <!-- Detailed Section 5: Living Room (7 tasks) -->
    <w:p><w:r><w:t>Carry out work in Living Room comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Room Decoration</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>ceiling</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>vinyl flooring</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>levelling compound</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>threshold</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>adhesive</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>sundry materials</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>skirting fixings</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>

    <!-- Acceptance Section -->
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
  assert.equal(isGenericLocation("External Walls"), true);
  assert.equal(isGenericLocation("Internal Walls"), true);
  assert.equal(isGenericLocation("Downstairs"), true);
  assert.equal(isGenericLocation("Upstairs"), true);
  assert.equal(isGenericLocation("Floor"), true);
  assert.equal(isGenericLocation("Ground Floor"), true);
  assert.equal(isGenericLocation("Dining Room"), false);
  assert.equal(isGenericLocation("Living Room"), false);
  assert.equal(isGenericLocation("2nd bathroom"), false);
});

test("Spelling variant vs semantic distinction", () => {
  // Real spelling mistake (typo)
  assert.equal(isSpellingVariant("Dining Room", "Dinning Room"), true);

  // Semantic antonyms / distinct keywords must NEVER be flagged as spelling variants
  assert.equal(isSpellingVariant("External Walls", "Internal Walls"), false);
  assert.equal(isSpellingVariant("Upstairs", "Downstairs"), false);
  assert.equal(isSpellingVariant("Ground Floor", "First Floor"), false);
  assert.equal(isSpellingVariant("Bedroom 1", "Bedroom 2"), false);
  assert.equal(isSpellingVariant("Front Room", "Back Room"), false);
  assert.equal(isSpellingVariant("Left Wing", "Right Wing"), false);
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
  assert.equal(isBannedTaskOrCategory("Remove 3.13m² of floorboards"), false);
  assert.equal(isBannedTaskOrCategory("Install 14.40m² ceramic wall tiling"), false);
  assert.equal(isBannedTaskOrCategory("Internal Door 6 Panel Smooth 838 x 1981mm"), false);
  assert.equal(isBannedTaskOrCategory("Universal Beam 178 x 102 x 19kg per m"), false);
  assert.equal(isBannedTaskOrCategory("Pull Light Switch"), false);
  assert.equal(isBannedTaskOrCategory("Extractor Fan"), false);
});

test("Maureen Orubebe 2nd Floor quote parser: full source fidelity, merged identical locations, strict section boundaries", async () => {
  const docxBuffer = await createMaureenOrubebeDocxBuffer();
  const result = await parseHbxlWordQuote(docxBuffer, "Maureen Orubebe 2nd Floor Quote.docx");

  assert.equal(result.valid, true, "Result must be valid");
  assert.equal(result.format, "hbxl-word-quote");

  // 1. Metadata Verification
  assert.equal(result.metadata.projectSiteName, "2nd Floor");
  assert.equal(result.metadata.clientName, "Maureen Orubebe");
  assert.ok(result.metadata.address.includes("3 Lingard Avenue"));
  assert.ok(result.metadata.address.includes("Colindale"));
  assert.equal(result.metadata.postcode, "NW9 5YZ");
  assert.equal(result.metadata.totalExclVat, 38822.47);
  assert.equal(result.metadata.formattedTotalExclVat, "£38,822.47");
  assert.equal(result.metadata.vatAmount, 7764.49);
  assert.equal(result.metadata.formattedVatAmount, "£7,764.49");
  assert.equal(result.metadata.totalIncVat, 46586.96);
  assert.equal(result.metadata.formattedTotalIncVat, "£46,586.96");
  assert.equal(result.metadata.totalQuotePrice, 38822.47);
  assert.equal(result.metadata.formattedTotalPrice, "£38,822.47");

  // 2. Location Statistics
  // 14 raw source sections merged into 13 distinct operational locations
  assert.equal(result.stats.sourceLocationCount, 14, "Source location count must be 14");
  assert.equal(result.stats.locationCount, 13, "Merged operational location count must be 13");
  assert.equal(result.stats.categoryCount, 21, "Work category count must be 21");
  assert.equal(result.stats.taskCount, 43, "Assignable explicit task count must be 43");
  assert.ok(result.stats.resourceCount >= 5, "Attached resource metadata lines must be recorded");

  // 3. Strict Boundary Verification: Ensure next location heading never leaked into previous location
  const loc2ndBathroom = result.locations.find(l => l.name === "2nd bathroom")!;
  const tasks2ndBathroom = loc2ndBathroom.categories.flatMap(c => c.tasks.map(t => t.name));
  assert.ok(!tasks2ndBathroom.includes("2nd floor bedroom 4"), "2nd bathroom must NOT contain '2nd floor bedroom 4'");

  const locBedroom4 = result.locations.find(l => l.name === "2nd floor bedroom 4")!;
  const tasksBedroom4 = locBedroom4.categories.flatMap(c => c.tasks.map(t => t.name));
  assert.ok(!tasksBedroom4.includes("2nd main bedroom"), "2nd floor bedroom 4 must NOT contain '2nd main bedroom'");

  const locPassage = result.locations.find(l => l.name === "2nd Passage")!;
  const tasksPassage = locPassage.categories.flatMap(c => c.tasks.map(t => t.name));
  assert.ok(!tasksPassage.includes("Bathroom Wall"), "2nd Passage must NOT contain 'Bathroom Wall'");

  const locBathroomWall = result.locations.find(l => l.name === "Bathroom Wall")!;
  const tasksBathroomWall = locBathroomWall.categories.flatMap(c => c.tasks.map(t => t.name));
  assert.ok(!tasksBathroomWall.includes("Bathrooms"), "Bathroom Wall must NOT contain 'Bathrooms'");

  const locBathrooms = result.locations.find(l => l.name === "Bathrooms")!;
  const tasksBathrooms = locBathrooms.categories.flatMap(c => c.tasks.map(t => t.name));
  assert.ok(!tasksBathrooms.includes("Downstairs"), "Bathrooms must NOT contain 'Downstairs'");

  // 4. Exact Normalization Merge: 2nd main bedroom + 2nd main Bedroom merged into 1 location
  const locMainBedrooms = result.locations.filter(l => l.normalizedName === "2nd main bedroom");
  assert.equal(locMainBedrooms.length, 1, "Must have exactly 1 merged '2nd main bedroom' location");
  const mergedMainBed = locMainBedrooms[0];
  assert.equal(mergedMainBed.reviewStatus, "CONFIRMED", "Merged identical room must be CONFIRMED");
  assert.deepEqual(mergedMainBed.categories.map(c => c.name), [
    "Removal of Floorboards",
    "Replace Existing Floorboards",
  ]);

  // 5. Semantic Distinctness: External Walls vs Internal Walls
  const extWalls = result.locations.find(l => l.name === "External Walls")!;
  const intWalls = result.locations.find(l => l.name === "Internal Walls")!;
  assert.ok(extWalls.reviewReason?.includes("Generic location heading"), "External Walls flagged as generic, not typo");
  assert.ok(intWalls.reviewReason?.includes("Generic location heading"), "Internal Walls flagged as generic, not typo");
  assert.ok(!extWalls.reviewReason?.includes("Internal Walls"), "External Walls must not be flagged as typo of Internal Walls");

  // 6. Separation of Tasks from Resources
  const floorboardCat = loc2ndBathroom.categories.find(c => c.name === "Replace Existing Floorboards")!;
  assert.deepEqual(floorboardCat.tasks.map(t => t.name), [
    "Remove 3.13m² of floorboards",
    "Install 3.13m² insulation",
    "Install 3.13m² replacement floorboards",
  ]);
  const insulTask = floorboardCat.tasks.find(t => t.name === "Install 3.13m² insulation")!;
  assert.ok(insulTask.resources?.includes("GP Fibreglass Insulation Roll 150mm"), "Resource metadata attached to insulation task");
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

  // Statistics: 5 locations, 8 work packages, 0 explicit action tasks (packages are assignable), 25 resources
  assert.equal(result.stats.locationCount, 5);
  assert.equal(result.stats.categoryCount, 8);
  assert.equal(result.stats.taskCount, 0);
  assert.ok(result.stats.resourceCount >= 20);

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
});

test("EstimatorXpress generated styles define package, resource, action, and header roles", async () => {
  const body = `
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>Spencer House</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>for</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>Promise</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>at</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>Spencer House</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>Spencer Road</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>Birchington</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P3"/></w:pPr><w:r><w:t>CT7 9EZ</w:t></w:r></w:p>
    <w:p><w:r><w:t>Site address:</w:t></w:r></w:p>
    <w:p><w:r><w:t>Spencer House</w:t></w:r></w:p>
    <w:p><w:r><w:t>23 August 2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>Dear Promise</w:t></w:r></w:p>
    <w:p><w:r><w:t>Subject: #2: Spencer House</w:t></w:r></w:p>
    <w:tbl><w:tr>
      <w:tc><w:p><w:r><w:t>Total cost</w:t></w:r></w:p></w:tc>
      <w:tc><w:p/></w:tc>
      <w:tc><w:p><w:r><w:t>£17,350.46</w:t></w:r></w:p></w:tc>
    </w:tr></w:tbl>
    <w:p><w:pPr><w:pStyle w:val="P7"/></w:pPr><w:r><w:t>Carry out work in Dining Room comprising:</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P11"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="P12"/></w:pPr><w:r><w:t>Vinyl Floor</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>General Works</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Material</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Labour</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:pPr><w:pStyle w:val="P13"/></w:pPr><w:r><w:t>Vinyl flooring</w:t></w:r></w:p></w:tc><w:tc><w:p><w:pPr><w:pStyle w:val="P13"/></w:pPr><w:r><w:t>Vinyl Flooring</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:pPr><w:pStyle w:val="P13"/></w:pPr><w:r><w:t>2nd layer of levelling compound</w:t></w:r></w:p></w:tc><w:tc><w:p><w:pPr><w:pStyle w:val="P13"/></w:pPr><w:r><w:t>Self Levelling Compound</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:pPr><w:pStyle w:val="P13"/></w:pPr><w:r><w:t>Vinyl adhesive</w:t></w:r></w:p></w:tc><w:tc><w:p><w:pPr><w:pStyle w:val="P13"/></w:pPr><w:r><w:t>Vinyl Floor Adhesive</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>Acceptance of Estimate</w:t></w:r></w:p>
    <w:p><w:r><w:t>Reference: Refurbishment (Estimated dated 23 August 2026)</w:t></w:r></w:p>
    <w:p><w:r><w:t>Promise Igbinedion</w:t></w:r></w:p>
    <w:p><w:r><w:t>Site address:</w:t></w:r></w:p>`;
  const buffer = await createMockDocxBuffer(body);
  const result = await parseHbxlWordQuote(buffer, "structural.docx");

  assert.equal(result.metadata.clientName, "Promise Igbinedion");
  assert.equal(result.metadata.projectSiteName, "Spencer House");
  assert.equal(result.metadata.address, "Spencer House\nSpencer Road\nBirchington\nCT7 9EZ");
  assert.equal(result.metadata.quoteDate, "23 August 2026");
  assert.equal(result.metadata.totalQuotePrice, 17350.46);
  assert.deepEqual(result.locations[0].categories.map((category) => category.name), ["Vinyl Flooring"]);
  assert.deepEqual(result.locations[0].categories[0].resources, [
    "Vinyl Floor",
    "Vinyl flooring",
    "2nd layer of levelling compound",
    "Vinyl adhesive",
  ]);
  assert.equal(result.stats.taskCount, 0);

  const documentXml = await (await JSZip.loadAsync(buffer)).file("word/document.xml")!.async("text");
  const trace = traceHbxlDocumentRoles(extractDocumentElements(documentXml));
  assert.equal(trace.find((row) => row.text === "Vinyl Flooring")?.role, "WORK_PACKAGE");
  assert.equal(trace.find((row) => row.text === "Vinyl Floor")?.role, "RESOURCE");
  assert.equal(trace.find((row) => row.text.startsWith("General Works |"))?.role, "TABLE_HEADER");
  assert.equal(trace.find((row) => row.text.startsWith("Vinyl flooring |"))?.role, "RESOURCE");
});

test("Table-based fallback extracts rooms and tasks when no carry-out anchors exist", async () => {
  const xml = `
    <w:p><w:r><w:t>HBXL Quotation: Test House</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total (excl. VAT): £32,500.00</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Kitchen</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Electrics</w:t></w:r></w:p>
    <w:p><w:r><w:t>Install 6x LED downlights</w:t></w:r></w:p>
  `;
  const buf = await createMockDocxBuffer(xml);
  const result = await parseHbxlWordQuote(buf, "Job 50 Test House.docx");

  assert.equal(result.valid, true);
  assert.equal(result.metadata.totalQuotePrice, 32500);
  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].name, "Kitchen");
  assert.equal(result.locations[0].categories[0].name, "Electrics");
  assert.equal(result.locations[0].categories[0].tasks[0].name, "Install 6x LED downlights");
});

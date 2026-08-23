import JSZip from "jszip";

export interface ParsedWordTask {
  name: string;
  description?: string;
  quantity?: string;
  unit?: string;
  unitRate?: string;
  totalCost?: string;
  sourceReference?: string;
  hbxlBuildPhase?: string;
}

export interface ParsedWordCategory {
  name: string;
  hbxlBuildPhase?: string;
  tasks: ParsedWordTask[];
}

export interface ParsedWordLocation {
  name: string;
  normalizedName: string;
  reviewStatus: "CONFIRMED" | "REVIEW_REQUIRED";
  reviewReason?: string;
  suggestedMapping?: string;
  categories: ParsedWordCategory[];
}

export interface ParsedWordQuoteResult {
  valid: boolean;
  format: "hbxl-word-quote" | "unknown";
  errors: string[];
  warnings: string[];
  metadata: {
    clientName: string;
    projectSiteName: string;
    address: string;
    postcode: string;
    projectType: string;
    quoteReference: string;
    quoteDate: string;
    totalQuotePrice: number | null;
    formattedTotalPrice: string;
  };
  locations: ParsedWordLocation[];
  stats: {
    locationCount: number;
    categoryCount: number;
    taskCount: number;
    flaggedLocationCount: number;
  };
}

export const GENERIC_LOCATION_PATTERNS: ReadonlyArray<RegExp> = [
  /^customised\s*build$/i,
  /^custom\s*build$/i,
  /^house$/i,
  /^main\s*house$/i,
  /^site$/i,
  /^general$/i,
  /^external$/i,
  /^external\s*works$/i,
  /^preliminaries$/i,
  /^whole\s*house$/i,
  /^building$/i,
  /^unknown$/i,
  /^unassigned$/i,
];

// Standard distinct room roots that should never be confused with each other
export const STANDARD_DISTINCT_ROOMS = new Set([
  "living room",
  "dining room",
  "sitting room",
  "kitchen",
  "utility room",
  "bathroom",
  "2nd bathroom",
  "bedroom",
  "bedroom 1",
  "bedroom 2",
  "bedroom 3",
  "bedroom 4",
  "2nd floor bedroom 4",
  "hallway",
  "landing",
  "porch",
  "garage",
  "conservatory",
  "cloakroom",
  "dressing room",
  "study",
  "office",
  "lounge",
  "loft",
  "attic",
  "basement",
  "cellar",
  "bathroom wall",
]);

/**
 * Calculates Levenshtein distance between two strings.
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[an][bn];
}

/**
 * Checks if two location names represent a likely typo/spelling variant
 * (e.g. "Dining Room" vs "Dinning Room").
 */
export function isSpellingVariant(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();

  if (normA === normB) return false;

  // If both are known standard distinct rooms, they are distinct!
  if (STANDARD_DISTINCT_ROOMS.has(normA) && STANDARD_DISTINCT_ROOMS.has(normB)) {
    return false;
  }

  // Check if one is a double-letter variation of another (e.g. dining -> dinning, accommodation -> accomodation)
  const collapsedA = normA.replace(/(.)\1+/g, "$1");
  const collapsedB = normB.replace(/(.)\1+/g, "$1");
  if (collapsedA === collapsedB) {
    return true;
  }

  // Check Levenshtein distance on words
  const dist = calculateLevenshteinDistance(normA, normB);
  if (dist === 1) {
    return true;
  }

  if (dist === 2 && Math.min(normA.length, normB.length) >= 8) {
    return true;
  }

  return false;
}

/**
 * Checks if a location name is a generic / non-room container.
 */
export function isGenericLocation(name: string): boolean {
  const trimmed = name.trim();
  return GENERIC_LOCATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Banned words and phrases that must NEVER be extracted as tasks or categories.
 */
export const BANNED_TASK_KEYWORDS = new Set([
  "description",
  "material",
  "materials",
  "labour",
  "plant",
  "other",
  "total",
  "totals",
  "total cost",
  "total cost excluding vat",
  "total cost including vat",
  "total cost excl vat",
  "total cost inc vat",
  "total cost (excl vat)",
  "total cost (inc vat)",
  "total cost (excl. vat)",
  "total cost (inc. vat)",
  "total vat",
  "subtotal",
  "sub-total",
  "grand total",
  "net total",
  "vat",
  "vat @ 20%",
  "quantity",
  "qty",
  "unit",
  "unit rate",
  "rate",
  "hours",
  "cost",
  "item",
  "item no",
  "item number",
  "ref",
  "code",
  "resources to include:",
  "resources to include",
  "resource to include:",
  "resource to include",
  "resources:",
  "resources",
  "acceptance of estimate",
  "acceptance of quotation",
  "acceptance",
  "terms and conditions",
  "terms & conditions",
  "terms & conditions of business",
  "terms and conditions of business",
  "terms & conditions of sale",
  "signed",
  "date",
  "signature",
  "print name",
  "client signature",
  "contractor signature",
  "customer signature",
  "date of acceptance",
  "summary of estimate",
  "summary of quotation",
  "payment schedule",
  "stage payments",
  "vat summary",
]);

/**
 * Check if a paragraph text is banned from becoming a task or category.
 */
export function isBannedTaskOrCategory(text: string): boolean {
  const norm = text.trim().toLowerCase().replace(/[:\.\-_]+$/, "").trim();
  if (!norm) return true;

  if (BANNED_TASK_KEYWORDS.has(norm)) return true;

  // Standalone currency amount or number (e.g. "£1,234.56", "£ 0.00", "123.45", "£17,350.46")
  if (/^£?\s*[\d,]+(?:\.\d{1,2})?$/.test(norm)) return true;

  // Any line containing currency that represents a total or cost line
  if (norm.includes("£") && (/total/i.test(norm) || /cost/i.test(norm) || /vat/i.test(norm) || /price/i.test(norm))) {
    return true;
  }

  // Any line starting with total / subtotal / grand total / vat
  if (/^(?:total|sub-?total|grand\s+total|net\s+total|vat)\b/i.test(norm)) return true;

  // Starts with "resources to include" or resource breakdown
  if (/^resources?\s+to\s+include/i.test(norm)) return true;

  // Acceptance / signing / legal blocks
  if (/^(acceptance|terms\s*(?:&|and)\s*conditions|signature|signed|print\s*name|payment\s*terms|vat\s*summary|date\s*of\s*acceptance)/i.test(norm)) return true;

  // Table header combinations like "Material Labour Plant Other Total"
  if (/^(?:material|labour|plant|other|total|\s)+$/i.test(norm)) return true;

  return false;
}

/**
 * Parses XML text from word/document.xml into a clean representation.
 */
export interface RawDocParagraph {
  text: string;
  isHeading: boolean;
  headingLevel: number;
  isBold: boolean;
  isBullet: boolean;
  styleName?: string;
}

export function extractParagraphsFromDocumentXml(xmlContent: string): RawDocParagraph[] {
  const paragraphs: RawDocParagraph[] = [];

  // Match all paragraphs <w:p>...</w:p>
  const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xmlContent)) !== null) {
    const pBody = pMatch[1];

    // Extract text runs <w:t>...</w:t>
    let text = "";
    const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(pBody)) !== null) {
      // Decode basic xml entities
      const runText = tMatch[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      text += runText;
    }

    text = text.trim();
    if (!text) continue;

    // Check style / heading
    const pStyleMatch = pBody.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/);
    const styleVal = pStyleMatch ? pStyleMatch[1].toLowerCase() : "";

    let isHeading = false;
    let headingLevel = 0;

    if (styleVal.includes("heading1") || styleVal.includes("heading 1") || styleVal === "title") {
      isHeading = true;
      headingLevel = 1;
    } else if (styleVal.includes("heading2") || styleVal.includes("heading 2") || styleVal.includes("subtitle")) {
      isHeading = true;
      headingLevel = 2;
    } else if (styleVal.includes("heading3") || styleVal.includes("heading 3")) {
      isHeading = true;
      headingLevel = 3;
    }

    // Check bold run formatting
    const isBold = /<w:b(?:\s+[^>]*)?\/>/.test(pBody) || /<w:b\s+w:val="(?:true|1)"\/>/.test(pBody);
    // Check bullet / num formatting
    const isBullet = /<w:numPr>/.test(pBody) || text.startsWith("•") || text.startsWith("-") || text.startsWith("*");

    // Clean bullet symbols from start of text
    const cleanText = text.replace(/^[•\-\*\s]+/, "").trim();

    paragraphs.push({
      text: cleanText || text,
      isHeading,
      headingLevel,
      isBold,
      isBullet,
      styleName: pStyleMatch ? pStyleMatch[1] : undefined,
    });
  }

  return paragraphs;
}

/**
 * Extracts quote metadata (client, site, address, quote price) from paragraphs or text.
 * CRITICAL: Never invent, enrich or substitute data not found in the document.
 * Returns empty strings for fields not explicitly present.
 */
function extractMetadata(paragraphs: RawDocParagraph[], fullText: string, fallbackFilename?: string) {
  let clientName = "";
  let projectSiteName = "";
  const addressLines: string[] = [];
  let postcode = "";
  let projectType = "";
  let quoteReference = "";
  let quoteDate = "";
  let totalQuotePrice: number | null = null;
  let formattedTotalPrice = "";

  let fallbackProjectSiteName = "";
  // Extract project site name from filename ONLY as a fallback if not found in body
  if (fallbackFilename) {
    const fnClean = fallbackFilename.replace(/\.docx$/i, "");
    const siteMatch = fnClean.match(/(?:Job\s*\d+\s+)?([A-Za-z0-9\s]+?)(?:\s*[-–]?\s*(?:Quote|Quotation|Smart\s+Schedule|Export))/i);
    if (siteMatch && siteMatch[1]) {
      fallbackProjectSiteName = siteMatch[1].trim();
    }
  }

  const postcodePattern = /\b([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\b/i;

  const totalPatterns = [
    /(?:Grand\s+Total|Total\s+(?:\(excl\.?\s*VAT\)|\(inc\.?\s*VAT\)|Quote|Quotation|Price|Estimated\s*Cost|Amount))\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i,
    /Total\s*\(excl\.?\s*VAT\)\s*:?\s*£?\s*([\d,]+(?:\.\d{2})?)/i,
    /Total\s*Price\s*:?\s*£?\s*([\d,]+(?:\.\d{2})?)/i,
    /^Total\s*:?\s*£\s*([\d,]+\.\d{2})$/i,
  ];

  const clientPatterns = [
    /^(?:Client|Customer|Prepared\s+for|For|To):\s*(.+)$/i,
    /^(?:Client\s+Name):\s*(.+)$/i,
  ];
  const sitePatterns = [
    /^(?:Project\/Site|Project\s*Site|Site\s*Name|Job\s*Title|Site|Project):\s*(.+)$/i,
  ];
  const addressLabelPattern = /^(?:Site\s+Address|Address|Property):\s*(.+)$/i;
  const datePatterns = [
    /^(?:Date|Quotation\s+Date|Issue\s+Date):\s*(.+)$/i,
  ];
  const refPatterns = [
    /^(?:Reference|Ref|Job\s+Ref|Quote\s+Ref(?:erence)?):\s*(.+)$/i,
  ];

  let inAddressBlock = false;
  let addressBlockLineCount = 0;
  const MAX_ADDRESS_LINES = 6;

  for (const p of paragraphs) {
    const t = p.text.trim();
    if (!t) { inAddressBlock = false; continue; }

    if (p.isHeading && p.headingLevel === 1) {
      inAddressBlock = false;
      continue;
    }

    // Stop address block if we hit a location anchor or acceptance/terms
    if (/^Carry\s+out\s+work\s+in/i.test(t) || /^(?:Acceptance|Terms)/i.test(t)) {
      inAddressBlock = false;
    }

    // Client name
    if (!clientName) {
      for (const cp of clientPatterns) {
        const m = t.match(cp);
        if (m && m[1] && m[1].trim().length > 1) {
          const val = m[1].trim();
          if (!val.match(/^(?:Ltd|Limited|PLC|LLP|plc)$/i)) {
            clientName = val;
            break;
          }
        }
      }
    }

    // Project/Site name
    if (!projectSiteName) {
      for (const sp of sitePatterns) {
        const m = t.match(sp);
        if (m && m[1] && m[1].trim().length > 1) {
          projectSiteName = m[1].trim();
          break;
        }
      }
    }

    // Date
    if (!quoteDate) {
      for (const dp of datePatterns) {
        const m = t.match(dp);
        if (m && m[1]) { quoteDate = m[1].trim(); break; }
      }
    }

    // Reference
    if (!quoteReference) {
      for (const rp of refPatterns) {
        const m = t.match(rp);
        if (m && m[1]) { quoteReference = m[1].trim(); break; }
      }
    }

    // Grand/Total price
    if (totalQuotePrice === null) {
      let matchedTotal = false;
      for (const tp of totalPatterns) {
        const m = t.match(tp);
        if (m && m[1]) {
          const numStr = m[1].replace(/,/g, "");
          const val = parseFloat(numStr);
          if (!isNaN(val) && val > 100) {
            totalQuotePrice = val;
            formattedTotalPrice = `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            if (inAddressBlock) inAddressBlock = false;
            matchedTotal = true;
            break;
          }
        }
      }
      if (matchedTotal) continue;
    }

    // Address block
    if (!inAddressBlock) {
      const am = t.match(addressLabelPattern);
      if (am && am[1]) {
        inAddressBlock = true;
        addressBlockLineCount = 0;
        const firstAddressLine = am[1].trim();
        if (firstAddressLine) {
          addressLines.push(firstAddressLine);
          addressBlockLineCount++;
          const pm = firstAddressLine.match(postcodePattern);
          if (pm && pm[1]) postcode = pm[1].toUpperCase().trim();
        }
        continue;
      }
    } else {
      const isAnotherLabel = /^[A-Za-z][A-Za-z\s]{1,30}:\s/.test(t);
      if (isAnotherLabel || addressBlockLineCount >= MAX_ADDRESS_LINES || p.isHeading) {
        inAddressBlock = false;
      } else {
        addressLines.push(t);
        addressBlockLineCount++;
        const pm = t.match(postcodePattern);
        if (pm && pm[1] && !postcode) postcode = pm[1].toUpperCase().trim();
        continue;
      }
    }

    // Postcode fallback
    if (!postcode) {
      const pm = t.match(postcodePattern);
      if (pm && pm[1]) postcode = pm[1].toUpperCase().trim();
    }
  }

  const address = addressLines.join("\n");

  return {
    clientName,
    projectSiteName: projectSiteName || fallbackProjectSiteName,
    address,
    postcode,
    projectType,
    quoteReference,
    quoteDate,
    totalQuotePrice,
    formattedTotalPrice,
  };
}

/**
 * Parses an HBXL Word Quote document buffer.
 * STRICT RULES:
 * 1. Authoritative location anchor: "Carry out work in [LOCATION] comprising:"
 * 2. Each location owns ONLY content between its anchor and the next location anchor (or Acceptance/Terms/End).
 * 3. Summary headings and tables do NOT create locations.
 * 4. Banned keywords (Material, Labour, Plant, Other, Total, £ values, Acceptance, etc.) are never tasks.
 * 5. Generic and spelling-variant locations flagged REVIEW_REQUIRED.
 */
export async function parseHbxlWordQuote(
  fileBuffer: Buffer | ArrayBuffer,
  filename?: string,
): Promise<ParsedWordQuoteResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(fileBuffer);
  } catch (err) {
    return {
      valid: false,
      format: "unknown",
      errors: [`Failed to unpack Word document (.docx): ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
      metadata: {
        clientName: "",
        projectSiteName: "",
        address: "",
        postcode: "",
        projectType: "",
        quoteReference: "",
        quoteDate: "",
        totalQuotePrice: null,
        formattedTotalPrice: "",
      },
      locations: [],
      stats: { locationCount: 0, categoryCount: 0, taskCount: 0, flaggedLocationCount: 0 },
    };
  }

  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    return {
      valid: false,
      format: "unknown",
      errors: ["Word document missing word/document.xml."],
      warnings: [],
      metadata: {
        clientName: "",
        projectSiteName: "",
        address: "",
        postcode: "",
        projectType: "",
        quoteReference: "",
        quoteDate: "",
        totalQuotePrice: null,
        formattedTotalPrice: "",
      },
      locations: [],
      stats: { locationCount: 0, categoryCount: 0, taskCount: 0, flaggedLocationCount: 0 },
    };
  }

  const documentXml = await documentXmlFile.async("text");
  const paragraphs = extractParagraphsFromDocumentXml(documentXml);

  if (paragraphs.length === 0) {
    return {
      valid: false,
      format: "unknown",
      errors: ["Word document contains no readable text content."],
      warnings: [],
      metadata: {
        clientName: "",
        projectSiteName: "",
        address: "",
        postcode: "",
        projectType: "",
        quoteReference: "",
        quoteDate: "",
        totalQuotePrice: null,
        formattedTotalPrice: "",
      },
      locations: [],
      stats: { locationCount: 0, categoryCount: 0, taskCount: 0, flaggedLocationCount: 0 },
    };
  }

  const fullText = paragraphs.map((p) => p.text).join("\n");
  const metadata = extractMetadata(paragraphs, fullText, filename);

  // =========================================================================
  // LOCATION & TASK EXTRACTION
  // =========================================================================
  // Rule: Detect if document uses the standard HBXL anchor:
  // "Carry out work in [LOCATION] comprising:"
  // =========================================================================

  const carryOutRegex = /^Carry\s+out\s+work\s+in\s+(.+?)(?:\s+comprising\s*:?|\s*:)$/i;
  const isTerminationSection = (text: string): boolean => {
    return /^(?:Acceptance\s+of\s+(?:Estimate|Quotation|Quote)|Terms\s*(?:&|and)\s*Conditions|Customer\s+Signature|Client\s+Signature|Date\s+of\s+Acceptance)/i.test(text.trim());
  };

  // Check if any "Carry out work in" sentences exist in the document
  const hasCarryOutAnchors = paragraphs.some((p) => carryOutRegex.test(p.text.trim()));

  interface RawLocation {
    name: string;
    categories: Array<{
      name: string;
      tasks: ParsedWordTask[];
    }>;
  }

  const rawLocations: RawLocation[] = [];
  let currentLocation: RawLocation | null = null;
  let currentCategory: { name: string; tasks: ParsedWordTask[] } | null = null;
  let insideDetailedSection = !hasCarryOutAnchors; // If carry-out anchors exist, wait until the first anchor

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const text = p.text.trim();
    if (!text) continue;

    // Check if we have hit a termination section (Acceptance of Estimate, Terms & Conditions, etc.)
    if (isTerminationSection(text)) {
      // Terminate detailed section parsing
      currentLocation = null;
      currentCategory = null;
      insideDetailedSection = false;
      break;
    }

    if (hasCarryOutAnchors) {
      // MODE 1: Standard HBXL "Carry out work in [LOCATION] comprising:" anchors
      const carryMatch = text.match(carryOutRegex);
      if (carryMatch && carryMatch[1]) {
        const rawLocName = carryMatch[1].trim().replace(/[:\.\-_]+$/, "").trim();
        if (rawLocName) {
          insideDetailedSection = true;
          currentLocation = {
            name: rawLocName,
            categories: [],
          };
          rawLocations.push(currentLocation);
          currentCategory = null;
          continue;
        }
      }

      if (!insideDetailedSection || !currentLocation) {
        // Skip all content before the first "Carry out work in" anchor (i.e. Summary page)
        continue;
      }
    } else {
      // MODE 2: Fallback for documents formatted with Heading 1 room names
      // Known location indicators / room names
      const knownRoomNames = [
        "dining room", "dinning room", "living room", "sitting room", "lounge",
        "kitchen", "utility room", "bathroom", "2nd bathroom", "en suite", "ensuite", "cloakroom", "wc",
        "bedroom", "bedroom 1", "bedroom 2", "bedroom 3", "bedroom 4", "2nd floor bedroom 4",
        "master bedroom", "hallway", "hall", "landing", "porch", "conservatory", "loft", "garage",
        "customised build", "custom build", "house", "main house", "extension", "external works",
        "ground floor", "first floor", "second floor", "basement", "roof", "bathroom wall"
      ];

      const isHeading1Location = (p.headingLevel === 1 || (p.isBold && !p.isBullet)) &&
        knownRoomNames.some(r => text.toLowerCase() === r || text.toLowerCase().startsWith(r + " "));

      if (isHeading1Location && !isBannedTaskOrCategory(text)) {
        currentLocation = {
          name: text,
          categories: [],
        };
        rawLocations.push(currentLocation);
        currentCategory = null;
        continue;
      }

      if (!currentLocation) continue;
    }

    // Inside a valid location section:
    // Skip any banned tokens, table column headers, prices, acceptance text, etc.
    if (isBannedTaskOrCategory(text)) {
      continue;
    }

    // Determine if this paragraph is a Work Category heading (e.g. "Replace Existing Floorboards", "Ceramic Wall Tiling", "Vinyl Flooring")
    const isCategoryHeading = (p.headingLevel === 2 || (p.isHeading && p.headingLevel > 1) || (p.isBold && !p.isBullet)) &&
      !p.isBullet && text.length < 80;

    if (isCategoryHeading) {
      currentCategory = {
        name: text,
        tasks: [],
      };
      currentLocation.categories.push(currentCategory);
      continue;
    }

    // Specific Work Item / Task
    // If no category yet, create a default "General Works" category
    if (!currentCategory) {
      currentCategory = {
        name: "General Works",
        tasks: [],
      };
      currentLocation.categories.push(currentCategory);
    }

    // Ensure we don't add duplicate tasks within the same category
    if (!currentCategory.tasks.some(t => t.name === text)) {
      currentCategory.tasks.push({
        name: text,
        description: text,
        sourceReference: "HBXL_WORD",
      });
    }
  }

  // =========================================================================
  // LOCATION REVIEW & DUPLICATE CHECKS
  // =========================================================================
  const locations: ParsedWordLocation[] = [];

  for (let i = 0; i < rawLocations.length; i++) {
    const rawLoc = rawLocations[i];
    // Remove any empty categories that have no tasks
    const validCategories = rawLoc.categories.filter((cat) => cat.tasks.length > 0);

    const normalized = rawLoc.name.trim().toLowerCase();
    let reviewStatus: "CONFIRMED" | "REVIEW_REQUIRED" = "CONFIRMED";
    let reviewReason: string | undefined = undefined;

    // 1. Generic location check
    if (isGenericLocation(rawLoc.name)) {
      reviewStatus = "REVIEW_REQUIRED";
      reviewReason = `Generic location heading "${rawLoc.name}" requires room clarification before worker assignment.`;
    }

    // 2. Check for duplicate / spelling variant among the extracted DETAIL locations
    for (let j = 0; j < rawLocations.length; j++) {
      if (i === j) continue;
      const other = rawLocations[j];
      const otherNorm = other.name.trim().toLowerCase();

      if (normalized === otherNorm) {
        reviewStatus = "REVIEW_REQUIRED";
        reviewReason = `Duplicate location heading "${rawLoc.name}" found in quote.`;
        break;
      }

      if (isSpellingVariant(rawLoc.name, other.name)) {
        reviewStatus = "REVIEW_REQUIRED";
        reviewReason = `Spelling variant / possible duplicate of "${other.name}". Please verify room name.`;
        break;
      }
    }

    locations.push({
      name: rawLoc.name,
      normalizedName: normalized,
      reviewStatus,
      reviewReason,
      categories: validCategories,
    });
  }

  let totalTasks = 0;
  let totalCategories = 0;
  for (const loc of locations) {
    totalCategories += loc.categories.length;
    for (const cat of loc.categories) {
      totalTasks += cat.tasks.length;
    }
  }

  const flaggedLocationCount = locations.filter((l) => l.reviewStatus === "REVIEW_REQUIRED").length;

  return {
    valid: locations.length > 0,
    format: "hbxl-word-quote",
    errors,
    warnings,
    metadata,
    locations,
    stats: {
      locationCount: locations.length,
      categoryCount: totalCategories,
      taskCount: totalTasks,
      flaggedLocationCount,
    },
  };
}

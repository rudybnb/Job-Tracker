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

// Standard distinct room roots that should never be confused with each other
export const STANDARD_DISTINCT_ROOMS = new Set([
  "living room",
  "dining room",
  "sitting room",
  "kitchen",
  "utility room",
  "bathroom",
  "bedroom",
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
]);

/**
 * Checks if two location names represent a likely typo/spelling variant
 * (e.g. "Dining Room" vs "Dinning Room").
 */
export function isSpellingVariant(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();

  if (normA === normB) return false;

  // If both are known standard distinct rooms (e.g. "living room" and "dining room"), they are distinct!
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
    // Only if lengths are close and not distinct standard rooms
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
 * Parses XML text from word/document.xml into a clean representation.
 */
interface RawDocParagraph {
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
      let runText = tMatch[1]
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

  // Extract project site name from filename ONLY — as a secondary hint
  // e.g. "Job 2 Spencer House - Quote(1).docx" => "Spencer House"
  if (fallbackFilename) {
    const fnClean = fallbackFilename.replace(/\.docx$/i, "");
    const siteMatch = fnClean.match(/(?:Job\s*\d+\s+)?([A-Za-z0-9\s]+?)(?:\s*[-–]?\s*(?:Quote|Quotation|Smart\s+Schedule|Export))/i);
    if (siteMatch && siteMatch[1]) {
      projectSiteName = siteMatch[1].trim();
    }
  }

  const postcodePattern = /\b([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\b/i;

  // More specific total pattern — avoids matching intermediate line totals.
  // Must match a final/grand total pattern explicitly.
  const totalPatterns = [
    /(?:Grand\s+Total|Total\s+(?:\(excl\.?\s*VAT\)|\(inc\.?\s*VAT\)|Quote|Quotation|Price|Estimated\s*Cost|Amount))\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i,
    /Total\s*\(excl\.?\s*VAT\)\s*:?\s*£?\s*([\d,]+(?:\.\d{2})?)/i,
    /Total\s*Price\s*:?\s*£?\s*([\d,]+(?:\.\d{2})?)/i,
    /^Total\s*:?\s*£\s*([\d,]+\.\d{2})$/i,
  ];

  // Patterns for explicit label-based fields
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

  // Track whether we're in an address block (consecutive lines after address label)
  let inAddressBlock = false;
  let addressBlockLineCount = 0;
  const MAX_ADDRESS_LINES = 6;

  for (const p of paragraphs) {
    const t = p.text.trim();
    if (!t) { inAddressBlock = false; continue; }

    // Skip headings (location names) when extracting metadata
    if (p.isHeading && p.headingLevel === 1) {
      inAddressBlock = false;
      continue;
    }

    // Client name (only from explicit label)
    if (!clientName) {
      for (const cp of clientPatterns) {
        const m = t.match(cp);
        if (m && m[1] && m[1].trim().length > 1) {
          const val = m[1].trim();
          // Exclude obvious noise
          if (!val.match(/^(?:Ltd|Limited|PLC|LLP|plc)$/i)) {
            clientName = val;
            break;
          }
        }
      }
    }

    // Project/Site name (only from explicit label; filename fallback already set)
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

    // Grand/Total price — MUST check BEFORE address block accumulation to avoid
    // lines like "Total (excl. VAT): £17,350.46" being swallowed into address lines.
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
            // If we were accumulating address lines, stop here — this line is a total, not an address
            if (inAddressBlock) inAddressBlock = false;
            matchedTotal = true;
            break;
          }
        }
      }
      if (matchedTotal) continue;
    }

    // Address block — start when explicit address label encountered
    if (!inAddressBlock) {
      const am = t.match(addressLabelPattern);
      if (am && am[1]) {
        inAddressBlock = true;
        addressBlockLineCount = 0;
        const firstAddressLine = am[1].trim();
        if (firstAddressLine) {
          addressLines.push(firstAddressLine);
          addressBlockLineCount++;
          // Check for postcode in first address line
          const pm = firstAddressLine.match(postcodePattern);
          if (pm && pm[1]) postcode = pm[1].toUpperCase().trim();
        }
        continue;
      }
    } else {
      // Continue accumulating address lines until we hit another label-pattern, heading, or max
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

    // Postcode — fallback: scan all paragraphs
    if (!postcode) {
      const pm = t.match(postcodePattern);
      if (pm && pm[1]) postcode = pm[1].toUpperCase().trim();
    }

    // Grand/Total price (secondary check for lines not caught above)
    if (totalQuotePrice === null) {
      for (const tp of totalPatterns) {
        const m = t.match(tp);
        if (m && m[1]) {
          const numStr = m[1].replace(/,/g, "");
          const val = parseFloat(numStr);
          if (!isNaN(val) && val > 100) { // Ignore trivial line-item amounts
            totalQuotePrice = val;
            formattedTotalPrice = `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            break;
          }
        }
      }
    }
  }

  // Build single address string from collected lines
  const address = addressLines.join("\n");

  return {
    clientName,
    projectSiteName,
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

  // Parse location hierarchy
  // Strategy:
  // Level 1: Location/Room headings (Heading 1, or bold line matching room/area names)
  // Level 2: Work Categories under location (Heading 2, or bold sub-headings)
  // Level 3: Work Items / Task Descriptions under categories (Bullets or regular paragraphs)

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

  // Known location indicators / keyword filters to distinguish location headings from general text
  const locationHeaderRegex = /^(?:Location|Room|Area):\s*(.+)$/i;

  const isLikelyLocationHeading = (p: RawDocParagraph): boolean => {
    const t = p.text.trim();
    if (t.length === 0 || t.length > 60) return false;
    if (t.startsWith("Total") || t.startsWith("Quote") || t.startsWith("Client") || t.startsWith("Project") || t.startsWith("Date")) return false;

    if (locationHeaderRegex.test(t)) return true;
    if (p.headingLevel === 1) return true;

    // Check bold room names e.g. "Dining Room", "Dinning Room", "Living Room", "Customised Build", "House", "Kitchen"
    const knownRoomNames = [
      "dining room", "dinning room", "living room", "sitting room", "lounge",
      "kitchen", "utility room", "bathroom", "en suite", "ensuite", "cloakroom", "wc",
      "bedroom", "bedroom 1", "bedroom 2", "bedroom 3", "master bedroom",
      "hallway", "hall", "landing", "porch", "conservatory", "loft", "garage",
      "customised build", "custom build", "house", "main house", "extension", "external works",
      "ground floor", "first floor", "second floor", "basement", "roof"
    ];

    const lower = t.toLowerCase();
    if (knownRoomNames.includes(lower) || knownRoomNames.some(r => lower.startsWith(r))) {
      return p.isHeading || p.isBold || p.styleName?.toLowerCase().includes("heading") || true;
    }

    return false;
  };

  const isLikelyCategoryHeading = (p: RawDocParagraph): boolean => {
    if (p.isBullet) return false;
    const t = p.text.trim();
    if (t.length === 0 || t.length > 70) return false;
    if (isLikelyLocationHeading(p)) return false;
    if (t.startsWith("Total") || t.startsWith("Client") || t.startsWith("Price")) return false;

    if (p.headingLevel === 2) return true;
    if (p.isHeading && p.headingLevel > 1) return true;

    // Only if bold or explicit style and not a bullet
    if (p.isBold) return true;

    return false;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const text = p.text.trim();
    if (!text) continue;

    // Check if this paragraph is a location heading
    if (isLikelyLocationHeading(p)) {
      const locName = text.replace(locationHeaderRegex, "$1").trim();
      currentLocation = {
        name: locName,
        categories: [],
      };
      rawLocations.push(currentLocation);
      currentCategory = null;
      continue;
    }

    // If we have a current location, check for category or task
    if (currentLocation) {
      if (isLikelyCategoryHeading(p)) {
        currentCategory = {
          name: text,
          tasks: [],
        };
        currentLocation.categories.push(currentCategory);
        continue;
      }

      // If we don't have a category yet, create a default "General" category
      if (!currentCategory) {
        currentCategory = {
          name: "General Works",
          tasks: [],
        };
        currentLocation.categories.push(currentCategory);
      }

      // Add task / work item
      currentCategory.tasks.push({
        name: text,
        description: text,
        sourceReference: "HBXL_WORD",
      });
    }
  }

  // Location review flagging & duplicate checking
  const locations: ParsedWordLocation[] = [];

  for (let i = 0; i < rawLocations.length; i++) {
    const rawLoc = rawLocations[i];
    const normalized = rawLoc.name.trim().toLowerCase();
    let reviewStatus: "CONFIRMED" | "REVIEW_REQUIRED" = "CONFIRMED";
    let reviewReason: string | undefined = undefined;

    // 1. Check generic location names
    if (isGenericLocation(rawLoc.name)) {
      reviewStatus = "REVIEW_REQUIRED";
      reviewReason = `Generic location heading "${rawLoc.name}" requires room clarification before worker assignment.`;
    }

    // 2. Check for similar location names / spelling variants (e.g. "Dining Room" vs "Dinning Room")
    for (let j = 0; j < rawLocations.length; j++) {
      if (i === j) continue;
      const other = rawLocations[j];
      const otherNorm = other.name.trim().toLowerCase();

      // If exact same name appears twice
      if (normalized === otherNorm) {
        reviewStatus = "REVIEW_REQUIRED";
        reviewReason = `Duplicate location heading "${rawLoc.name}" found in quote.`;
        break;
      }

      // Check if it is a spelling variant
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
      categories: rawLoc.categories,
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

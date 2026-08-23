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
  resources?: string[];
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
    totalExclVat: number | null;
    formattedTotalExclVat: string;
    vatAmount: number | null;
    formattedVatAmount: string;
    totalIncVat: number | null;
    formattedTotalIncVat: string;
  };
  locations: ParsedWordLocation[];
  stats: {
    sourceLocationCount: number;
    locationCount: number;
    categoryCount: number;
    taskCount: number;
    resourceCount: number;
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
  /^external\s*walls?$/i,
  /^internal\s*walls?$/i,
  /^floor$/i,
  /^floors?$/i,
  /^ground\s*floor$/i,
  /^first\s*floor$/i,
  /^second\s*floor$/i,
  /^downstairs$/i,
  /^upstairs$/i,
  /^roof$/i,
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
  "2nd main bedroom",
  "2nd passage",
  "bathrooms",
  "bathroom wall",
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

// Semantic antonym / directional keyword pairs that must NEVER be considered spelling variants
const OPPOSING_SEMANTIC_WORDS: ReadonlyArray<[string, string]> = [
  ["internal", "external"],
  ["inside", "outside"],
  ["upstairs", "downstairs"],
  ["upper", "lower"],
  ["front", "rear"],
  ["front", "back"],
  ["left", "right"],
  ["north", "south"],
  ["east", "west"],
  ["ground", "first"],
  ["first", "second"],
  ["second", "third"],
  ["third", "fourth"],
  ["1st", "2nd"],
  ["2nd", "3rd"],
  ["3rd", "4th"],
  ["1", "2"],
  ["2", "3"],
  ["3", "4"],
  ["4", "5"],
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

/**
 * Checks if two location names represent a likely typo/spelling variant
 * (e.g. "Dining Room" vs "Dinning Room").
 */
export function isSpellingVariant(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();

  if (normA === normB) return false;

  // Check if they differ on opposing directional/semantic keywords
  const wordsA = new Set(normA.split(/\s+/));
  const wordsB = new Set(normB.split(/\s+/));

  for (const [w1, w2] of OPPOSING_SEMANTIC_WORDS) {
    if ((wordsA.has(w1) && wordsB.has(w2)) || (wordsA.has(w2) && wordsB.has(w1))) {
      return false;
    }
  }

  // If both are known standard distinct rooms, they are distinct!
  if (STANDARD_DISTINCT_ROOMS.has(normA) && STANDARD_DISTINCT_ROOMS.has(normB)) {
    return false;
  }

  // Double-letter variation (e.g. dining -> dinning, accommodation -> accomodation)
  const collapsedA = normA.replace(/(.)\1+/g, "$1");
  const collapsedB = normB.replace(/(.)\1+/g, "$1");
  if (collapsedA === collapsedB) {
    return true;
  }

  // Small Levenshtein distance on words (length >= 4)
  const dist = calculateLevenshteinDistance(normA, normB);
  if (dist === 1 && Math.min(normA.length, normB.length) >= 4) {
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
  "general works",
  "room",
  "floor",
  "tiling",
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
 * Distinguishes between Actionable Work Items and Pure Material/Product Descriptions.
 */
export function isPureMaterialOrProduct(text: string): boolean {
  const norm = text.trim().toLowerCase();

  // Action verbs indicate actionable tasks
  if (
    /^(?:remove|removal|install|installation|fit|fitting|supply\s+and\s+fit|hang|erect|construct|apply|paint|plaster|undercoat|emulsion|strip|form|lay|replace|replacement|take\s+down|cut|drill|connect|test|commission|seal|bed|point|re-point|first\s+fix|second\s+fix|decorate)\b/i.test(
      norm,
    )
  ) {
    return false;
  }

  // Known operational fixtures
  if (
    /^(?:pull\s+light\s+switch|extractor\s+fan|universal\s+beam|internal\s+door|fire\s+door|lintel|padstones?|architrave|door\s+casing|door\s+former|threshold|skirting fixings?|skirtings?|ceiling\s+rose|radiator|double\s+socket|sockets?)/i.test(
      norm,
    )
  ) {
    return false;
  }

  // Generic non-action labels / table filler
  if (/^(?:material|materials|general\s+works|room|floor|tiling|description)$/i.test(norm)) {
    return true;
  }

  // Specific product catalog descriptions with dimensions, brands, allowances, or pack sizes
  if (
    /fibreglass|tongue\s*&\s*grooved|t&g|gloss\s+white|wall\s+tile\s+grout|wall\s+tile\s+adhesive|pvc\s+tile\s+trim|waterproof\s+wall\s+tile|tile\s+allowances?|roll\s+\d+mm|nominal\s+\d+mm|finished\s+\d+mm|twin\s*&\s*earth/i.test(
      norm,
    )
  ) {
    return true;
  }

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
 */
function extractMetadata(paragraphs: RawDocParagraph[], fullText: string, fallbackFilename?: string) {
  let clientName = "";
  let projectSiteName = "";
  const addressLines: string[] = [];
  let postcode = "";
  let projectType = "";
  let quoteReference = "";
  let quoteDate = "";
  let totalExclVat: number | null = null;
  let vatAmount: number | null = null;
  let totalIncVat: number | null = null;
  let formattedTotalExclVat = "";
  let formattedVatAmount = "";
  let formattedTotalIncVat = "";
  let totalQuotePrice: number | null = null;
  let formattedTotalPrice = "";

  let fallbackProjectSiteName = "";
  if (fallbackFilename) {
    const fnClean = fallbackFilename.replace(/\.docx$/i, "");
    const siteMatch = fnClean.match(/(?:Job\s*\d+\s+)?([A-Za-z0-9\s]+?)(?:\s*[-–]?\s*(?:Quote|Quotation|Smart\s+Schedule|Export))/i);
    if (siteMatch && siteMatch[1]) {
      fallbackProjectSiteName = siteMatch[1].trim();
    }
  }

  const postcodePattern = /\b([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\b/i;

  const exclVatPatterns = [
    /(?:Total\s*\(excl\.?\s*VAT\)|\bTotal\s+cost\s+excluding\s+VAT\b|\bTotal\s+excl\.?\s*VAT\b|\bNet\s+Total\b)\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  const vatPatterns = [
    /(?:Total\s+VAT|VAT\s*@\s*20%|^VAT)\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i,
    /^(?:Add\s+)?VAT\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  const incVatPatterns = [
    /(?:Grand\s+Total|Total\s*\(inc\.?\s*VAT\)|\bTotal\s+cost\s+including\s+VAT\b|\bTotal\s+inc\.?\s*VAT\b|\bGross\s+Total\b)\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  const genericTotalPatterns = [
    /(?:Total\s+Quote|Total\s+Quotation|Total\s+Price|Estimated\s*Cost|Total\s*Amount)\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i,
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
  let inDetailedWorkSection = false;
  let addressBlockLineCount = 0;
  const MAX_ADDRESS_LINES = 6;

  for (const p of paragraphs) {
    const t = p.text.trim();
    if (!t) { inAddressBlock = false; continue; }

    if (p.isHeading && p.headingLevel === 1) {
      inAddressBlock = false;
      continue;
    }

    if (/^Carry\s+out\s+work\s+in/i.test(t)) {
      inAddressBlock = false;
      inDetailedWorkSection = true;
    }

    if (/^(?:Acceptance|Terms)/i.test(t)) {
      inAddressBlock = false;
    }

    // Skip total and address scanning inside detailed room sections to avoid room subtotals
    if (inDetailedWorkSection) {
      continue;
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

    // 1. Total excluding VAT (Net)
    if (totalExclVat === null) {
      for (const pat of exclVatPatterns) {
        const m = t.match(pat);
        if (m && m[1]) {
          const val = parseFloat(m[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 0) {
            totalExclVat = val;
            formattedTotalExclVat = `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            break;
          }
        }
      }
    }

    // 2. VAT Amount
    if (vatAmount === null) {
      for (const pat of vatPatterns) {
        const m = t.match(pat);
        if (m && m[1]) {
          const val = parseFloat(m[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 0) {
            vatAmount = val;
            formattedVatAmount = `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            break;
          }
        }
      }
    }

    // 3. Total including VAT (Gross / Grand Total)
    if (totalIncVat === null) {
      for (const pat of incVatPatterns) {
        const m = t.match(pat);
        if (m && m[1]) {
          const val = parseFloat(m[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 0) {
            totalIncVat = val;
            formattedTotalIncVat = `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            break;
          }
        }
      }
    }

    // Generic total fallback if specific excl/inc VAT not matched
    if (totalQuotePrice === null) {
      for (const pat of genericTotalPatterns) {
        const m = t.match(pat);
        if (m && m[1]) {
          const val = parseFloat(m[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 100) {
            totalQuotePrice = val;
            formattedTotalPrice = `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            break;
          }
        }
      }
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

  // Determine main total quote price
  if (totalQuotePrice === null) {
    if (totalExclVat !== null) {
      totalQuotePrice = totalExclVat;
      formattedTotalPrice = formattedTotalExclVat;
    } else if (totalIncVat !== null) {
      totalQuotePrice = totalIncVat;
      formattedTotalPrice = formattedTotalIncVat;
    }
  }

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
    totalExclVat,
    formattedTotalExclVat,
    vatAmount,
    formattedVatAmount,
    totalIncVat,
    formattedTotalIncVat,
  };
}

/**
 * Extracts a location name if the paragraph is a location boundary anchor.
 */
function extractLocationAnchorName(p: RawDocParagraph, nextP?: RawDocParagraph, hasCarryOutAnchors: boolean = true): string | null {
  const text = p.text.trim();

  // Pattern 1: Standard HBXL "Carry out work in [LOCATION] comprising:"
  const carryMatch = text.match(/^Carry\s+out\s+work\s+in\s+(.+?)(?:\s+comprising\s*:?|\s*:)?$/i);
  if (carryMatch && carryMatch[1]) {
    const name = carryMatch[1].trim().replace(/[:\.\-_]+$/, "").trim();
    if (name && !isBannedTaskOrCategory(name)) {
      return name;
    }
  }

  // Pattern 2: Heading / title line whose text matches the location in the immediately following "Carry out work in..."
  if (nextP) {
    const nextText = nextP.text.trim();
    const nextCarryMatch = nextText.match(/^Carry\s+out\s+work\s+in\s+(.+?)(?:\s+comprising\s*:?|\s*:)?$/i);
    if (nextCarryMatch && nextCarryMatch[1]) {
      const name = nextCarryMatch[1].trim().replace(/[:\.\-_]+$/, "").trim();
      // Only treat p as a location title header if its text matches the upcoming location name
      if (text.toLowerCase() === name.toLowerCase() || ((p.isHeading || p.isBold) && calculateLevenshteinDistance(text.toLowerCase(), name.toLowerCase()) <= 2)) {
        return name;
      }
    }
  }

  // Pattern 3: Fallback for documents that do NOT have "Carry out work in" anchors
  if (!hasCarryOutAnchors && (p.headingLevel === 1 || (p.isBold && !p.isBullet)) && text.length < 50) {
    const norm = text.toLowerCase();
    if (STANDARD_DISTINCT_ROOMS.has(norm) || isGenericLocation(text)) {
      return text;
    }
  }

  return null;
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
      stats: { sourceLocationCount: 0, locationCount: 0, categoryCount: 0, taskCount: 0, resourceCount: 0, flaggedLocationCount: 0 },
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
      stats: { sourceLocationCount: 0, locationCount: 0, categoryCount: 0, taskCount: 0, resourceCount: 0, flaggedLocationCount: 0 },
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
      stats: { sourceLocationCount: 0, locationCount: 0, categoryCount: 0, taskCount: 0, resourceCount: 0, flaggedLocationCount: 0 },
    };
  }

  const fullText = paragraphs.map((p) => p.text).join("\n");
  const metadata = extractMetadata(paragraphs, fullText, filename);

  // =========================================================================
  // LOCATION & TASK EXTRACTION
  // =========================================================================
  const carryOutRegex = /^Carry\s+out\s+work\s+in\s+/i;
  const isTerminationSection = (text: string): boolean => {
    return /^(?:Acceptance\s+of\s+(?:Estimate|Quotation|Quote)|Terms\s*(?:&|and)\s*Conditions|Customer\s+Signature|Client\s+Signature|Date\s+of\s+Acceptance)/i.test(text.trim());
  };

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
  let lastActionableTask: ParsedWordTask | null = null;
  let insideDetailedSection = !hasCarryOutAnchors;
  let totalResourceMetadataCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const nextP = i + 1 < paragraphs.length ? paragraphs[i + 1] : undefined;
    const text = p.text.trim();
    if (!text) continue;

    // Check if we have hit a termination section (Acceptance, Terms & Conditions, etc.)
    if (isTerminationSection(text)) {
      currentLocation = null;
      currentCategory = null;
      lastActionableTask = null;
      insideDetailedSection = false;
      break;
    }

    // Check if this paragraph is a Location Anchor Boundary
    const anchorLocationName = extractLocationAnchorName(p, nextP, hasCarryOutAnchors);
    if (anchorLocationName) {
      insideDetailedSection = true;

      // Close previous location immediately so no boundary heading leaks into previous room!
      currentLocation = {
        name: anchorLocationName,
        categories: [],
      };
      rawLocations.push(currentLocation);
      currentCategory = null;
      lastActionableTask = null;

      // If the current paragraph is the title and next paragraph is "Carry out work in...", advance loop
      if (nextP && /^Carry\s+out\s+work\s+in/i.test(nextP.text.trim())) {
        i++; // Skip companion carry-out sentence
      }
      continue;
    }

    if (!insideDetailedSection || !currentLocation) {
      // Skip all content before the first detail location anchor (i.e. Cover/Summary page)
      continue;
    }

    // Skip any banned tokens, table column headers, prices, acceptance text, etc.
    if (isBannedTaskOrCategory(text)) {
      continue;
    }

    // Check if paragraph text is a Work Category Heading
    // e.g. "Replace Existing Floorboards", "Internal Lighting", "Bathroom Electrics", "Ceramic Wall Tiling"
    const isCategoryHeading =
      (p.headingLevel === 2 || (p.isHeading && p.headingLevel > 1) || (p.isBold && !p.isBullet)) &&
      !p.isBullet &&
      text.length < 80 &&
      !isPureMaterialOrProduct(text);

    if (isCategoryHeading) {
      currentCategory = {
        name: text,
        tasks: [],
      };
      currentLocation.categories.push(currentCategory);
      lastActionableTask = null;
      continue;
    }

    // Check if this line is pure resource/material metadata rather than an actionable task
    if (isPureMaterialOrProduct(text)) {
      totalResourceMetadataCount++;
      if (lastActionableTask) {
        lastActionableTask.resources = lastActionableTask.resources || [];
        if (!lastActionableTask.resources.includes(text)) {
          lastActionableTask.resources.push(text);
        }
      }
      continue;
    }

    // Specific Actionable Task / Work Item
    if (!currentCategory) {
      currentCategory = {
        name: "General Works",
        tasks: [],
      };
      currentLocation.categories.push(currentCategory);
    }

    // Ensure we don't add duplicate tasks within the same category
    let existingTask = currentCategory.tasks.find((t) => t.name === text);
    if (!existingTask) {
      existingTask = {
        name: text,
        description: text,
        sourceReference: "HBXL_WORD",
      };
      currentCategory.tasks.push(existingTask);
    }
    lastActionableTask = existingTask;
  }

  // =========================================================================
  // MERGE EXACT NORMALIZED DUPLICATE DETAIL LOCATIONS
  // (e.g. "2nd main bedroom" and "2nd main Bedroom" merged into 1 location)
  // =========================================================================
  const locationMap = new Map<string, RawLocation>();

  for (const rawLoc of rawLocations) {
    const normKey = rawLoc.name.trim().toLowerCase();
    const existing = locationMap.get(normKey);

    if (!existing) {
      locationMap.set(normKey, {
        name: rawLoc.name,
        categories: [...rawLoc.categories],
      });
    } else {
      // Merge categories from this section into existing location
      for (const newCat of rawLoc.categories) {
        const existingCat = existing.categories.find((c) => c.name.toLowerCase() === newCat.name.toLowerCase());
        if (existingCat) {
          // Merge tasks
          for (const task of newCat.tasks) {
            if (!existingCat.tasks.some((t) => t.name.toLowerCase() === task.name.toLowerCase())) {
              existingCat.tasks.push(task);
            }
          }
        } else {
          existing.categories.push(newCat);
        }
      }
    }
  }

  const mergedLocationsList = Array.from(locationMap.values());

  // =========================================================================
  // LOCATION REVIEW & SPELLING VARIANT CHECKS
  // =========================================================================
  const locations: ParsedWordLocation[] = [];

  for (let i = 0; i < mergedLocationsList.length; i++) {
    const loc = mergedLocationsList[i];
    // Filter out any categories with 0 tasks
    const validCategories = loc.categories.filter((cat) => cat.tasks.length > 0);

    const normalized = loc.name.trim().toLowerCase();
    let reviewStatus: "CONFIRMED" | "REVIEW_REQUIRED" = "CONFIRMED";
    let reviewReason: string | undefined = undefined;

    // 1. Generic / container location check
    if (isGenericLocation(loc.name)) {
      reviewStatus = "REVIEW_REQUIRED";
      reviewReason = `Generic location heading "${loc.name}" requires room clarification before worker assignment.`;
    }

    // 2. Check for true spelling variants across distinct normalized locations
    // (e.g. "Dining Room" vs "Dinning Room")
    for (let j = 0; j < mergedLocationsList.length; j++) {
      if (i === j) continue;
      const other = mergedLocationsList[j];
      const otherNorm = other.name.trim().toLowerCase();

      if (isSpellingVariant(loc.name, other.name)) {
        reviewStatus = "REVIEW_REQUIRED";
        reviewReason = `Spelling variant / possible duplicate of "${other.name}". Please verify room name.`;
        break;
      }
    }

    locations.push({
      name: loc.name,
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
      sourceLocationCount: rawLocations.length,
      locationCount: locations.length,
      categoryCount: totalCategories,
      taskCount: totalTasks,
      resourceCount: totalResourceMetadataCount,
      flaggedLocationCount,
    },
  };
}

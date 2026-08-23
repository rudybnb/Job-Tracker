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
    missingFields?: string[];
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
  "item / description",
]);

/**
 * Check if a paragraph or table text is banned from becoming a task or category.
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

  // Table header combinations like "Material Labour Plant Other Total" or "General Works Material Labour Plant Total"
  if (/^(?:general\s+works|material|materials|labour|plant|other|total|\s|\|)+$/i.test(norm)) return true;

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

export interface RawDocParagraph {
  text: string;
  isHeading: boolean;
  headingLevel: number;
  isBold: boolean;
  isBullet: boolean;
  styleName?: string;
}

export interface DocTableCell {
  text: string;
  paragraphs: RawDocParagraph[];
}

export interface DocTableRow {
  cells: DocTableCell[];
  text: string;
}

export interface DocTable {
  rows: DocTableRow[];
}

export type DocElement =
  | { type: "paragraph"; paragraph: RawDocParagraph }
  | { type: "table"; table: DocTable };

function findNextTag(xml: string, tagName: string, fromPos: number): number {
  let p = fromPos;
  while (p < xml.length) {
    const idx = xml.indexOf(`<${tagName}`, p);
    if (idx === -1) return -1;
    const nextChar = xml[idx + tagName.length + 1];
    if (nextChar === '>' || nextChar === ' ' || nextChar === '/' || nextChar === '\n' || nextChar === '\r' || nextChar === '\t') {
      return idx;
    }
    p = idx + tagName.length + 1;
  }
  return -1;
}

function findClosingTag(xml: string, tagName: string, fromPos: number): number {
  return xml.indexOf(`</${tagName}>`, fromPos);
}

export function parseSingleParagraphXml(pInnerXml: string): RawDocParagraph {
  let text = "";
  const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let tMatch: RegExpExecArray | null;

  while ((tMatch = tRegex.exec(pInnerXml)) !== null) {
    const runText = tMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    text += runText;
  }

  text = text.trim();

  const pStyleMatch = pInnerXml.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/);
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

  const isBold = /<w:b(?:\s+[^>]*)?\/>/.test(pInnerXml) || /<w:b\s+w:val="(?:true|1)"\/>/.test(pInnerXml);
  const isBullet = /<w:numPr>/.test(pInnerXml) || text.startsWith("•") || text.startsWith("-") || text.startsWith("*");
  const cleanText = text.replace(/^[•\-\*\s]+/, "").trim();

  return {
    text: cleanText || text,
    isHeading,
    headingLevel,
    isBold,
    isBullet,
    styleName: pStyleMatch ? pStyleMatch[1] : undefined,
  };
}

export function parseSingleTableXml(tblInnerXml: string): DocTable {
  const rows: DocTableRow[] = [];
  let pos = 0;

  while (pos < tblInnerXml.length) {
    const trStart = findNextTag(tblInnerXml, "w:tr", pos);
    if (trStart === -1) break;
    const trClose = findClosingTag(tblInnerXml, "w:tr", trStart);
    if (trClose === -1) break;

    const trFullXml = tblInnerXml.substring(trStart, trClose + 7);
    const trInner = trFullXml.replace(/^<w:tr(?:\s+[^>]*)?>/, "").replace(/<\/w:tr>$/, "");

    const cells: DocTableCell[] = [];
    let cellPos = 0;

    while (cellPos < trInner.length) {
      const tcStart = findNextTag(trInner, "w:tc", cellPos);
      if (tcStart === -1) break;
      const tcClose = findClosingTag(trInner, "w:tc", tcStart);
      if (tcClose === -1) break;

      const tcFullXml = trInner.substring(tcStart, tcClose + 7);
      const tcInner = tcFullXml.replace(/^<w:tc(?:\s+[^>]*)?>/, "").replace(/<\/w:tc>$/, "");

      const paragraphs: RawDocParagraph[] = [];
      let pPos = 0;

      while (pPos < tcInner.length) {
        const pStart = findNextTag(tcInner, "w:p", pPos);
        if (pStart === -1) break;
        const pClose = findClosingTag(tcInner, "w:p", pStart);
        if (pClose === -1) break;

        const pFullXml = tcInner.substring(pStart, pClose + 6);
        const pInner = pFullXml.replace(/^<w:p(?:\s+[^>]*)?>/, "").replace(/<\/w:p>$/, "");
        const p = parseSingleParagraphXml(pInner);
        if (p.text) {
          paragraphs.push(p);
        }
        pPos = pClose + 6;
      }

      const cellText = paragraphs.map((p) => p.text).join("\n").trim();
      cells.push({ text: cellText, paragraphs });
      cellPos = tcClose + 7;
    }

    if (cells.length > 0) {
      const rowText = cells.map((c) => c.text).filter(Boolean).join(" | ");
      rows.push({ cells, text: rowText });
    }

    pos = trClose + 7;
  }

  return { rows };
}

/**
 * Extracts top-level document elements (<w:p> and <w:tbl>) in exact document order from <w:body>.
 */
export function extractDocumentElements(xmlContent: string): DocElement[] {
  const elements: DocElement[] = [];
  const bodyStart = xmlContent.indexOf("<w:body>");
  const bodyEnd = xmlContent.lastIndexOf("</w:body>");
  if (bodyStart === -1 || bodyEnd === -1) return elements;

  const bodyXml = xmlContent.substring(bodyStart + 8, bodyEnd);
  let pos = 0;

  while (pos < bodyXml.length) {
    const nextP = findNextTag(bodyXml, "w:p", pos);
    const nextTbl = findNextTag(bodyXml, "w:tbl", pos);

    if (nextP === -1 && nextTbl === -1) break;

    if (nextP !== -1 && (nextTbl === -1 || nextP < nextTbl)) {
      const pClose = findClosingTag(bodyXml, "w:p", nextP);
      if (pClose === -1) break;
      const pFullXml = bodyXml.substring(nextP, pClose + 6);
      const pInner = pFullXml.replace(/^<w:p(?:\s+[^>]*)?>/, "").replace(/<\/w:p>$/, "");
      const p = parseSingleParagraphXml(pInner);
      if (p.text.trim()) {
        elements.push({ type: "paragraph", paragraph: p });
      }
      pos = pClose + 6;
    } else if (nextTbl !== -1) {
      let depth = 1;
      let searchPos = nextTbl + 6;
      let tblClose = -1;

      while (depth > 0 && searchPos < bodyXml.length) {
        const nextOpen = findNextTag(bodyXml, "w:tbl", searchPos);
        const nextClose = findClosingTag(bodyXml, "w:tbl", searchPos);

        if (nextClose === -1) break;

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          searchPos = nextOpen + 6;
        } else {
          depth--;
          if (depth === 0) {
            tblClose = nextClose;
          }
          searchPos = nextClose + 8;
        }
      }

      if (tblClose === -1) break;

      const tblFullXml = bodyXml.substring(nextTbl, tblClose + 8);
      const tblInner = tblFullXml.replace(/^<w:tbl(?:\s+[^>]*)?>/, "").replace(/<\/w:tbl>$/, "");
      const table = parseSingleTableXml(tblInner);
      if (table.rows.length > 0) {
        elements.push({ type: "table", table });
      }
      pos = tblClose + 8;
    }
  }

  return elements;
}

/**
 * Extracts flat paragraph list (maintained for backwards compatibility with tests).
 */
export function extractParagraphsFromDocumentXml(xmlContent: string): RawDocParagraph[] {
  const elements = extractDocumentElements(xmlContent);
  const paragraphs: RawDocParagraph[] = [];

  for (const el of elements) {
    if (el.type === "paragraph") {
      paragraphs.push(el.paragraph);
    } else if (el.type === "table") {
      for (const row of el.table.rows) {
        for (const cell of row.cells) {
          paragraphs.push(...cell.paragraphs);
        }
      }
    }
  }

  return paragraphs;
}

function cleanLabel(str: string) {
  return str.trim().toLowerCase().replace(/[:\.\-_]+$/, "").trim();
}

function parseAmount(str: string): number | null {
  const m = str.replace(/,/g, "").match(/[\d]+(?:\.\d{2})?/);
  if (!m) return null;
  const val = parseFloat(m[0]);
  return isNaN(val) ? null : val;
}

function formatAmount(val: number): string {
  return `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isAddressTerminator(text: string): boolean {
  const norm = text.trim().toLowerCase();
  if (!norm) return false;
  if (norm.includes("£") || /^(?:total|sub-?total|grand\s+total|net\s+total|vat)\b/i.test(norm)) return true;
  if (/^(?:summary\s+of\s+(?:estimate|quotation)|acceptance|terms\s*(?:&|and)\s*conditions|date|reference|ref:)/i.test(norm)) return true;
  if (/^carry\s+out\s+work\s+in/i.test(norm)) return true;
  return false;
}

/**
 * Extracts quote metadata (client, site, address, quote price) from document elements.
 * IMPORTANT: Strictly uses document content as the source of truth; zero authoritative filename fallbacks.
 */
export function extractMetadataFromElements(elements: DocElement[]) {
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

  const postcodePattern = /\b([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\b/i;

  const CLIENT_LABELS = new Set([
    "client", "client name", "customer", "customer name", "prepared for", "quotation for", "quote for", "for", "to"
  ]);

  const SITE_LABELS = new Set([
    "project / site", "project/site", "project & site", "project site", "project name", "site name",
    "job title", "project", "site", "property name"
  ]);

  const ADDRESS_LABELS = new Set([
    "site address", "property address", "client address", "customer address", "address", "property", "location"
  ]);

  const DATE_LABELS = new Set([
    "quote date", "quotation date", "date", "issue date", "date of quote", "date of quotation"
  ]);

  const REF_LABELS = new Set([
    "reference", "ref", "quote ref", "quote reference", "job ref"
  ]);

  const EXCL_VAT_LABELS = new Set([
    "total cost excluding vat", "total cost excl vat", "total cost excl. vat", "total excluding vat",
    "total excl vat", "total excl. vat", "total (excl vat)", "total (excl. vat)", "net total", "total net cost", "subtotal", "sub-total"
  ]);

  const VAT_LABELS = new Set([
    "total vat", "vat @ 20%", "vat @ 20.00%", "vat amount", "add vat", "vat"
  ]);

  const INC_VAT_LABELS = new Set([
    "total cost including vat", "total cost inc vat", "total cost inc. vat", "total including vat",
    "total inc vat", "total inc. vat", "total (inc vat)", "total (inc. vat)", "grand total", "gross total", "total gross cost"
  ]);

  const GENERIC_TOTAL_LABELS = new Set([
    "total quote", "total quotation", "total price", "estimated cost", "total amount", "total"
  ]);

  let inAddressParagraphBlock = false;
  let addressParagraphCount = 0;

  for (const el of elements) {
    if (el.type === "table") {
      inAddressParagraphBlock = false;
      for (const row of el.table.rows) {
        if (row.cells.length >= 2) {
          for (let c = 0; c + 1 < row.cells.length; c += 2) {
            const label = cleanLabel(row.cells[c].text);
            const val = row.cells[c + 1].text.trim();
            if (!val) continue;

            if (!clientName && CLIENT_LABELS.has(label)) {
              clientName = val.split("\n")[0].trim();
            } else if (!projectSiteName && SITE_LABELS.has(label)) {
              projectSiteName = val.split("\n")[0].trim();
            } else if (addressLines.length === 0 && ADDRESS_LABELS.has(label)) {
              const lines = val.split("\n").map(l => l.trim()).filter(Boolean);
              for (const line of lines) {
                if (isAddressTerminator(line)) break;
                addressLines.push(line);
                const pm = line.match(postcodePattern);
                if (pm && pm[1] && !postcode) postcode = pm[1].toUpperCase().trim();
              }
            } else if (!quoteDate && DATE_LABELS.has(label)) {
              const cleanDate = val.split("\n")[0].trim().replace(/^[\._\-\s]+$/, "");
              if (cleanDate) quoteDate = cleanDate;
            } else if (!quoteReference && REF_LABELS.has(label)) {
              const cleanRef = val.split("\n")[0].trim().replace(/^[\._\-\s]+$/, "");
              if (cleanRef) quoteReference = cleanRef;
            } else if (totalExclVat === null && EXCL_VAT_LABELS.has(label)) {
              const amt = parseAmount(val);
              if (amt !== null && amt > 0) {
                totalExclVat = amt;
                formattedTotalExclVat = formatAmount(amt);
              }
            } else if (vatAmount === null && VAT_LABELS.has(label)) {
              const amt = parseAmount(val);
              if (amt !== null && amt > 0) {
                vatAmount = amt;
                formattedVatAmount = formatAmount(amt);
              }
            } else if (totalIncVat === null && INC_VAT_LABELS.has(label)) {
              const amt = parseAmount(val);
              if (amt !== null && amt > 0) {
                totalIncVat = amt;
                formattedTotalIncVat = formatAmount(amt);
              }
            } else if (totalQuotePrice === null && GENERIC_TOTAL_LABELS.has(label)) {
              const amt = parseAmount(val);
              if (amt !== null && amt > 100) {
                totalQuotePrice = amt;
                formattedTotalPrice = formatAmount(amt);
              }
            }
          }
        }
      }
    } else if (el.type === "paragraph") {
      const t = el.paragraph.text.trim();
      if (!t) {
        inAddressParagraphBlock = false;
        continue;
      }

      if (isAddressTerminator(t) || el.paragraph.isHeading) {
        inAddressParagraphBlock = false;
      }

      if (!clientName) {
        const m = t.match(/^(?:Client|Customer|Prepared\s+for|Quotation\s+for|Quote\s+for|For|To):\s*(.+)$/i);
        if (m && m[1].trim() && !m[1].match(/^(?:Ltd|Limited|PLC|LLP|plc)$/i)) {
          clientName = m[1].trim();
        }
      }
      if (!projectSiteName) {
        const m = t.match(/^(?:Project\/Site|Project\s*Site|Project\s*Name|Site\s*Name|Job\s*Title|Site|Project):\s*(.+)$/i);
        if (m && m[1].trim()) projectSiteName = m[1].trim();
      }
      if (!quoteDate) {
        const m = t.match(/^(?:Quote\s+Date|Quotation\s+Date|Date|Issue\s+Date):\s*(.+)$/i);
        if (m && m[1].trim()) {
          const cleanDate = m[1].trim().replace(/^[\._\-\s]+$/, "");
          if (cleanDate) quoteDate = cleanDate;
        }
      }
      if (!quoteReference) {
        const m = t.match(/^(?:Reference|Ref|Job\s+Ref|Quote\s+Ref(?:erence)?):\s*(.+)$/i);
        if (m && m[1].trim()) {
          const cleanRef = m[1].trim().replace(/^[\._\-\s]+$/, "");
          if (cleanRef) quoteReference = cleanRef;
        }
      }

      // Check totals in paragraph
      if (totalExclVat === null) {
        const m = t.match(/(?:Total\s*\(excl\.?\s*VAT\)|\bTotal\s+cost\s+excluding\s+VAT\b|\bTotal\s+excl\.?\s*VAT\b|\bNet\s+Total\b)\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (m && m[1]) {
          const amt = parseAmount(m[1]);
          if (amt !== null && amt > 0) {
            totalExclVat = amt;
            formattedTotalExclVat = formatAmount(amt);
          }
        }
      }

      if (vatAmount === null) {
        const m = t.match(/(?:Total\s+VAT|VAT\s*@\s*20%|^VAT|Add\s+VAT)\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (m && m[1]) {
          const amt = parseAmount(m[1]);
          if (amt !== null && amt > 0) {
            vatAmount = amt;
            formattedVatAmount = formatAmount(amt);
          }
        }
      }

      if (totalIncVat === null) {
        const m = t.match(/(?:Grand\s+Total|Total\s*\(inc\.?\s*VAT\)|\bTotal\s+cost\s+including\s+VAT\b|\bTotal\s+inc\.?\s*VAT\b|\bGross\s+Total\b)\s*:?\s*(?:£|GBP)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (m && m[1]) {
          const amt = parseAmount(m[1]);
          if (amt !== null && amt > 0) {
            totalIncVat = amt;
            formattedTotalIncVat = formatAmount(amt);
          }
        }
      }

      // Address paragraph blocks
      if (!inAddressParagraphBlock && addressLines.length === 0) {
        const am = t.match(/^(?:Site\s+Address|Address|Property):\s*(.*)$/i);
        if (am) {
          inAddressParagraphBlock = true;
          addressParagraphCount = 0;
          const firstLine = am[1].trim();
          if (firstLine && !isAddressTerminator(firstLine)) {
            addressLines.push(firstLine);
            addressParagraphCount++;
            const pm = firstLine.match(postcodePattern);
            if (pm && pm[1] && !postcode) postcode = pm[1].toUpperCase().trim();
          }
        }
      } else if (inAddressParagraphBlock) {
        const isLabel = /^[A-Za-z\s]{2,25}:\s/.test(t);
        if (isLabel || addressParagraphCount >= 6 || isAddressTerminator(t)) {
          inAddressParagraphBlock = false;
        } else {
          addressLines.push(t);
          addressParagraphCount++;
          const pm = t.match(postcodePattern);
          if (pm && pm[1] && !postcode) postcode = pm[1].toUpperCase().trim();
        }
      }
    }
  }

  if (totalQuotePrice === null) {
    if (totalExclVat !== null) {
      totalQuotePrice = totalExclVat;
      formattedTotalPrice = formattedTotalExclVat;
    } else if (totalIncVat !== null) {
      totalQuotePrice = totalIncVat;
      formattedTotalPrice = formattedTotalIncVat;
    }
  }

  if (!postcode) {
    for (const line of addressLines) {
      const pm = line.match(postcodePattern);
      if (pm && pm[1]) {
        postcode = pm[1].toUpperCase().trim();
        break;
      }
    }
  }

  const address = addressLines.join("\n");

  const missingFields: string[] = [];
  if (!clientName) missingFields.push("Client Name");
  if (!projectSiteName) missingFields.push("Project / Site Name");
  if (!address) missingFields.push("Site Address");
  if (!postcode) missingFields.push("Postcode");
  if (!quoteDate) missingFields.push("Quote Date");
  if (totalExclVat === null && totalIncVat === null && totalQuotePrice === null) missingFields.push("Quote Price");

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
    totalExclVat,
    formattedTotalExclVat,
    vatAmount,
    formattedVatAmount,
    totalIncVat,
    formattedTotalIncVat,
    missingFields,
  };
}

function extractLocationAnchorFromText(text: string): string | null {
  const norm = text.trim();
  const carryMatch = norm.match(/^Carry\s+out\s+work\s+in\s+(.+?)(?:\s+comprising\s*:?|\s*:)?$/i);
  if (carryMatch && carryMatch[1]) {
    const name = carryMatch[1].trim().replace(/[:\.\-_]+$/, "").trim();
    if (name) {
      return name;
    }
  }
  return null;
}

/**
 * Parses document elements into location hierarchy, work categories, actionable tasks, and resource metadata.
 */
export function parseElementsIntoLocationsAndTasks(elements: DocElement[]) {
  const carryOutRegex = /^Carry\s+out\s+work\s+in\s+/i;
  
  let hasCarryOutAnchors = false;
  for (const el of elements) {
    if (el.type === "paragraph" && carryOutRegex.test(el.paragraph.text.trim())) {
      hasCarryOutAnchors = true;
      break;
    } else if (el.type === "table") {
      for (const row of el.table.rows) {
        if (carryOutRegex.test(row.text)) {
          hasCarryOutAnchors = true;
          break;
        }
      }
    }
  }

  const isTerminationSection = (text: string): boolean => {
    return /^(?:Acceptance\s+of\s+(?:Estimate|Quotation|Quote)|Terms\s*(?:&|and)\s*Conditions|Customer\s+Signature|Client\s+Signature|Date\s+of\s+Acceptance)/i.test(text.trim());
  };

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
  let totalResourceCount = 0;

  function handleActionableTask(taskName: string, description?: string) {
    const cleanName = taskName.trim().replace(/[:\.\-_]+$/, "").trim();
    if (!cleanName || isBannedTaskOrCategory(cleanName)) return;

    if (isPureMaterialOrProduct(cleanName)) {
      totalResourceCount++;
      if (lastActionableTask) {
        lastActionableTask.resources = lastActionableTask.resources || [];
        if (!lastActionableTask.resources.includes(cleanName)) {
          lastActionableTask.resources.push(cleanName);
        }
      }
      return;
    }

    if (!currentCategory) {
      currentCategory = {
        name: "General Works",
        tasks: [],
      };
      currentLocation?.categories.push(currentCategory);
    }

    const newTask: ParsedWordTask = {
      name: cleanName,
      description: description?.trim() || undefined,
      resources: [],
    };
    currentCategory.tasks.push(newTask);
    lastActionableTask = newTask;
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    if (el.type === "paragraph") {
      const p = el.paragraph;
      const text = p.text.trim();
      if (!text) continue;

      if (isTerminationSection(text)) {
        currentLocation = null;
        currentCategory = null;
        lastActionableTask = null;
        insideDetailedSection = false;
        break;
      }

      // Check if location anchor
      const anchorName = extractLocationAnchorFromText(text);
      if (anchorName) {
        insideDetailedSection = true;
        currentLocation = { name: anchorName, categories: [] };
        rawLocations.push(currentLocation);
        currentCategory = null;
        lastActionableTask = null;
        continue;
      }

      // If next element is a paragraph with Carry out work in...
      const nextEl = i + 1 < elements.length ? elements[i + 1] : undefined;
      if (nextEl && nextEl.type === "paragraph") {
        const nextAnchor = extractLocationAnchorFromText(nextEl.paragraph.text);
        if (nextAnchor && (text.toLowerCase() === nextAnchor.toLowerCase() || ((p.isHeading || p.isBold) && calculateLevenshteinDistance(text.toLowerCase(), nextAnchor.toLowerCase()) <= 2))) {
          insideDetailedSection = true;
          currentLocation = { name: nextAnchor, categories: [] };
          rawLocations.push(currentLocation);
          currentCategory = null;
          lastActionableTask = null;
          i++; // skip companion carry-out sentence
          continue;
        }
      }

      // Fallback for non-carry-out documents
      if (!hasCarryOutAnchors && (p.headingLevel === 1 || (p.isBold && !p.isBullet)) && text.length < 50) {
        const norm = text.toLowerCase();
        if (STANDARD_DISTINCT_ROOMS.has(norm) || isGenericLocation(text)) {
          insideDetailedSection = true;
          currentLocation = { name: text, categories: [] };
          rawLocations.push(currentLocation);
          currentCategory = null;
          lastActionableTask = null;
          continue;
        }
      }

      if (!insideDetailedSection || !currentLocation) {
        continue;
      }

      if (isBannedTaskOrCategory(text)) {
        continue;
      }

      const isCategoryHeading =
        (p.headingLevel === 2 || (p.isHeading && p.headingLevel > 1) || (p.isBold && !p.isBullet)) &&
        !p.isBullet &&
        text.length < 80 &&
        !isPureMaterialOrProduct(text);

      if (isCategoryHeading) {
        currentCategory = { name: text, tasks: [] };
        currentLocation.categories.push(currentCategory);
        lastActionableTask = null;
        continue;
      }

      handleActionableTask(text);
    } else if (el.type === "table") {
      if (isTerminationSection(el.table.rows.map(r => r.text).join(" "))) {
        break;
      }

      for (const row of el.table.rows) {
        const rowText = row.text.trim();
        if (!rowText || isBannedTaskOrCategory(rowText)) continue;

        // Check if table row contains location anchor
        const anchorName = extractLocationAnchorFromText(rowText);
        if (anchorName) {
          insideDetailedSection = true;
          currentLocation = { name: anchorName, categories: [] };
          rawLocations.push(currentLocation);
          currentCategory = null;
          lastActionableTask = null;
          continue;
        }

        if (!insideDetailedSection || !currentLocation) {
          continue;
        }

        // Check if row is a category header (e.g. 1 cell spanning or bold)
        if (row.cells.length === 1 && row.cells[0].paragraphs.length > 0) {
          const cellP = row.cells[0].paragraphs[0];
          if ((cellP.isHeading || cellP.isBold) && !isPureMaterialOrProduct(cellP.text) && !isBannedTaskOrCategory(cellP.text)) {
            currentCategory = { name: cellP.text.trim(), tasks: [] };
            currentLocation.categories.push(currentCategory);
            lastActionableTask = null;
            continue;
          }
        }

        // In standard table rows:
        let descText = "";
        let extraText = "";

        if (row.cells.length >= 2) {
          if (/^\d+(?:\.\d+)?$|^[A-Z]$/i.test(row.cells[0].text.trim())) {
            descText = row.cells[1].text.trim();
            extraText = row.cells.slice(2).map(c => c.text).join(" ");
          } else {
            descText = row.cells[0].text.trim();
            extraText = row.cells.slice(1).map(c => c.text).join(" ");
          }
        } else if (row.cells.length === 1) {
          descText = row.cells[0].text.trim();
        }

        if (descText && !isBannedTaskOrCategory(descText)) {
          const lines = descText.split("\n").map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            handleActionableTask(line);
          }
        }
      }
    }
  }

  // Group and normalize locations (Maureen identical merge, Spencer preservation)
  const groupedLocations = new Map<string, ParsedWordLocation>();

  for (const rawLoc of rawLocations) {
    const rawName = rawLoc.name.trim();
    if (!rawName) continue;

    const normName = rawName.toLowerCase();
    const existing = groupedLocations.get(normName);

    if (existing) {
      for (const rawCat of rawLoc.categories) {
        const catNorm = rawCat.name.toLowerCase();
        const existingCat = existing.categories.find(c => c.name.toLowerCase() === catNorm);
        if (existingCat) {
          for (const task of rawCat.tasks) {
            if (!existingCat.tasks.some(t => t.name.toLowerCase() === task.name.toLowerCase())) {
              existingCat.tasks.push(task);
            }
          }
        } else {
          existing.categories.push(rawCat);
        }
      }
    } else {
      let reviewStatus: "CONFIRMED" | "REVIEW_REQUIRED" = "CONFIRMED";
      let reviewReason: string | undefined;

      if (isGenericLocation(rawName)) {
        reviewStatus = "REVIEW_REQUIRED";
        reviewReason = `Generic location heading "${rawName}" requires room clarification before worker assignment.`;
      }

      groupedLocations.set(normName, {
        name: rawName,
        normalizedName: normName,
        reviewStatus,
        reviewReason,
        categories: rawLoc.categories,
      });
    }
  }

  const finalLocations = Array.from(groupedLocations.values());

  // Check spelling variants across locations (e.g. Dining Room vs Dinning Room)
  for (let i = 0; i < finalLocations.length; i++) {
    for (let j = i + 1; j < finalLocations.length; j++) {
      const locA = finalLocations[i];
      const locB = finalLocations[j];
      if (isSpellingVariant(locA.name, locB.name)) {
        if (locA.reviewStatus !== "REVIEW_REQUIRED") {
          locA.reviewStatus = "REVIEW_REQUIRED";
          locA.reviewReason = `Spelling variant / possible duplicate of "${locB.name}". Please verify room name.`;
        }
        if (locB.reviewStatus !== "REVIEW_REQUIRED") {
          locB.reviewStatus = "REVIEW_REQUIRED";
          locB.reviewReason = `Spelling variant / possible duplicate of "${locA.name}". Please verify room name.`;
        }
      }
    }
  }

  const categoryCount = finalLocations.reduce((sum, l) => sum + l.categories.length, 0);
  const taskCount = finalLocations.reduce(
    (sum, l) => sum + l.categories.reduce((cSum, c) => cSum + c.tasks.length, 0),
    0
  );
  const flaggedLocationCount = finalLocations.filter((l) => l.reviewStatus === "REVIEW_REQUIRED").length;

  return {
    locations: finalLocations,
    stats: {
      sourceLocationCount: rawLocations.length,
      locationCount: finalLocations.length,
      categoryCount,
      taskCount,
      resourceCount: totalResourceCount,
      flaggedLocationCount,
    },
  };
}

/**
 * Parses an HBXL EstimatorXpress Word Quote document buffer.
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
        totalExclVat: null,
        formattedTotalExclVat: "",
        vatAmount: null,
        formattedVatAmount: "",
        totalIncVat: null,
        formattedTotalIncVat: "",
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
        totalExclVat: null,
        formattedTotalExclVat: "",
        vatAmount: null,
        formattedVatAmount: "",
        totalIncVat: null,
        formattedTotalIncVat: "",
      },
      locations: [],
      stats: { sourceLocationCount: 0, locationCount: 0, categoryCount: 0, taskCount: 0, resourceCount: 0, flaggedLocationCount: 0 },
    };
  }

  const documentXml = await documentXmlFile.async("text");
  const elements = extractDocumentElements(documentXml);

  if (elements.length === 0) {
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
        totalExclVat: null,
        formattedTotalExclVat: "",
        vatAmount: null,
        formattedVatAmount: "",
        totalIncVat: null,
        formattedTotalIncVat: "",
      },
      locations: [],
      stats: { sourceLocationCount: 0, locationCount: 0, categoryCount: 0, taskCount: 0, resourceCount: 0, flaggedLocationCount: 0 },
    };
  }

  const metadata = extractMetadataFromElements(elements);
  const { locations, stats } = parseElementsIntoLocationsAndTasks(elements);

  return {
    valid: true,
    format: "hbxl-word-quote",
    errors,
    warnings,
    metadata,
    locations,
    stats,
  };
}

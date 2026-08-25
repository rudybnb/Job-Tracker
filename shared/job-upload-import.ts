import type { InsertJob } from "./schema";

export type JobUploadFormat = "enhanced-hbxl" | "original-hbxl" | "job-table" | "unknown";

export interface UploadValidationIssue {
  line?: number;
  field?: string;
  message: string;
}

export interface UploadJobPreview {
  name: string;
  address: string;
  postcode: string;
  projectType: string;
  buildPhases: string[];
}

export interface ProjectMetadata {
  clientName: string;
  projectSiteName: string;
  address: string;
  postcode: string;
  projectType: string;
}

export interface ParsedUploadJob {
  title: string;
  description: string;
  location: string;
  phases: string[];
  phaseTaskData: string;
  taskRows: number;
}

export interface JobUploadParseResult {
  valid: boolean;
  format: JobUploadFormat;
  errors: UploadValidationIssue[];
  warnings: UploadValidationIssue[];
  jobPreview: UploadJobPreview[];
  jobs: ParsedUploadJob[];
  stats: {
    jobs: number;
    phases: number;
    taskRows: number;
    malformedRows: number;
  };
}

export interface SmartScheduleCommercialSummary {
  labourTotal: number;
  materialTotal: number;
  plantTotal: number;
  subcontractorTotal: number;
  otherTotal: number;
  totalEstimatedCost: number;
  totalsByResourceType: Record<string, number>;
  clientQuote: number | null;
  grossProfit: number | null;
  marginPercent: number | null;
}

type SmartScheduleCostBucket = "labour" | "material" | "plant" | "subcontractor" | "other";

export function parseCurrencyAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\(([^)]+)\)/, "-$1")
    .replace(/gbp|£|,/gi, "")
    .trim();
  if (!normalized) return null;

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function calculateSmartScheduleCommercialSummary(source: unknown, quotedAmount?: unknown): SmartScheduleCommercialSummary {
  const parsedSource = parsePhaseTaskDataSource(source);
  const directValues = isPlainRecord(parsedSource) ? parsedSource : {};
  const financials = isPlainRecord(directValues.financials) ? directValues.financials : directValues;
  const resources = Array.isArray(directValues.resources) ? directValues.resources : [];
  const categoryTotals: Record<SmartScheduleCostBucket, number> = {
    labour: 0,
    material: 0,
    plant: 0,
    subcontractor: 0,
    other: 0,
  };
  const totalsByResourceType: Record<string, number> = {};

  for (const resource of resources) {
    if (!isPlainRecord(resource)) continue;
    const totalCost = numericValue(resource.totalCost);
    if (!Number.isFinite(totalCost) || totalCost === 0) continue;

    const resourceType = String(resource.resourceType ?? "other").trim();
    const normalizedResourceType = resourceType.toLowerCase() || "other";
    totalsByResourceType[normalizedResourceType] = roundCurrency((totalsByResourceType[normalizedResourceType] ?? 0) + totalCost);
    categoryTotals[toSmartScheduleCostBucket(resourceType)] += totalCost;
  }

  if (resources.length === 0) {
    categoryTotals.labour = financialNumber(financials, ["labourTotal", "totalLabour"]);
    categoryTotals.material = financialNumber(financials, ["materialTotal", "totalMaterial"]);
    categoryTotals.plant = financialNumber(financials, ["plantTotal", "totalPlant"]);
    categoryTotals.subcontractor = financialNumber(financials, ["subcontractorTotal", "subcontractorsTotal", "totalSubcontractor", "totalSubcontractors"]);
    categoryTotals.other = financialNumber(financials, ["otherTotal", "totalOther"]);
  }

  const labourTotal = roundCurrency(categoryTotals.labour);
  const materialTotal = roundCurrency(categoryTotals.material);
  const plantTotal = roundCurrency(categoryTotals.plant);
  const subcontractorTotal = roundCurrency(categoryTotals.subcontractor);
  const otherTotal = roundCurrency(categoryTotals.other);
  const calculatedEstimatedCost = roundCurrency(labourTotal + materialTotal + plantTotal + subcontractorTotal + otherTotal);
  const explicitEstimatedCost = resources.length === 0 ? financialNumber(financials, ["totalEstimatedCost", "estimatedCostTotal"]) : 0;
  const legacyGrandTotal = resources.length === 0 ? financialNumber(financials, ["grandTotal"]) : 0;
  const totalEstimatedCost = explicitEstimatedCost || calculatedEstimatedCost || legacyGrandTotal;
  const clientQuote = parseCurrencyAmount(quotedAmount);
  const grossProfit = clientQuote === null ? null : roundCurrency(clientQuote - totalEstimatedCost);
  const marginPercent = clientQuote === null || clientQuote === 0 || grossProfit === null
    ? null
    : roundCurrency((grossProfit / clientQuote) * 100);

  return {
    labourTotal,
    materialTotal,
    plantTotal,
    subcontractorTotal,
    otherTotal,
    totalEstimatedCost: roundCurrency(totalEstimatedCost),
    totalsByResourceType,
    clientQuote,
    grossProfit,
    marginPercent,
  };
}

type CsvLine = {
  lineNumber: number;
  raw: string;
  cells: string[];
};

export const acceptedJobUploadColumns = [
  "Name",
  "Address",
  "Post code",
  "Post Code",
  "Postcode",
  "Project Type",
  "Order Date",
  "Date Required",
  "Required Date",
  "Build Phase",
  "Type of Resource",
  "Resource Type",
  "Resource Description",
  "Resource Description Without Price",
  "Product Code",
  "Description",
  "Quantity",
  "Order Quantity",
  "Supplier",
  "Build Phases",
  "ProjectType",
];

export function normalizeUploadCsvContent(csvContent: string): string {
  return csvContent.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function parseJobUploadCsv(csvContent: string): JobUploadParseResult {
  const lines = toCsvLines(csvContent);
  const errors: UploadValidationIssue[] = [];
  const warnings: UploadValidationIssue[] = [];

  if (lines.length === 0) {
    errors.push({ message: "The selected file is empty." });
    return emptyResult("unknown", errors, warnings);
  }

  const tableResult = parseJobTable(lines, errors, warnings);
  if (tableResult !== null) return tableResult;

  const header = extractHeaderFields(lines, errors);
  const enhancedHeaderIndex = lines.findIndex((line) => isEnhancedHbxlHeader(line.cells));
  if (enhancedHeaderIndex !== -1) {
    return parseEnhancedHbxl(lines, enhancedHeaderIndex, header, errors, warnings);
  }

  const originalHeaderIndex = lines.findIndex((line) => isOriginalHbxlHeader(line.cells));
  if (originalHeaderIndex !== -1) {
    return parseOriginalHbxl(lines, originalHeaderIndex, header, errors, warnings);
  }

  errors.push({
    message:
      "Could not find a supported job table or HBXL task header. Expected Build Phase task data or a Name/Address/Postcode/Project Type job table.",
  });
  return buildResult("unknown", errors, warnings, []);
}

export function validateProjectMetadata(metadata: ProjectMetadata): UploadValidationIssue[] {
  const errors: UploadValidationIssue[] = [];
  requireValue(errors, undefined, "Client Name", metadata.clientName);
  requireValue(errors, undefined, "Project / Site Name", metadata.projectSiteName);
  requireValue(errors, undefined, "Address", metadata.address);
  requireValue(errors, undefined, "Postcode", metadata.postcode);
  requireValue(errors, undefined, "Project Type", metadata.projectType);

  if (metadata.postcode.trim() && !/^[A-Z0-9][A-Z0-9 ]{2,10}$/i.test(metadata.postcode.trim())) {
    errors.push({ field: "Postcode", message: "Postcode must look like a valid postcode." });
  }

  return errors;
}

export function suggestJobNameFromSource(sourceName: string): string {
  return sourceName
    .replace(/\.[^.]+$/, "")
    .replace(/\bsmart\s+schedule\s+export\b/gi, "")
    .replace(/^\s*job\s+\d+\s*/i, "")
    .replace(/[\s_-]+$/g, "")
    .replace(/^[\s_-]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function toInsertJobs(
  parsedJobs: ParsedUploadJob[],
  uploadId: string,
  importFingerprint: string,
  metadata: ProjectMetadata,
): InsertJob[] {
  const cleanMetadata = normalizeProjectMetadata(metadata);
  return parsedJobs.map((job) => ({
    title: cleanMetadata.projectSiteName,
    clientName: cleanMetadata.clientName,
    description: cleanMetadata.projectType,
    location: `${cleanMetadata.address}, ${cleanMetadata.postcode}`,
    status: "pending" as const,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    notes: `Project / Site Name: ${cleanMetadata.projectSiteName}\nProject Type: ${cleanMetadata.projectType}\nImport Fingerprint: ${importFingerprint}`,
    phases: job.phases.join(", "),
    uploadId,
    phaseTaskData: job.phaseTaskData,
  }));
}

function parseJobTable(
  lines: CsvLine[],
  errors: UploadValidationIssue[],
  warnings: UploadValidationIssue[],
): JobUploadParseResult | null {
  if (lines.length < 2) return null;

  const headers = lines[0].cells.map(normalizeHeader);
  const nameIndex = findColumn(headers, ["name"]);
  const addressIndex = findColumn(headers, ["address"]);
  const postcodeIndex = findColumn(headers, ["postcode", "post code"]);
  const projectTypeIndex = findColumn(headers, ["projecttype", "project type"]);
  const phasesIndex = findColumn(headers, ["buildphases", "build phases", "phases"]);

  const tableDetected = [nameIndex, addressIndex, postcodeIndex, projectTypeIndex].every((index) => index >= 0);
  if (!tableDetected) return null;

  if (phasesIndex < 0) {
    errors.push({ line: lines[0].lineNumber, field: "Build Phases", message: "Job table is missing a Build Phases column." });
  }

  const jobs: ParsedUploadJob[] = [];
  for (const line of lines.slice(1)) {
    const rowName = cell(line, nameIndex);
    const rowAddress = cell(line, addressIndex);
    const rowPostcode = cell(line, postcodeIndex).toUpperCase();
    const rowProjectType = cell(line, projectTypeIndex);
    const phaseValue = phasesIndex >= 0 ? cell(line, phasesIndex) : "";
    const phases = splitPhases(phaseValue);

    requireValue(errors, line.lineNumber, "Name", rowName);
    requireValue(errors, line.lineNumber, "Address", rowAddress);
    requireValue(errors, line.lineNumber, "Postcode", rowPostcode);
    requireValue(errors, line.lineNumber, "Project Type", rowProjectType);
    requireValue(errors, line.lineNumber, "Build Phases", phaseValue);

    jobs.push({
      title: rowName,
      description: rowProjectType,
      location: `${rowAddress}, ${rowPostcode}`,
      phases,
      phaseTaskData: JSON.stringify({}),
      taskRows: 0,
    });
  }

  return buildResult("job-table", errors, warnings, jobs);
}

function parseEnhancedHbxl(
  lines: CsvLine[],
  headerIndex: number,
  header: UploadJobPreview,
  errors: UploadValidationIssue[],
  warnings: UploadValidationIssue[],
): JobUploadParseResult {
  const headerLine = lines[headerIndex];
  const headers = headerLine.cells.map(normalizeHeader);
  const orderDateIndex = findColumn(headers, ["order date"]);
  const requiredDateIndex = findColumn(headers, ["date required", "required date"]);
  const phaseIndex = findColumn(headers, ["build phase", "phase"]);
  const resourceTypeIndex = findColumn(headers, ["type of resource", "resource type"]);
  const descriptionIndex = findColumn(headers, ["resource description", "description"]);
  const descriptionWithoutPriceIndex = findColumn(headers, ["resource description without price"]);
  const quantityIndex = findColumn(headers, ["quantity", "order quantity", "qty"]);
  const supplierIndex = findColumn(headers, ["supplier"]);
  const productCodeIndex = findColumn(headers, ["product code"]);

  requireColumn(errors, headerLine.lineNumber, "Order Date", orderDateIndex);
  requireColumn(errors, headerLine.lineNumber, "Build Phase", phaseIndex);
  requireColumn(errors, headerLine.lineNumber, "Type of Resource or Resource Type", resourceTypeIndex);
  requireColumn(errors, headerLine.lineNumber, "Resource Description or Description", descriptionIndex);
  requireColumn(errors, headerLine.lineNumber, "Order Quantity or Quantity", quantityIndex);

  const phases: string[] = [];
  const resources: any[] = [];
  const phaseTaskData: Record<string, any[]> = {};
  const weeklyBreakdown: Record<string, { labour: number; material: number; total: number }> = {};
  let taskRows = 0;

  for (const line of lines.slice(headerIndex + 1)) {
    const orderDate = cell(line, orderDateIndex);
    const buildPhase = cell(line, phaseIndex);
    const resourceType = cell(line, resourceTypeIndex);
    const description = cell(line, descriptionIndex);
    const descriptionWithoutPrice = descriptionWithoutPriceIndex >= 0 ? cell(line, descriptionWithoutPriceIndex) : "";
    const quantityText = cell(line, quantityIndex);
    const quantity = Number.parseInt(quantityText, 10);

    requireValue(errors, line.lineNumber, "Order Date", orderDate);
    requireValue(errors, line.lineNumber, "Build Phase", buildPhase);
    requireValue(errors, line.lineNumber, "Type of Resource", resourceType);
    requireValue(errors, line.lineNumber, "Resource Description", description);
    requireInteger(errors, line.lineNumber, "Quantity", quantityText);

    if (!orderDate || !buildPhase || !resourceType || !description || !Number.isFinite(quantity)) {
      continue;
    }

    const phaseName = buildPhase.trim();
    const priceMatch = description.match(/\u00a3(\d+\.?\d*)/);
    const unitMatch = description.match(/\u00a3\d+\.?\d*\/(\w+)/);
    const unitPrice = priceMatch ? Number.parseFloat(priceMatch[1]) : 0;
    const unit = unitPrice > 0 ? (unitMatch ? unitMatch[1] : "Each") : resourceType.toLowerCase() === "labour" ? "Hours" : "Each";
    const totalCost = unitPrice * quantity;
    const supplier = supplierIndex >= 0 ? cell(line, supplierIndex) || "Not specified" : "Not specified";

    if (unitPrice > 0) {
      if (!weeklyBreakdown[orderDate]) weeklyBreakdown[orderDate] = { labour: 0, material: 0, total: 0 };
      if (resourceType.toLowerCase() === "labour") weeklyBreakdown[orderDate].labour += totalCost;
      if (resourceType.toLowerCase() === "material") weeklyBreakdown[orderDate].material += totalCost;
      weeklyBreakdown[orderDate].total += totalCost;
    }

    if (!phaseTaskData[phaseName]) phaseTaskData[phaseName] = [];
    const taskName = (descriptionWithoutPrice || description.replace(/\u00a3.*/, "")).trim();
    phaseTaskData[phaseName].push({
      task: taskName,
      description:
        unitPrice > 0
          ? `${taskName} (${quantity} ${unit}) - ${supplier} - GBP ${totalCost.toFixed(2)}`
          : `${taskName} (${quantity} ${unit}) - ${supplier}`,
      quantity,
      unitPrice,
      totalCost,
      supplier,
      productCode: productCodeIndex >= 0 ? cell(line, productCodeIndex) : "",
      orderDate,
      requiredDate: requiredDateIndex >= 0 ? cell(line, requiredDateIndex) : "",
      resourceType,
      resourceDescription: description,
      resourceDescriptionWithoutPrice: descriptionWithoutPrice,
      unit,
      costBreakdown: unitPrice > 0 ? `${quantity} x GBP ${unitPrice} = GBP ${totalCost.toFixed(2)}` : "Price not specified in CSV",
    });

    if (!phases.includes(phaseName)) phases.push(phaseName);
    resources.push({
      orderDate,
      requiredDate: requiredDateIndex >= 0 ? cell(line, requiredDateIndex) : "",
      buildPhase: phaseName,
      resourceType,
      productCode: productCodeIndex >= 0 ? cell(line, productCodeIndex) : "",
      description,
      descriptionWithoutPrice,
      quantity,
      supplier,
      unitPrice,
      unit,
      totalCost,
    });
    taskRows++;
  }

  if (taskRows === 0) {
    errors.push({ line: headerLine.lineNumber, message: "No valid HBXL task rows were found after the task header." });
  }

  const commercialSummary = calculateSmartScheduleCommercialSummary({ resources: resources.filter((resource) => resource.unitPrice) });

  const job = buildParsedJob(header, phases, JSON.stringify({
    phases: phaseTaskData,
    financials: {
      totalLabour: commercialSummary.labourTotal,
      totalMaterial: commercialSummary.materialTotal,
      labourTotal: commercialSummary.labourTotal,
      materialTotal: commercialSummary.materialTotal,
      plantTotal: commercialSummary.plantTotal,
      subcontractorTotal: commercialSummary.subcontractorTotal,
      otherTotal: commercialSummary.otherTotal,
      totalEstimatedCost: commercialSummary.totalEstimatedCost,
      grandTotal: commercialSummary.labourTotal + commercialSummary.materialTotal,
      weeklyBreakdown,
    },
    resources: resources.filter((resource) => resource.unitPrice),
  }), taskRows);

  return buildResult("enhanced-hbxl", errors, warnings, [job]);
}

function parseOriginalHbxl(
  lines: CsvLine[],
  headerIndex: number,
  header: UploadJobPreview,
  errors: UploadValidationIssue[],
  warnings: UploadValidationIssue[],
): JobUploadParseResult {
  const phases: string[] = [];
  const phaseTaskData: Record<string, Array<{ description: string; quantity: number; task: string }>> = {};
  let currentPhase = "";
  let taskRows = 0;

  for (const line of lines.slice(headerIndex + 1)) {
    const columns = line.cells;
    const col1 = cell(line, 0);
    const col2 = cell(line, 1);
    const col3 = cell(line, 2);
    const col4 = cell(line, 3);

    if (columns.length < 3) {
      errors.push({ line: line.lineNumber, message: "Malformed HBXL row: expected phase/task columns after the Build Phase header." });
      continue;
    }

    if (!col1 && col2 && !col3) {
      currentPhase = col2;
      if (!phases.includes(currentPhase)) phases.push(currentPhase);
      if (!phaseTaskData[currentPhase]) phaseTaskData[currentPhase] = [];
      continue;
    }

    if (col3) {
      if (!currentPhase) {
        errors.push({ line: line.lineNumber, field: "Build Phase", message: "Task row appears before any build phase row." });
        continue;
      }
      requireInteger(errors, line.lineNumber, "Quantity", col4);
      const quantity = Number.parseInt(col4, 10);
      if (!Number.isFinite(quantity)) continue;
      const taskDescription = col3.replace(/"/g, "").trim();
      phaseTaskData[currentPhase].push({
        description: taskDescription,
        quantity,
        task: `Install ${taskDescription.toLowerCase()}`,
      });
      taskRows++;
      continue;
    }

    errors.push({ line: line.lineNumber, message: "Malformed HBXL row: could not identify this row as a phase or task." });
  }

  if (phases.length === 0) errors.push({ line: lines[headerIndex].lineNumber, field: "Build Phase", message: "No build phases were found." });
  if (taskRows === 0) errors.push({ line: lines[headerIndex].lineNumber, message: "No task rows were found after the Build Phase header." });

  const job = buildParsedJob(header, phases, JSON.stringify(phaseTaskData), taskRows);
  return buildResult("original-hbxl", errors, warnings, [job]);
}

function extractHeaderFields(lines: CsvLine[], errors: UploadValidationIssue[]): UploadJobPreview {
  const header: UploadJobPreview = {
    name: "",
    address: "",
    postcode: "",
    projectType: "",
    buildPhases: [],
  };

  for (const line of lines.slice(0, 5)) {
    const key = normalizeHeader(line.cells[0] ?? "");
    const value = line.cells.slice(1).filter((part) => part.trim()).join(", ").trim();

    if (key === "name") header.name = value;
    if (key === "address") header.address = value;
    if (key === "post code" || key === "postcode") header.postcode = value.toUpperCase();
    if (key === "project type" || key === "projecttype") header.projectType = value;
  }

  return header;
}

function buildParsedJob(header: UploadJobPreview, phases: string[], phaseTaskData: string, taskRows: number): ParsedUploadJob {
  return {
    title: header.name,
    description: header.projectType,
    location: header.address || header.postcode ? `${header.address}, ${header.postcode}` : "",
    phases,
    phaseTaskData,
    taskRows,
  };
}

function buildResult(
  format: JobUploadFormat,
  errors: UploadValidationIssue[],
  warnings: UploadValidationIssue[],
  jobs: ParsedUploadJob[],
): JobUploadParseResult {
  const valid = errors.length === 0 && jobs.length > 0;
  const jobPreview = jobs.map((job) => {
    const commaIndex = job.location.indexOf(",");
    const address = commaIndex >= 0 ? job.location.slice(0, commaIndex).trim() : job.location.trim();
    const postcode = commaIndex >= 0 ? job.location.slice(commaIndex + 1).trim() : "";
    return {
      name: job.title,
      address,
      postcode,
      projectType: job.description,
      buildPhases: job.phases.length > 0 ? job.phases : [],
    };
  });
  const phases = new Set(jobs.flatMap((job) => job.phases));
  return {
    valid,
    format,
    errors,
    warnings,
    jobPreview,
    jobs,
    stats: {
      jobs: valid ? jobs.length : 0,
      phases: phases.size,
      taskRows: jobs.reduce((total, job) => total + job.taskRows, 0),
      malformedRows: errors.filter((error) => error.line !== undefined).length,
    },
  };
}

function emptyResult(format: JobUploadFormat, errors: UploadValidationIssue[], warnings: UploadValidationIssue[]): JobUploadParseResult {
  return buildResult(format, errors, warnings, []);
}

function toCsvLines(csvContent: string): CsvLine[] {
  return normalizeUploadCsvContent(csvContent)
    .split("\n")
    .map((raw, index) => ({ lineNumber: index + 1, raw: raw.trim() }))
    .filter((line) => line.raw.length > 0)
    .map((line) => ({ ...line, cells: parseCsvLine(line.raw).map((cellValue) => cellValue.trim()) }));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function isEnhancedHbxlHeader(cells: string[]): boolean {
  const headers = cells.map(normalizeHeader);
  return (
    findColumn(headers, ["order date"]) >= 0 &&
    findColumn(headers, ["build phase", "phase"]) >= 0 &&
    findColumn(headers, ["order quantity", "quantity"]) >= 0 &&
    (findColumn(headers, ["resource description", "description"]) >= 0 ||
      findColumn(headers, ["type of resource", "resource type"]) >= 0)
  );
}

function isOriginalHbxlHeader(cells: string[]): boolean {
  const headers = cells.map(normalizeHeader);
  return findColumn(headers, ["build phase", "phase"]) >= 0;
}

function cell(line: CsvLine, index: number): string {
  if (index < 0) return "";
  return line.cells[index]?.trim() ?? "";
}

function requireColumn(errors: UploadValidationIssue[], line: number, field: string, index: number) {
  if (index < 0) errors.push({ line, field, message: `Missing required HBXL column: ${field}.` });
}

function requireValue(errors: UploadValidationIssue[], line: number | undefined, field: string, value: string) {
  if (!value || value.trim() === "") errors.push({ line, field, message: `Missing required value: ${field}.` });
}

function requireInteger(errors: UploadValidationIssue[], line: number, field: string, value: string) {
  if (!value || !/^\d+$/.test(value.trim())) {
    errors.push({ line, field, message: `Invalid ${field}: expected a whole number.` });
  }
}

function normalizeProjectMetadata(metadata: ProjectMetadata): ProjectMetadata {
  return {
    clientName: metadata.clientName.trim(),
    projectSiteName: metadata.projectSiteName.trim(),
    address: metadata.address.trim(),
    postcode: metadata.postcode.trim().toUpperCase(),
    projectType: metadata.projectType.trim(),
  };
}

function splitPhases(value: string): string[] {
  return value
    .split(/[|;]/)
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePhaseTaskDataSource(source: unknown): unknown {
  if (typeof source !== "string") return source;
  try {
    return JSON.parse(source);
  } catch {
    return {};
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const amount = parseCurrencyAmount(value);
    return amount ?? Number.NaN;
  }
  return Number.NaN;
}

function financialNumber(source: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const amount = numericValue(source[key]);
    if (Number.isFinite(amount)) return roundCurrency(amount);
  }
  return 0;
}

function toSmartScheduleCostBucket(resourceType: string): SmartScheduleCostBucket {
  const normalized = resourceType.toLowerCase().replace(/[\s_-]+/g, " ").trim();
  if (/\blabou?r\b/.test(normalized)) return "labour";
  if (/\bmaterials?\b/.test(normalized)) return "material";
  if (/\bplant\b/.test(normalized)) return "plant";
  if (/\bsub\s*contract(or|ors)?\b|\bsubcontract(or|ors)?\b/.test(normalized)) return "subcontractor";
  return "other";
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatUploadDate(rawDate?: string | Date | null): string {
  if (!rawDate) return "—";
  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


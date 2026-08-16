import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildOfflineProjectModel, renderOfflineProjectMarkdown } from "../shared/measurable-work/offline-project-model.ts";

interface CliOptions {
  project: string;
  dxf: string;
  hbxl: string;
  jsonOut: string;
  markdownOut: string;
}

const DEFAULT_OPTIONS: CliOptions = {
  project: "Patrick Brook / Chat Test",
  dxf: "test-fixtures/patrick-brook/Chat Test.dxf",
  hbxl: "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv",
  jsonOut: "reports/offline-project-model/patrick-brook-offline-project-model.json",
  markdownOut: "reports/offline-project-model/patrick-brook-offline-project-model.md",
};

function parseArgs(args: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--help") throw new Error(usage());
    if (!next) throw new Error(`Missing value for ${arg}`);

    if (arg === "--project") options.project = next;
    else if (arg === "--dxf") options.dxf = next;
    else if (arg === "--hbxl") options.hbxl = next;
    else if (arg === "--json-out") options.jsonOut = next;
    else if (arg === "--markdown-out") options.markdownOut = next;
    else throw new Error(`Unknown option: ${arg}`);
    i++;
  }

  return options;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/build-patrick-brook-offline-project.ts",
    "  tsx scripts/build-patrick-brook-offline-project.ts --dxf path/to/file.dxf --hbxl path/to/smart-schedule.csv",
    "",
    "Builds offline JSON and Markdown reports only. It does not connect to the database or API.",
  ].join("\n");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const [dxfContent, hbxlCsvContent] = await Promise.all([
    readFile(options.dxf, "utf8"),
    readFile(options.hbxl, "utf8"),
  ]);

  const model = buildOfflineProjectModel({
    project: options.project,
    dxfContent,
    hbxlCsvContent,
    sourceDxf: options.dxf,
    sourceSmartSchedule: options.hbxl,
  });

  await Promise.all([
    mkdir(dirname(options.jsonOut), { recursive: true }),
    mkdir(dirname(options.markdownOut), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(options.jsonOut, `${JSON.stringify(model, null, 2)}\n`, "utf8"),
    writeFile(options.markdownOut, renderOfflineProjectMarkdown(model), "utf8"),
  ]);

  console.log([
    `Offline Patrick Brook project model built`,
    `Work areas: ${model.summary.workAreasDetected}`,
    `Trades/packages: ${model.summary.tradesDetected}`,
    `Measurable items: ${model.summary.measurableItemsCreated}`,
    `Drawing objects linked: ${model.summary.drawingObjectsLinked}`,
    `HBXL resources linked: ${model.summary.hbxlResourcesLinked}`,
    `Exact matches: ${model.summary.exactMatches}`,
    `Review required: ${model.summary.reviewRequired}`,
    `JSON: ${options.jsonOut}`,
    `Markdown: ${options.markdownOut}`,
  ].join("\n"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

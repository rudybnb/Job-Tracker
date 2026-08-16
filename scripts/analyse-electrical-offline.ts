import { readFile, writeFile } from "node:fs/promises";
import { analyseElectricalProject, formatElectricalConsoleSummary } from "../shared/measurable-work/offline-electrical.ts";

interface CliOptions {
  project: string;
  dxf: string;
  hbxl: string;
  out?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (!next && arg !== "--help") throw new Error(`Missing value for ${arg}`);

    if (arg === "--project") {
      options.project = next;
      i++;
    } else if (arg === "--dxf") {
      options.dxf = next;
      i++;
    } else if (arg === "--hbxl") {
      options.hbxl = next;
      i++;
    } else if (arg === "--out") {
      options.out = next;
      i++;
    } else if (arg === "--help") {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.project || !options.dxf || !options.hbxl) throw new Error(usage());
  return options as CliOptions;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/analyse-electrical-offline.ts --project \"Patrick Brook\" --dxf path/to/plans.dxf --hbxl path/to/smart-schedule.csv --out report.json",
    "",
    "This offline analyser reads local DXF/CSV files only and does not connect to the database or API.",
  ].join("\n");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const [dxfContent, hbxlCsvContent] = await Promise.all([
    readFile(options.dxf, "utf8"),
    readFile(options.hbxl, "utf8"),
  ]);
  const report = analyseElectricalProject({ project: options.project, dxfContent, hbxlCsvContent });

  console.log(formatElectricalConsoleSummary(report));

  if (options.out) {
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nJSON report written: ${options.out}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

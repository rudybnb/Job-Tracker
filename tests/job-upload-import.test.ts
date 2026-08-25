import assert from "node:assert/strict";
import test from "node:test";
import { calculateSmartScheduleCommercialSummary, parseJobUploadCsv, suggestJobNameFromSource, toInsertJobs, validateProjectMetadata } from "../shared/job-upload-import.ts";

const validEnhancedHbxl = `Order Date,Date Required,Build Phase,Type of Resource,Resource Type,Supplier,Product Code,Resource Description,Resource Description Without Price,Order Quantity
2026-08-12,2026-08-13,Electrical,Labour,Electrician,Sculpt Electrical,LAB-001,First fix wiring,First fix wiring,4
2026-08-12,2026-08-13,Electrical,Material,Cable,Supplier A,MAT-001,Twin cable GBP placeholder,Twin cable,10`;

test("validates enhanced HBXL upload before import", () => {
  const result = parseJobUploadCsv(validEnhancedHbxl);

  assert.equal(result.valid, true);
  assert.equal(result.format, "enhanced-hbxl");
  assert.equal(result.errors.length, 0);
  assert.equal(result.stats.jobs, 1);
  assert.equal(result.stats.taskRows, 2);
  assert.deepEqual(result.jobPreview[0].buildPhases, ["Electrical"]);
});

test("does not require project metadata inside confirmed HBXL schedule files", () => {
  const result = parseJobUploadCsv(validEnhancedHbxl);

  assert.equal(result.valid, true);
  assert.equal(result.jobPreview[0].name, "");
  assert.equal(result.jobPreview[0].address, "");
  assert.equal(result.jobPreview[0].postcode, "");
  assert.equal(result.jobPreview[0].projectType, "");
});

test("rejects malformed task rows instead of silently skipping them", () => {
  const result = parseJobUploadCsv(`Order Date,Date Required,Build Phase,Type of Resource,Resource Description,Order Quantity
2026-08-12,2026-08-13,Electrical,Labour,First fix wiring,not-a-number`);

  assert.equal(result.valid, false);
  assert.match(result.errors.map((issue) => issue.message).join("\n"), /Invalid Quantity/);
  assert.equal(result.stats.jobs, 0);
});

test("validates simple job table uploads", () => {
  const result = parseJobUploadCsv(`Name,Address,Postcode,ProjectType,BuildPhases
Kitchen Works,1 Site Road,ME1 1AA,Kitchen,Demo; First Fix; Finish`);

  assert.equal(result.valid, true);
  assert.equal(result.format, "job-table");
  assert.deepEqual(result.jobPreview[0].buildPhases, ["Demo", "First Fix", "Finish"]);
});

test("validates project metadata separately before insert", () => {
  assert.deepEqual(validateProjectMetadata({ clientName: "", projectSiteName: "", address: "", postcode: "", projectType: "" }).map((issue) => issue.field), [
    "Client Name",
    "Project / Site Name",
    "Address",
    "Postcode",
    "Project Type",
  ]);

  assert.equal(validateProjectMetadata({ clientName: "A Real Client", projectSiteName: "Spencer House", address: "10 High Street", postcode: "SG1 1EH", projectType: "Refurb" }).length, 0);
});

test("suggests project site name from HBXL source names only", () => {
  assert.equal(suggestJobNameFromSource("Job 50 Spencer House Smart Schedule Export.xlsx"), "Spencer House");
  assert.equal(suggestJobNameFromSource("Job 50 Spencer House Smart Schedule Export"), "Spencer House");
});

test("uses approved metadata for created job fields", () => {
  const result = parseJobUploadCsv(validEnhancedHbxl);
  const [job] = toInsertJobs(result.jobs, "upload-1", "fingerprint-1", {
    clientName: "A Real Client",
    projectSiteName: "Spencer House",
    address: "10 High Street",
    postcode: "SG1 1EH",
    projectType: "Refurb",
  });

  assert.equal(job.title, "Spencer House");
  assert.equal(job.clientName, "A Real Client");
  assert.equal(job.location, "10 High Street, SG1 1EH");
  assert.equal(job.description, "Refurb");
  assert.doesNotMatch(job.notes ?? "", /Client Name:/);
  assert.match(job.notes ?? "", /Project \/ Site Name: Spencer House/);
  assert.match(job.notes ?? "", /Import Fingerprint: fingerprint-1/);
});

test("calculates Smart Schedule commercial category totals without changing legacy grandTotal meaning", () => {
  const result = parseJobUploadCsv(`Order Date,Date Required,Build Phase,Type of Resource,Resource Type,Supplier,Product Code,Resource Description,Resource Description Without Price,Order Quantity
2026-08-12,2026-08-13,Setup,Labour,Electrician,Sculpt Electrical,LAB-001,Electrician \u00a325/hour,Electrician,2
2026-08-12,2026-08-13,Setup,Material,Brick,Supplier A,MAT-001,Brick \u00a33/each,Brick,10
2026-08-12,2026-08-13,Setup,Plant,Digger,Hire Co,PLANT-001,Digger \u00a310/day,Digger,4
2026-08-12,2026-08-13,Setup,Subcontractors,Roofer,Roofer Co,SUB-001,Roofer \u00a3100/item,Roofer,1
2026-08-12,2026-08-13,Setup,Misc,Fee,Admin Co,OTH-001,Admin fee \u00a35/each,Admin fee,2`);

  assert.equal(result.valid, true);
  const phaseTaskData = JSON.parse(result.jobs[0].phaseTaskData);

  assert.equal(phaseTaskData.financials.labourTotal, 50);
  assert.equal(phaseTaskData.financials.materialTotal, 30);
  assert.equal(phaseTaskData.financials.plantTotal, 40);
  assert.equal(phaseTaskData.financials.subcontractorTotal, 100);
  assert.equal(phaseTaskData.financials.otherTotal, 10);
  assert.equal(phaseTaskData.financials.totalEstimatedCost, 230);
  assert.equal(phaseTaskData.financials.grandTotal, 80);
});

test("calculates proven Smart Schedule gross profit and margin from retained totals plus Word quote", () => {
  const summary = calculateSmartScheduleCommercialSummary({
    labourTotal: 17537,
    materialTotal: 14794.22,
    plantTotal: 1820,
    subcontractorTotal: 15450,
    otherTotal: 0,
    totalEstimatedCost: 49601.22,
  }, "GBP 71,110.29");

  assert.equal(summary.clientQuote, 71110.29);
  assert.equal(summary.totalEstimatedCost, 49601.22);
  assert.equal(summary.grossProfit, 21509.07);
  assert.equal(summary.marginPercent, 30.25);
});

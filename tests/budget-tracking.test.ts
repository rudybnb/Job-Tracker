import assert from "node:assert/strict";
import test from "node:test";
import { calculateBudgetTrackingCommercialSummary, isActiveBudgetTrackingJob } from "../shared/budget-tracking.ts";

test("active budget tracking jobs are valid booleans for canonical job statuses", () => {
  assert.equal(isActiveBudgetTrackingJob("pending"), true);
  assert.equal(isActiveBudgetTrackingJob("assigned"), true);
  assert.equal(isActiveBudgetTrackingJob("completed"), false);
});

test("Maureen proof values come from Word quote and Smart Schedule estimate", () => {
  const summary = calculateBudgetTrackingCommercialSummary({
    quoted_amount: "GBP 71,110.29",
    phase_task_data: JSON.stringify({
      financials: {
        labourTotal: 17537,
        materialTotal: 14794.22,
        plantTotal: 1820,
        subcontractorTotal: 15450,
        otherTotal: 0,
        totalEstimatedCost: 49601.22,
      },
    }),
    total_actual_cost: "0.00",
  });

  assert.equal(summary.clientQuote, 71110.29);
  assert.equal(summary.estimatedCost, 49601.22);
  assert.equal(summary.forecastGrossProfit, 21509.07);
  assert.equal(summary.forecastMarginPercent, 30.25);
  assert.equal(summary.actualSpent, 0);
});

test("actual spent remains separate from Smart Schedule estimated cost", () => {
  const summary = calculateBudgetTrackingCommercialSummary({
    quoted_amount: "1000.00",
    phase_task_data: JSON.stringify({ financials: { totalEstimatedCost: 600 } }),
    total_actual_cost: "25.00",
  });

  assert.equal(summary.estimatedCost, 600);
  assert.equal(summary.actualSpent, 25);
});

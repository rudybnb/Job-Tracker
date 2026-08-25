import { calculateSmartScheduleCommercialSummary, parseCurrencyAmount } from "./job-upload-import";

export interface BudgetTrackingCommercialInput {
  quotedAmount?: unknown;
  quoted_amount?: unknown;
  phaseTaskData?: unknown;
  phase_task_data?: unknown;
  totalActualCost?: unknown;
  total_actual_cost?: unknown;
}

export interface BudgetTrackingCommercialSummary {
  clientQuote: number | null;
  estimatedCost: number;
  estimatedLabourCost: number;
  estimatedMaterialCost: number;
  estimatedPlantCost: number;
  estimatedSubcontractorCost: number;
  estimatedOtherCost: number;
  forecastGrossProfit: number | null;
  forecastMarginPercent: number | null;
  actualSpent: number;
}

export function isActiveBudgetTrackingJob(status: unknown): boolean {
  const normalized = String(status ?? "").toLowerCase().trim();
  return normalized !== "completed" && normalized !== "cancelled";
}

export function formatMoneyField(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

export function calculateBudgetTrackingCommercialSummary(input: BudgetTrackingCommercialInput): BudgetTrackingCommercialSummary {
  const quotedAmount = input.quotedAmount ?? input.quoted_amount ?? null;
  const phaseTaskData = input.phaseTaskData ?? input.phase_task_data ?? null;
  const actualSpent = parseCurrencyAmount(input.totalActualCost ?? input.total_actual_cost ?? 0) ?? 0;
  const smartSchedule = calculateSmartScheduleCommercialSummary(phaseTaskData, quotedAmount);

  return {
    clientQuote: smartSchedule.clientQuote,
    estimatedCost: smartSchedule.totalEstimatedCost,
    estimatedLabourCost: smartSchedule.labourTotal,
    estimatedMaterialCost: smartSchedule.materialTotal,
    estimatedPlantCost: smartSchedule.plantTotal,
    estimatedSubcontractorCost: smartSchedule.subcontractorTotal,
    estimatedOtherCost: smartSchedule.otherTotal,
    forecastGrossProfit: smartSchedule.grossProfit,
    forecastMarginPercent: smartSchedule.marginPercent,
    actualSpent,
  };
}

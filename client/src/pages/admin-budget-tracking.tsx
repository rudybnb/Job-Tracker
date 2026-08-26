import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buildProcurementCostPlan, type ProcurementSectionKey, type ProcurementCostPlanSection } from "@shared/procurement-cost-plan";
import {
  buildRoomPackageProcurementChecklist,
  type ProcurementAssignment,
  type ProcurementLocation,
  type ProcurementLocationTask,
  type ProcurementStructuredResource,
  type ProcurementTimeFilter,
  type RoomPackageProcurementChecklist,
} from "@shared/weekly-procurement";
import {
  classifyAllRows,
  normalizeProductDescription,
  matchWordProductsToCsv,
  allocateRoomBudgets,
  buildWeeklyPricedBudget,
  buildWeeklyBuyingList,
  type MaterialsUsedRow,
  type WeeklyBuyingItem,
  type WeeklyBuyingSummary,
} from "@shared/procurement-pricing";
import "./hallmark-sweep.css";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  total_spent?: string | null;
  active_jobs?: number | string | null;
  created_at: string;
}

interface Job {
  id: string;
  client_id: string | null;
  job_name: string;
  total_budget: string;
  labour_budget: string;
  material_budget: string;
  plant_budget: string;
  client_quote: string | null;
  quoted_amount: string | null;
  estimated_cost: string;
  estimated_labour_cost: string;
  estimated_material_cost: string;
  estimated_plant_cost: string;
  estimated_subcontractor_cost: string;
  estimated_other_cost: string;
  actual_labour_cost: string;
  actual_material_cost: string;
  actual_plant_cost: string;
  actual_spent: string;
  total_actual_cost: string;
  forecast_gross_profit: string | null;
  forecast_margin_percentage: string | null;
  profit_loss: string;
  profit_loss_percentage: string;
  phase_task_data: string | null;
  status: string;
  start_date: string | null;
  estimated_end_date: string | null;
}

const moneyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function moneyValue(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null | undefined): string {
  return moneyFormatter.format(moneyValue(value));
}

function formatMaybeMoney(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "Not available" : formatMoney(value);
}

function formatMaybePercent(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "Not available" : `${moneyValue(value).toFixed(2)}%`;
}

function isActiveJob(job: Job): boolean {
  const status = job.status.toLowerCase();
  return status !== "completed" && status !== "cancelled";
}

const PROCUREMENT_TAB_ORDER: ProcurementSectionKey[] = ["materials", "labour", "plant", "subcontractors"];
const PROCUREMENT_TAB_LABELS: Record<ProcurementSectionKey, string> = {
  materials: "MATERIALS",
  labour: "LABOUR",
  plant: "PLANT / HIRE",
  subcontractors: "SUBCONTRACTORS",
};
const PROCUREMENT_BUDGET_LABELS: Record<ProcurementSectionKey, string> = {
  materials: "WHOLE JOB MATERIAL BUDGET",
  labour: "WHOLE JOB LABOUR BUDGET",
  plant: "WHOLE JOB PLANT BUDGET",
  subcontractors: "WHOLE JOB SUBCONTRACTOR BUDGET",
};
const PROCUREMENT_TIME_FILTERS: Array<{ key: ProcurementTimeFilter; label: string }> = [
  { key: "next-7-days", label: "NEXT 7 DAYS" },
  { key: "next-week", label: "NEXT WEEK" },
  { key: "all-job", label: "ALL JOB" },
];

function MaterialUpload({ jobId, onImported }: { jobId: string; onImported: () => void }) {
  const [preview, setPreview] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDuplicateInfo(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/jobs/${jobId}/material-costs/preview`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Preview failed");
      const data = await response.json();
      setPreview(data);
    } catch (err) {
      setError("Failed to preview CSV");
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setError(null);
    setDuplicateInfo(null);
    setUploading(true);
    try {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const fd = new FormData();
      if (input?.files?.[0]) {
        fd.append("file", input.files[0]);
      }
      const response = await fetch(`/api/jobs/${jobId}/material-costs/import`, {
        method: "POST",
        body: fd,
      });

      if (response.status === 409) {
        setDuplicateInfo(
          "This exact Materials Used CSV is already attached to this job. No changes were made."
        );
        setPreview(null);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.message || "Failed to import CSV");
      }

      setPreview(null);
      onImported();
    } catch (err: any) {
      setError(err?.message || "Failed to import CSV");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 p-3">
      <h5 className="text-xs font-bold uppercase tracking-wide text-yellow-500 mb-2">Import / Re-import HBXL Materials Used CSV</h5>
      <input type="file" accept=".csv" onChange={handleFile} className="text-sm text-slate-400 mb-2" />
      {uploading && <p className="text-xs text-slate-400">Processing...</p>}
      {duplicateInfo && (
        <div className="mt-2 rounded-lg border border-blue-500/40 bg-blue-950/30 p-3 text-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-blue-400">ALREADY IMPORTED</span>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            {duplicateInfo}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {preview && (
        <div className="mt-2 rounded border border-slate-600 bg-slate-800 p-2">
          <div className="text-xs text-slate-300 mb-1 font-medium">{preview.filename}</div>
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div><span className="text-slate-400">Rows:</span> <span className="text-white font-mono">{preview.rowCount}</span></div>
            <div><span className="text-slate-400">Physical:</span> <span className="text-green-400 font-mono">£{preview.physicalProductTotal.toLocaleString()}</span></div>
            <div><span className="text-slate-400">Allowances:</span> <span className="text-yellow-400 font-mono">£{preview.allowanceTotal.toLocaleString()}</span></div>
          </div>
          <div className="text-xs text-white font-bold mb-2">Grand Total: <span className="font-mono">£{preview.grandTotal.toLocaleString()}</span></div>
          <button
            type="button"
            onClick={handleImport}
            disabled={uploading}
            className="rounded border border-green-500 bg-green-500/20 px-3 py-1 text-xs font-bold text-green-400 hover:bg-green-500/30 disabled:opacity-50"
          >
            {uploading ? "Importing..." : "Confirm Import"}
          </button>
        </div>
      )}
    </div>
  );
}

interface ActualPurchaseRecord {
  id: string;
  jobId: string;
  budgetResourceId: string | null;
  materialKey: string;
  materialDescription: string;
  supplierName: string | null;
  supplierUnitPrice: string;
  actualQuantity: string;
  actualTotal: string;
  purchaseDate: string | null;
  paymentStatus: string;
  notes: string | null;
  createdAt: string;
}

function MaterialsCostSheet({
  jobId,
  materialCostRows = [],
  materialCostActuals = [],
  onActualsSaved,
  procurementAssignments = [],
  procurementLocations = [],
  procurementTasks = [],
  procurementStructuredResources = [],
  activeTimeFilter = "next-7-days",
  onTimeFilterChange,
}: {
  jobId: string;
  materialCostRows: any[];
  materialCostActuals: ActualPurchaseRecord[];
  onActualsSaved: () => void;
  procurementAssignments?: ProcurementAssignment[];
  procurementLocations?: ProcurementLocation[];
  procurementTasks?: ProcurementLocationTask[];
  procurementStructuredResources?: ProcurementStructuredResource[];
  activeTimeFilter?: ProcurementTimeFilter;
  onTimeFilterChange?: (filter: ProcurementTimeFilter) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhase, setSelectedPhase] = useState<string>("ALL");
  const [addingPurchaseForMaterial, setAddingPurchaseForMaterial] = useState<any | null>(null);
  const [expandedPurchasesForDesc, setExpandedPurchasesForDesc] = useState<string | null>(null);

  // Form state for adding purchase
  const [formSupplier, setFormSupplier] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formStatus, setFormStatus] = useState("UNPAID");
  const [formNotes, setFormNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group actual purchases by stable materialKey
  const purchasesByMaterial = useMemo(() => {
    const map = new Map<string, ActualPurchaseRecord[]>();
    for (const act of materialCostActuals) {
      const key = act.materialKey || normalizeProductDescription(act.materialDescription);
      const list = map.get(key) ?? [];
      list.push(act);
      map.set(key, list);
    }
    return map;
  }, [materialCostActuals]);

  // Separate Physical Products vs Broad Allowances
  const physicalRows = useMemo(
    () => materialCostRows.filter((r) => r.materialRowKind === "PHYSICAL_PRODUCT"),
    [materialCostRows]
  );
  const allowanceRows = useMemo(
    () => materialCostRows.filter((r) => r.materialRowKind === "BROAD_ALLOWANCE"),
    [materialCostRows]
  );

  // Convert raw materialCostRows into typed MaterialsUsedRow[] for matching & allocation
  const csvRows: MaterialsUsedRow[] = useMemo(() => {
    return materialCostRows.map((r: any) => ({
      buildPhase: r.buildPhase,
      description: r.description,
      unitRate: parseFloat(r.unitRate) || 0,
      unit: r.unit,
      qtyExcludingWastage: parseFloat(r.qtyExcludingWastage) || 0,
      wastageQty: parseFloat(r.wastageQty) || 0,
      orderQtyIncludingWastage: parseFloat(r.orderQtyIncludingWastage) || 0,
      costExcludingWastage: parseFloat(r.costExcludingWastage) || 0,
      wastageCost: parseFloat(r.wastageCost) || 0,
      totalCostIncludingWastage: parseFloat(r.totalCostIncludingWastage) || 0,
    }));
  }, [materialCostRows]);

  // Product matches from Word descriptions
  const productMatches = useMemo(() => {
    if (!procurementStructuredResources.length || !csvRows.length) return [];
    const wordDescs = Array.from(new Set(
      procurementStructuredResources
        .filter((r) => r.sourceValueKind === "quantity" && r.productDescription)
        .map((r) => r.productDescription)
    ));
    return matchWordProductsToCsv(wordDescs, csvRows);
  }, [procurementStructuredResources, csvRows]);

  // Room package checklist for active period
  const roomPackageChecklist = useMemo(() => {
    return buildRoomPackageProcurementChecklist({
      jobId,
      assignments: procurementAssignments,
      locations: procurementLocations,
      tasks: procurementTasks,
      structuredResources: procurementStructuredResources,
      filter: activeTimeFilter,
    });
  }, [jobId, procurementAssignments, procurementLocations, procurementTasks, procurementStructuredResources, activeTimeFilter]);

  // Proportional room allocations for scheduled tasks in active period
  const allocations = useMemo(() => {
    if (!roomPackageChecklist.length || !productMatches.length) return [];
    const scheduledTaskIds = new Set(roomPackageChecklist.map((i) => i.locationTaskId));
    return allocateRoomBudgets(procurementStructuredResources, productMatches, scheduledTaskIds);
  }, [procurementStructuredResources, productMatches, roomPackageChecklist]);

  // Weekly buying summary & items
  const weeklyBuyingSummary: WeeklyBuyingSummary = useMemo(() => {
    return buildWeeklyBuyingList(
      allocations,
      roomPackageChecklist,
      productMatches,
      csvRows,
      materialCostActuals
    );
  }, [allocations, roomPackageChecklist, productMatches, csvRows, materialCostActuals]);

  // Available build phases for dropdown filter (whole job)
  const buildPhases = useMemo(() => {
    const phases = new Set<string>();
    for (const r of physicalRows) {
      if (r.buildPhase) phases.add(r.buildPhase);
    }
    return Array.from(phases);
  }, [physicalRows]);

  // Filtered physical rows (whole job)
  const filteredPhysicalRows = useMemo(() => {
    return physicalRows.filter((r) => {
      const matchPhase = selectedPhase === "ALL" || r.buildPhase === selectedPhase;
      const matchSearch =
        !searchTerm.trim() ||
        r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.buildPhase && r.buildPhase.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchPhase && matchSearch;
    });
  }, [physicalRows, selectedPhase, searchTerm]);

  // Handle open Add Purchase modal/form from Whole-Job row
  const handleOpenAddPurchase = (row: any) => {
    const normKey = normalizeProductDescription(row.description);
    const existing = (purchasesByMaterial.get(normKey) ?? []).filter((p) => p.paymentStatus !== "CANCELLED");
    const totalPurchased = existing.reduce((s, p) => s + parseFloat(p.actualQuantity || "0"), 0);
    const planned = parseFloat(row.orderQtyIncludingWastage || "0");
    const remaining = Math.max(planned - totalPurchased, 0);

    setAddingPurchaseForMaterial(row);
    setFormSupplier("");
    setFormPrice(row.unitRate ? parseFloat(row.unitRate).toFixed(2) : "");
    setFormQty(remaining > 0 ? remaining.toFixed(2) : planned.toFixed(2));
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormStatus("UNPAID");
    setFormNotes("");
  };

  // Handle open Add Purchase modal/form from Period Buying List item
  const handleOpenAddPurchaseForWeeklyItem = (item: WeeklyBuyingItem) => {
    const matchedPhysicalRow = physicalRows.find(
      (r) => normalizeProductDescription(r.description) === item.materialKey
    );
    const rowObj = matchedPhysicalRow ?? {
      id: null,
      description: item.description,
      unitRate: item.unitRate ? item.unitRate.toString() : "0",
      unit: item.unit,
      orderQtyIncludingWastage: item.qtyNeeded.toString(),
      totalCostIncludingWastage: item.hbxlBudget.toString(),
    };

    setAddingPurchaseForMaterial(rowObj);
    setFormSupplier("");
    setFormPrice(item.unitRate ? item.unitRate.toFixed(2) : "");
    setFormQty(item.stillToBuyQty > 0 ? item.stillToBuyQty.toFixed(2) : item.qtyNeeded.toFixed(2));
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormStatus("UNPAID");
    setFormNotes("");
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingPurchaseForMaterial || !formPrice || !formQty) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/material-costs/actuals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetResourceId: addingPurchaseForMaterial.id || null,
          materialKey: normalizeProductDescription(addingPurchaseForMaterial.description),
          materialDescription: addingPurchaseForMaterial.description,
          supplierName: formSupplier ? formSupplier.trim() : null,
          supplierUnitPrice: formPrice,
          actualQuantity: formQty,
          purchaseDate: formDate,
          paymentStatus: formStatus,
          notes: formNotes ? formNotes.trim() : null,
        }),
      });

      if (res.ok) {
        setAddingPurchaseForMaterial(null);
        onActualsSaved();
      }
    } catch (err) {
      console.error("Save purchase failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePurchase = async (purchaseId: string) => {
    if (!confirm("Are you sure you want to remove this purchase record?")) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/material-costs/actuals/${purchaseId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onActualsSaved();
      }
    } catch (err) {
      console.error("Delete purchase failed:", err);
    }
  };

  // Financial Totals Calculations (Whole Job)
  const hbxlPhysicalBudget = useMemo(
    () => physicalRows.reduce((sum, r) => sum + moneyValue(r.totalCostIncludingWastage), 0),
    [physicalRows]
  );

  const activePurchasesAll = useMemo(() => {
    return materialCostActuals.filter((act) => act.paymentStatus !== "CANCELLED");
  }, [materialCostActuals]);

  const actualMaterialSpend = useMemo(() => {
    return activePurchasesAll.reduce((sum, act) => sum + moneyValue(act.actualTotal), 0);
  }, [activePurchasesAll]);

  const totalPurchaseSaving = useMemo(() => {
    return physicalRows.reduce((sum, r) => {
      const normKey = normalizeProductDescription(r.description);
      const allPurchases = purchasesByMaterial.get(normKey) ?? [];
      const activePurchases = allPurchases.filter((p) => p.paymentStatus !== "CANCELLED");
      if (activePurchases.length === 0) return sum;
      const purchasedQty = activePurchases.reduce((s, p) => s + parseFloat(p.actualQuantity || "0"), 0);
      const actualSpend = activePurchases.reduce((s, p) => s + parseFloat(p.actualTotal || "0"), 0);
      const hbxlRate = parseFloat(r.unitRate || "0");
      const hbxlBenchmark = purchasedQty * hbxlRate;
      return sum + (hbxlBenchmark - actualSpend);
    }, 0);
  }, [physicalRows, purchasesByMaterial]);

  const totalBudgetRemaining = hbxlPhysicalBudget - actualMaterialSpend;
  const allowanceBudget = useMemo(
    () => allowanceRows.reduce((sum, r) => sum + moneyValue(r.totalCostIncludingWastage), 0),
    [allowanceRows]
  );
  const totalHbxlReport = hbxlPhysicalBudget + allowanceBudget;

  const countPurchasedLines = useMemo(() => {
    return physicalRows.filter((r) => {
      const normKey = normalizeProductDescription(r.description);
      const list = purchasesByMaterial.get(normKey) ?? [];
      return list.some((p) => p.paymentStatus !== "CANCELLED");
    }).length;
  }, [physicalRows, purchasesByMaterial]);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TOP PERIOD SELECTOR                                                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-yellow-500">Materials Procurement</div>
          <h3 className="text-base font-bold text-white">Weekly Buying Plan</h3>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Procurement period selector">
          {PROCUREMENT_TIME_FILTERS.map((filter) => {
            const selected = activeTimeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onTimeFilterChange?.(filter.key)}
                className={`rounded-lg border px-3.5 py-1.5 text-xs font-bold tracking-wide transition-all ${
                  selected
                    ? "border-yellow-500 bg-yellow-500 text-slate-950 shadow-md font-extrabold"
                    : "border-slate-600 bg-slate-800 text-slate-200 hover:border-yellow-500/70"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TOP SUMMARY — ONLY THREE LARGE VALUES FOR THE SELECTED PERIOD       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TOP SUMMARY — ONLY THREE LARGE VALUES FOR THE SELECTED PERIOD       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {(() => {
        const hasUnpriced = weeklyBuyingSummary.unpricedMaterialsCount > 0;
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Card 1: PLANNED MATERIAL SPEND / PLANNED SPEND — PRICED ITEMS */}
            <div className="rounded-lg border border-yellow-500/50 bg-slate-900 p-4 shadow">
              <div className="text-[11px] font-bold uppercase tracking-wider text-yellow-500">
                {hasUnpriced ? "Planned Spend — Priced Items" : "Planned Material Spend"}
              </div>
              <div className="mt-1 text-2xl font-black text-white font-mono">{formatMoney(weeklyBuyingSummary.plannedSpend)}</div>
              <div className="mt-1 text-xs text-slate-400">
                {hasUnpriced
                  ? `${weeklyBuyingSummary.unpricedMaterialsCount} ${weeklyBuyingSummary.unpricedMaterialsCount === 1 ? "item still needs" : "items still need"} pricing`
                  : `${roomPackageChecklist.length} scheduled ${roomPackageChecklist.length === 1 ? "package" : "packages"} (${weeklyBuyingSummary.totalMaterialsCount} ${weeklyBuyingSummary.totalMaterialsCount === 1 ? "material" : "materials"})`}
              </div>
            </div>

            {/* Card 2: ACTUAL PURCHASED */}
            <div className="rounded-lg border border-blue-500/50 bg-slate-900 p-4 shadow">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Actual Purchased</div>
              <div className="mt-1 text-2xl font-black text-blue-300 font-mono">{formatMoney(weeklyBuyingSummary.actualPurchased)}</div>
              <div className="mt-1 text-xs text-slate-400">
                Attributable purchases for period materials
              </div>
            </div>

            {/* Card 3: REMAINING TO BUY / REMAINING TO BUY — PRICED ITEMS */}
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 shadow">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                {hasUnpriced ? "Remaining to Buy — Priced Items" : "Remaining to Buy"}
              </div>
              <div className="mt-1 text-2xl font-black text-white font-mono">{formatMoney(weeklyBuyingSummary.remainingToBuyBudget)}</div>
              <div className="mt-1 text-xs text-slate-400">
                {hasUnpriced
                  ? `+ ${weeklyBuyingSummary.unpricedMaterialsCount} unpriced ${weeklyBuyingSummary.unpricedMaterialsCount === 1 ? "item" : "items"}`
                  : `${weeklyBuyingSummary.remainingMaterialsCount} of ${weeklyBuyingSummary.totalMaterialsCount} ${weeklyBuyingSummary.totalMaterialsCount === 1 ? "material" : "materials"} left to buy`}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PRIMARY BUYING LIST: WHAT I NEED TO BUY                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 shadow">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-white">What I Need to Buy</h4>
            <p className="text-xs text-slate-400">
              Materials required for work scheduled in {PROCUREMENT_TIME_FILTERS.find((f) => f.key === activeTimeFilter)?.label}
            </p>
          </div>
          <div className="text-xs text-slate-400">
            <span className="font-mono text-white font-bold">{weeklyBuyingSummary.items.length}</span> {weeklyBuyingSummary.items.length === 1 ? "material" : "materials"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/90 text-slate-300 font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-3 min-w-[220px]">Material</th>
                <th className="py-2.5 px-2 w-28 text-right">Qty Needed</th>
                <th className="py-2.5 px-2 w-28 text-right">HBXL Budget</th>
                <th className="py-2.5 px-2 w-24 text-right">Bought</th>
                <th className="py-2.5 px-2 w-28 text-right">Still to Buy</th>
                <th className="py-2.5 px-3 w-32 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {weeklyBuyingSummary.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No materials required for work packages scheduled in this period.
                  </td>
                </tr>
              ) : (
                weeklyBuyingSummary.items.map((item) => (
                  <tr key={item.materialKey} className="hover:bg-slate-800/40 transition-colors">
                    {/* Material */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-white leading-tight">{item.description}</div>
                      {item.neededForRooms.length > 0 && (
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                          Needed for: {item.neededForRooms.join(" · ")}
                        </div>
                      )}
                    </td>

                    {/* Qty Needed */}
                    <td className="py-2.5 px-2 text-right font-mono text-slate-200">
                      {item.qtyNeeded.toFixed(2)} <span className="text-slate-500 text-[10px]">{item.unit}</span>
                    </td>

                    {/* HBXL Budget */}
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-yellow-400">
                      {item.isPriced ? (
                        formatMoney(item.hbxlBudget)
                      ) : (
                        <span className="text-amber-400 font-bold text-[10px] uppercase tracking-wider">
                          PRICE NEEDED
                        </span>
                      )}
                    </td>

                    {/* Bought */}
                    <td className="py-2.5 px-2 text-right font-mono">
                      {item.qtyBought > 0 ? (
                        <div>
                          <span className="text-blue-300 font-semibold">{item.qtyBought.toFixed(2)}</span>
                          <span className="text-slate-500 text-[10px] ml-0.5">{item.unit}</span>
                        </div>
                      ) : (
                        <span className="text-slate-600">0</span>
                      )}
                    </td>

                    {/* Still to Buy */}
                    <td className="py-2.5 px-2 text-right font-mono">
                      {item.isFullyBought ? (
                        <span className="inline-flex items-center text-green-400 font-bold text-[11px]">
                          ✓ Complete
                        </span>
                      ) : (
                        <div>
                          <span className="text-white font-semibold">{item.stillToBuyQty.toFixed(2)}</span>
                          <span className="text-slate-500 text-[10px] ml-0.5">{item.unit}</span>
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenAddPurchaseForWeeklyItem(item)}
                          className="rounded border border-yellow-500/50 bg-yellow-500/10 px-2.5 py-1 text-[11px] font-bold text-yellow-400 hover:bg-yellow-500/20 transition-all"
                        >
                          + Purchase
                        </button>
                        {item.qtyBought > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedPurchasesForDesc(expandedPurchasesForDesc === item.description ? null : item.description)}
                            className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                            title="View Purchases"
                          >
                            {expandedPurchasesForDesc === item.description ? "▲" : "▼"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EXPANDED PURCHASE DETAIL DRAWER                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {expandedPurchasesForDesc && (() => {
        const normKey = normalizeProductDescription(expandedPurchasesForDesc);
        const list = purchasesByMaterial.get(normKey) ?? [];
        return (
          <div className="rounded-lg border border-blue-500/40 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wide">Purchase History: {expandedPurchasesForDesc}</h4>
                <p className="text-xs text-slate-400">{list.length} recorded supplier orders</p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedPurchasesForDesc(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                ✕ Close
              </button>
            </div>
            <div className="space-y-2">
              {list.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950 p-2.5 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-white">{p.supplierName || "Supplier Unspecified"}</div>
                    <div className="text-slate-400 text-[11px]">
                      Date: {p.purchaseDate || "N/A"} · Status: <span className={p.paymentStatus === "PAID" ? "text-green-400 font-bold" : p.paymentStatus === "CANCELLED" ? "text-red-400 font-bold" : "text-amber-400 font-bold"}>{p.paymentStatus}{p.paymentStatus === "CANCELLED" ? " (EXCLUDED FROM TOTALS)" : ""}</span>
                      {p.notes ? ` · Note: ${p.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono">
                      <span className="text-slate-400">{p.actualQuantity} @ £{parseFloat(p.supplierUnitPrice).toFixed(2)} = </span>
                      <span className="font-bold text-blue-300 text-sm">£{parseFloat(p.actualTotal).toFixed(2)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePurchase(p.id)}
                      className="rounded bg-red-950/40 border border-red-800/40 px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-900/60"
                      title="Delete purchase"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ADD PURCHASE MODAL                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {addingPurchaseForMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Record Material Purchase</h3>
                <p className="text-xs text-yellow-500 font-medium mt-0.5">{addingPurchaseForMaterial.description}</p>
                <p className="text-[11px] text-slate-400">HBXL Budget: £{parseFloat(addingPurchaseForMaterial.totalCostIncludingWastage || "0").toFixed(2)} ({addingPurchaseForMaterial.orderQtyIncludingWastage} {addingPurchaseForMaterial.unit || "Each"} @ £{parseFloat(addingPurchaseForMaterial.unitRate || "0").toFixed(2)})</p>
              </div>
              <button
                type="button"
                onClick={() => setAddingPurchaseForMaterial(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Supplier Name</label>
                <input
                  type="text"
                  placeholder="e.g. Travis Perkins, Screwfix, Dulux"
                  value={formSupplier}
                  onChange={(e) => setFormSupplier(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:border-yellow-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Supplier Unit Price (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white placeholder-slate-600 focus:border-yellow-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Quantity ({addingPurchaseForMaterial.unit || "Each"})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.0001"
                    required
                    placeholder={addingPurchaseForMaterial.orderQtyIncludingWastage}
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white placeholder-slate-600 focus:border-yellow-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded bg-slate-950/80 border border-slate-800 p-2.5 flex items-center justify-between">
                <span className="text-slate-400 font-semibold">Calculated Total:</span>
                <span className="text-base font-black font-mono text-blue-300">
                  {formPrice && formQty ? formatMoney(parseFloat(formPrice) * parseFloat(formQty)) : "£0.00"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Purchase Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-yellow-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Payment Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-yellow-500 focus:outline-none"
                  >
                    <option value="UNPAID">Unpaid</option>
                    <option value="PAID">Paid</option>
                    <option value="PARTIALLY_PAID">Partially Paid</option>
                    <option value="CANCELLED">Cancelled (Excluded from spend)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Order reference, invoice #, delivery notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-white placeholder-slate-600 focus:border-yellow-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddingPurchaseForMaterial(null)}
                  className="rounded border border-slate-700 bg-slate-800 px-4 py-2 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded bg-yellow-500 px-4 py-2 text-slate-950 font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Confirm Purchase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* COLLAPSED SECTION 1: FULL JOB MATERIAL BUDGET & MATERIAL LIST        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <details className="rounded-lg border border-slate-700 bg-slate-900/90 p-4 text-slate-300">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-yellow-500 select-none flex items-center justify-between">
          <span>▼ Full Job Material Budget & Material List ({physicalRows.length} items)</span>
          <span className="font-mono text-yellow-400 font-normal">{formatMoney(hbxlPhysicalBudget)}</span>
        </summary>

        <div className="mt-4 space-y-4 pt-3 border-t border-slate-800">
          {/* Top Money Summary Header (Whole Job) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* HBXL Physical Material Budget */}
            <div className="rounded-lg border border-yellow-500/50 bg-slate-900 p-3 shadow">
              <div className="text-[11px] font-bold uppercase tracking-wider text-yellow-500">HBXL Physical Budget</div>
              <div className="mt-1 text-2xl font-black text-white font-mono">{formatMoney(hbxlPhysicalBudget)}</div>
              <div className="mt-1 text-xs text-slate-400">{physicalRows.length} physical material items</div>
            </div>

            {/* Actual / Committed Material Spend */}
            <div className="rounded-lg border border-blue-500/50 bg-slate-900 p-3 shadow">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Actual Material Spend</div>
              <div className="mt-1 text-2xl font-black text-blue-300 font-mono">{formatMoney(actualMaterialSpend)}</div>
              <div className="mt-1 text-xs text-slate-400">{activePurchasesAll.length} orders on {countPurchasedLines} lines</div>
            </div>

            {/* True Saving / Overspend on Purchases Made */}
            <div className={`rounded-lg border p-3 shadow ${totalPurchaseSaving >= 0 ? "border-green-500/50 bg-green-950/20" : "border-red-500/50 bg-red-950/20"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${totalPurchaseSaving >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {totalPurchaseSaving >= 0 ? "Purchase Saving" : "Purchase Overspend"}
                </span>
                <Badge variant={totalPurchaseSaving >= 0 ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                  {totalPurchaseSaving >= 0 ? "SAVING" : "OVERSPEND"}
                </Badge>
              </div>
              <div className={`mt-1 text-2xl font-black font-mono ${totalPurchaseSaving >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalPurchaseSaving >= 0 ? `+${formatMoney(totalPurchaseSaving)}` : `-${formatMoney(Math.abs(totalPurchaseSaving))}`}
              </div>
              <div className="mt-1 text-xs text-slate-400">Vs HBXL benchmark on purchased qty</div>
            </div>

            {/* Remaining Budget */}
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 shadow">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Budget Remaining</div>
              <div className="mt-1 text-2xl font-black text-white font-mono">{formatMoney(totalBudgetRemaining)}</div>
              <div className="mt-1 text-xs text-slate-500">Unspent physical allocation</div>
            </div>
          </div>

          {/* Secondary Allowance & Full Report Card */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-yellow-400 uppercase tracking-wide">Allowance Budget:</span>
              <span className="font-mono font-bold text-white text-sm">{formatMoney(allowanceBudget)}</span>
              <span className="text-slate-400">(Carpeting, Wood & Vinyl Flooring)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-300 uppercase tracking-wide">Total HBXL Report:</span>
              <span className="font-mono font-bold text-yellow-400 text-sm">{formatMoney(totalHbxlReport)}</span>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              <input
                type="text"
                placeholder="Search material description or phase..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-yellow-500 focus:outline-none flex-1 max-w-md"
              />
              <select
                value={selectedPhase}
                onChange={(e) => setSelectedPhase(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-yellow-500 focus:outline-none"
              >
                <option value="ALL">All Build Phases ({physicalRows.length})</option>
                {buildPhases.map((phase) => (
                  <option key={phase} value={phase}>{phase}</option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-400">
              Showing <span className="font-mono text-white">{filteredPhysicalRows.length}</span> of {physicalRows.length} physical rows
            </div>
          </div>

          {/* Whole-Job Primary Material Sheet Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 shadow">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/90 text-slate-300 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-2 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Material Description</th>
                  <th className="py-2.5 px-2 w-20 text-right">Planned</th>
                  <th className="py-2.5 px-2 w-20 text-right">Purchased</th>
                  <th className="py-2.5 px-2 w-20 text-right">Remaining</th>
                  <th className="py-2.5 px-2 w-20 text-right">HBXL Rate</th>
                  <th className="py-2.5 px-2 w-24 text-right">HBXL Budget</th>
                  <th className="py-2.5 px-2 w-24 text-right">Actual Spend</th>
                  <th className="py-2.5 px-3 w-36 text-right">Saving / Overspend</th>
                  <th className="py-2.5 px-2 w-28 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPhysicalRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      No physical materials match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPhysicalRows.map((row) => {
                    const normKey = normalizeProductDescription(row.description);
                    const allPurchases = purchasesByMaterial.get(normKey) ?? [];
                    const activePurchases = allPurchases.filter((p) => p.paymentStatus !== "CANCELLED");

                    const plannedQty = parseFloat(row.orderQtyIncludingWastage || "0");
                    const hbxlRate = parseFloat(row.unitRate || "0");
                    const hbxlBudget = moneyValue(row.totalCostIncludingWastage);

                    const purchasedQty = activePurchases.reduce((s, p) => s + parseFloat(p.actualQuantity || "0"), 0);
                    const actualSpend = activePurchases.reduce((s, p) => s + parseFloat(p.actualTotal || "0"), 0);
                    const hasActivePurchases = activePurchases.length > 0;

                    const remainingQty = Math.max(plannedQty - purchasedQty, 0);
                    const isOverbought = purchasedQty > plannedQty;

                    const hbxlBenchmarkPurchased = purchasedQty * hbxlRate;
                    const truePurchaseSaving = hasActivePurchases ? (hbxlBenchmarkPurchased - actualSpend) : null;
                    const isSaving = truePurchaseSaving !== null && truePurchaseSaving >= 0;
                    const budgetRemaining = hbxlBudget - actualSpend;
                    const isExpanded = expandedPurchasesForDesc === row.description;

                    return (
                      <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-2 text-center text-slate-500 font-mono text-[11px]">{row.sourceRowOrder}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white leading-tight">{row.description}</div>
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">{row.buildPhase}</div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-300">
                          {plannedQty.toFixed(2)} <span className="text-slate-500 text-[10px]">{row.unit}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono">
                          {hasActivePurchases ? (
                            <div>
                              <span className="text-blue-300 font-semibold">{purchasedQty.toFixed(2)}</span>
                              <span className="text-slate-500 text-[10px] ml-0.5">{row.unit}</span>
                              {isOverbought && (
                                <span className="block text-[9px] text-amber-400 font-bold uppercase">Over planned</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-300">
                          {remainingQty.toFixed(2)} <span className="text-slate-500 text-[10px]">{row.unit}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-300">£{hbxlRate.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-yellow-400">£{hbxlBudget.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold">
                          {hasActivePurchases ? (
                            <div>
                              <span className="text-blue-300">£{actualSpend.toFixed(2)}</span>
                              <span className="block text-[10px] text-slate-400">
                                {activePurchases.length === 1 ? (activePurchases[0].supplierName || "1 order") : `${activePurchases.length} orders`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {truePurchaseSaving !== null ? (
                            <div>
                              <span className={`font-bold text-xs ${isSaving ? "text-green-400" : "text-red-400"}`}>
                                {isSaving ? `+£${truePurchaseSaving.toFixed(2)} SAVING` : `-£${Math.abs(truePurchaseSaving).toFixed(2)} OVERSPEND`}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                Rem. Bud: £{budgetRemaining.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenAddPurchase(row)}
                              className="rounded border border-yellow-500/50 bg-yellow-500/10 px-2 py-1 text-[11px] font-bold text-yellow-400 hover:bg-yellow-500/20 transition-all"
                            >
                              + Purchase
                            </button>
                            {allPurchases.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedPurchasesForDesc(isExpanded ? null : row.description)}
                                className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                                title="View Purchases"
                              >
                                {isExpanded ? "▲" : "▼"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Broad Allowances Section */}
          {allowanceRows.length > 0 && (
            <section className="rounded-lg border border-yellow-500/40 bg-yellow-950/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wide text-yellow-500">HBXL Broad Allowances (Lump-Sum Provisional Items)</h4>
                  <p className="text-xs text-slate-400">Lump-sum finishings allowances from the client estimate; tracked separately from physical trade buying.</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Total Allowance: </span>
                  <span className="text-sm font-bold text-yellow-400 font-mono">{formatMoney(allowanceBudget)}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                {allowanceRows.map((a) => (
                  <div key={a.id} className="rounded-md border border-slate-700 bg-slate-900/80 p-3 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">{a.description}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{a.buildPhase}</div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Provisional Budget:</span>
                      <span className="text-xs font-bold text-yellow-400 font-mono">£{parseFloat(a.totalCostIncludingWastage).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </details>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* COLLAPSED SECTION 2: WEEKLY / ROOM MATERIAL PLANNING                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <details className="rounded-lg border border-slate-700 bg-slate-900/90 p-4 text-slate-300">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-yellow-500 select-none">
          ▼ Weekly / Room Material Planning ({roomPackageChecklist.length} packages scheduled in {PROCUREMENT_TIME_FILTERS.find((f) => f.key === activeTimeFilter)?.label})
        </summary>
        <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
          <div className="text-xs text-slate-400">
            <span className="text-yellow-500 font-bold uppercase tracking-wide">PLANNED WORK:</span> {roomPackageChecklist.length} packages scheduled.
          </div>
          <p className="text-xs text-slate-400">
            Room/package resource lists come from the Word quote. Smart Schedule pricing is currently project-level and is not allocated to individual rooms.
          </p>
          <RoomPackageChecklist
            items={roomPackageChecklist}
            materialCostRows={materialCostRows}
            allStructuredResources={procurementStructuredResources}
          />
        </div>
      </details>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* COLLAPSED SECTION 3: MATERIALS USED CSV IMPORT & REVISIONS           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <details className="rounded-lg border border-slate-700 bg-slate-900/90 p-4 text-slate-300">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-yellow-500 select-none">
          ▼ Materials Used CSV Import & Revisions
        </summary>
        <div className="mt-4 pt-3 border-t border-slate-800">
          <MaterialUpload
            jobId={jobId}
            onImported={onActualsSaved}
          />
        </div>
      </details>
    </div>
  );
}

function ResourceQuantity({ resource }: { resource: ProcurementStructuredResource }) {
  if (resource.sourceValueKind === "quantity") {
    return <span className="font-mono text-xs text-green-400">{resource.quantity} {resource.unit}</span>;
  }
  if (resource.sourceValueKind === "currency_unclassified") {
    return (
      <span className="text-xs text-slate-500">
        Source allowance: <span className="font-mono">{resource.sourceValueRaw}</span>
        <span className="ml-1 italic">Unconfirmed</span>
      </span>
    );
  }
  return <span className="text-xs italic text-slate-500">To confirm</span>;
}

function RoomPackageChecklist({ 
  items,
  materialCostRows,
  allStructuredResources,
}: { 
  items: RoomPackageProcurementChecklist[];
  materialCostRows?: any[];
  allStructuredResources?: ProcurementStructuredResource[];
}) {
  const pricedBudget = useMemo(() => {
    if (!materialCostRows?.length || !allStructuredResources?.length || !items.length) return null;
    
    const csvRows: MaterialsUsedRow[] = materialCostRows.map((r: any) => ({
      buildPhase: r.buildPhase,
      description: r.description,
      unitRate: parseFloat(r.unitRate) || 0,
      unit: r.unit,
      qtyExcludingWastage: parseFloat(r.qtyExcludingWastage) || 0,
      wastageQty: parseFloat(r.wastageQty) || 0,
      orderQtyIncludingWastage: parseFloat(r.orderQtyIncludingWastage) || 0,
      costExcludingWastage: parseFloat(r.costExcludingWastage) || 0,
      wastageCost: parseFloat(r.wastageCost) || 0,
      totalCostIncludingWastage: parseFloat(r.totalCostIncludingWastage) || 0,
    }));
    
    const classified = classifyAllRows(csvRows);
    const scheduledTaskIds = new Set(items.map(i => i.locationTaskId));
    const productMatches = matchWordProductsToCsv(
      Array.from(new Set(allStructuredResources.filter(r => r.sourceValueKind === "quantity").map(r => r.productDescription))),
      csvRows
    );
    const allocations = allocateRoomBudgets(allStructuredResources, productMatches, scheduledTaskIds);
    return buildWeeklyPricedBudget(allocations, productMatches, classified);
  }, [materialCostRows, allStructuredResources, items]);

  return (
    <section className="rounded-lg border border-yellow-500/60 bg-yellow-950/20 p-3">
      <div className="mb-3">
        <h4 className="text-sm font-bold uppercase tracking-wide text-yellow-500">Room / Package Procurement Checklist</h4>
        <p className="mt-1 text-xs text-slate-400">Assignment dates determine visibility. Word references are unpriced and quantities must be confirmed.</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No structured room/work packages are scheduled in this period.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.locationTaskId} className="rounded-md border border-slate-700 bg-slate-900 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-yellow-500">{item.locationName}</div>
                  <div className="font-semibold text-white">{item.workPackage}</div>
                </div>
                <div className="text-xs text-slate-400">Assigned: {item.startDate} to {item.endDate}</div>
              </div>
              {item.structuredResources.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {item.structuredResources.map((resource) => (
                    <li key={resource.id ?? `${item.locationTaskId}-${resource.sourceOrder}`} className="flex flex-col gap-0.5 rounded bg-slate-800/50 px-2 py-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium text-white">{resource.usageDescription}</span>
                        <ResourceQuantity resource={resource} />
                      </div>
                      <div className="text-xs text-slate-400">{resource.productDescription}</div>
                    </li>
                  ))}
                </ul>
              ) : item.resources.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {item.resources.map((resource, index) => (
                    <li key={`${item.locationTaskId}-${resource}-${index}`} className="flex items-start gap-2 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                      <span className="text-slate-300">{resource}</span>
                      <span className="ml-auto shrink-0 text-xs italic text-slate-500">Quantity: To confirm</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No Word resource references retained for this package.</p>
              )}
              {pricedBudget ? (() => {
                const itemAllocations = pricedBudget.pricedItems.filter(a => a.locationTaskId === item.locationTaskId);
                if (itemAllocations.length === 0) {
                  return (
                    <div className="mt-3 border-t border-slate-700 pt-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Package Budget</div>
                      <div className="text-sm font-semibold text-white">Not allocated from source</div>
                      <p className="mt-1 text-xs text-slate-500">
                        HBXL/Smart Schedule cost exists at project level but cannot yet be reliably allocated to this room/package.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="mt-2 rounded border border-green-500/30 bg-green-950/20 p-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-green-500 mb-1">HBXL Priced Materials</div>
                    <div className="space-y-1">
                      {itemAllocations.map(a => (
                        <div key={`${a.locationTaskId}-${a.wordProductDescription}`} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 truncate">{a.wordProductDescription}</span>
                          <span className="ml-2 shrink-0 font-mono text-green-400">{a.allocatedOrderQty} {a.unit} — £{a.allocatedBudget.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })() : (
                <div className="mt-3 border-t border-slate-700 pt-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Package Budget</div>
                  <div className="text-sm font-semibold text-white">Not allocated from source</div>
                  <p className="mt-1 text-xs text-slate-500">
                    HBXL/Smart Schedule cost exists at project level but cannot yet be reliably allocated to this room/package.
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProcurementSection({ section }: { section: ProcurementCostPlanSection }) {
  return (
    <section className="rounded-lg border border-slate-600 bg-slate-800 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="text-sm font-bold uppercase tracking-wide text-yellow-500">{section.title}</h4>
        <span className="text-sm font-bold text-white">{formatMoney(section.total)}</span>
      </div>
      {section.lines.length === 0 ? (
        <p className="text-sm text-slate-400">No Smart Schedule rows in this category.</p>
      ) : (
        <div className="space-y-2">
          {section.lines.map((line, index) => (
            <div key={`${section.key}-${line.phase}-${line.productCode}-${line.description}-${index}`} className="rounded-md border border-slate-700 bg-slate-900 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{line.description}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Qty: {line.quantity.toLocaleString()} {line.unit}
                    {line.phase ? ` · Phase: ${line.phase}` : ""}
                    {line.requiredDate ? ` · Required: ${line.requiredDate}` : ""}
                  </div>
                  {(line.supplier || line.productCode) && (
                    <div className="mt-1 text-xs text-slate-500">
                      {line.supplier ? `Supplier: ${line.supplier}` : ""}
                      {line.supplier && line.productCode ? " · " : ""}
                      {line.productCode ? `Product code: ${line.productCode}` : ""}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-400">Budget Rate</div>
                  <div className="font-semibold text-slate-100">{formatMoney(line.budgetRate)}</div>
                  <div className="mt-1 text-xs text-slate-400">Budget Total</div>
                  <div className="font-bold text-white">{formatMoney(line.budgetTotal)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LogoutButton() {
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
    window.location.reload();
  };

  return (
    <div className="fixed top-4 left-4 z-50 bg-slate-800 rounded-lg p-2 border border-slate-600 shadow-lg">
      <div className="flex items-center space-x-2">
        <span className="text-yellow-400 text-sm font-medium">Admin</span>
        <Button
          onClick={handleLogout}
          size="sm"
          className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white"
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

export default function AdminBudgetTracking() {
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [expandedProcurementJobId, setExpandedProcurementJobId] = useState<string | null>(null);
  const [activeProcurementTab, setActiveProcurementTab] = useState<ProcurementSectionKey>("materials");
  const [activeProcurementTimeFilter, setActiveProcurementTimeFilter] = useState<ProcurementTimeFilter>("next-7-days");

  // Fetch all clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/financial/clients"],
    refetchInterval: 30000,
  });

  // Fetch jobs for selected client
  const { data: allJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/financial/jobs"],
    refetchInterval: 30000,
  });

  const { data: procurementAssignments = [] } = useQuery<ProcurementAssignment[]>({
    queryKey: ["/api/job-assignments"],
    enabled: Boolean(expandedProcurementJobId),
  });

  const { data: procurementLocations = [] } = useQuery<ProcurementLocation[]>({
    queryKey: ["/api/jobs", expandedProcurementJobId, "procurement-locations"],
    queryFn: async () => {
      if (!expandedProcurementJobId) return [];
      const response = await fetch(`/api/jobs/${expandedProcurementJobId}/locations`);
      if (!response.ok) throw new Error("Failed to load job locations");
      return response.json();
    },
    enabled: Boolean(expandedProcurementJobId),
  });

  const { data: procurementTasks = [] } = useQuery<ProcurementLocationTask[]>({
    queryKey: ["/api/jobs", expandedProcurementJobId, "procurement-location-tasks"],
    queryFn: async () => {
      if (!expandedProcurementJobId) return [];
      const response = await fetch(`/api/jobs/${expandedProcurementJobId}/location-tasks`);
      if (!response.ok) throw new Error("Failed to load job location tasks");
      return response.json();
    },
    enabled: Boolean(expandedProcurementJobId),
  });

  const { data: procurementStructuredResources = [] } = useQuery<ProcurementStructuredResource[]>({
    queryKey: ["/api/jobs", expandedProcurementJobId, "procurement-structured-resources"],
    queryFn: async () => {
      if (!expandedProcurementJobId) return [];
      const response = await fetch(`/api/jobs/${expandedProcurementJobId}/location-task-resources`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: Boolean(expandedProcurementJobId),
  });

  const { data: materialCostRows = [] } = useQuery<any[]>({
    queryKey: ["/api/jobs", expandedProcurementJobId, "material-costs"],
    queryFn: async () => {
      if (!expandedProcurementJobId) return [];
      const response = await fetch(`/api/jobs/${expandedProcurementJobId}/material-costs`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: Boolean(expandedProcurementJobId),
  });

  const { data: materialCostActuals = [], refetch: refetchActuals } = useQuery<ActualPurchaseRecord[]>({
    queryKey: ["/api/jobs", expandedProcurementJobId, "material-costs-actuals"],
    queryFn: async () => {
      if (!expandedProcurementJobId) return [];
      const response = await fetch(`/api/jobs/${expandedProcurementJobId}/material-costs/actuals`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: Boolean(expandedProcurementJobId),
  });

  const selectedClientJobs = allJobs.filter(job => job.client_id === selectedClientId);
  const totalActiveJobs = allJobs.filter(isActiveJob).length;
  const totalActualSpent = allJobs.reduce((sum, job) => sum + moneyValue(job.actual_spent ?? job.total_actual_cost), 0);
  const totalQuotedValue = allJobs.reduce((sum, job) => sum + moneyValue(job.client_quote), 0);
  const jobsForClient = (clientId: string) => allJobs.filter((job) => job.client_id === clientId);

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => window.location.href = '/admin-dashboard'}
            className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center hover:bg-slate-600"
          >
            <i className="fas fa-arrow-left text-white"></i>
          </button>
          <div className="hallmark-logo-mark">
            <img src="/sculpt-projects-logo.png" alt="Sculpt Projects" />
          </div>
          <div>
            <div className="text-sm font-medium">Budget Tracking</div>
            <div className="text-xs text-slate-400">Financial Management</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Live</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-slate-400 text-sm">Total Clients</div>
                <div className="text-2xl font-bold text-white">{clients.length}</div>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <i className="fas fa-users text-blue-400 text-xl"></i>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-slate-400 text-sm">Quoted Value</div>
                <div className="text-2xl font-bold text-white">
                  {formatMoney(totalQuotedValue)}
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <i className="fas fa-file-invoice-pound text-blue-400 text-xl"></i>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-slate-400 text-sm">Active Jobs</div>
                <div className="text-2xl font-bold text-white">
                  {totalActiveJobs}
                </div>
              </div>
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <i className="fas fa-briefcase text-green-400 text-xl"></i>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-slate-400 text-sm">Total Spent</div>
                <div className="text-2xl font-bold text-white">
                  {formatMoney(totalActualSpent)}
                </div>
              </div>
              <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                <i className="fas fa-pound-sign text-yellow-400 text-xl"></i>
              </div>
            </div>
          </Card>
        </div>

        {/* Client List or Job Details */}
        {selectedClientId === null ? (
          <>
            {/* Client List View */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-yellow-600">
                  <i className="fas fa-users mr-2"></i>
                  Clients
                </h2>
                <Button
                  onClick={() => {/* TODO: Add new client */}}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <i className="fas fa-plus mr-2"></i>
                  New Client
                </Button>
              </div>

              {clientsLoading ? (
                <div className="text-center py-8 text-slate-400">
                  <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                  <div>Loading clients...</div>
                </div>
              ) : clients.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <i className="fas fa-inbox text-4xl mb-2"></i>
                  <div>No clients yet</div>
                  <div className="text-sm">Add your first client to get started</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {clients.map((client) => {
                    const clientJobs = jobsForClient(client.id);
                    const activeJobs = clientJobs.filter(isActiveJob).length;
                    const quotedValue = clientJobs.reduce((sum, job) => sum + moneyValue(job.client_quote), 0);
                    const estimatedCost = clientJobs.reduce((sum, job) => sum + moneyValue(job.estimated_cost), 0);
                    const actualSpent = clientJobs.reduce((sum, job) => sum + moneyValue(job.actual_spent ?? job.total_actual_cost), 0);
                    const hasCommercialData = quotedValue > 0 || estimatedCost > 0;
                    const statusColor = hasCommercialData ? "bg-blue-500" : "bg-slate-600";
                    const statusText = hasCommercialData ? "Commercial Data" : "No Manual Budget";

                    return (
                      <Card
                        key={client.id}
                        className="bg-slate-700 border-slate-600 p-4 hover:bg-slate-650 cursor-pointer transition-colors"
                        onClick={() => setSelectedClientId(client.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="text-lg font-semibold text-white">{client.name}</h3>
                              <Badge className={`text-xs ${statusColor}`}>
                                {statusText}
                              </Badge>
                            </div>
                            <div className="text-sm text-slate-400 mt-1">
                              {clientJobs.length} {clientJobs.length === 1 ? 'job' : 'jobs'} ({activeJobs} active)
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-400">Total Quoted</div>
                            <div className="text-lg font-bold text-white">
                              {formatMoney(quotedValue)}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              Spent: {formatMoney(actualSpent)}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Client Jobs View */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Button
                    onClick={() => {
                      setSelectedClientId(null);
                      setExpandedProcurementJobId(null);
                    }}
                    variant="outline"
                    size="sm"
                    className="border-slate-600 hover:bg-slate-700"
                  >
                    <i className="fas fa-arrow-left mr-2"></i>
                    Back to Clients
                  </Button>
                  <h2 className="text-lg font-semibold text-white">
                    {clients.find(c => c.id === selectedClientId)?.name} - Jobs
                  </h2>
                </div>
              </div>

              {selectedClientJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <i className="fas fa-briefcase text-4xl mb-2"></i>
                  <div>No jobs found for this client</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedClientJobs.map((job) => {
                    const quotedValue = moneyValue(job.client_quote ?? job.quoted_amount);
                    const estimatedCost = moneyValue(job.estimated_cost);
                    const actualSpent = moneyValue(job.actual_spent ?? job.total_actual_cost);
                    const actualLabour = moneyValue(job.actual_labour_cost);
                    const actualMaterial = moneyValue(job.actual_material_cost);
                    const actualPlant = moneyValue(job.actual_plant_cost);
                    const procurementPlan = buildProcurementCostPlan(job.phase_task_data);
                    const procurementOpen = expandedProcurementJobId === job.id;
                    const roomPackageChecklist = buildRoomPackageProcurementChecklist({
                      assignments: procurementAssignments,
                      locations: procurementLocations,
                      tasks: procurementTasks,
                      structuredResources: procurementStructuredResources,
                      filter: activeProcurementTimeFilter,
                      jobId: job.id,
                    });

                    return (
                      <Card key={job.id} className="bg-slate-700 border-slate-600 p-4">
                        <div className="space-y-4">
                          {/* Job Header */}
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-white">{job.job_name}</h3>
                              <div className="text-sm text-slate-400">Status: {job.status}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-slate-400">Client Quote</div>
                              <div className="text-lg font-bold text-white">
                                {formatMaybeMoney(job.client_quote)}
                              </div>
                            </div>
                          </div>

                          {/* Budget vs Actual Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-600">
                            <div>
                              <div className="text-xs text-slate-400">Estimated Cost</div>
                              <div className="text-sm font-semibold text-slate-200">
                                {formatMaybeMoney(job.estimated_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Actual Spent</div>
                              <div className="text-sm font-semibold text-slate-200">
                                {formatMoney(actualSpent)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Forecast Profit</div>
                              <div className="text-sm font-semibold text-slate-200">
                                {formatMaybeMoney(job.forecast_gross_profit)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Forecast Margin</div>
                              <div className="text-sm font-semibold text-slate-200">
                                {formatMaybePercent(job.forecast_margin_percentage)}
                              </div>
                            </div>
                          </div>

                          {/* Cost Categories */}
                          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-600">
                            <div>
                              <div className="text-xs text-slate-400">Labour (Spent / Bud)</div>
                              <div className="text-sm font-semibold text-slate-200">
                                {formatMoney(actualLabour)} / {formatMaybeMoney(job.estimated_labour_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Material (Spent / Bud)</div>
                              <div className="text-sm font-semibold text-slate-200">
                                {formatMoney(actualMaterial)} / {formatMaybeMoney(job.estimated_material_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Plant (Spent / Bud)</div>
                              <div className="text-sm font-semibold text-slate-200">
                                {formatMoney(actualPlant)} / {formatMaybeMoney(job.estimated_plant_cost)}
                              </div>
                            </div>
                          </div>

                          {/* Actual Spend */}
                          <div className="pt-3 border-t border-slate-600">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-slate-400">Actual spent source</span>
                              <span className="text-sm font-semibold text-slate-200">Approved actual-cost records only</span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex space-x-2 pt-3 border-t border-slate-600">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-slate-600 hover:bg-slate-600"
                              onClick={() => {
                                setExpandedProcurementJobId(procurementOpen ? null : job.id);
                                if (!procurementOpen) {
                                  setActiveProcurementTab("materials");
                                  setActiveProcurementTimeFilter("next-7-days");
                                }
                              }}
                            >
                              <i className="fas fa-eye mr-2"></i>
                              {procurementOpen ? "Hide Cost Plan" : "View Details"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-slate-600 hover:bg-slate-600"
                              onClick={() => {/* TODO: Add expense */}}
                            >
                              <i className="fas fa-plus mr-2"></i>
                              Add Expense
                            </Button>
                          </div>

                          {procurementOpen && (
                            <div className="pt-4 border-t border-slate-600 space-y-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-lg font-bold text-white">Procurement / Cost Plan</h3>
                                  <p className="text-sm text-slate-400">
                                    Primary material buying and Smart Schedule allowances: what to buy, hire, subcontract, or plan for labour.
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-right">
                                  <div className="text-xs text-slate-400">Section Total</div>
                                  <div className="text-lg font-bold text-white">{formatMoney(procurementPlan.totalEstimatedCost)}</div>
                                  <div className="text-xs text-slate-500">Commercial summary: {formatMoney(job.estimated_cost)}</div>
                                </div>
                              </div>

                              {moneyValue(job.estimated_cost) !== moneyValue(procurementPlan.totalEstimatedCost) && (
                                <div className="rounded-md border border-amber-500 bg-amber-950/40 p-3 text-sm text-amber-100">
                                  Smart Schedule row sections total {formatMoney(procurementPlan.totalEstimatedCost)}. Commercial summary total is {formatMoney(job.estimated_cost)}.
                                </div>
                              )}

                              {/* Category Tabs */}
                              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Procurement categories">
                                {PROCUREMENT_TAB_ORDER.map((key) => {
                                  const section = procurementPlan[key];
                                  const selected = activeProcurementTab === key;
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      role="tab"
                                      aria-selected={selected}
                                      onClick={() => setActiveProcurementTab(key)}
                                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-yellow-500 bg-yellow-500 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-200 hover:border-yellow-500"}`}
                                    >
                                      <span className="block text-xs font-bold tracking-wide">{PROCUREMENT_TAB_LABELS[key]}</span>
                                      <span className="block text-sm font-semibold">{formatMoney(section.total)}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Tab Content */}
                              <div role="tabpanel" className="space-y-4">
                                {activeProcurementTab === "materials" ? (
                                  <div className="space-y-4">
                                    {materialCostRows.length > 0 ? (
                                      <>
                                        <MaterialsCostSheet
                                          jobId={job.id}
                                          materialCostRows={materialCostRows}
                                          materialCostActuals={materialCostActuals}
                                          onActualsSaved={refetchActuals}
                                          procurementAssignments={procurementAssignments}
                                          procurementLocations={procurementLocations}
                                          procurementTasks={procurementTasks}
                                          procurementStructuredResources={procurementStructuredResources}
                                          activeTimeFilter={activeProcurementTimeFilter}
                                          onTimeFilterChange={setActiveProcurementTimeFilter}
                                        />
                                      </>
                                    ) : (
                                      <div className="space-y-4">
                                        <div className="rounded-lg border border-yellow-500/60 bg-slate-900 p-6 text-center">
                                          <h4 className="text-base font-bold text-yellow-400 mb-2">No Materials Used CSV Imported Yet</h4>
                                          <p className="text-xs text-slate-400 max-w-lg mx-auto mb-4">
                                            Import the project's HBXL Materials Used CSV to unlock the full flat material pricing sheet, supplier purchasing tracking, and automatic room budget allocations.
                                          </p>
                                          <MaterialUpload 
                                            jobId={job.id} 
                                            onImported={() => {
                                              queryClient.invalidateQueries({ queryKey: ["/api/jobs", expandedProcurementJobId, "material-costs"] });
                                              refetchActuals();
                                            }} 
                                          />
                                        </div>
                                        <ProcurementSection section={procurementPlan.materials} />
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    <section className="rounded-lg border border-yellow-500 bg-slate-900 p-4">
                                      <div className="text-xs font-bold tracking-wide text-yellow-500">{PROCUREMENT_BUDGET_LABELS[activeProcurementTab]}</div>
                                      <div className="mt-1 text-2xl font-bold text-white">{formatMoney(procurementPlan[activeProcurementTab].total)}</div>
                                    </section>
                                    <ProcurementSection section={procurementPlan[activeProcurementTab]} />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
  matchWordProductsToCsv,
  allocateRoomBudgets,
  buildWeeklyPricedBudget,
  type MaterialsUsedRow,
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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
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
      if (!response.ok) throw new Error("Import failed");
      setPreview(null);
      onImported();
    } catch (err) {
      setError("Failed to import CSV");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 p-3">
      <h5 className="text-xs font-bold uppercase tracking-wide text-yellow-500 mb-2">Import / Re-import HBXL Materials Used CSV</h5>
      <input type="file" accept=".csv" onChange={handleFile} className="text-sm text-slate-400 mb-2" />
      {uploading && <p className="text-xs text-slate-400">Processing...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
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

interface MaterialActualEntry {
  supplierName?: string;
  supplierUnitPrice?: string;
  actualQuantity?: string;
  actualTotal?: string;
  notes?: string;
}

function MaterialsCostSheet({
  jobId,
  materialCostRows = [],
  materialCostActuals = [],
  onActualsSaved,
}: {
  jobId: string;
  materialCostRows: any[];
  materialCostActuals: any[];
  onActualsSaved: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhase, setSelectedPhase] = useState<string>("ALL");
  const [editingActuals, setEditingActuals] = useState<Record<string, MaterialActualEntry>>({});
  const [savingResourceId, setSavingResourceId] = useState<string | null>(null);
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);

  // Map of actuals by resourceId
  const actualsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const act of materialCostActuals) {
      map[act.resourceId] = act;
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

  // Available build phases for dropdown filter
  const buildPhases = useMemo(() => {
    const phases = new Set<string>();
    for (const r of physicalRows) {
      if (r.buildPhase) phases.add(r.buildPhase);
    }
    return Array.from(phases);
  }, [physicalRows]);

  // Filtered physical rows
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

  // Helper to get active entry for a row
  const getEntry = (resourceId: string): MaterialActualEntry => {
    return editingActuals[resourceId] ?? actualsMap[resourceId] ?? {};
  };

  // Handle change of inputs
  const handleFieldChange = (resourceId: string, field: keyof MaterialActualEntry, value: string, defaultQty?: string) => {
    setEditingActuals((prev) => {
      const current = { ...getEntry(resourceId), [field]: value };
      
      const price = parseFloat(field === "supplierUnitPrice" ? value : (current.supplierUnitPrice ?? "0")) || 0;
      const qtyStr = field === "actualQuantity" ? value : (current.actualQuantity ?? defaultQty ?? "0");
      const qty = parseFloat(qtyStr) || 0;
      
      if (price > 0 && qty > 0) {
        current.actualTotal = (price * qty).toFixed(2);
      } else if (price === 0 || qty === 0) {
        current.actualTotal = "";
      }

      return {
        ...prev,
        [resourceId]: current,
      };
    });
  };

  const handleSaveRow = async (resource: any) => {
    const entry = getEntry(resource.id);
    setSavingResourceId(resource.id);
    try {
      const res = await fetch(`/api/jobs/${jobId}/material-costs/${resource.id}/actual`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: entry.supplierName ?? null,
          supplierUnitPrice: entry.supplierUnitPrice ?? null,
          actualQuantity: entry.actualQuantity ?? (entry.supplierUnitPrice ? resource.orderQtyIncludingWastage : null),
          actualTotal: entry.actualTotal ?? null,
          notes: entry.notes ?? null,
        }),
      });
      if (res.ok) {
        setSavedSuccessId(resource.id);
        setTimeout(() => setSavedSuccessId(null), 2500);
        onActualsSaved();
      }
    } catch (err) {
      console.error("Save actual failed:", err);
    } finally {
      setSavingResourceId(null);
    }
  };

  // Financial Totals Calculations
  const hbxlPhysicalBudget = useMemo(
    () => physicalRows.reduce((sum, r) => sum + moneyValue(r.totalCostIncludingWastage), 0),
    [physicalRows]
  );

  const actualMaterialSpend = useMemo(() => {
    return physicalRows.reduce((sum, r) => {
      const entry = getEntry(r.id);
      return sum + (entry.actualTotal ? moneyValue(entry.actualTotal) : 0);
    }, 0);
  }, [physicalRows, editingActuals, actualsMap]);

  // Variance: sum of (HBXL budget - Actual Total) for items that have actual supplier pricing entered
  const totalVariance = useMemo(() => {
    return physicalRows.reduce((sum, r) => {
      const entry = getEntry(r.id);
      if (!entry.actualTotal || moneyValue(entry.actualTotal) === 0) return sum;
      const hbxlCost = moneyValue(r.totalCostIncludingWastage);
      const actCost = moneyValue(entry.actualTotal);
      return sum + (hbxlCost - actCost);
    }, 0);
  }, [physicalRows, editingActuals, actualsMap]);

  const remainingBudget = hbxlPhysicalBudget - actualMaterialSpend;
  const allowanceBudget = useMemo(
    () => allowanceRows.reduce((sum, r) => sum + moneyValue(r.totalCostIncludingWastage), 0),
    [allowanceRows]
  );
  const totalHbxlReport = hbxlPhysicalBudget + allowanceBudget;

  const countPricedItems = useMemo(() => {
    return physicalRows.filter((r) => {
      const entry = getEntry(r.id);
      return entry.actualTotal && moneyValue(entry.actualTotal) > 0;
    }).length;
  }, [physicalRows, editingActuals, actualsMap]);

  return (
    <div className="space-y-4">
      {/* Top Money Summary Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* HBXL Physical Material Budget */}
        <div className="rounded-lg border border-yellow-500/50 bg-slate-900 p-3 shadow">
          <div className="text-[11px] font-bold uppercase tracking-wider text-yellow-500">HBXL Physical Budget</div>
          <div className="mt-1 text-2xl font-black text-white font-mono">{formatMoney(hbxlPhysicalBudget)}</div>
          <div className="mt-1 text-xs text-slate-400">{physicalRows.length} physical material items</div>
        </div>

        {/* Actual Material Spend */}
        <div className="rounded-lg border border-blue-500/50 bg-slate-900 p-3 shadow">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Actual Material Spend</div>
          <div className="mt-1 text-2xl font-black text-blue-300 font-mono">{formatMoney(actualMaterialSpend)}</div>
          <div className="mt-1 text-xs text-slate-400">{countPricedItems} of {physicalRows.length} items priced</div>
        </div>

        {/* Saving / Overspend */}
        <div className={`rounded-lg border p-3 shadow ${totalVariance >= 0 ? "border-green-500/50 bg-green-950/20" : "border-red-500/50 bg-red-950/20"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${totalVariance >= 0 ? "text-green-400" : "text-red-400"}`}>
              {totalVariance >= 0 ? "Buying Saving" : "Buying Overspend"}
            </span>
            <Badge variant={totalVariance >= 0 ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
              {totalVariance >= 0 ? "SAVING" : "OVERSPEND"}
            </Badge>
          </div>
          <div className={`mt-1 text-2xl font-black font-mono ${totalVariance >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalVariance >= 0 ? `+${formatMoney(totalVariance)}` : `-${formatMoney(Math.abs(totalVariance))}`}
          </div>
          <div className="mt-1 text-xs text-slate-400">Net variance on priced lines</div>
        </div>

        {/* Remaining Material Budget */}
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 shadow">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Remaining Budget</div>
          <div className="mt-1 text-2xl font-black text-white font-mono">{formatMoney(remainingBudget)}</div>
          <div className="mt-1 text-xs text-slate-500">Uncommitted physical budget</div>
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

      {/* Primary Material Sheet Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 shadow">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/90 text-slate-300 font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-2 w-10 text-center">#</th>
              <th className="py-2.5 px-3 min-w-[220px]">Material Description</th>
              <th className="py-2.5 px-2 w-28">Order Qty</th>
              <th className="py-2.5 px-2 w-20 text-right">HBXL Rate</th>
              <th className="py-2.5 px-2 w-24 text-right">HBXL Budget</th>
              <th className="py-2.5 px-2 w-36">Supplier</th>
              <th className="py-2.5 px-2 w-24">Supplier Price</th>
              <th className="py-2.5 px-2 w-24">Actual Qty</th>
              <th className="py-2.5 px-2 w-24 text-right">Actual Total</th>
              <th className="py-2.5 px-2 w-28 text-right">Variance</th>
              <th className="py-2.5 px-2 w-16 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredPhysicalRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-400">
                  No physical materials match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredPhysicalRows.map((row) => {
                const entry = getEntry(row.id);
                const hbxlBudget = moneyValue(row.totalCostIncludingWastage);
                const actualTotalVal = entry.actualTotal ? moneyValue(entry.actualTotal) : null;
                const variance = actualTotalVal !== null ? hbxlBudget - actualTotalVal : null;
                const isSaving = variance !== null && variance >= 0;
                const isSavingSuccess = savedSuccessId === row.id;
                const isRowSaving = savingResourceId === row.id;

                return (
                  <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px]">{row.sourceRowOrder}</td>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-white leading-tight">{row.description}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">{row.buildPhase}</div>
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-300">
                      {row.orderQtyIncludingWastage} <span className="text-slate-500 text-[10px]">{row.unit}</span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-slate-300">£{parseFloat(row.unitRate).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-yellow-400">£{hbxlBudget.toFixed(2)}</td>
                    
                    {/* Supplier Name input */}
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        placeholder="Supplier..."
                        value={entry.supplierName ?? ""}
                        onChange={(e) => handleFieldChange(row.id, "supplierName", e.target.value)}
                        onBlur={() => handleSaveRow(row)}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white placeholder-slate-600 focus:border-yellow-500 focus:outline-none"
                      />
                    </td>

                    {/* Supplier Unit Price input */}
                    <td className="py-2 px-2">
                      <div className="relative">
                        <span className="absolute left-1.5 top-1 text-slate-500 text-xs">£</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={entry.supplierUnitPrice ?? ""}
                          onChange={(e) => handleFieldChange(row.id, "supplierUnitPrice", e.target.value, row.orderQtyIncludingWastage)}
                          onBlur={() => handleSaveRow(row)}
                          className="w-full rounded border border-slate-700 bg-slate-950 pl-4 pr-1 py-1 font-mono text-xs text-white placeholder-slate-600 focus:border-yellow-500 focus:outline-none"
                        />
                      </div>
                    </td>

                    {/* Actual Quantity input */}
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder={row.orderQtyIncludingWastage}
                        value={entry.actualQuantity ?? ""}
                        onChange={(e) => handleFieldChange(row.id, "actualQuantity", e.target.value, row.orderQtyIncludingWastage)}
                        onBlur={() => handleSaveRow(row)}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white placeholder-slate-600 focus:border-yellow-500 focus:outline-none"
                      />
                    </td>

                    {/* Actual Total */}
                    <td className="py-2 px-2 text-right font-mono font-semibold">
                      {actualTotalVal !== null ? (
                        <span className="text-blue-300">£{actualTotalVal.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Variance */}
                    <td className="py-2 px-2 text-right font-mono font-bold">
                      {variance !== null ? (
                        <span className={isSaving ? "text-green-400" : "text-red-400"}>
                          {isSaving ? `+£${variance.toFixed(2)}` : `-£${Math.abs(variance).toFixed(2)}`}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Save Action */}
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleSaveRow(row)}
                        disabled={isRowSaving}
                        title="Save Supplier Actuals"
                        className={`rounded px-2 py-1 text-[10px] font-bold uppercase transition-all ${
                          isSavingSuccess
                            ? "bg-green-600 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
                        }`}
                      >
                        {isRowSaving ? "..." : isSavingSuccess ? "✓" : "Save"}
                      </button>
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

  const { data: materialCostActuals = [], refetch: refetchActuals } = useQuery<any[]>({
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
                    const budgetVariance = quotedValue - actualSpent;
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
                                        {/* PRIMARY VIEW: Money-First Material Cost Sheet */}
                                        <MaterialsCostSheet
                                          jobId={job.id}
                                          materialCostRows={materialCostRows}
                                          materialCostActuals={materialCostActuals}
                                          onActualsSaved={refetchActuals}
                                        />

                                        {/* SECONDARY VIEW: Collapsible Weekly/Room Material Planning */}
                                        <details className="rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-slate-300">
                                          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-yellow-500 select-none">
                                            ▼ Weekly / Room Material Planning (Optional Reference)
                                          </summary>
                                          <div className="mt-3 space-y-3 pt-3 border-t border-slate-800">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <div className="flex flex-wrap gap-2" aria-label="Procurement time period">
                                                {PROCUREMENT_TIME_FILTERS.map((filter) => {
                                                  const selected = activeProcurementTimeFilter === filter.key;
                                                  return (
                                                    <button
                                                      key={filter.key}
                                                      type="button"
                                                      aria-pressed={selected}
                                                      onClick={() => setActiveProcurementTimeFilter(filter.key)}
                                                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${selected ? "border-yellow-500 bg-yellow-500 text-slate-950" : "border-slate-600 bg-slate-800 text-slate-200 hover:border-yellow-500"}`}
                                                    >
                                                      {filter.label}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                              <div className="text-right">
                                                <span className="text-xs text-yellow-500 font-bold uppercase tracking-wide">
                                                  {PROCUREMENT_TIME_FILTERS.find((filter) => filter.key === activeProcurementTimeFilter)?.label} PLANNED WORK:
                                                </span>
                                                <span className="ml-2 font-mono font-bold text-white text-sm">{roomPackageChecklist.length}</span>
                                                <span className="ml-1 text-xs text-slate-400">packages</span>
                                              </div>
                                            </div>
                                            <p className="text-xs text-slate-400 border-t border-slate-800 pt-2">
                                              Room/package resource lists come from the Word quote. Smart Schedule pricing is currently project-level and is not allocated to individual rooms.
                                            </p>
                                            <RoomPackageChecklist 
                                              items={roomPackageChecklist} 
                                              materialCostRows={materialCostRows}
                                              allStructuredResources={procurementStructuredResources}
                                            />
                                          </div>
                                        </details>

                                        {/* Utility: Materials CSV Re-import */}
                                        <details className="rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-slate-300">
                                          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-yellow-500 select-none">
                                            ▼ Materials Used CSV Import & Revisions
                                          </summary>
                                          <div className="mt-3 pt-3 border-t border-slate-800">
                                            <MaterialUpload 
                                              jobId={job.id} 
                                              onImported={() => {
                                                queryClient.invalidateQueries({ queryKey: ["/api/jobs", expandedProcurementJobId, "material-costs"] });
                                                refetchActuals();
                                              }} 
                                            />
                                          </div>
                                        </details>
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

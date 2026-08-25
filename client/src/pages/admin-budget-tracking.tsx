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
      <h5 className="text-xs font-bold uppercase tracking-wide text-yellow-500 mb-2">Import HBXL Materials Used CSV</h5>
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
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch jobs for selected client
  const { data: allJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/financial/jobs"],
    refetchInterval: 30000,
  });

  const { data: procurementAssignments = [], isPending: assignmentsLoading, isError: assignmentsFailed } = useQuery<ProcurementAssignment[]>({
    queryKey: ["/api/job-assignments"],
    enabled: Boolean(expandedProcurementJobId),
  });

  const { data: procurementLocations = [], isPending: locationsLoading, isError: locationsFailed } = useQuery<ProcurementLocation[]>({
    queryKey: ["/api/jobs", expandedProcurementJobId, "procurement-locations"],
    queryFn: async () => {
      if (!expandedProcurementJobId) return [];
      const response = await fetch(`/api/jobs/${expandedProcurementJobId}/locations`);
      if (!response.ok) throw new Error("Failed to load job locations");
      return response.json();
    },
    enabled: Boolean(expandedProcurementJobId),
  });

  const { data: procurementTasks = [], isPending: tasksLoading, isError: tasksFailed } = useQuery<ProcurementLocationTask[]>({
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
                        className="bg-slate-700 border-slate-600 p-4 cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => setSelectedClientId(client.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4 flex-1">
                            {/* Status Indicator */}
                            <div className={`w-3 h-3 rounded-full ${statusColor}`}></div>
                            
                            {/* Client Info */}
                            <div className="flex-1">
                              <div className="font-semibold text-white">{client.name}</div>
                              <div className="text-sm text-slate-400">{client.email || "No email recorded"}</div>
                            </div>

                            {/* Stats */}
                            <div className="text-right">
                              <div className="text-sm text-slate-400">Active Jobs</div>
                              <div className="text-lg font-bold text-white">{activeJobs}</div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm text-slate-400">Quoted Value</div>
                              <div className="text-lg font-bold text-white">
                                {formatMoney(quotedValue)}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm text-slate-400">Estimated Cost</div>
                              <div className="text-lg font-bold text-white">
                                {formatMoney(estimatedCost)}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm text-slate-400">Actual Spent</div>
                              <div className="text-lg font-bold text-white">
                                {formatMoney(actualSpent)}
                              </div>
                            </div>

                            {/* Status Badge */}
                            <Badge className={`${statusColor} text-white border-0`}>
                              {statusText}
                            </Badge>

                            {/* Arrow */}
                            <i className="fas fa-chevron-right text-slate-400"></i>
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
            {/* Job Details View */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => { setSelectedClientId(null); setExpandedProcurementJobId(null); }}
                    className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center hover:bg-slate-600"
                  >
                    <i className="fas fa-arrow-left text-white"></i>
                  </button>
                  <div>
                    <h2 className="text-lg font-semibold text-yellow-600">
                      {clients.find(c => c.id === selectedClientId)?.name}
                    </h2>
                    <div className="text-sm text-slate-400">Jobs & Budget Tracking</div>
                  </div>
                </div>
                <Button
                  onClick={() => {/* TODO: Add new job */}}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <i className="fas fa-plus mr-2"></i>
                  New Job
                </Button>
              </div>

              {selectedClientJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <i className="fas fa-briefcase text-4xl mb-2"></i>
                  <div>No jobs for this client</div>
                  <div className="text-sm">Add a job to start tracking</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedClientJobs.map((job) => {
                    const hasCommercialData = moneyValue(job.client_quote) > 0 || moneyValue(job.estimated_cost) > 0;
                    const statusColor = hasCommercialData ? "bg-blue-500" : "bg-slate-600";
                    const statusText = hasCommercialData ? "Commercial Data" : "No Manual Budget";
                    const procurementPlan = buildProcurementCostPlan(job.phase_task_data);
                    const procurementOpen = expandedProcurementJobId === job.id;
                    const roomPackageChecklist = procurementOpen
                      ? buildRoomPackageProcurementChecklist({
                          jobId: job.id,
                          assignments: procurementAssignments,
                          locations: procurementLocations,
                          tasks: procurementTasks,
                          structuredResources: procurementStructuredResources,
                          filter: activeProcurementTimeFilter,
                        })
                      : [];
                    const checklistLoading = procurementOpen && (assignmentsLoading || locationsLoading || tasksLoading);
                    const checklistFailed = procurementOpen && (assignmentsFailed || locationsFailed || tasksFailed);

                    return (
                      <Card key={job.id} className="bg-slate-700 border-slate-600 p-4">
                        <div className="space-y-3">
                          {/* Job Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-3 h-3 rounded-full ${statusColor}`}></div>
                              <div>
                                <div className="font-semibold text-white">{job.job_name}</div>
                                <div className="text-sm text-slate-400">
                                  Status: {job.status.replace('_', ' ').toUpperCase()}
                                </div>
                              </div>
                            </div>
                            <Badge className={`${statusColor} text-white border-0`}>
                              {statusText}
                            </Badge>
                          </div>

                          {/* Commercial Details */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-slate-400">Client Quote</div>
                              <div className="text-lg font-bold text-white">
                                {formatMaybeMoney(job.client_quote)}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Estimated Cost</div>
                              <div className="text-lg font-bold text-white">
                                {formatMoney(job.estimated_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Forecast Gross Profit</div>
                              <div className="text-lg font-bold text-white">
                                {formatMaybeMoney(job.forecast_gross_profit)}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Forecast Margin</div>
                              <div className="text-lg font-bold text-white">
                                {formatMaybePercent(job.forecast_margin_percentage)}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Actual Spent</div>
                              <div className="text-lg font-bold text-white">
                                {formatMoney(job.actual_spent ?? job.total_actual_cost)}
                              </div>
                            </div>
                          </div>

                          {/* Estimated Cost Breakdown */}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-slate-600">
                            <div>
                              <div className="text-xs text-slate-400">Estimated Labour</div>
                              <div className="text-sm font-semibold text-blue-400">
                                {formatMoney(job.estimated_labour_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Estimated Materials</div>
                              <div className="text-sm font-semibold text-green-400">
                                {formatMoney(job.estimated_material_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Estimated Plant</div>
                              <div className="text-sm font-semibold text-yellow-400">
                                {formatMoney(job.estimated_plant_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Subcontractors</div>
                              <div className="text-sm font-semibold text-purple-400">
                                {formatMoney(job.estimated_subcontractor_cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Other</div>
                              <div className="text-sm font-semibold text-slate-300">
                                {formatMoney(job.estimated_other_cost)}
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
                                    Read-only Smart Schedule allowances: what to buy, hire, subcontract, or plan for labour. Budget rates are allowance benchmarks.
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

                              <div className="flex flex-wrap gap-2" aria-label="Procurement time period">
                                {PROCUREMENT_TIME_FILTERS.map((filter) => {
                                  const selected = activeProcurementTimeFilter === filter.key;
                                  return (
                                    <button
                                      key={filter.key}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => setActiveProcurementTimeFilter(filter.key)}
                                      className={`rounded-lg border px-3 py-2 text-xs font-bold tracking-wide transition-colors ${selected ? "border-yellow-500 bg-yellow-500 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-200 hover:border-yellow-500"}`}
                                    >
                                      {filter.label}
                                    </button>
                                  );
                                })}
                              </div>

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

                              <div role="tabpanel" className="space-y-4">
                                <section className="rounded-lg border border-yellow-500 bg-slate-900 p-4">
                                  <div className={`grid gap-4 ${activeProcurementTab === "materials" ? "md:grid-cols-2" : "grid-cols-1"}`}>
                                    <div>
                                      <div className="text-xs font-bold tracking-wide text-yellow-500">{PROCUREMENT_BUDGET_LABELS[activeProcurementTab]}</div>
                                      <div className="mt-1 text-2xl font-bold text-white">{formatMoney(procurementPlan[activeProcurementTab].total)}</div>
                                    </div>
                                    {activeProcurementTab === "materials" && (
                                      <div>
                                        <div className="text-xs font-bold tracking-wide text-yellow-500">
                                          {PROCUREMENT_TIME_FILTERS.find((filter) => filter.key === activeProcurementTimeFilter)?.label} PLANNED WORK
                                        </div>
                                        <div className="mt-1 text-2xl font-bold text-white">{roomPackageChecklist.length}</div>
                                        <div className="text-xs text-slate-400">scheduled rooms/packages</div>
                                      </div>
                                    )}
                                  </div>
                                  {activeProcurementTab === "materials" && (
                                    <p className="mt-4 border-t border-slate-700 pt-3 text-sm text-slate-300">
                                      Room/package resource lists come from the Word quote. Smart Schedule pricing is currently project-level and is not allocated to individual rooms.
                                    </p>
                                  )}
                                </section>
                                {activeProcurementTab === "materials" && (
                                  checklistLoading ? (
                                    <div className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-sm text-slate-400">Loading scheduled room/package resources...</div>
                                  ) : checklistFailed ? (
                                    <div className="rounded-lg border border-red-500 bg-red-950/30 p-3 text-sm text-red-100">Unable to load the room/package procurement checklist.</div>
                                  ) : (
                                    <RoomPackageChecklist 
                                      items={roomPackageChecklist} 
                                      materialCostRows={materialCostRows}
                                      allStructuredResources={procurementStructuredResources}
                                    />
                                  )
                                )}
                                {activeProcurementTab === "materials" && (
                                  <MaterialUpload 
                                    jobId={job.id} 
                                    onImported={() => queryClient.invalidateQueries({ queryKey: ["/api/jobs", expandedProcurementJobId, "material-costs"] })} 
                                  />
                                )}
                                <ProcurementSection section={procurementPlan[activeProcurementTab]} />
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

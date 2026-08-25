import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buildProcurementCostPlan, type ProcurementSectionKey, type ProcurementCostPlanSection } from "@shared/procurement-cost-plan";
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
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [expandedProcurementJobId, setExpandedProcurementJobId] = useState<string | null>(null);
  const [activeProcurementTab, setActiveProcurementTab] = useState<ProcurementSectionKey>("materials");

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
                                if (!procurementOpen) setActiveProcurementTab("materials");
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

                              <div role="tabpanel">
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

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface Client {
  id: number;
  name: string;
  email: string;
  phone: string;
  total_spent: string;
  active_jobs: number;
  created_at: string;
}

interface Job {
  id: number;
  client_id: number;
  job_name: string;
  total_budget: string;
  labour_budget: string;
  material_budget: string;
  plant_budget: string;
  actual_labour_cost: string;
  actual_material_cost: string;
  actual_plant_cost: string;
  total_actual_cost: string;
  profit_loss: string;
  profit_loss_percentage: string;
  status: string;
  start_date: string;
  estimated_end_date: string;
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
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Fetch all clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/financial/clients"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch jobs for selected client
  const { data: allJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/financial/jobs"],
    enabled: selectedClientId !== null,
    refetchInterval: 30000,
  });

  const selectedClientJobs = allJobs.filter(job => job.client_id === selectedClientId);

  // Calculate budget status color
  const getBudgetStatusColor = (totalBudget: string, totalActual: string) => {
    const budget = parseFloat(totalBudget);
    const actual = parseFloat(totalActual);
    
    if (budget === 0) return "bg-slate-600";
    
    const percentage = (actual / budget) * 100;
    
    if (percentage < 90) return "bg-green-500"; // Green - On budget
    if (percentage >= 90 && percentage <= 100) return "bg-amber-500"; // Amber - Warning
    return "bg-red-500"; // Red - Over budget
  };

  // Calculate budget percentage
  const getBudgetPercentage = (totalBudget: string, totalActual: string) => {
    const budget = parseFloat(totalBudget);
    const actual = parseFloat(totalActual);
    
    if (budget === 0) return 0;
    return Math.min((actual / budget) * 100, 100);
  };

  // Get status text
  const getStatusText = (totalBudget: string, totalActual: string) => {
    const budget = parseFloat(totalBudget);
    const actual = parseFloat(totalActual);
    
    if (budget === 0) return "No Budget";
    
    const percentage = (actual / budget) * 100;
    
    if (percentage < 90) return "On Budget";
    if (percentage >= 90 && percentage <= 100) return "Warning";
    return "Over Budget";
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
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
          <div className="w-8 h-8 bg-yellow-600 rounded-lg flex items-center justify-center">
            <i className="fas fa-chart-line text-black"></i>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className="text-slate-400 text-sm">Active Jobs</div>
                <div className="text-2xl font-bold text-white">
                  {clients.reduce((sum, client) => sum + client.active_jobs, 0)}
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
                  £{clients.reduce((sum, client) => sum + parseFloat(client.total_spent || "0"), 0).toLocaleString()}
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
                    // Calculate overall status for this client
                    const clientJobs = allJobs.filter(j => j.client_id === client.id);
                    const totalBudget = clientJobs.reduce((sum, job) => sum + parseFloat(job.total_budget || "0"), 0);
                    const totalActual = clientJobs.reduce((sum, job) => sum + parseFloat(job.total_actual_cost || "0"), 0);
                    const statusColor = getBudgetStatusColor(totalBudget.toString(), totalActual.toString());
                    const statusText = getStatusText(totalBudget.toString(), totalActual.toString());

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
                              <div className="text-sm text-slate-400">{client.email}</div>
                            </div>

                            {/* Stats */}
                            <div className="text-right">
                              <div className="text-sm text-slate-400">Active Jobs</div>
                              <div className="text-lg font-bold text-white">{client.active_jobs}</div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm text-slate-400">Total Spent</div>
                              <div className="text-lg font-bold text-white">
                                £{parseFloat(client.total_spent || "0").toLocaleString()}
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
                    onClick={() => setSelectedClientId(null)}
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
                    const budgetPercentage = getBudgetPercentage(job.total_budget, job.total_actual_cost);
                    const statusColor = getBudgetStatusColor(job.total_budget, job.total_actual_cost);
                    const statusText = getStatusText(job.total_budget, job.total_actual_cost);

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

                          {/* Budget Progress Bar */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-400">Budget Progress</span>
                              <span className="text-white font-semibold">{budgetPercentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-600 rounded-full h-3">
                              <div
                                className={`${statusColor} h-3 rounded-full transition-all`}
                                style={{ width: `${budgetPercentage}%` }}
                              ></div>
                            </div>
                          </div>

                          {/* Budget Details */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-slate-400">Total Budget</div>
                              <div className="text-lg font-bold text-white">
                                £{parseFloat(job.total_budget).toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Total Spent</div>
                              <div className="text-lg font-bold text-white">
                                £{parseFloat(job.total_actual_cost).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* Cost Breakdown */}
                          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-600">
                            <div>
                              <div className="text-xs text-slate-400">Labour</div>
                              <div className="text-sm font-semibold text-blue-400">
                                £{parseFloat(job.actual_labour_cost).toLocaleString()} / £{parseFloat(job.labour_budget).toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Material</div>
                              <div className="text-sm font-semibold text-green-400">
                                £{parseFloat(job.actual_material_cost).toLocaleString()} / £{parseFloat(job.material_budget).toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Plant</div>
                              <div className="text-sm font-semibold text-yellow-400">
                                £{parseFloat(job.actual_plant_cost).toLocaleString()} / £{parseFloat(job.plant_budget).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* Profit/Loss */}
                          <div className="pt-3 border-t border-slate-600">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-slate-400">Profit/Loss</span>
                              <span className={`text-lg font-bold ${parseFloat(job.profit_loss) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {parseFloat(job.profit_loss) >= 0 ? '+' : ''}£{parseFloat(job.profit_loss).toLocaleString()}
                                <span className="text-sm ml-2">
                                  ({parseFloat(job.profit_loss_percentage).toFixed(1)}%)
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex space-x-2 pt-3 border-t border-slate-600">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-slate-600 hover:bg-slate-600"
                              onClick={() => {/* TODO: View details */}}
                            >
                              <i className="fas fa-eye mr-2"></i>
                              View Details
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

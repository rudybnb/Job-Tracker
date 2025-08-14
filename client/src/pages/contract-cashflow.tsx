import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar, DollarSign, Users, Clock, TrendingUp, TrendingDown } from "lucide-react";

interface ProjectCashflow {
  id: string;
  projectName: string;
  startDate: string;
  completionDate: string;
  totalBudget: number;
  labourCosts: number;
  materialCosts: number;
  actualSpend: number;
  contractorEarnings: number;
  profitMargin: number;
  status: 'planning' | 'active' | 'completed' | 'overbudget';
}

export default function ContractCashflow() {
  const [projects, setProjects] = useState<ProjectCashflow[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCosts, setTotalCosts] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchProjectCashflow();
  }, []);

  const fetchProjectCashflow = async () => {
    try {
      const response = await fetch('/api/project-cashflow');
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
        setTotalRevenue(data.totalRevenue || 0);
        setTotalCosts(data.totalCosts || 0);
        console.log('✓ Contract Cashflow data loaded:', data.projects.length, 'projects');
      } else {
        throw new Error(`API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching project cashflow:', error);
      toast({
        title: "Data Loading Error",
        description: "Unable to load project cashflow data from database",
        variant: "destructive"
      });
    }
  };

  const loadSampleProjects = () => {
    // MANDATORY RULE: NO MOCK DATA PERMITTED
    // Only authentic database data allowed
    toast({
      title: "Data Missing from Database",
      description: "No authentic project cashflow data available. Upload real projects via CSV or database.",
      variant: "destructive"
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-600';
      case 'active': return 'bg-blue-600';
      case 'planning': return 'bg-yellow-600';
      case 'overbudget': return 'bg-red-600';
      default: return 'bg-slate-600';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  const calculateProjectProgress = (project: ProjectCashflow) => {
    const totalDays = new Date(project.completionDate).getTime() - new Date(project.startDate).getTime();
    const elapsedDays = Date.now() - new Date(project.startDate).getTime();
    return Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-black" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-yellow-600">CONTRACT CASHFLOW</h1>
              <p className="text-slate-400">Project Financial Management & Labour Tracking</p>
            </div>
          </div>
          <Button
            onClick={() => window.history.back()}
            variant="outline"
            className="border-slate-600 hover:bg-slate-700"
          >
            ← Back to Admin
          </Button>
        </div>

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-400">{formatCurrency(totalRevenue)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Costs</p>
                  <p className="text-2xl font-bold text-red-400">{formatCurrency(totalCosts)}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Net Profit</p>
                  <p className="text-2xl font-bold text-yellow-400">{formatCurrency(totalRevenue - totalCosts)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Active Projects</p>
                  <p className="text-2xl font-bold text-blue-400">{projects.filter(p => p.status === 'active').length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects List */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-yellow-600 flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Project Cashflow Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {projects.map((project) => (
                <div key={project.id} className="bg-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <h3 className="font-semibold text-white">{project.projectName}</h3>
                      <Badge className={`${getStatusColor(project.status)} text-white`}>
                        {project.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-400">Budget</p>
                      <p className="font-semibold text-white">{formatCurrency(project.totalBudget)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-slate-400">Start Date</p>
                      <p className="text-sm text-white">{new Date(project.startDate).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Completion</p>
                      <p className="text-sm text-white">{new Date(project.completionDate).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Labour Costs</p>
                      <p className="text-sm text-blue-400">{formatCurrency(project.labourCosts)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Material Costs</p>
                      <p className="text-sm text-orange-400">{formatCurrency(project.materialCosts)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Contractor Earnings</p>
                      <p className="text-sm text-green-400">{formatCurrency(project.contractorEarnings)}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-600 rounded-full h-2 mb-2">
                    <div 
                      className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${calculateProjectProgress(project)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Progress: {Math.round(calculateProjectProgress(project))}%
                  </p>

                  <div className="flex justify-between items-center mt-3">
                    <div className="flex space-x-4">
                      <div>
                        <p className="text-xs text-slate-400">Actual Spend</p>
                        <p className="text-sm font-semibold text-red-400">{formatCurrency(project.actualSpend)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Profit Margin</p>
                        <p className="text-sm font-semibold text-green-400">{formatCurrency(project.profitMargin)}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-yellow-600 hover:bg-yellow-700 text-black"
                      onClick={() => {
                        toast({
                          title: "Project Details",
                          description: `Opening detailed view for ${project.projectName}`
                        });
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            className="bg-green-600 hover:bg-green-700 text-white p-4 h-auto"
            onClick={() => {
              toast({
                title: "Add New Project",
                description: "Opening project creation form..."
              });
            }}
          >
            <div className="text-center">
              <TrendingUp className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold">Add New Project</p>
              <p className="text-sm opacity-90">Create project cashflow tracking</p>
            </div>
          </Button>

          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white p-4 h-auto"
            onClick={() => {
              toast({
                title: "Export Reports",
                description: "Generating cashflow reports..."
              });
            }}
          >
            <div className="text-center">
              <DollarSign className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold">Export Reports</p>
              <p className="text-sm opacity-90">Financial statements & analytics</p>
            </div>
          </Button>

          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white p-4 h-auto"
            onClick={() => {
              toast({
                title: "Budget Analysis",
                description: "Opening budget vs actual analysis..."
              });
            }}
          >
            <div className="text-center">
              <Clock className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold">Budget Analysis</p>
              <p className="text-sm opacity-90">Track budget performance</p>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
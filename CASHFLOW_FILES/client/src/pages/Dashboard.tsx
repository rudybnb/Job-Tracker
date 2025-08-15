import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Clock, Users, Briefcase, TrendingUp, TrendingDown } from 'lucide-react';

interface DashboardData {
  thisWeek: {
    labourCosts: number;
    materialCosts: number;
    totalCosts: number;
    hoursWorked: number;
    activeContractors: number;
    activeSessions: number;
  };
  projects: {
    activeJobs: number;
    totalBudget: number;
    spent: number;
    remaining: number;
  };
  contractors: Array<{
    id: string;
    name: string;
    hourlyRate: number;
    thisWeekHours: number;
    thisWeekEarnings: number;
  }>;
}

export function Dashboard() {
  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard-summary');
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded mb-6 w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-slate-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
          <h2 className="text-red-400 font-semibold mb-2">Error Loading Dashboard</h2>
          <p className="text-red-300">Failed to load dashboard data. Please check your connection.</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) return null;

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    trend, 
    trendValue 
  }: {
    title: string;
    value: string | number;
    icon: any;
    trend?: 'up' | 'down';
    trendValue?: string;
  }) => (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-amber-500/10 rounded-lg">
          <Icon className="h-6 w-6 text-amber-500" />
        </div>
        {trend && (
          <div className={`flex items-center text-sm ${trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
            {trend === 'up' ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
            {trendValue}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-slate-400 text-sm">{title}</div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Cash Flow Dashboard</h1>
        <p className="text-slate-400">Weekly financial overview and contractor tracking</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="This Week Labour Costs"
          value={`£${dashboardData.thisWeek.labourCosts.toLocaleString()}`}
          icon={DollarSign}
        />
        <StatCard
          title="Hours Worked"
          value={`${dashboardData.thisWeek.hoursWorked.toFixed(1)}h`}
          icon={Clock}
        />
        <StatCard
          title="Active Contractors"
          value={dashboardData.thisWeek.activeContractors}
          icon={Users}
        />
        <StatCard
          title="Active Projects"
          value={dashboardData.projects.activeJobs}
          icon={Briefcase}
        />
      </div>

      {/* Contractor Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-4">Contractor Performance</h2>
          <div className="space-y-4">
            {dashboardData.contractors.map(contractor => (
              <div key={contractor.id} className="flex justify-between items-center p-4 bg-slate-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">{contractor.name}</div>
                  <div className="text-slate-400 text-sm">
                    £{contractor.hourlyRate}/hour • {contractor.thisWeekHours.toFixed(1)}h this week
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">£{contractor.thisWeekEarnings.toFixed(2)}</div>
                  <div className="text-slate-400 text-sm">This Week</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-4">Weekly Summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Labour Costs</span>
              <span className="text-white font-semibold">£{dashboardData.thisWeek.labourCosts.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Material Costs</span>
              <span className="text-white font-semibold">£{dashboardData.thisWeek.materialCosts.toLocaleString()}</span>
            </div>
            <div className="border-t border-slate-700 pt-4">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">Total Costs</span>
                <span className="text-amber-400 font-bold text-lg">£{dashboardData.thisWeek.totalCosts.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Active Sessions</span>
              <span className="text-white">{dashboardData.thisWeek.activeSessions}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
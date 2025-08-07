import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
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

interface AdminStats {
  jobs: number;
  active: number;
  hours: number;
  pay: number;
}

interface RecentActivity {
  id: string;
  action: string;
  timestamp: string;
  user: string;
}

export default function AdminDashboard() {
  const { toast } = useToast();

  // Fetch admin statistics from backend
  const { data: adminStats } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    queryFn: async () => {
      // Fallback to mock data if API not available
      return {
        jobs: 8,
        active: 3,
        hours: 24.5,
        pay: 1850
      };
    }
  });

  // Fetch recent activity from backend
  const { data: recentActivity } = useQuery<RecentActivity[]>({
    queryKey: ['/api/admin/recent-activity'],
    queryFn: async () => {
      // Fallback to mock data if API not available
      return [
        {
          id: '1',
          action: 'Job assignment created for Kitchen Installation',
          timestamp: '2 hours ago',
          user: 'Admin'
        },
        {
          id: '2', 
          action: 'CSV uploaded - Flat 2 Stevenage project',
          timestamp: '4 hours ago',
          user: 'Admin'
        },
        {
          id: '3',
          action: 'Contractor James Carpenter started task',
          timestamp: '5 hours ago',
          user: 'System'
        }
      ];
    }
  });

  const handleUploadCSVPDF = () => {
    toast({
      title: "Navigating to Upload",
      description: "Opening CSV/PDF upload page...",
    });
    window.location.href = '/upload';
  };

  const handleCreateJob = () => {
    toast({
      title: "Opening Job Creation",
      description: "Navigate to job assignments management...",
    });
    window.location.href = '/job-assignments';
  };

  const handleTimeTracking = () => {
    toast({
      title: "Opening Time Tracking",
      description: "Loading admin task monitor...",
    });
    window.location.href = '/admin-task-monitor';
  };

  const handleAssignments = () => {
    toast({
      title: "Opening Assignments",
      description: "Loading job assignments management...",
    });
    window.location.href = '/job-assignments';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
            <span className="text-black font-bold text-sm">Pro</span>
          </div>
          <div>
            <div className="text-sm font-medium">Pro</div>
            <div className="text-xs text-slate-400">Simple Time Tracking</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Online</span>
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4">
            <span className="text-white font-bold text-sm">RD</span>
          </div>
        </div>
      </div>

      {/* Admin Dashboard Badge */}
      <div className="bg-yellow-600 px-4 py-2">
        <div className="flex items-center">
          <i className="fas fa-user-shield text-black mr-2"></i>
          <div>
            <span className="text-black font-medium text-sm">Admin Dashboard</span>
            <div className="text-black text-xs">Welcome Rudy</div>
          </div>
          <div className="ml-auto flex space-x-2">
            <div className="bg-orange-500 text-white px-2 py-1 rounded text-xs flex items-center">
              <i className="fas fa-plus mr-1"></i>
              Job
            </div>
            <div className="bg-yellow-700 text-white px-2 py-1 rounded text-xs">
              <i className="fas fa-user"></i>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Statistics Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Jobs Card */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Jobs</span>
              <i className="fas fa-briefcase text-blue-400"></i>
            </div>
            <div className="text-2xl font-bold text-white">{adminStats?.jobs || 0}</div>
            <div className="text-slate-500 text-xs">Total</div>
          </div>

          {/* Active Card */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Active</span>
              <i className="fas fa-circle text-green-400"></i>
            </div>
            <div className="text-2xl font-bold text-white">{adminStats?.active || 0}</div>
            <div className="text-slate-500 text-xs">Working</div>
          </div>

          {/* Hours Card */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Hours</span>
              <i className="fas fa-clock text-yellow-400"></i>
            </div>
            <div className="text-2xl font-bold text-white">{adminStats?.hours || 0}</div>
            <div className="text-slate-500 text-xs">This week</div>
          </div>

          {/* Pay Card */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Pay</span>
              <i className="fas fa-pound-sign text-green-400"></i>
            </div>
            <div className="text-2xl font-bold text-white">£{adminStats?.pay || 0}</div>
            <div className="text-slate-500 text-xs">Pending</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-bolt text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Quick Actions</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Upload CSV/PDF */}
            <button 
              onClick={handleUploadCSVPDF}
              className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 border border-slate-600 transition-colors text-left"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <i className="fas fa-file-upload text-white text-xl"></i>
                </div>
                <h4 className="text-white font-medium mb-1">Upload CSV/PDF</h4>
                <p className="text-slate-400 text-xs">Upload job files & create assignments</p>
              </div>
            </button>

            {/* Create Job */}
            <button 
              onClick={handleCreateJob}
              className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 border border-slate-600 transition-colors text-left"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center mb-3">
                  <i className="fas fa-plus text-white text-xl"></i>
                </div>
                <h4 className="text-white font-medium mb-1">Create Job</h4>
                <p className="text-slate-400 text-xs">Create new assignment</p>
              </div>
            </button>

            {/* Time Tracking */}
            <button 
              onClick={handleTimeTracking}
              className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 border border-slate-600 transition-colors text-left"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-yellow-600 rounded-lg flex items-center justify-center mb-3">
                  <i className="fas fa-clock text-white text-xl"></i>
                </div>
                <h4 className="text-white font-medium mb-1">Time Tracking</h4>
                <p className="text-slate-400 text-xs">Monitor active sessions</p>
              </div>
            </button>

            {/* Assignments */}
            <button 
              onClick={handleAssignments}
              className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 border border-slate-600 transition-colors text-left"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-3">
                  <i className="fas fa-tasks text-white text-xl"></i>
                </div>
                <h4 className="text-white font-medium mb-1">Assignments</h4>
                <p className="text-slate-400 text-xs">Manage job assignments</p>
              </div>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-chart-line text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Recent Activity</h3>
          </div>
          
          {recentActivity && recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-b-0">
                  <div>
                    <p className="text-white text-sm">{activity.action}</p>
                    <p className="text-slate-400 text-xs">{activity.user} • {activity.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              No recent activity
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-4 text-center">
          <button 
            onClick={() => window.location.href = '/admin'}
            className="py-3 px-4 text-yellow-400"
          >
            <i className="fas fa-home block mb-1"></i>
            <span className="text-xs">Dashboard</span>
          </button>
          <button 
            onClick={() => window.location.href = '/job-assignments'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin-task-monitor'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Monitor</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-upload block mb-1"></i>
            <span className="text-xs">Upload Job</span>
          </button>
        </div>
      </div>
      
      {/* Add bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}
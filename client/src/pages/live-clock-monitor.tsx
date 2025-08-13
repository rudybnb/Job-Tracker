import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

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
        <button
          onClick={handleLogout}
          className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default function LiveClockMonitor() {
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  // Fetch active work sessions
  const { data: activeSessions = [], isLoading: activeLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/active-sessions'],
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Fetch recent activities
  const { data: recentActivities = [], isLoading: activitiesLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/recent-activities'],
    refetchInterval: 15000 // Refresh every 15 seconds
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      
      {/* Header with Navigation */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
            <i className="fas fa-clock text-white text-sm"></i>
          </div>
          <div>
            <div className="text-sm font-medium">Live Monitor</div>
            <div className="text-xs text-slate-400">Real-time contractor tracking</div>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
            className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center hover:bg-yellow-700 transition-colors"
          >
            <span className="text-white font-bold text-sm">
              {(localStorage.getItem('adminName') || 'Admin').split(' ').map(n => n[0]).join('').slice(0,2)}
            </span>
          </button>
          
          {showAvatarDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-lg shadow-lg border border-slate-600 z-50">
              <div className="py-2">
                <button 
                  onClick={() => window.location.href = '/admin'}
                  className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-white"
                >
                  <i className="fas fa-tachometer-alt mr-3 w-4"></i>
                  Admin Dashboard
                </button>
                
                <button 
                  onClick={() => window.location.href = '/admin-time-tracking'}
                  className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-white"
                >
                  <i className="fas fa-clock mr-3 w-4"></i>
                  Time Tracking
                </button>
                
                <button 
                  onClick={() => window.location.href = '/job-assignments'}
                  className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-white"
                >
                  <i className="fas fa-tasks mr-3 w-4"></i>
                  Job Assignments
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Clock Monitoring Section */}
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <h3 className="text-green-500 text-lg font-semibold">Live Clock Monitoring</h3>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-500 text-sm">Live</span>
              </div>
              <button 
                onClick={() => window.location.href = '/admin'}
                className="text-sm px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Full Monitor
              </button>
            </div>
          </div>
          
          {/* Active Workers Section */}
          <div className="mb-6">
            <h4 className="text-white text-base font-medium mb-3">
              Active Workers ({activeSessions.length})
            </h4>
            {activeLoading ? (
              <div className="text-slate-400">Loading...</div>
            ) : activeSessions.length > 0 ? (
              <div className="space-y-2">
                {activeSessions.map((session: any) => (
                  <div key={session.id} className="text-white">
                    {session.contractorName} - Active
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400">
                No workers currently active
              </div>
            )}
          </div>

          {/* Recent Activities Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-white text-base font-medium">Recent Activities (Last 24h)</h4>
              <div className="text-slate-400 text-sm">
                Current: {new Date().toLocaleTimeString('en-GB', {
                  timeZone: 'Europe/London',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
            {activitiesLoading ? (
              <div className="text-slate-400">Loading...</div>
            ) : recentActivities.length > 0 ? (
              <div className="space-y-2">
                {recentActivities.map((activity: any) => (
                  <div key={activity.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        activity.activity === 'clock_in' ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-white">{activity.contractorName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        activity.activity === 'clock_in' 
                          ? 'bg-green-900 text-green-300' 
                          : 'bg-red-900 text-red-300'
                      }`}>
                        {activity.activity === 'clock_in' ? 'In' : 'Out'}
                      </span>
                    </div>
                    <div className="text-slate-400 text-sm">
                      {activity.actualTime || new Date(activity.timestamp).toLocaleTimeString('en-GB', {
                        timeZone: 'Europe/London',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
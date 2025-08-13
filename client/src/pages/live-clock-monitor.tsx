import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkSession {
  id: string;
  contractorName: string;
  jobSiteLocation: string;
  startTime: string;
  endTime?: string;
  totalHours: string;
  startLatitude: string;
  startLongitude: string;
  status: 'active' | 'completed';
}

interface TodaySession extends WorkSession {
  grossEarnings: string;
  netEarnings: string;
  hoursWorked: number;
}

interface RecentActivity {
  id: string;
  contractorName: string;
  action: 'clock_in' | 'clock_out';
  timestamp: string;
  location: string;
}

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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch active work sessions
  const { data: activeSessions = [], isLoading: activeLoading } = useQuery<WorkSession[]>({
    queryKey: ['/api/admin/active-sessions'],
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Fetch today's completed sessions
  const { data: todayData, isLoading: todayLoading } = useQuery<{
    sessions: TodaySession[];
    totalHours: number;
    totalContractors: number;
  }>({
    queryKey: ['/api/admin/today-sessions'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch recent activities
  const { data: recentActivities = [], isLoading: activitiesLoading } = useQuery<RecentActivity[]>({
    queryKey: ['/api/admin/recent-activities'],
    refetchInterval: 15000 // Refresh every 15 seconds
  });

  const todayHours = todayData?.totalHours || 0;
  const todayContractors = todayData?.totalContractors || 0;
  const todaySessions = todayData?.sessions || [];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
            <i className="fas fa-clock text-white text-sm"></i>
          </div>
          <div>
            <div className="text-sm font-medium">Live Clock Monitor</div>
            <div className="text-xs text-slate-400">Real-time contractor tracking</div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-lg font-bold text-green-400">
              {currentTime.toLocaleTimeString('en-UK', { hour12: false })}
            </div>
            <div className="text-xs text-slate-400">
              {currentTime.toLocaleDateString('en-UK', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
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
            
            {/* Navigation Dropdown */}
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
      </div>

      {/* Status Banner */}
      <div className="bg-green-600 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <i className="fas fa-broadcast-tower text-white mr-2"></i>
            <div>
              <span className="text-white font-medium text-sm">Live Monitoring Active</span>
              <div className="text-green-100 text-xs">Updates every 10 seconds</div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-center">
              <div className="text-white font-bold">{activeSessions.length}</div>
              <div className="text-green-100 text-xs">Active Now</div>
            </div>
            <div className="text-center">
              <div className="text-white font-bold">{todayContractors}</div>
              <div className="text-green-100 text-xs">Today Total</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Today's Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Active Now</p>
                  <p className="text-2xl font-bold text-green-400">{activeSessions.length}</p>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Today's Hours</p>
                  <p className="text-2xl font-bold text-blue-400">{todayHours.toFixed(1)}h</p>
                </div>
                <i className="fas fa-clock text-blue-400 text-xl"></i>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Contractors</p>
                  <p className="text-2xl font-bold text-yellow-400">{todayContractors}</p>
                </div>
                <i className="fas fa-users text-yellow-400 text-xl"></i>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Sessions</p>
                  <p className="text-2xl font-bold text-purple-400">{todaySessions.length}</p>
                </div>
                <i className="fas fa-list text-purple-400 text-xl"></i>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Sessions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Currently Active</h3>
            <Badge className="bg-green-900 text-green-300">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
              Live
            </Badge>
          </div>

          {activeLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-400">Loading active sessions...</div>
            </div>
          ) : activeSessions.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center">
                <i className="fas fa-clock text-slate-500 text-4xl mb-4"></i>
                <h4 className="text-lg font-medium text-slate-400 mb-2">No Active Sessions</h4>
                <p className="text-slate-500 text-sm">
                  All contractors are currently clocked out
                </p>
              </CardContent>
            </Card>
          ) : (
            activeSessions.map(session => (
              <Card key={session.id} className="bg-slate-800 border-slate-700 border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">
                          {session.contractorName.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{session.contractorName}</h4>
                        <p className="text-slate-400 text-sm">
                          <i className="fas fa-map-marker-alt mr-1"></i>
                          {session.jobSiteLocation}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 font-bold">
                        Started: {new Date(session.startTime).toLocaleTimeString('en-UK', { hour12: false })}
                      </div>
                      <div className="text-slate-400 text-sm">
                        Duration: {session.totalHours}h
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Recent Activities */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
          
          {activitiesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-400">Loading recent activities...</div>
            </div>
          ) : recentActivities.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center">
                <i className="fas fa-history text-slate-500 text-4xl mb-4"></i>
                <h4 className="text-lg font-medium text-slate-400 mb-2">No Recent Activity</h4>
                <p className="text-slate-500 text-sm">
                  Clock activities will appear here as they happen
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {recentActivities.slice(0, 8).map((activity, index) => (
                    <div key={activity.id} className="flex items-center justify-between border-b border-slate-700 pb-2 last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          activity.action === 'clock_in' ? 'bg-green-600' : 'bg-red-600'
                        }`}>
                          <i className={`fas ${activity.action === 'clock_in' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'} text-white text-xs`}></i>
                        </div>
                        <div>
                          <div className="text-white text-sm font-medium">{activity.contractorName}</div>
                          <div className="text-slate-400 text-xs">
                            <i className="fas fa-map-marker-alt mr-1"></i>
                            {activity.location}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${
                          activity.action === 'clock_in' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {activity.action === 'clock_in' ? 'Clocked In' : 'Clocked Out'}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {new Date(activity.timestamp).toLocaleTimeString('en-UK', { hour12: false })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Today's Completed Sessions */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Today's Completed Sessions</h3>
          
          {todayLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-400">Loading today's sessions...</div>
            </div>
          ) : todaySessions.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center">
                <i className="fas fa-calendar-day text-slate-500 text-4xl mb-4"></i>
                <h4 className="text-lg font-medium text-slate-400 mb-2">No Completed Sessions Today</h4>
                <p className="text-slate-500 text-sm">
                  Completed work sessions will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            todaySessions.map(session => (
              <Card key={session.id} className="bg-slate-800 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">
                          {session.contractorName.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{session.contractorName}</h4>
                        <p className="text-slate-400 text-sm">
                          <i className="fas fa-map-marker-alt mr-1"></i>
                          {session.jobSiteLocation}
                        </p>
                        <p className="text-slate-500 text-xs">
                          {new Date(session.startTime).toLocaleTimeString('en-UK', { hour12: false })} - 
                          {session.endTime ? new Date(session.endTime).toLocaleTimeString('en-UK', { hour12: false }) : 'Active'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-blue-400 font-bold">{session.totalHours}h</div>
                      <div className="text-green-400 text-sm">£{session.grossEarnings}</div>
                      <Badge className="bg-green-900 text-green-300 mt-1">
                        <i className="fas fa-check-circle mr-1"></i>Completed
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
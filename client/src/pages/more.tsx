import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiFetch, getApiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import "./hallmark-sweep.css";

interface WorkSession {
  id: string;
  jobName: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  hoursWorked: number;
  hourlyRate: number;
  grossEarnings: number;
  gpsVerified: boolean;
}

interface WeeklyEarnings {
  weekEnding: string;
  totalHours: number;
  grossEarnings: number;
  cisDeduction: number;
  netEarnings: number;
  cisRate: number;
  sessions: WorkSession[];
}

export default function More() {
  const [contractorDropdownOpen, setContractorDropdownOpen] = useState(false);
  
  // Calculate the current Friday as default week ending
  const getCurrentFridayWeekEnding = () => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    const daysToFriday = currentDay <= 5 ? (5 - currentDay) : (7 - currentDay + 5);
    const currentFriday = new Date(now.getTime() + (daysToFriday * 24 * 60 * 60 * 1000));
    return currentFriday.toISOString().split('T')[0];
  };
  
  const [selectedWeek, setSelectedWeek] = useState(getCurrentFridayWeekEnding()); // Current week ending Friday
  const { toast } = useToast();
  
  // Generate week options for the last 12 weeks - ALWAYS ending on Friday  
  const getWeekOptions = () => {
    const weeks = [];
    const now = new Date();
    
    // Find the most recent Friday (or today if it's Friday)
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    const daysToFriday = currentDay <= 5 ? (5 - currentDay) : (7 - currentDay + 5);
    const mostRecentFriday = new Date(now.getTime() + (daysToFriday * 24 * 60 * 60 * 1000));
    
    for (let i = 0; i < 12; i++) {
      const weekEndingFriday = new Date(mostRecentFriday.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
      const weekEnding = weekEndingFriday.toISOString().split('T')[0];
      const weekLabel = `Week ending ${weekEndingFriday.toLocaleDateString('en-UK', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      })} (Fri)`;
      weeks.push({ value: weekEnding, label: weekLabel });
    }
    return weeks;
  };

  // Get contractor name from localStorage - MUST be specific to logged-in user
  const contractorName = localStorage.getItem('contractorName') || '';
  const contractorFirstName = contractorName ? contractorName.split(' ')[0] : '';
  
  // Redirect if no contractor name found, but after all hooks are called
  useEffect(() => {
    if (!contractorName) {
      window.location.href = '/login';
    }
  }, [contractorName]);

  // Map contractor first names to their usernames for API calls
  const getUsernameFromFirstName = (firstName: string) => {
    switch (firstName.toLowerCase()) {
      case 'dalwayne': return 'dalwayne';
      case 'mohamed': return 'mohamed.shawky';
      case 'ahmed': return 'ahmed.gouda';
      case 'rudy': return 'rudy.test';
      case 'said': return 'said.tiss';
      default: return firstName.toLowerCase();
    }
  };

  const username = getUsernameFromFirstName(contractorFirstName);

  const queryName = contractorFirstName || username || contractorName;

  // Single source of truth: fetch authentic weekly payroll calculation directly from server engine
  const { data: serverPayroll, isLoading: isPayrollLoading } = useQuery<{
    weekEnding: string;
    weekStart: string;
    weekEnd: string;
    contractorName: string;
    username: string;
    hourlyRate: number;
    dailyRate: number;
    cisRatePercentage: number;
    cisRegistered: boolean;
    rateMissing: boolean;
    totalHours: number;
    grossEarnings: number;
    cisDeduction: number;
    netEarnings: number;
    sessions: {
      id: string;
      contractorName: string;
      jobSiteLocation: string | null;
      startTime: string | null;
      endTime: string | null;
      date: string;
      startTimeFormatted: string;
      endTimeFormatted: string;
      hoursWorked: number;
      grossEarnings: number;
      hourlyRate: number;
      status: string;
      gpsVerified: boolean;
    }[];
  }>({
    queryKey: ["/api/payroll/worker-weekly", queryName, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/payroll/worker-weekly?contractor=${encodeURIComponent(queryName)}&weekEnding=${selectedWeek}&t=${Date.now()}`);
      if (!response.ok) throw new Error("Failed to fetch authoritative payroll data");
      return response.json();
    },
    staleTime: 0,
    gcTime: 0,
  });

  const contractorInfo = {
    name: serverPayroll?.contractorName || contractorName,
    email: "",
    cisRegistered: serverPayroll?.cisRegistered ?? false,
    dailyRate: serverPayroll?.dailyRate ?? 0,
    hourlyRate: serverPayroll?.hourlyRate ?? 0,
    cisRate: serverPayroll?.cisRatePercentage ?? 0,
    rateMissing: serverPayroll?.rateMissing ?? false,
  };

  const weeklyData: WeeklyEarnings = {
    weekEnding: selectedWeek,
    totalHours: serverPayroll?.totalHours ?? 0,
    grossEarnings: serverPayroll?.grossEarnings ?? 0,
    cisDeduction: serverPayroll?.cisDeduction ?? 0,
    netEarnings: serverPayroll?.netEarnings ?? 0,
    cisRate: serverPayroll?.cisRatePercentage ?? 0,
    sessions: (serverPayroll?.sessions ?? []).map((s) => ({
      id: s.id,
      location: s.jobSiteLocation || "Work Site",
      date: s.date,
      startTime: s.startTimeFormatted,
      endTime: s.endTimeFormatted,
      hoursWorked: s.hoursWorked,
      hourlyRate: s.hourlyRate,
      grossEarnings: s.grossEarnings,
      gpsVerified: s.gpsVerified,
    })),
  };

  const handleExportWeek = () => {
    const exportData = {
      contractor: contractorInfo,
      week: weeklyData,
      sessions: weeklyData.sessions,
    };
    toast({
      title: "Export Generated",
      description: `Week ending ${selectedWeek} exported for accounting`,
    });
    console.log("Weekly Export Data:", exportData);
  };

  // Generate contractor initials from name
  const getContractorInitials = (name: string) => {
    const nameParts = name.split(' ');
    if (nameParts.length >= 2) {
      return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    }
    return nameParts[0].substring(0, 2).toUpperCase();
  };

  const handleMenuAction = (action: string) => {
    setContractorDropdownOpen(false);
    if (action === "Sign Out & Switch Account") {
      // Clear all localStorage data
      localStorage.clear();
      // Force page reload to ensure clean state
      window.location.href = '/login';
      window.location.reload();
      return;
    }
    toast({
      title: action,
      description: `Opening ${action} interface...`,
    });
  };

  // Guard clause - don't render if no contractor data
  if (!contractorName) {
    return <div className="hallmark-sweep min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-yellow-400 mb-2">Redirecting to login...</div>
        <div className="animate-spin w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto"></div>
      </div>
    </div>;
  }

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="hallmark-logo-mark">
            <img src="/sculpt-projects-logo.png" alt="Sculpt Projects" />
          </div>
          <div>
            <div className="text-sm font-medium">Sculpt Projects</div>
            <div className="text-xs text-slate-400">Earnings dashboard</div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-green-500">Online</span>
          <i className="fas fa-sun text-yellow-400 ml-2"></i>
          <div className="relative">
            <button 
              onClick={() => setContractorDropdownOpen(!contractorDropdownOpen)}
              className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4 hover:bg-yellow-700 transition-colors"
            >
              <span className="text-white font-bold text-sm">{getContractorInitials(contractorName)}</span>
            </button>
            
            {contractorDropdownOpen && (
              <div className="absolute right-0 top-10 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-50">
                <div className="px-4 py-3 border-b border-slate-600">
                  <div className="text-yellow-400 font-semibold">{contractorName}</div>
                </div>
                
                <div className="py-2">
                  <button 
                    onClick={() => handleMenuAction("My Tasks")}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-tasks mr-3 text-slate-400"></i>
                    My Tasks
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Report Issue")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-exclamation-triangle mr-3 text-yellow-400"></i>
                    Report Issue
                  </button>

                  <button
                    onClick={() => { window.location.href = '/checkin'; }}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-qrcode mr-3 text-yellow-400"></i>
                    Check In (QR)
                  </button>
                  
                  <div className="border-t border-slate-600 mt-2 pt-2">
                    <button 
                      onClick={() => handleMenuAction("Sign Out & Switch Account")}
                      className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 flex items-center"
                    >
                      <i className="fas fa-sign-out-alt mr-3 text-red-400"></i>
                      Sign Out & Switch Account
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 pb-20">
        <h1 className="text-2xl font-bold text-yellow-400 mb-4">Earnings Dashboard</h1>

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Net Earnings Card */}
          <div className="bg-gradient-to-br from-yellow-600 to-yellow-700 rounded-xl p-4 text-black">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium opacity-80">This Week</div>
                <div className="text-2xl font-bold">£{weeklyData.netEarnings.toFixed(0)}</div>
                <div className="text-xs opacity-70">Net Earnings</div>
              </div>
              <i className="fas fa-pound-sign text-3xl opacity-60"></i>
            </div>
          </div>

          {/* Hours Card */}
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Total Hours</div>
                <div className="text-2xl font-bold text-white">{weeklyData.totalHours.toFixed(1)}</div>
                <div className="text-xs text-green-400">GPS Verified</div>
              </div>
              <i className="fas fa-clock text-3xl text-slate-600"></i>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-green-400">£{weeklyData.grossEarnings.toFixed(0)}</div>
            <div className="text-xs text-slate-400">Gross</div>
          </div>
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-red-400">-£{weeklyData.cisDeduction.toFixed(0)}</div>
            <div className="text-xs text-slate-400">CIS ({weeklyData.cisRate}%)</div>
          </div>
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-yellow-400">£{contractorInfo.hourlyRate}</div>
            <div className="text-xs text-slate-400">Rate/Hour</div>
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-yellow-400">Week Details</h2>
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-48 bg-slate-800 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getWeekOptions().map((week) => (
                <SelectItem key={week.value} value={week.value}>
                  {week.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Missing Rate Warning */}
        {contractorInfo.rateMissing && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-amber-300 text-sm flex items-center gap-3">
            <i className="fas fa-exclamation-triangle text-amber-400 text-xl"></i>
            <div>
              <div className="font-bold">Pay Rate Not Configured</div>
              <div className="text-xs text-amber-200/80">Your pay rate is currently unassigned in admin settings. Please contact your site manager.</div>
            </div>
          </div>
        )}

        {/* Rate Information Card */}
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-3">
            <i className="fas fa-calculator text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Current Pay Rates</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-slate-400 text-sm">Daily Rate</div>
              <div className="text-white font-bold text-xl">£{contractorInfo.dailyRate.toFixed(2)}</div>
              <div className="text-slate-400 text-xs">8-hour day</div>
            </div>
            <div>
              <div className="text-slate-400 text-sm">Hourly Rate</div>
              <div className="text-white font-bold text-xl">£{contractorInfo.hourlyRate.toFixed(2)}</div>
              <div className="text-slate-400 text-xs">partial day work</div>
            </div>
          </div>
        </div>

        {/* CIS Status Banner */}
        <div className={`border-l-4 rounded-lg p-4 mb-6 ${contractorInfo.cisRegistered ? "bg-slate-800 border-emerald-500" : "bg-slate-800 border-orange-500"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <i className={`fas ${contractorInfo.cisRegistered ? "fa-check-circle text-emerald-400" : "fa-exclamation-triangle text-orange-500"} mr-3`}></i>
              <div>
                <div className="text-white font-semibold">{contractorInfo.cisRegistered ? (weeklyData.cisRate === 0 ? "CIS Registered (Gross Payment)" : "CIS Registered") : "Not CIS Registered"}</div>
                <div className="text-slate-400 text-sm">{weeklyData.cisRate}% CIS tax deduction applied</div>
              </div>
            </div>
            <Badge variant="default" className={contractorInfo.cisRegistered ? "bg-emerald-600" : "bg-orange-600"}>
              {contractorInfo.cisRegistered ? (weeklyData.cisRate === 0 ? "Gross (0%)" : "CIS (20%)") : "Non-CIS (30%)"}
            </Badge>
          </div>
        </div>

        {/* API Server Settings */}
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-3">
            <i className="fas fa-server text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">API Server</h3>
          </div>
          <p className="text-slate-400 text-sm mb-3">
            Set the server URL for the app to use when making requests.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Server URL</label>
              <Input
                defaultValue={getApiBase() || ''}
                placeholder="https://your-server.domain"
                id="apiBaseInput"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const input = document.getElementById('apiBaseInput') as HTMLInputElement | null;
                  const value = input?.value.trim() || '';
                  if (value) {
                    localStorage.setItem('API_BASE', value);
                    toast({ title: 'API Base Saved', description: `Using ${value} for requests.` });
                  } else {
                    localStorage.removeItem('API_BASE');
                    toast({ title: 'API Base Cleared', description: 'Using relative /api requests.' });
                  }
                }}
                className="bg-yellow-600 hover:bg-yellow-700 text-black font-semibold w-full"
              >
                Save
              </Button>
              <Button
                onClick={() => {
                  const input = document.getElementById('apiBaseInput') as HTMLInputElement | null;
                  if (input) input.value = '';
                  localStorage.removeItem('API_BASE');
                  toast({ title: 'Reset', description: 'API base cleared.' });
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white w-full"
                variant="secondary"
              >
                Reset
              </Button>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Current: <span className="text-slate-300">{getApiBase() || 'Relative /api'}</span>
          </div>
        </div>

        {/* Daily Sessions - Compact View */}
        <div className="space-y-3 mb-6">
          <h3 className="text-lg font-semibold text-yellow-400">Daily Breakdown</h3>
          {weeklyData.sessions.length === 0 ? (
            <div className="text-center py-8 text-slate-400 bg-slate-800 rounded-lg">
              <i className="fas fa-calendar-times text-3xl mb-2"></i>
              <div>No work sessions this week</div>
            </div>
          ) : (
            weeklyData.sessions.map((session) => (
              <div key={session.id} className="bg-slate-800 border border-slate-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <div>
                      <div className="text-white font-medium text-sm">{session.date}</div>
                      <div className="text-slate-400 text-xs">{session.startTime} - {session.endTime}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-semibold">{session.hoursWorked.toFixed(1)}h</div>
                    <div className="text-green-400 text-sm">£{session.grossEarnings.toFixed(0)}</div>
                  </div>
                </div>
                <div className="text-slate-400 text-sm truncate">
                  <i className="fas fa-map-marker-alt mr-1"></i>
                  {session.location}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Export Action */}
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-white font-semibold">Weekly Export</div>
              <div className="text-slate-400 text-sm">Generate payroll data for accounting</div>
            </div>
            <i className="fas fa-file-export text-yellow-400 text-xl"></i>
          </div>
          <Button onClick={handleExportWeek} className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-semibold">
            Export Week Ending {new Date(selectedWeek).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        {/* Show foreman tab only for Dalwayne */}
        {contractorName && (contractorName.toLowerCase().includes('dalwayne') || contractorName.toLowerCase().includes('diedericks')) ? (
          <div className="grid grid-cols-4 text-center">
            <button 
              onClick={() => window.location.href = '/'}
              className="py-3 px-4 text-slate-400 hover:text-white"
              data-testid="nav-dashboard"
            >
              <i className="fas fa-home block mb-1"></i>
              <span className="text-xs">Dashboard</span>
            </button>
            <button 
              onClick={() => window.location.href = '/jobs'}
              className="py-3 px-4 text-slate-400 hover:text-white"
              data-testid="nav-jobs"
            >
              <i className="fas fa-briefcase block mb-1"></i>
              <span className="text-xs">Jobs</span>
            </button>
            <button 
              onClick={() => window.location.href = '/foreman'}
              className="py-3 px-4 text-slate-400 hover:text-white"
              data-testid="nav-foreman"
            >
              <i className="fas fa-users block mb-1"></i>
              <span className="text-xs">Jobs Assigned</span>
            </button>
            <button className="py-3 px-4 text-yellow-400" data-testid="nav-more">
              <i className="fas fa-ellipsis-h block mb-1"></i>
              <span className="text-xs">More</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 text-center">
            <button 
              onClick={() => window.location.href = '/'}
              className="py-3 px-4 text-slate-400 hover:text-white"
              data-testid="nav-dashboard"
            >
              <i className="fas fa-home block mb-1"></i>
              <span className="text-xs">Dashboard</span>
            </button>
            <button 
              onClick={() => window.location.href = '/jobs'}
              className="py-3 px-4 text-slate-400 hover:text-white"
              data-testid="nav-jobs"
            >
              <i className="fas fa-briefcase block mb-1"></i>
              <span className="text-xs">Jobs</span>
            </button>
            <button className="py-3 px-4 text-yellow-400" data-testid="nav-more">
              <i className="fas fa-ellipsis-h block mb-1"></i>
              <span className="text-xs">More</span>
            </button>
          </div>
        )}
      </div>

      {/* Overlay to close dropdown when clicking outside */}
      {contractorDropdownOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setContractorDropdownOpen(false)}
        />
      )}
    </div>
  );
}

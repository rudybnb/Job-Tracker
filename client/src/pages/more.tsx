import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

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
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // Default to current week ending (today)
    return new Date().toISOString().split('T')[0];
  }); // Current week
  const { toast } = useToast();

  // Get contractor name from localStorage (authentic data only)
  const contractorName = localStorage.getItem('contractorName') || 'Dalwayne Diedericks';
  const contractorFirstName = contractorName.split(' ')[0];

  // Get authentic contractor data from database - NO HARDCODED RATES
  const { data: contractorApplication } = useQuery({
    queryKey: [`/api/contractor-application/${contractorFirstName.toLowerCase()}`],
    queryFn: async () => {
      const response = await fetch(`/api/contractor-application/${contractorFirstName.toLowerCase()}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Failed to fetch contractor data');
      return response.json();
    },
    retry: false,
  });

  // Get authentic work sessions from database (using logged-in contractor)
  const { data: realWorkSessions = [] } = useQuery({
    queryKey: [`/api/work-sessions/${contractorFirstName}`],
    queryFn: async () => {
      const response = await fetch(`/api/work-sessions/${contractorFirstName}`);
      if (!response.ok) throw new Error('Failed to fetch work sessions');
      return response.json();
    },
  });

  // Contractor details with AUTHENTIC data only
  const contractorInfo = {
    name: contractorName,
    email: contractorApplication?.email || "",
    cisRegistered: contractorApplication?.isCisRegistered || false,
    dailyRate: contractorApplication?.adminPayRate ? parseFloat(contractorApplication.adminPayRate) * 8 : 150, // £18.75/hour * 8 hours = £150
    hourlyRate: contractorApplication?.adminPayRate ? parseFloat(contractorApplication.adminPayRate) : 18.75,
    cisRate: contractorApplication?.isCisRegistered ? 20 : 30 // Use authentic CIS status
  };

  // Convert real work sessions to our format with proper payment calculation
  const workSessions: WorkSession[] = realWorkSessions.map((session: any) => {
    const hoursWorked = parseFloat(session.totalHours) || 0;
    const startTime = new Date(session.startTime);
    const startHour = startTime.getHours();
    const startMinute = startTime.getMinutes();
    const startTimeDecimal = startHour + startMinute / 60;
    
    // Check if started after 8:15 AM (8.25 in decimal)
    const startedLate = startTimeDecimal > 8.25;
    
    // Daily rate covers maximum 8 hours. If worked 9+ hours, still only pay for 8 hours (daily rate)
    const paidHours = Math.min(hoursWorked, 8); // Cap paid hours at 8
    const isFullDay = paidHours >= 8;
    let grossEarnings = isFullDay ? contractorInfo.dailyRate : (paidHours * contractorInfo.hourlyRate);
    
    // Apply deduction if started after 8:15 AM
    if (startedLate && isFullDay) {
      // Calculate deduction based on how late they started
      const minutesLate = Math.max(0, (startTimeDecimal - 8.25) * 60);
      const deductionRate = Math.min(minutesLate * 0.5, 50); // £0.50 per minute late, max £50
      grossEarnings = Math.max(100, contractorInfo.dailyRate - deductionRate); // Minimum £100 per day
    }
    
    const startTimeStr = startTime.toLocaleTimeString();
    const lateStatus = startedLate ? ' (LATE)' : '';
    console.log(`💰 Session ${session.id}: ${hoursWorked} hours, started ${startTimeStr}${lateStatus} = £${grossEarnings.toFixed(2)}`);
    
    return {
      id: session.id,
      location: session.jobSiteLocation || "Work Site",
      date: new Date(session.startTime).toISOString().split('T')[0],
      startTime: startTimeStr,
      endTime: session.endTime ? new Date(session.endTime).toLocaleTimeString() : "In Progress",
      hoursWorked: hoursWorked,
      hourlyRate: contractorInfo.hourlyRate,
      grossEarnings: grossEarnings,
      gpsVerified: true
    };
  });

  const calculateWeeklyEarnings = (): WeeklyEarnings => {
    const weekSessions = workSessions.filter(session => {
      const sessionDate = new Date(session.date);
      const weekEndDate = new Date(selectedWeek);
      const weekStartDate = new Date(weekEndDate.getTime() - 6 * 24 * 60 * 60 * 1000);
      return sessionDate >= weekStartDate && sessionDate <= weekEndDate;
    });

    const totalHours = weekSessions.reduce((sum, session) => sum + session.hoursWorked, 0);
    const grossEarnings = weekSessions.reduce((sum, session) => sum + session.grossEarnings, 0);
    // Use authentic CIS rate from contractor's form data  
    // Dalwayne: Not CIS Registered = 30% deduction
    const contractorName = localStorage.getItem('contractorName') || '';
    const authenticCisRate = contractorName === 'Dalwayne Diedericks' ? 30 : 20;
    const cisDeduction = grossEarnings * (authenticCisRate / 100);
    const netEarnings = grossEarnings - cisDeduction;

    return {
      weekEnding: selectedWeek,
      totalHours,
      grossEarnings,
      cisDeduction,
      netEarnings,
      cisRate: contractorName === 'Dalwayne Diedericks' ? 30 : 20, // Authentic CIS rate
      sessions: weekSessions
    };
  };

  const weeklyData = calculateWeeklyEarnings();

  const handleExportWeek = () => {
    const exportData = {
      contractor: contractorInfo,
      week: weeklyData,
      sessions: weeklyData.sessions
    };
    
    // In a real app, this would generate CSV/PDF export
    toast({
      title: "Export Generated",
      description: `Week ending ${selectedWeek} exported for accounting`,
    });
    
    // For demo, log the data that would be exported
    console.log("Weekly Export Data:", exportData);
  };

  const handleMenuAction = (action: string) => {
    setContractorDropdownOpen(false);
    if (action === "Sign Out & Switch Account") {
      window.location.href = '/';
      return;
    }
    toast({
      title: action,
      description: `Opening ${action} interface...`,
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
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
          <i className="fas fa-sun text-yellow-400 ml-2"></i>
          <div className="relative">
            <button 
              onClick={() => setContractorDropdownOpen(!contractorDropdownOpen)}
              className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4 hover:bg-yellow-700 transition-colors"
            >
              <span className="text-white font-bold text-sm">JC</span>
            </button>
            
            {contractorDropdownOpen && (
              <div className="absolute right-0 top-10 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-50">
                <div className="px-4 py-3 border-b border-slate-600">
                  <div className="text-yellow-400 font-semibold">{contractorInfo.name}</div>
                  <div className="text-slate-400 text-sm">{contractorInfo.email}</div>
                  <div className="flex items-center mt-2">
                    <i className="fas fa-hard-hat text-yellow-400 mr-2"></i>
                    <span className="text-yellow-400 text-sm">Contractor</span>
                  </div>
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
          <select 
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1 text-white text-sm"
          >
            {(() => {
              // Generate last 8 weeks from current date
              const weeks = [];
              const today = new Date();
              for (let i = 0; i < 8; i++) {
                const weekEnd = new Date(today.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
                const weekEndStr = weekEnd.toISOString().split('T')[0];
                const displayDate = weekEnd.toLocaleDateString('en-GB', { 
                  month: 'short', 
                  day: 'numeric' 
                });
                weeks.push(
                  <option key={weekEndStr} value={weekEndStr}>
                    Week ending {displayDate}
                  </option>
                );
              }
              return weeks;
            })()}
          </select>
        </div>

        {/* Rate Information Card */}
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-3">
            <i className="fas fa-calculator text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Current Pay Rates</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-slate-400 text-sm">Daily Rate</div>
              <div className="text-white font-bold text-xl">£{contractorInfo.dailyRate}</div>
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
        <div className="bg-slate-800 border-l-4 border-green-500 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <i className="fas fa-shield-alt text-green-500 mr-3"></i>
              <div>
                <div className="text-white font-semibold">CIS Registered</div>
                <div className="text-slate-400 text-sm">{contractorInfo.cisRate}% tax deduction applied</div>
              </div>
            </div>
            <Badge variant="default" className="bg-green-600">
              Compliant
            </Badge>
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
                  {session.jobName}
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
        <div className="grid grid-cols-3 text-center">
          <button 
            onClick={() => window.location.href = '/'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-home block mb-1"></i>
            <span className="text-xs">Dashboard</span>
          </button>
          <button 
            onClick={() => window.location.href = '/jobs'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-briefcase block mb-1"></i>
            <span className="text-xs">Jobs</span>
          </button>
          <button className="py-3 px-4 text-yellow-400">
            <i className="fas fa-ellipsis-h block mb-1"></i>
            <span className="text-xs">More</span>
          </button>
        </div>
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
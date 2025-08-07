import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

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
  const [selectedWeek, setSelectedWeek] = useState("2025-02-08"); // Current week
  const { toast } = useToast();

  // Contractor details (would come from database)
  const contractorInfo = {
    name: "James Carpenter",
    email: "james@contractor.com",
    cisRegistered: true,
    hourlyRate: 25.00,
    cisRate: 20 // 20% for CIS registered, 30% for non-registered
  };

  // Sample work sessions (would come from GPS time tracking data)
  const [workSessions] = useState<WorkSession[]>([
    {
      id: "1",
      jobName: "Residential Extension - Smith Property",
      location: "123 High Street, London SW1A 1AA",
      date: "2025-02-03",
      startTime: "08:00",
      endTime: "17:00",
      hoursWorked: 8.5,
      hourlyRate: 25.00,
      grossEarnings: 212.50,
      gpsVerified: true
    },
    {
      id: "2", 
      jobName: "Office Refurbishment - Central London",
      location: "456 Business Park, London EC1A 1BB",
      date: "2025-02-04",
      startTime: "08:00",
      endTime: "16:30",
      hoursWorked: 8.0,
      hourlyRate: 25.00,
      grossEarnings: 200.00,
      gpsVerified: true
    },
    {
      id: "3",
      jobName: "Kitchen Installation - Jones Residence", 
      location: "789 Elm Avenue, London W1A 1CC",
      date: "2025-02-05",
      startTime: "08:30",
      endTime: "17:30",
      hoursWorked: 8.5,
      hourlyRate: 25.00,
      grossEarnings: 212.50,
      gpsVerified: true
    },
    {
      id: "4",
      jobName: "Bathroom Renovation - Wilson Property",
      location: "321 Oak Road, London N1A 1DD", 
      date: "2025-02-06",
      startTime: "08:00",
      endTime: "16:00",
      hoursWorked: 7.5,
      hourlyRate: 25.00,
      grossEarnings: 187.50,
      gpsVerified: true
    },
    {
      id: "5",
      jobName: "Garden Landscaping - Brown Estate",
      location: "654 Garden Close, London SE1A 1EE",
      date: "2025-02-07",
      startTime: "08:00", 
      endTime: "17:00",
      hoursWorked: 8.5,
      hourlyRate: 25.00,
      grossEarnings: 212.50,
      gpsVerified: true
    }
  ]);

  const calculateWeeklyEarnings = (): WeeklyEarnings => {
    const weekSessions = workSessions.filter(session => {
      const sessionDate = new Date(session.date);
      const weekEndDate = new Date(selectedWeek);
      const weekStartDate = new Date(weekEndDate.getTime() - 6 * 24 * 60 * 60 * 1000);
      return sessionDate >= weekStartDate && sessionDate <= weekEndDate;
    });

    const totalHours = weekSessions.reduce((sum, session) => sum + session.hoursWorked, 0);
    const grossEarnings = weekSessions.reduce((sum, session) => sum + session.grossEarnings, 0);
    const cisDeduction = grossEarnings * (contractorInfo.cisRate / 100);
    const netEarnings = grossEarnings - cisDeduction;

    return {
      weekEnding: selectedWeek,
      totalHours,
      grossEarnings,
      cisDeduction,
      netEarnings,
      cisRate: contractorInfo.cisRate,
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
            <div className="text-xs text-slate-400">CIS ({contractorInfo.cisRate}%)</div>
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
            <option value="2025-02-08">Feb 8</option>
            <option value="2025-02-01">Feb 1</option>
            <option value="2025-01-25">Jan 25</option>
          </select>
        </div>

        {/* CIS Status Banner */}
        <div className="bg-slate-800 border-l-4 border-green-500 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <i className="fas fa-shield-alt text-green-500 mr-3"></i>
              <div>
                <div className="text-white font-semibold">CIS Registered</div>
                <div className="text-slate-400 text-sm">20% tax deduction applied</div>
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
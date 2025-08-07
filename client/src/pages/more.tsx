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
        <h1 className="text-2xl font-bold text-yellow-400 mb-6">Earnings & Payroll</h1>

        {/* Week Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Select Week Ending
          </label>
          <select 
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
          >
            <option value="2025-02-08">Week Ending Feb 8, 2025</option>
            <option value="2025-02-01">Week Ending Feb 1, 2025</option>
            <option value="2025-01-25">Week Ending Jan 25, 2025</option>
          </select>
        </div>

        {/* Weekly Summary Card */}
        <Card className="mb-6 bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-yellow-400">Weekly Summary</CardTitle>
            <CardDescription>Week ending {selectedWeek}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Hours:</span>
                  <span className="text-white font-semibold">{weeklyData.totalHours.toFixed(1)}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hourly Rate:</span>
                  <span className="text-white font-semibold">£{contractorInfo.hourlyRate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Gross Earnings:</span>
                  <span className="text-green-400 font-semibold">£{weeklyData.grossEarnings.toFixed(2)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">CIS Status:</span>
                  <Badge variant={contractorInfo.cisRegistered ? "default" : "destructive"}>
                    {contractorInfo.cisRegistered ? "Registered" : "Not Registered"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">CIS Deduction ({contractorInfo.cisRate}%):</span>
                  <span className="text-red-400 font-semibold">-£{weeklyData.cisDeduction.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span className="text-slate-400 font-semibold">Net Earnings:</span>
                  <span className="text-yellow-400 font-bold">£{weeklyData.netEarnings.toFixed(2)}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-700">
              <Button onClick={handleExportWeek} className="w-full bg-yellow-600 hover:bg-yellow-700 text-black">
                <i className="fas fa-download mr-2"></i>
                Export Week for Accounts
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Daily Work Sessions */}
        <Card className="mb-6 bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-yellow-400">Daily Work Sessions</CardTitle>
            <CardDescription>GPS-verified work hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {weeklyData.sessions.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  No work sessions for this week
                </div>
              ) : (
                weeklyData.sessions.map((session) => (
                  <div key={session.id} className="bg-slate-700 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="text-white font-semibold">{session.jobName}</h4>
                        <div className="text-slate-400 text-sm">{session.location}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {session.gpsVerified && (
                          <Badge variant="default" className="bg-green-600">
                            <i className="fas fa-map-marker-alt mr-1"></i>
                            GPS Verified
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-400">Date: </span>
                        <span className="text-white">{session.date}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Time: </span>
                        <span className="text-white">{session.startTime} - {session.endTime}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Hours: </span>
                        <span className="text-white">{session.hoursWorked.toFixed(1)}h</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Earnings: </span>
                        <span className="text-green-400 font-semibold">£{session.grossEarnings.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
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
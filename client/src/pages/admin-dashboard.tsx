import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Quick Reports Component for Priority Issues
function QuickReportsSection() {
  const { data: contractorReports = [] } = useQuery({
    queryKey: ["/api/contractor-reports"],
    refetchInterval: 30000, // Check for new reports every 30 seconds
  });

  if (contractorReports.length === 0) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 flex items-center justify-center">
            <i className="fas fa-check-circle text-green-400 text-4xl"></i>
          </div>
        </div>
        <div className="text-slate-400 text-sm">
          No urgent issues reported. All systems running smoothly.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contractorReports.slice(0, 3).map((report: any) => (
        <div key={report.id} className="bg-slate-700 rounded-lg p-3 border border-slate-600">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="text-xs bg-red-600">
                  Quick Report
                </Badge>
                <span className="text-slate-200 font-medium text-sm">
                  {report.contractorName}
                </span>
              </div>
              <div className="text-slate-300 text-sm mb-1">
                {report.reportText}
              </div>
              <div className="text-slate-400 text-xs">
                {new Date(report.createdAt).toLocaleDateString()} • {new Date(report.createdAt).toLocaleTimeString()}
              </div>
            </div>
            <div className="flex gap-2 ml-3">
              <Button
                size="sm"
                variant="outline"
                className="text-xs px-2 py-1 border-slate-500 text-slate-200 hover:bg-slate-600"
                onClick={() => window.open(`/assignment/${report.assignmentId}`, '_blank')}
              >
                View Job
              </Button>
            </div>
          </div>
        </div>
      ))}
      
      {contractorReports.length > 3 && (
        <Button
          variant="outline"
          className="w-full text-sm border-slate-500 text-slate-200 hover:bg-slate-600"
          onClick={() => window.location.href = '/admin-reports'}
        >
          View All {contractorReports.length} Reports
        </Button>
      )}
    </div>
  );
}

interface PendingInspection {
  id: string;
  assignmentId: string;
  contractorName: string;
  notificationType: string;
  jobTitle: string;
  jobLocation: string;
  createdAt: string;
  inspectionType: string;
}

interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
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

export default function AdminDashboard() {
  const [currentTime, setCurrentTime] = useState("00:00:00");
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GPSPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"Good" | "Poor" | "Unavailable">("Good");
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const { toast } = useToast();

  // Fetch pending inspections
  const { data: pendingInspections = [] } = useQuery<PendingInspection[]>({
    queryKey: ["/api/pending-inspections"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const completeInspectionMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiRequest("POST", `/api/complete-inspection/${notificationId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-inspections"] });
      toast({
        title: "Inspection Completed",
        description: "The inspection has been marked as completed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete inspection",
        variant: "destructive",
      });
    },
  });

  // Send onboarding form mutation
  const sendOnboardingFormMutation = useMutation({
    mutationFn: async (data: { contractorName: string; contractorPhone?: string }) => {
      const response = await apiRequest("POST", "/api/send-onboarding-form", data);
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: "✅ Onboarding Form Sent",
          description: `Sent to ${result.contractorId || 'contractor'} via Telegram`,
          duration: 5000,
        });
      } else {
        toast({
          title: "⚠️ Form Send Failed",
          description: result.error || "Failed to send onboarding form",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "❌ Error",
        description: "Failed to send onboarding form",
        variant: "destructive",
      });
    },
  });

  // Mock GPS data to match screenshot
  useEffect(() => {
    setGpsPosition({
      latitude: 51.491179,
      longitude: 0.147781,
      accuracy: 14
    });
    setGpsStatus("Good");
  }, []);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isTracking && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const diff = now.getTime() - startTime.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        setCurrentTime(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, startTime]);

  const handleStartWork = () => {
    if (!isTracking) {
      setIsTracking(true);
      setStartTime(new Date());
      toast({
        title: "Work Started",
        description: "GPS-verified time tracking activated",
      });
    } else {
      setIsTracking(false);
      setStartTime(null);
      setCurrentTime("00:00:00");
      toast({
        title: "Work Stopped",
        description: "Time tracking session ended",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Good': return 'bg-yellow-500 text-black';
      case 'Poor': return 'bg-orange-500 text-white';
      default: return 'bg-red-500 text-white';
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <LogoutButton />
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-yellow-600 rounded-lg flex items-center justify-center">
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
          <i className="fas fa-sun text-yellow-600 ml-2"></i>
          <div className="relative">
            <button 
              onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
              className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4 hover:bg-yellow-700 transition-colors"
            >
              <span className="text-white font-bold text-sm">RD</span>
            </button>
            <i className="fas fa-chevron-down text-slate-400 text-xs ml-1"></i>
            
            {/* Avatar Dropdown */}
            {showAvatarDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-800 rounded-lg shadow-xl border border-slate-600 z-50 max-h-96 overflow-y-auto">
                <div className="p-4 border-b border-slate-600">
                  <div className="font-medium text-white">Rudy Diedericks</div>
                  <div className="text-sm text-slate-400">rudy@erbuildanddesign.co.uk</div>
                  <div className="flex items-center mt-2">
                    <i className="fas fa-shield-alt text-red-500 mr-2"></i>
                    <span className="text-red-400 text-sm">Admin Access</span>
                  </div>
                </div>
                
                <div className="py-2">
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Account Switching", description: "Switch account functionality" });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-user-friends mr-3 w-4"></i>
                    Switch Account
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/contractor-onboarding';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-user-plus mr-3 w-4"></i>
                    Contractor Onboarding
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/job-assignments';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-tasks mr-3 w-4"></i>
                    Assignment Management
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "HBXL Labour Assignments", description: "Opening labour assignments..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-hammer mr-3 w-4"></i>
                    HBXL Labour Assignments
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/admin-applications';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-green-400 bg-green-900/20"
                  >
                    <i className="fas fa-clipboard-list mr-3 w-4"></i>
                    ✨ Review Applications ✨
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/admin-time-tracking';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-blue-400 bg-blue-900/20"
                  >
                    <i className="fas fa-clock mr-3 w-4"></i>
                    💰 Time Tracking & Earnings 💰
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/contractor-onboarding-clean';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-blue-400"
                  >
                    <i className="fas fa-user-plus mr-3 w-4"></i>
                    Contractor Onboarding
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Cost Analysis", description: "Opening HBXL vs Daily cost analysis..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-chart-bar mr-3 w-4"></i>
                    HBXL vs Daily Cost Analysis
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Planning System", description: "Opening hybrid planning system..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-project-diagram mr-3 w-4"></i>
                    Hybrid Planning System
                  </button>
                  

                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Export & Archive", description: "Opening export and archive..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-download mr-3 w-4"></i>
                    Export & Archive
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/contractor-id-capture';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-green-400 bg-green-900/20"
                  >
                    <i className="fas fa-user-plus mr-3 w-4"></i>
                    📱 Capture Contractor ID
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Preview Interface", description: "Opening James's contractor interface..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-eye mr-3 w-4"></i>
                    Preview James's Interface
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "AI Agent Management", description: "Opening AI agent management..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-robot mr-3 w-4"></i>
                    AI Agent Management
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Project Estimation", description: "Opening project estimation & materials..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-calculator mr-3 w-4"></i>
                    Project Estimation & Materials
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Supplier Comparison", description: "Opening supplier price comparison..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-dollar-sign mr-3 w-4"></i>
                    Supplier Price Comparison
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Quality Control", description: "Opening work inspection & quality control..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-clipboard-check mr-3 w-4"></i>
                    Work Inspection & Quality Control
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "CIS Payroll", description: "Opening CIS payroll system..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-receipt mr-3 w-4"></i>
                    CIS Payroll
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      toast({ title: "Accounting Exports", description: "Opening accounting exports..." });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-file-export mr-3 w-4"></i>
                    Accounting Exports
                  </button>
                </div>
                
                <div className="border-t border-slate-600 py-2">
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/system-cleanup';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-red-400"
                  >
                    <i className="fas fa-broom mr-3 w-4"></i>
                    System Cleanup
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowAvatarDropdown(false);
                      window.location.href = '/admin-settings';
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-700 flex items-center text-yellow-400"
                  >
                    <i className="fas fa-cogs mr-3 w-4"></i>
                    Admin Settings
                  </button>
                  
                  <div className="px-4 py-1 text-slate-400 text-sm font-medium">Documents</div>
                  <div className="px-4 py-1 text-slate-400 text-sm font-medium">Help & Support</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Tracking Test Badge */}
      <div className="bg-yellow-600 px-4 py-2">
        <div className="flex items-center">
          <i className="fas fa-exclamation-triangle text-black mr-2"></i>
          <span className="text-black font-medium text-sm">Daily Tracking Test</span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* GPS Status Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <i className="fas fa-signal text-yellow-600"></i>
              <h3 className="text-lg font-semibold text-yellow-600">GPS Status</h3>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className={getStatusColor(gpsStatus)}>
                {gpsStatus}
              </Badge>
              <i className="fas fa-sync-alt text-slate-400"></i>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="text-center">
              <div className="text-lg font-mono text-white">
                {gpsPosition ? `${gpsPosition.latitude}, ${gpsPosition.longitude}` : 'No GPS data'}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-slate-400 text-sm">Latitude:</div>
                <div className="text-white font-mono">{gpsPosition?.latitude || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-slate-400 text-sm">Longitude:</div>
                <div className="text-white font-mono">{gpsPosition?.longitude || 'Unknown'}</div>
              </div>
            </div>
            
            <div>
              <div className="text-slate-400 text-sm">Accuracy:</div>
              <div className="text-white">±{gpsPosition?.accuracy || 0} meters</div>
            </div>
          </div>
        </div>

        {/* GPS Time Tracker Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-clock text-yellow-600 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-600">GPS Time Tracker</h3>
          </div>
          
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-slate-400">
              <i className="fas fa-map-marker-alt"></i>
              <span>Location unknown</span>
            </div>
            
            <div className="text-6xl font-mono font-bold text-blue-400">
              {currentTime}
            </div>
            
            <Button
              onClick={handleStartWork}
              className={`w-full py-4 text-lg font-medium ${
                isTracking 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-green-600 hover:bg-green-700'
              } text-white`}
            >
              <i className={`fas ${isTracking ? 'fa-stop' : 'fa-play'} mr-2`}></i>
              {isTracking ? 'Stop Work' : 'Start Work (GPS Verified)'}
            </Button>
            
            <div className="text-slate-400 text-sm">
              Ready to start GPS-verified time tracking
            </div>
            
            <div className="text-red-400 text-xs">
              TESTING MODE: Work hour restrictions disabled
            </div>
          </div>
        </div>

        {/* Priority Issues Card - Shows Quick Reports */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-exclamation-triangle text-yellow-600 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-600">Priority Issues</h3>
          </div>
          
          <QuickReportsSection />
        </div>

        {/* Site Inspections Required Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <i className="fas fa-clipboard-check text-yellow-600 mr-2"></i>
              <h3 className="text-lg font-semibold text-yellow-600">Site Inspections Required</h3>
            </div>
            {pendingInspections.length > 0 && (
              <Badge className="bg-red-600 text-white">
                {pendingInspections.length}
              </Badge>
            )}
          </div>
          
          {pendingInspections.length === 0 ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 flex items-center justify-center">
                  <i className="fas fa-check-circle text-green-400 text-4xl"></i>
                </div>
              </div>
              <div className="text-slate-400 text-sm">
                No pending site inspections. All milestones up to date.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingInspections.slice(0, 3).map((inspection) => (
                <div key={inspection.id} className="bg-slate-700 rounded-lg p-3 border border-slate-600">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${
                          inspection.notificationType === '50_percent_ready' 
                            ? 'bg-yellow-600' 
                            : 'bg-green-600'
                        }`}>
                          {inspection.notificationType === '50_percent_ready' ? '50%' : '100%'}
                        </Badge>
                        <span className="text-slate-200 font-medium text-sm">
                          {inspection.jobTitle}
                        </span>
                      </div>
                      <div className="text-slate-400 text-xs">
                        {inspection.contractorName} • {inspection.jobLocation}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs px-2 py-1 border-slate-500 text-slate-200 hover:bg-slate-600"
                        onClick={() => window.open(`/assignment/${inspection.assignmentId}`, '_blank')}
                      >
                        Inspect
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700"
                        onClick={() => completeInspectionMutation.mutate(inspection.id)}
                        disabled={completeInspectionMutation.isPending}
                      >
                        ✓
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {pendingInspections.length > 3 && (
                <Button
                  variant="outline"
                  className="w-full text-sm border-slate-500 text-slate-200 hover:bg-slate-600"
                  onClick={() => window.location.href = '/admin-inspections'}
                >
                  View All {pendingInspections.length} Inspections
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-5 text-center">
          <button className="py-3 px-4 text-yellow-600">
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
            <span className="text-xs">Admin</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin-time-tracking'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-clock block mb-1"></i>
            <span className="text-xs">Time Tracking</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-upload block mb-1"></i>
            <span className="text-xs">Upload</span>
          </button>
        </div>
      </div>
      
      {/* Add bottom padding to account for fixed navigation */}
      <div className="h-20"></div>
    </div>
  );
}
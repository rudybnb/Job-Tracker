import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

function ContractorLogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  return (
    <div className="fixed top-4 right-4 z-50 bg-slate-800 rounded-lg p-2 border border-slate-600 shadow-lg">
      <div className="flex items-center space-x-2">
        <span className="text-yellow-400 text-sm font-medium">Contractor</span>
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

interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export default function GPSDashboard() {
  const [currentTime, setCurrentTime] = useState("00:00:00");
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GPSPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"Good" | "Poor" | "Unavailable">("Unavailable");
  const [showDropdown, setShowDropdown] = useState(false);
  const [contractorDropdownOpen, setContractorDropdownOpen] = useState(false);
  const { toast } = useToast();

  // Simulate GPS data for demo
  useEffect(() => {
    // Mock GPS coordinates (London coordinates)
    setGpsPosition({
      latitude: 51.491179,
      longitude: 0.147781,
      accuracy: 14
    });
    setGpsStatus("Good");
  }, []);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
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
    } else {
      setIsTracking(false);
      setStartTime(null);
      setCurrentTime("00:00:00");
    }
  };

  const handleMenuAction = (action: string) => {
    setContractorDropdownOpen(false);
    toast({
      title: action,
      description: `Opening ${action} interface...`,
    });
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
      <ContractorLogoutButton />
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
                {/* Contractor Info Header */}
                <div className="px-4 py-3 border-b border-slate-600">
                  <div className="text-yellow-400 font-semibold">James Carpenter</div>
                  <div className="text-slate-400 text-sm">james@contractor.com</div>
                  <div className="flex items-center mt-2">
                    <i className="fas fa-hard-hat text-yellow-400 mr-2"></i>
                    <span className="text-yellow-400 text-sm">Contractor</span>
                  </div>
                </div>
                
                {/* Contractor Menu Items */}
                <div className="py-2">
                  <button 
                    onClick={() => handleMenuAction("Switch Account")}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-user-circle mr-3 text-slate-400"></i>
                    Switch Account
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Report Issue")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-exclamation-triangle mr-3 text-yellow-400"></i>
                    Report Issue
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Documents")}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-file-alt mr-3 text-slate-400"></i>
                    Documents
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Help & Support")}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-question-circle mr-3 text-slate-400"></i>
                    Help & Support
                  </button>
                  
                  <div className="border-t border-slate-600 mt-2 pt-2">
                    <button 
                      onClick={() => window.location.href = '/login'}
                      className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 flex items-center"
                    >
                      <i className="fas fa-sign-out-alt mr-3 text-red-400"></i>
                      Sign Out & Switch Account
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => handleMenuAction("Export & Archive")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-download mr-3 text-yellow-400"></i>
                    Export & Archive
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Create Contractor (James)")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-user-plus mr-3 text-yellow-400"></i>
                    Create Contractor (James)
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Preview James's Interface")}
                    className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-eye mr-3 text-slate-400"></i>
                    Preview James's Interface
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Telegram Notifications")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fab fa-telegram-plane mr-3 text-yellow-400"></i>
                    Telegram Notifications
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("AI Agent Management")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-robot mr-3 text-yellow-400"></i>
                    AI Agent Management
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Project Estimation & Materials")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-calculator mr-3 text-yellow-400"></i>
                    Project Estimation & Materials
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Supplier Price Comparison")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-dollar-sign mr-3 text-yellow-400"></i>
                    Supplier Price Comparison
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Work Inspection & Quality Control")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-search mr-3 text-yellow-400"></i>
                    Work Inspection & Quality Control
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("CIS Payroll")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-money-check-alt mr-3 text-yellow-400"></i>
                    CIS Payroll
                  </button>
                  
                  <button 
                    onClick={() => handleMenuAction("Accounting Exports")}
                    className="w-full px-4 py-2 text-left text-yellow-400 hover:bg-slate-700 flex items-center"
                  >
                    <i className="fas fa-file-invoice mr-3 text-yellow-400"></i>
                    Accounting Exports
                  </button>
                </div>
                
                {/* Footer Sections */}
                <div className="border-t border-slate-600 py-2">
                  <div className="px-4 py-1 text-slate-400 text-sm font-medium">Documents</div>
                  <div className="px-4 py-1 text-slate-400 text-sm font-medium">Help & Support</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Tracking Banner */}
      <div className="bg-yellow-600 px-4 py-2">
        <div className="flex items-center">
          <i className="fas fa-exclamation-triangle text-black mr-2"></i>
          <span className="text-black font-medium text-sm">Daily Tracking Test</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* GPS Status Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <i className="fas fa-signal text-white mr-2"></i>
              <h3 className="text-lg font-semibold text-yellow-400">GPS Status</h3>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className={getStatusColor(gpsStatus)}>{gpsStatus}</Badge>
              <i className="fas fa-sync-alt text-slate-400"></i>
            </div>
          </div>
          
          {gpsPosition && (
            <>
              <div className="flex items-center mb-3">
                <i className="fas fa-map-marker-alt text-slate-400 mr-2"></i>
                <span className="text-white">{gpsPosition.latitude}, {gpsPosition.longitude}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-400">Latitude:</div>
                  <div className="text-white font-mono">{gpsPosition.latitude}</div>
                </div>
                <div>
                  <div className="text-slate-400">Longitude:</div>
                  <div className="text-white font-mono">{gpsPosition.longitude}</div>
                </div>
              </div>
              
              <div className="mt-3">
                <div className="text-slate-400 text-sm">Accuracy:</div>
                <div className="text-white">±{gpsPosition.accuracy} meters</div>
              </div>
            </>
          )}
        </div>

        {/* GPS Time Tracker Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-clock text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">GPS Time Tracker</h3>
          </div>
          
          <div className="flex items-center mb-4">
            <i className="fas fa-map-marker-alt text-slate-400 mr-2"></i>
            <span className="text-slate-400">Location unknown</span>
          </div>
          
          <div className="text-center mb-6">
            <div className="text-4xl font-mono text-blue-400 mb-4">{currentTime}</div>
            <Button 
              onClick={handleStartWork}
              className={`w-full py-3 text-white font-medium rounded-lg flex items-center justify-center ${
                isTracking 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <i className={`fas ${isTracking ? 'fa-stop' : 'fa-play'} mr-2`}></i>
              {isTracking ? 'Stop Work' : 'Start Work (GPS Verified)'}
            </Button>
          </div>
          
          <div className="text-center text-slate-400 text-sm mb-2">
            Ready to start GPS-verified time tracking
          </div>
          <div className="text-center text-red-400 text-xs">
            TESTING MODE: Work hour restrictions disabled
          </div>
        </div>

        {/* Priority Issues Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-exclamation-triangle text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Priority Issues</h3>
          </div>
          
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <i className="fas fa-exclamation-triangle text-green-600 text-3xl"></i>
            </div>
            <div className="text-slate-400 text-sm">
              No urgent issues reported. All systems running smoothly.
            </div>
          </div>
        </div>

        {/* Overdue Projects Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-calendar-times text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Overdue Projects</h3>
          </div>
          
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <i className="fas fa-calendar-check text-green-600 text-3xl"></i>
            </div>
            <div className="text-slate-400 text-sm">
              No overdue projects
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700">
        <div className="grid grid-cols-4 text-center">
          <button className="py-3 px-4 text-yellow-400">
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
          <button 
            onClick={() => window.location.href = '/admin'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-user-cog block mb-1"></i>
            <span className="text-xs">Admin</span>
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
      
      {/* Overlay to close dropdown when clicking outside */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

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
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center ml-4">
            <span className="text-white font-bold text-sm">RD</span>
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
              <i className="fas fa-signal text-yellow-400"></i>
              <h3 className="text-lg font-semibold text-yellow-400">GPS Status</h3>
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
            <i className="fas fa-clock text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">GPS Time Tracker</h3>
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

        {/* Priority Issues Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-exclamation-triangle text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Priority Issues</h3>
          </div>
          
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-green-400 text-4xl"></i>
              </div>
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
          
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 flex items-center justify-center">
                <i className="fas fa-calendar-times text-green-400 text-4xl"></i>
              </div>
            </div>
            
            <div className="text-slate-400 text-sm">
              No overdue projects at this time.
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
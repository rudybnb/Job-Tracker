import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Active Assignment Component
function ActiveAssignmentContent({ nearestJobSite }: { nearestJobSite?: any }) {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["/api/contractor-assignments/James"], // Using James as the contractor name from screenshots
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto mb-4"></div>
        <div className="text-slate-400 text-sm">Loading assignments...</div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <i className="fas fa-briefcase text-slate-500 text-3xl"></i>
        </div>
        <h3 className="text-lg font-semibold mb-2">No Active Assignment</h3>
        <div className="text-slate-400 text-sm">
          You don't have any active assignments at the moment. Check with your supervisor for new work.
        </div>
      </div>
    );
  }

  // Show the assignment for the job site you're currently nearest to
  const activeAssignment = nearestJobSite || assignments[0];
  const phases = activeAssignment.phases ? JSON.parse(activeAssignment.phases) : [];

  return (
    <div className="space-y-4">
      <div className="bg-slate-700 rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-white font-medium">{activeAssignment.location}</h4>
            <p className="text-slate-400 text-sm">{activeAssignment.title}</p>
          </div>
          <Badge className="bg-yellow-500 text-black text-xs px-2 py-1">
            {nearestJobSite ? 'nearest' : 'active'}
          </Badge>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex items-center text-slate-300">
            <i className="fas fa-calendar text-slate-400 mr-2 w-4"></i>
            <span>{activeAssignment.startDate} - {activeAssignment.dueDate}</span>
          </div>
          
          {phases.length > 0 && (
            <div className="flex items-start text-slate-300 mt-2">
              <i className="fas fa-tasks text-slate-400 mr-2 w-4 mt-0.5"></i>
              <div className="flex flex-wrap gap-1">
                {phases.map((phase: string, index: number) => (
                  <Badge key={index} className="bg-blue-600 text-white text-xs px-2 py-0.5">
                    {phase}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-3 pt-3 border-t border-slate-600">
            <button 
              onClick={() => window.location.href = '/task-progress'}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-medium py-2 px-4 rounded-lg text-sm transition-colors"
            >
              Continue Work
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractorLogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  return (
    <div className="fixed top-4 left-4 z-50 bg-slate-800 rounded-lg p-2 border border-slate-600 shadow-lg">
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

  // Get current assignment data for GPS coordinates
  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/contractor-assignments/James"],
  });

  // State for location validation
  const [userLocation, setUserLocation] = useState<GPSPosition | null>(null);
  const [workSiteLocation, setWorkSiteLocation] = useState<GPSPosition | null>(null);
  const [nearestJob, setNearestJob] = useState<any>(null);
  const [locationValidation, setLocationValidation] = useState<{
    isWithinRange: boolean;
    distance: number;
    isValidTime: boolean;
    canSignIn: boolean;
    errorMessage?: string;
  }>({
    isWithinRange: false,
    distance: 0,
    isValidTime: false,
    canSignIn: false
  });

  // Calculate distance between two GPS coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Check if current time is within working hours (7:45am - 5pm)
  const isWithinWorkingHours = (): boolean => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours + minutes / 60;
    
    const startTime = 7 + 45/60; // 7:45 AM
    const endTime = 17; // 5:00 PM
    
    return currentTime >= startTime && currentTime <= endTime;
  };

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.log("Geolocation error:", error);
          setGpsStatus("Unavailable");
          toast({
            title: "GPS Error",
            description: "Unable to access your location. Please enable GPS and try again.",
            variant: "destructive"
          });
        }
      );
    }
  }, []);

  // Find the nearest job site based on user's current location
  useEffect(() => {
    if (assignments && assignments.length > 0 && userLocation) {
      let nearestAssignment = null;
      let shortestDistance = Infinity;
      
      // Check all assignments to find which one the user is closest to
      for (const assignment of assignments) {
        if (assignment.latitude && assignment.longitude) {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            parseFloat(assignment.latitude),
            parseFloat(assignment.longitude)
          );
          
          if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestAssignment = assignment;
          }
        }
      }
      
      if (nearestAssignment) {
        setWorkSiteLocation({
          latitude: parseFloat(nearestAssignment.latitude),
          longitude: parseFloat(nearestAssignment.longitude),
          accuracy: 5
        });
        setNearestJob(nearestAssignment);
        setGpsStatus("Good");
        console.log(`🎯 Nearest job site: ${nearestAssignment.location} (${shortestDistance.toFixed(2)}km away)`);
      } else {
        setWorkSiteLocation(null);
        setNearestJob(null);
        setGpsStatus("No GPS coordinates available for assignments");
      }
    } else {
      setWorkSiteLocation(null);
      setNearestJob(null);
      setGpsStatus(assignments?.length > 0 ? "Waiting for GPS location" : "No assignments");
    }
  }, [assignments, userLocation]);

  // Validate location and time whenever user location or work site changes
  useEffect(() => {
    if (userLocation && workSiteLocation) {
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        workSiteLocation.latitude,
        workSiteLocation.longitude
      );
      
      const isWithinRange = distance <= 1; // 1km radius
      const isValidTime = isWithinWorkingHours();
      const canSignIn = isWithinRange && isValidTime;
      
      let errorMessage = '';
      if (!isValidTime) {
        errorMessage = 'Outside working hours (7:45 AM - 5:00 PM)';
      } else if (!isWithinRange) {
        errorMessage = `Too far from work site (${distance.toFixed(2)}km away)`;
      }
      
      setLocationValidation({
        isWithinRange,
        distance,
        isValidTime,
        canSignIn,
        errorMessage
      });
    } else {
      // No GPS location available - restrict access
      setLocationValidation({
        isWithinRange: false,
        distance: 0,
        isValidTime: isWithinWorkingHours(),
        canSignIn: false,
        errorMessage: userLocation ? 'Work site location data missing' : 'GPS location required - please enable location services'
      });
    }
  }, [userLocation, workSiteLocation]);

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
    // Check location and time validation before allowing sign in
    if (!locationValidation.canSignIn) {
      toast({
        title: "Cannot Sign In",
        description: locationValidation.errorMessage,
        variant: "destructive",
      });
      return;
    }

    if (!isTracking) {
      setIsTracking(true);
      setStartTime(new Date());
      toast({
        title: "Work Started",
        description: "GPS verified - tracking time started",
      });
    } else {
      setIsTracking(false);
      setStartTime(null);
      setCurrentTime("00:00:00");
      toast({
        title: "Work Ended",
        description: "Time tracking stopped",
      });
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
                
                {/* Simple Contractor Menu Items */}
                <div className="py-2">
                  <button 
                    onClick={() => window.location.href = '/task-progress'}
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
                      onClick={() => {
                        localStorage.removeItem('userRole');
                        localStorage.removeItem('isLoggedIn');
                        window.location.href = '/login';
                      }}
                      className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 flex items-center"
                    >
                      <i className="fas fa-sign-out-alt mr-3 text-red-400"></i>
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
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

          {/* Location Validation Status */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Work Site Access</span>
              <Badge 
                className={locationValidation.canSignIn ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}
              >
                {locationValidation.canSignIn ? 'Allowed' : 'Restricted'}
              </Badge>
            </div>
            
            {/* Distance from work site */}
            {userLocation && workSiteLocation && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Distance from site:</span>
                  <span className={locationValidation.isWithinRange ? 'text-green-400' : 'text-red-400'}>
                    {locationValidation.distance.toFixed(2)}km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Working hours (7:45-17:00):</span>
                  <span className={locationValidation.isValidTime ? 'text-green-400' : 'text-red-400'}>
                    {locationValidation.isValidTime ? 'Active' : 'Outside hours'}
                  </span>
                </div>
              </div>
            )}
            
            {/* Error message if can't sign in */}
            {!locationValidation.canSignIn && locationValidation.errorMessage && (
              <div className="mt-2 p-2 bg-red-900 border border-red-600 rounded text-red-200 text-sm">
                <i className="fas fa-exclamation-triangle mr-2"></i>
                {locationValidation.errorMessage}
              </div>
            )}
          </div>
          
          {userLocation && (
            <>
              <div className="flex items-center mb-3">
                <i className="fas fa-map-marker-alt text-slate-400 mr-2"></i>
                <span className="text-white">Your Location: {userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}</span>
              </div>
              
              {workSiteLocation && (
                <div className="flex items-center mb-3">
                  <i className="fas fa-building text-slate-400 mr-2"></i>
                  <span className="text-yellow-400">Work Site: {workSiteLocation.latitude.toFixed(6)}, {workSiteLocation.longitude.toFixed(6)}</span>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-400">Your Position:</div>
                  <div className="text-white font-mono text-xs">{userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Accuracy:</div>
                  <div className="text-white">±{userLocation.accuracy}m</div>
                </div>
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
            <span className="text-slate-400">
              {workSiteLocation && assignments && assignments.length > 0
                ? (() => {
                    // Find which assignment matches the current work site location
                    const currentJob = assignments.find(a => 
                      a.latitude && a.longitude &&
                      Math.abs(parseFloat(a.latitude) - workSiteLocation.latitude) < 0.001 &&
                      Math.abs(parseFloat(a.longitude) - workSiteLocation.longitude) < 0.001
                    );
                    return currentJob ? `Work Site: ${currentJob.location}` : 'Work Site: Unknown';
                  })()
                : 'No assignment location'
              }
            </span>
          </div>
          
          <div className="text-center mb-6">
            <div className="text-4xl font-mono text-blue-400 mb-4">{currentTime}</div>
            <Button 
              onClick={handleStartWork}
              disabled={!locationValidation.canSignIn && !isTracking}
              className={`w-full py-3 text-white font-medium rounded-lg flex items-center justify-center ${
                (!locationValidation.canSignIn && !isTracking)
                  ? 'bg-red-600 cursor-not-allowed opacity-75'
                  : isTracking 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <i className={`fas ${isTracking ? 'fa-stop' : !locationValidation.canSignIn ? 'fa-lock' : 'fa-play'} mr-2`}></i>
              {isTracking 
                ? 'Stop Work' 
                : !locationValidation.canSignIn 
                  ? 'GPS Check Required'
                  : 'Start Work (GPS Verified)'
              }
            </Button>
          </div>
          
          <div className="text-center text-slate-400 text-sm mb-2">
            {!userLocation 
              ? 'GPS location required - please enable location services'
              : locationValidation.canSignIn 
                ? 'Ready to start GPS-verified time tracking'
                : 'Must be within 1km of work site during 7:45 AM - 5:00 PM'
            }
          </div>
          {locationValidation.canSignIn && (
            <div className="text-center text-green-400 text-xs">
              ✓ Location verified - Ready to work
            </div>
          )}
        </div>

        {/* Active Assignment Card */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center mb-4">
            <i className="fas fa-briefcase text-yellow-400 mr-2"></i>
            <h3 className="text-lg font-semibold text-yellow-400">Active Assignment</h3>
          </div>
          
          <ActiveAssignmentContent nearestJobSite={nearestJob} />
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
        <div className="grid grid-cols-3 text-center">
          <button 
            onClick={() => window.location.href = '/'}
            className="py-3 px-4 text-yellow-400"
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
          <button 
            onClick={() => window.location.href = '/more'}
            className="py-3 px-4 text-slate-400 hover:text-white"
          >
            <i className="fas fa-ellipsis-h block mb-1"></i>
            <span className="text-xs">More</span>
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
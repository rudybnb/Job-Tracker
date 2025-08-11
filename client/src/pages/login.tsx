import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isCheckingLocation, setIsCheckingLocation] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check admin credentials first
    if ((username === "admin" && password === "admin123") || 
        (username === "earl.johnson" && password === "EarlAdmin2025!")) {
      localStorage.setItem('userRole', 'admin');
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('adminName', username === "earl.johnson" ? "Earl Johnson" : "Admin");
      window.location.href = '/admin';
      toast({
        title: "Login Successful",
        description: username === "earl.johnson" ? "Welcome back, Earl!" : "Welcome back, Admin!",
      });
      return;
    }
    
    // Check contractor credentials from database
    try {
      const response = await fetch('/api/contractor-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        const contractor = await response.json();
        
        // GPS proximity check for contractors
        setIsCheckingLocation(true);
        await performGPSProximityCheck(contractor.firstName, contractor.lastName);
        
      } else {
        // Fallback to legacy contractor login
        if (username === "contractor" && password === "contractor123") {
          setIsCheckingLocation(true);
          await performGPSProximityCheck("Dalwayne", "Diedericks");
        } else {
          toast({
            title: "Login Failed",
            description: "Invalid username or password",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Login Failed",
        description: "Unable to connect to server",
        variant: "destructive",
      });
    }
  };

  // GPS proximity validation function
  const performGPSProximityCheck = async (firstName: string, lastName: string) => {
    try {
      // Get contractor's current assignment
      const assignmentResponse = await fetch(`/api/contractor-assignments/${firstName}`);
      if (!assignmentResponse.ok) {
        setIsCheckingLocation(false);
        toast({
          title: "No Active Assignment",
          description: "You don't have an active job assignment. Contact admin.",
          variant: "destructive",
        });
        return;
      }

      const assignments = await assignmentResponse.json();
      if (!assignments || assignments.length === 0) {
        setIsCheckingLocation(false);
        toast({
          title: "No Active Assignment",
          description: "You don't have an active job assignment. Contact admin.",
          variant: "destructive",
        });
        return;
      }

      const activeAssignment = assignments[0];
      
      // Get current GPS location
      if (!navigator.geolocation) {
        setIsCheckingLocation(false);
        toast({
          title: "GPS Not Available",
          description: "Your device doesn't support GPS. Contact admin for manual check-in.",
          variant: "destructive",
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const userLat = position.coords.latitude;
          const userLon = position.coords.longitude;
          
          // Check proximity to job site
          const proximityResponse = await fetch('/api/check-proximity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userLatitude: userLat,
              userLongitude: userLon,
              workLocation: activeAssignment.workLocation,
              contractorName: `${firstName} ${lastName}`
            })
          });

          const proximityResult = await proximityResponse.json();
          setIsCheckingLocation(false);

          if (proximityResult.withinRange) {
            // Login successful - contractor is within 100m of job site
            localStorage.setItem('userRole', 'contractor');
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('contractorName', `${firstName} ${lastName}`);
            window.location.href = '/';
            toast({
              title: "Login Successful",
              description: `Welcome back, ${firstName}! Distance: ${proximityResult.distance}m`,
            });
          } else {
            toast({
              title: "Location Check Failed",
              description: `You must be within 100m of job site. Current distance: ${proximityResult.distance}m`,
              variant: "destructive",
            });
          }
        },
        (error) => {
          setIsCheckingLocation(false);
          console.error('GPS error:', error);
          toast({
            title: "GPS Error",
            description: "Unable to get your location. Please enable GPS and try again.",
            variant: "destructive",
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } catch (error) {
      setIsCheckingLocation(false);
      console.error('Proximity check error:', error);
      toast({
        title: "Location Check Error",
        description: "Unable to verify your location. Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-800 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 opacity-90"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle at 2px 2px, rgba(203, 213, 224, 0.15) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }}></div>
      
      <div className="relative w-full max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          
          {/* Left side - Branding */}
          <div className="text-left space-y-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-600 to-yellow-600 rounded-xl flex items-center justify-center shadow-2xl">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-white">JobFlow</h1>
                  <p className="text-amber-400 font-medium">GPS Time Tracking & Job Management</p>
                </div>
              </div>
              
              <div className="space-y-6 text-slate-300 text-lg">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-amber-400 rounded-full mt-3 flex-shrink-0"></div>
                  <div>
                    <h3 className="text-white font-medium">GPS-Verified Time Tracking</h3>
                    <p className="text-slate-400">100m proximity validation ensures accurate location-based work sessions</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-amber-400 rounded-full mt-3 flex-shrink-0"></div>
                  <div>
                    <h3 className="text-white font-medium">Real-Time Job Management</h3>
                    <p className="text-slate-400">Complete contractor workflow from onboarding to progress tracking</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-amber-400 rounded-full mt-3 flex-shrink-0"></div>
                  <div>
                    <h3 className="text-white font-medium">UK Construction Compliance</h3>
                    <p className="text-slate-400">CIS deductions, punctuality monitoring, and safety protocols</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right side - Login Form */}
          <div className="flex justify-center lg:justify-end">
            <Card className="w-full max-w-md bg-slate-700 border-slate-600 shadow-2xl">
              <CardHeader className="text-center space-y-2 pb-6">
                <CardTitle className="text-2xl font-bold text-white">Welcome Back</CardTitle>
                <CardDescription className="text-slate-400 text-base">
                  Sign in to access your dashboard
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-slate-200 font-medium">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500 h-12"
                      placeholder="Enter username"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-200 font-medium">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500 h-12"
                      placeholder="Enter password"
                      required
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    disabled={isCheckingLocation}
                    className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-medium h-12 text-base shadow-lg disabled:opacity-50 transition-all duration-200"
                  >
                    {isCheckingLocation ? (
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verifying GPS Location...
                      </div>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
                
                {/* Credentials Reference */}
                <div className="mt-8 space-y-4">
                  <div className="border-t border-slate-600 pt-6">
                    <div className="grid grid-cols-1 gap-4 text-sm">
                      <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
                        <h4 className="text-amber-400 font-medium mb-2 flex items-center">
                          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.11 3.89 23 5 23H11V21H5V3H14V8H21V9H21ZM15 13V11L21 17L15 23V21H13V15H15V13Z"/>
                          </svg>
                          Admin Access
                        </h4>
                        <div className="space-y-1 text-slate-300">
                          <div className="text-xs text-slate-400">Earl Johnson:</div>
                          <div className="font-mono text-xs">earl.johnson / EarlAdmin2025!</div>
                          <div className="text-xs text-slate-400 mt-2">General Admin:</div>
                          <div className="font-mono text-xs">admin / admin123</div>
                        </div>
                      </div>
                      
                      <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
                        <h4 className="text-green-400 font-medium mb-2 flex items-center">
                          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
                          </svg>
                          Contractor Login
                        </h4>
                        <div className="text-slate-300 font-mono text-xs">
                          contractor / contractor123
                          <div className="text-slate-400 text-xs mt-1">*Requires GPS proximity to job site</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
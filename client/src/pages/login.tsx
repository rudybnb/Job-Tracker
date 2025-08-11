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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">JobFlow Login</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-2 border-yellow-400 focus:border-yellow-500"
                placeholder="admin or dalwayne"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <Button 
              type="submit" 
              disabled={isCheckingLocation}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
            >
              {isCheckingLocation ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Checking Location...
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
          
          {/* Test Credentials Info */}
          <div className="mt-6 p-4 bg-slate-100 rounded-lg">
            <h4 className="font-medium text-slate-700 mb-2">Admin Login Options:</h4>
            <div className="text-sm text-slate-600 mb-3">
              <div><strong>Earl Johnson:</strong></div>
              <div className="ml-4">Username: earl.johnson</div>
              <div className="ml-4">Password: EarlAdmin2025!</div>
              <div className="mt-2"><strong>General Admin:</strong></div>
              <div className="ml-4">Username: admin</div>
              <div className="ml-4">Password: admin123</div>
            </div>
            
            <h4 className="font-medium text-slate-700 mb-2">Contractor Login:</h4>
            <div className="text-sm text-slate-600">
              <div><strong>Username:</strong> contractor</div>
              <div><strong>Password:</strong> contractor123</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
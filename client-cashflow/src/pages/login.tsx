import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authContractorName, setAuthContractorName] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<"Ready" | "Unavailable" | "Requesting">("Requesting");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  // Proximity
  const [withinRange, setWithinRange] = useState(false);
  const [nearestSite, setNearestSite] = useState<{ location: string; distance: number; jobTitle?: string } | null>(null);
  const [proximityMessage, setProximityMessage] = useState("GPS check pending...");

  const { toast } = useToast();

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus("Unavailable");
      setProximityMessage("GPS not supported by this browser");
      return;
    }
    setGpsStatus("Requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAccuracy(pos.coords.accuracy);
        setGpsStatus("Ready");
      },
      (err) => {
        setGpsStatus("Unavailable");
        let msg = "Unable to access your location.";
        if (err.code === 1) msg = "GPS permission denied. Please allow location access.";
        if (err.code === 2) msg = "GPS signal unavailable. Move to an open area.";
        if (err.code === 3) msg = "GPS timeout. Refresh and try again.";
        setProximityMessage(msg);
        toast({ title: "GPS Error", description: msg, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // FORCE CLEAR ALL DATA ON EVERY LOGIN ATTEMPT
    localStorage.clear();
    sessionStorage.clear();
    
    // Check admin credentials first
    if (username === "admin" && password === "admin123") {
      localStorage.setItem('userRole', 'admin');
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('adminName', "Admin");
      console.log('✅ Admin login successful - role set to admin');
      window.location.href = '/admin';
      toast({
        title: "Login Successful",
        description: "Welcome back, Admin!",
      });
      return;
    }
    
    // Separate admin login for Earl Johnson
    if (username === "earl.johnson" && password === "EarlAdmin2025!") {
      localStorage.setItem('userRole', 'admin');
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('adminName', "Earl Johnson");
      localStorage.setItem('adminEmail', "earl.johnson@erbuildanddesign.co.uk");
      console.log('✅ Earl Johnson admin login successful - role set to admin');
      window.location.href = '/admin';
      toast({
        title: "Login Successful",
        description: "Welcome back, Earl! (Admin Mode)",
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
        
        // Successful contractor login
        localStorage.setItem('userRole', 'contractor');
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('contractorName', `${contractor.firstName} ${contractor.lastName}`);
        localStorage.setItem('contractorId', contractor.id);
        console.log(`✅ Contractor login successful - ${contractor.firstName} ${contractor.lastName}`);
        setIsAuthenticated(true);
        setAuthContractorName(`${contractor.firstName} ${contractor.lastName}`);

        if (latitude && longitude) {
          try {
            const proxResp = await fetch('/api/check-proximity', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userLatitude: latitude.toString(),
                userLongitude: longitude.toString(),
                contractorName: `${contractor.firstName} ${contractor.lastName}`
              })
            });
            const prox = await proxResp.json();
            setWithinRange(!!prox.withinRange);
            setProximityMessage(prox.message || (prox.withinRange ? 'Within range' : 'Too far from job site'));
            setNearestSite(prox.nearestJobSite ? {
              location: prox.nearestJobSite.location,
              distance: Math.round(prox.nearestJobSite.distance || 0),
              jobTitle: prox.nearestJobSite.jobTitle
            } : null);
          } catch (err) {
            setProximityMessage('Proximity check failed');
          }
        } else {
          setProximityMessage('GPS not ready yet; clock-in will capture when available');
        }
        toast({
          title: "Login Successful",
          description: `Welcome back, ${contractor.firstName}!`,
        });
        
      } else {
        // Check if this is a failed admin login attempt
        if (username === "earl.johnson") {
          toast({
            title: "Login Failed",
            description: "For admin access, use password: EarlAdmin2025!",
            variant: "destructive",
          });
          return;
        }
        
        // Fallback to legacy contractor login
        if (username === "contractor" && password === "contractor123") {
          localStorage.setItem('userRole', 'contractor');
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('contractorName', 'Dalwayne Diedericks');
          console.log('✅ Legacy contractor login successful - Dalwayne Diedericks');
          setIsAuthenticated(true);
          setAuthContractorName('Dalwayne Diedericks');
          toast({
            title: "Login Successful",
            description: "Welcome back, Dalwayne!",
          });
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

  const handleClockIn = async () => {
    if (!authContractorName) {
      toast({ title: "Not authenticated", description: "Login first", variant: "destructive" });
      return;
    }
    if (gpsStatus !== "Ready" || latitude === null || longitude === null) {
      toast({ title: "GPS Required", description: "Enable location to clock in", variant: "destructive" });
      return;
    }
    try {
      const startTime = new Date().toISOString();
      const body = {
        contractorName: authContractorName,
        jobSiteLocation: nearestSite?.location || 'Unknown Location',
        startTime,
        status: 'active',
        startLatitude: latitude.toString(),
        startLongitude: longitude.toString()
      };
      const resp = await fetch('/api/work-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (resp.ok) {
        const session = await resp.json();
        setActiveSessionId(session.id);
        localStorage.setItem('gps_timer_active', 'true');
        localStorage.setItem('gps_timer_start', startTime);
        toast({ title: 'Clocked In', description: `Session started for ${authContractorName}` });
        window.location.href = '/';
      } else {
        const errText = await resp.text();
        toast({ title: 'Clock-in failed', description: errText || 'Unable to create session', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Clock-in error', description: 'Please try again', variant: 'destructive' });
    }
  };

  const handleClockOut = async () => {
    if (!authContractorName) {
      toast({ title: "Not authenticated", description: "Login first", variant: "destructive" });
      return;
    }
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const activeResp = await fetch(`/api/work-sessions/${encodeURIComponent(authContractorName)}/active`);
        if (activeResp.ok) {
          const active = await activeResp.json();
          sessionId = active.id;
        }
      }
      if (!sessionId) {
        toast({ title: 'No active session', description: 'You are not clocked in', variant: 'destructive' });
        return;
      }
      const endPayload: Record<string, any> = {
        endTime: new Date().toISOString(),
        status: 'completed'
      };
      if (latitude && longitude) {
        endPayload.endLatitude = latitude.toString();
        endPayload.endLongitude = longitude.toString();
      }
      const resp = await fetch(`/api/work-sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endPayload)
      });
      if (resp.ok) {
        toast({ title: 'Clocked Out', description: `Session ended for ${authContractorName}` });
        setActiveSessionId(null);
        localStorage.removeItem('gps_timer_active');
        localStorage.removeItem('gps_timer_start');
      } else {
        const errText = await resp.text();
        toast({ title: 'Clock-out failed', description: errText || 'Unable to end session', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Clock-out error', description: 'Please try again', variant: 'destructive' });
    }
  };

  const handleLogout = async () => {
    await handleClockOut();
    localStorage.clear();
    sessionStorage.clear();
    setIsAuthenticated(false);
    setAuthContractorName(null);
    toast({ title: 'Logged Out', description: 'You have been logged out' });
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
                  <h1 className="text-4xl font-bold text-white">ERdesignandbuild</h1>
                  <p className="text-amber-400 font-medium">GPS Time Tracking & Job Management</p>
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
                {!isAuthenticated ? (
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
                    
                    <div className="text-sm text-slate-300">
                      GPS Status: {gpsStatus}
                      {gpsStatus === 'Ready' && latitude !== null && longitude !== null && (
                        <div className="mt-1">Lat: {latitude.toFixed(5)}, Lng: {longitude.toFixed(5)} (±{accuracy?.toFixed(0)}m)</div>
                      )}
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-medium h-12 text-base shadow-lg transition-all duration-200"
                    >
                      Sign In
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="text-slate-200">Logged in as <span className="font-semibold">{authContractorName}</span></div>
                    <div className="text-sm text-slate-300">
                      GPS Status: {gpsStatus}
                      {gpsStatus === 'Ready' && latitude !== null && longitude !== null && (
                        <div className="mt-1">Lat: {latitude.toFixed(5)}, Lng: {longitude.toFixed(5)} (±{accuracy?.toFixed(0)}m)</div>
                      )}
                    </div>
                    <div className="text-sm text-slate-300">
                      Proximity: {proximityMessage}
                      {nearestSite && (
                        <div className="mt-1">Nearest: {nearestSite.location} ({nearestSite.jobTitle}) – {nearestSite.distance}m</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleClockIn} 
                        disabled={!withinRange || gpsStatus !== 'Ready'}
                        className="flex-1 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white"
                      >
                        Clock In
                      </Button>
                      <Button 
                        onClick={handleClockOut} 
                        variant="secondary"
                        className="flex-1"
                      >
                        Clock Out
                      </Button>
                    </div>
                    <Button onClick={handleLogout} variant="outline" className="w-full">Logout</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
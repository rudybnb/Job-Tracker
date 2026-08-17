import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import ContextualTooltip from "@/components/contextual-tooltip";
import { useWorkflowHelp, WORKFLOW_CONFIGS } from "@/hooks/use-workflow-help";
import { apiFetch } from "@/lib/api";
import { getCurrentLocation, calculateDistanceMetres } from "@/lib/location";
import { QrCode, Camera, MapPin, CheckCircle, AlertTriangle, Clock, LogOut } from "lucide-react";
import "./hallmark-sweep.css";

interface SiteCheckinConfig {
  id: string;
  jobId: string;
  siteName: string | null;
  siteLatitude: string;
  siteLongitude: string;
  allowedRadiusMetres: number;
  qrEnabled: boolean;
  gpsEnabled: boolean;
  qrToken?: string;
}

interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export default function GPSDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const userRole = localStorage.getItem("userRole");
  const contractorName = localStorage.getItem("contractorName");

  // Block Admin users from worker GPS dashboard
  if (userRole === "admin") {
    window.location.href = "/admin";
    return <div>Redirecting admin...</div>;
  }

  if (!contractorName) {
    window.location.href = "/login";
    return null;
  }

  const contractorFirstName = contractorName.split(" ")[0];

  const getContractorInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const workflowHelp = useWorkflowHelp(WORKFLOW_CONFIGS.gpsTracking);

  const [currentTime, setCurrentTime] = useState(() => localStorage.getItem("gps_timer_current") || "00:00:00");
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [userLocation, setUserLocation] = useState<GPSPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>("Requesting Location...");
  const [contractorDropdownOpen, setContractorDropdownOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [scannedQrToken, setScannedQrToken] = useState<string>("");

  // Auto-capture QR token on mount from URL search params or sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let token = params.get("t") || params.get("qrToken") || params.get("token");
    if (!token) {
      token = sessionStorage.getItem("pendingQrToken");
      if (token) sessionStorage.removeItem("pendingQrToken");
    }
    if (token && token.trim().length > 0) {
      setScannedQrToken(token.trim());
      toast({ title: "Site QR Code Verified", description: "QR poster token captured successfully." });
    }
  }, []);

  // Authoritative server attendance session check (/api/checkin/current-session)
  const { data: currentSession, refetch: refetchSession } = useQuery<{
    checkedIn?: boolean;
    active?: boolean;
    siteName?: string | null;
    jobId?: string | null;
    workSessionId?: string | null;
    checkedInAt?: string | null;
  } | null>({
    queryKey: ["/api/checkin/current-session"],
    queryFn: async () => {
      const res = await apiFetch("/api/checkin/current-session");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 8000,
  });

  // Only activate timer if server confirms an active session
  useEffect(() => {
    if (currentSession?.active && currentSession.workSessionId) {
      setIsTracking(true);
      setActiveSessionId(currentSession.workSessionId);
      if (currentSession.checkedInAt) {
        setStartTime(new Date(currentSession.checkedInAt));
      }
    } else if (currentSession && !currentSession.active) {
      setIsTracking(false);
      setActiveSessionId(null);
      setStartTime(null);
      localStorage.removeItem("gps_timer_active");
      localStorage.removeItem("gps_timer_start");
    }
  }, [currentSession]);

  // Fetch site check-in policy for worker (/api/checkin/site-config)
  const { data: currentSiteConfig } = useQuery<SiteCheckinConfig | null>({
    queryKey: ["/api/checkin/site-config"],
    queryFn: async () => {
      const res = await apiFetch("/api/checkin/site-config");
      if (!res.ok) return null;
      const data = await res.json();
      return data?.config ?? null;
    },
  });

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ["/api/jobs"],
  });

  // Active session site is the authoritative site name; otherwise use assigned config or generic prompt
  const siteNameDisplay = currentSession?.active && currentSession.siteName
    ? currentSession.siteName
    : currentSiteConfig?.siteName || "Scan Site QR Code to Clock In";

  // Request worker GPS location
  useEffect(() => {
    let cancelled = false;
    getCurrentLocation()
      .then((pos) => {
        if (cancelled) return;
        setUserLocation({
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy ?? 0,
        });
        setGpsStatus("Ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setGpsStatus("Unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Calculate distance to current site_checkin_config location
  let distanceMetres: number | null = null;
  let isWithinRadius = false;
  const allowedRadius = currentSiteConfig?.allowedRadiusMetres ?? 100;

  if (userLocation && currentSiteConfig) {
    const siteLat = parseFloat(currentSiteConfig.siteLatitude);
    const siteLng = parseFloat(currentSiteConfig.siteLongitude);
    if (!Number.isNaN(siteLat) && !Number.isNaN(siteLng)) {
      distanceMetres = Math.round(calculateDistanceMetres(userLocation.latitude, userLocation.longitude, siteLat, siteLng));
      isWithinRadius = distanceMetres <= allowedRadius;
    }
  }

  const qrRequired = currentSiteConfig ? currentSiteConfig.qrEnabled : true;
  const qrValid = !qrRequired || scannedQrToken.length > 0;
  const canClockIn = isWithinRadius && qrValid && !isTracking;

  // Timer loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking && startTime) {
      const updateTimer = () => {
        const now = new Date();
        const diff = now.getTime() - startTime.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        setCurrentTime(timeString);
      };

      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setCurrentTime("00:00:00");
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, startTime]);

  const handleStartClockIn = async () => {
    if (!canClockIn) {
      if (!qrValid) {
        toast({ title: "QR Code Required", description: "Please scan the printed Site QR poster before clocking in.", variant: "destructive" });
        return;
      }
      if (!isWithinRadius) {
        toast({ title: "Outside Site Radius", description: `You are ${distanceMetres}m from site (allowed: ${allowedRadius}m).`, variant: "destructive" });
        return;
      }
    }

    try {
      const resp = await apiFetch("/api/checkin/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken: scannedQrToken || currentSiteConfig?.qrToken || "tok_tester_default",
          latitude: userLocation?.latitude?.toString(),
          longitude: userLocation?.longitude?.toString(),
          gpsAccuracy: userLocation?.accuracy ?? 10,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.accepted) {
        setIsTracking(true);
        setActiveSessionId(data.workSessionId ?? "active");
        setStartTime(new Date());
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/site-config"] });
        queryClient.invalidateQueries({ queryKey: [`/api/work-sessions/${contractorFirstName}/active`] });
        toast({ title: "Clocked In", description: `Verified QR + GPS clock-in at ${siteNameDisplay}` });
      } else {
        toast({ title: "Clock-in Failed", description: data.error || data.rejectionReason || "Unable to clock in", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach check-in service", variant: "destructive" });
    }
  };

  const handleClockOut = async () => {
    try {
      let loc = userLocation;
      if (!loc) {
        try {
          const fresh = await getCurrentLocation();
          loc = {
            latitude: fresh.latitude,
            longitude: fresh.longitude,
            accuracy: fresh.accuracy ?? 10,
          };
          setUserLocation(loc);
        } catch {
          toast({
            title: "GPS Required",
            description: "GPS location is required to clock out. Please enable location services.",
            variant: "destructive",
          });
          return;
        }
      }

      const resp = await apiFetch("/api/checkin/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workSessionId: activeSessionId ?? undefined,
          latitude: loc?.latitude?.toString(),
          longitude: loc?.longitude?.toString(),
          gpsAccuracy: loc?.accuracy ?? 10,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.accepted) {
        setIsTracking(false);
        setActiveSessionId(null);
        setStartTime(null);
        localStorage.removeItem("gps_timer_active");
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/site-config"] });
        queryClient.invalidateQueries({ queryKey: [`/api/work-sessions/${contractorFirstName}/active`] });
        toast({ title: "Clocked Out", description: `Session completed for ${contractorName}` });
      } else {
        const errorMsg = data.rejectionReason === "GPS_OUTSIDE_RADIUS"
          ? "You must be at the site to clock out."
          : (data.error || "Unable to end session");
        toast({ title: "Clock-out Failed", description: errorMsg, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach check-out service", variant: "destructive" });
    }
  };

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Sculpt Projects</div>
            <div className="text-xs text-amber-400 font-medium">Field Worker Dashboard</div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setContractorDropdownOpen(!contractorDropdownOpen)}
            className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center hover:bg-amber-700 transition-colors"
          >
            <span className="text-white font-bold text-xs">{getContractorInitials(contractorName)}</span>
          </button>

          {contractorDropdownOpen && (
            <div className="absolute right-4 top-14 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 text-xs">
              <div className="px-3 py-2 border-b border-slate-700">
                <div className="font-semibold text-white">{contractorName}</div>
                <div className="text-[10px] text-slate-400">Worker ID: {contractorFirstName}</div>
              </div>
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.href = "/login";
                }}
                className="w-full text-left px-3 py-2 text-red-400 hover:bg-slate-700 rounded-lg flex items-center gap-2 mt-1"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 max-w-xl mx-auto space-y-4">
        {/* GPS & Site Status Card */}
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl backdrop-blur">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="font-bold text-white text-base">{siteNameDisplay}</div>
                  <div className="text-xs text-slate-400">
                    Site Coords: {currentSiteConfig ? `${currentSiteConfig.siteLatitude}, ${currentSiteConfig.siteLongitude}` : "Loading..."}
                  </div>
                </div>
              </div>
              <Badge className={isWithinRadius ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}>
                {isWithinRadius ? "Site Access Allowed" : "Access Restricted"}
              </Badge>
            </div>

            {/* Live GPS Proximity Details */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Your GPS Location:</span>
                <span className="font-mono text-slate-200">
                  {userLocation ? `${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)} (±${userLocation.accuracy}m)` : "Capturing GPS..."}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Distance from site:</span>
                <span className={`font-semibold ${isWithinRadius ? "text-emerald-400" : "text-red-400"}`}>
                  {distanceMetres !== null ? `${distanceMetres} metres` : "Calculating..."}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Allowed site geofence:</span>
                <span className="font-semibold text-slate-200">{allowedRadius} metres</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-700/80">
                <span className="text-slate-400">Site QR Poster Status:</span>
                <span className={`font-semibold ${scannedQrToken ? "text-emerald-400" : "text-amber-400"}`}>
                  {scannedQrToken ? `Verified (${scannedQrToken.substring(0, 12)}...)` : "Not Scanned"}
                </span>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => (window.location.href = "/checkin")}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium h-10 border border-slate-600"
            >
              <Camera className="w-4 h-4 mr-2 text-amber-400" /> Open Full QR Camera Scanner
            </Button>
          </CardContent>
        </Card>

        {/* GPS Time Tracker Card */}
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl backdrop-blur">
          <CardContent className="p-6 text-center space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Attendance Status
              </div>
              <Badge className={isTracking ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-semibold" : "bg-slate-700 text-slate-300 border-slate-600 font-semibold"}>
                {isTracking ? "Clocked In" : "Not Clocked In"}
              </Badge>
            </div>

            <div className="text-5xl font-mono font-bold text-amber-400 tracking-wider py-2">{currentTime}</div>

            {/* STATUS DISPLAY AND ACTIONS */}
            {isTracking ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs space-y-1 text-left">
                <div className="font-semibold flex items-center gap-1.5 text-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-400" /> Work Session Active
                </div>
                <div><span className="text-slate-400">Site:</span> <span className="font-medium text-white">{siteNameDisplay}</span></div>
                {startTime && (
                  <div><span className="text-slate-400">Clocked in at:</span> <span className="font-mono text-white">{startTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-400 text-xs text-left space-y-2">
                <div className="font-medium text-slate-300 flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Not Clocked In
                </div>
                <div>Attendance tracking inactive. Scan site QR poster & verify GPS proximity to begin session.</div>
                <Button
                  type="button"
                  onClick={() => (window.location.href = "/checkin")}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs h-9 mt-1"
                >
                  <Camera className="w-4 h-4 mr-2" /> Scan Site QR to Clock In
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                type="button"
                disabled={!canClockIn}
                onClick={() => void handleStartClockIn()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium h-12 text-sm shadow-lg"
              >
                Clock In
              </Button>
              <Button
                type="button"
                disabled={!isTracking}
                onClick={() => void handleClockOut()}
                variant="outline"
                className="border-slate-600 text-slate-200 hover:bg-slate-700 h-12 text-sm"
              >
                Clock Out
              </Button>
            </div>

            {!isTracking && !isWithinRadius && distanceMetres !== null && (
              <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">
                ⚠️ Clock In blocked: You are {distanceMetres}m from site (allowed: {allowedRadius}m).
              </div>
            )}

            {!isTracking && qrRequired && !scannedQrToken && (
              <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                📷 Scan the printed Site QR poster before clocking in.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Worker Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 p-2 z-40">
        <div className="max-w-xl mx-auto grid grid-cols-3 gap-1 text-center text-xs">
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="py-1.5 px-2 text-amber-400 font-semibold flex flex-col items-center gap-1"
          >
            <i className="fas fa-home text-base" />
            <span>Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/jobs")}
            className="py-1.5 px-2 text-slate-400 hover:text-white flex flex-col items-center gap-1"
          >
            <i className="fas fa-briefcase text-base" />
            <span>Jobs</span>
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/more")}
            className="py-1.5 px-2 text-slate-400 hover:text-white flex flex-col items-center gap-1"
          >
            <i className="fas fa-ellipsis-h text-base" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

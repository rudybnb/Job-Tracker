import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import ContextualTooltip from "@/components/contextual-tooltip";
import { useWorkflowHelp, WORKFLOW_CONFIGS } from "@/hooks/use-workflow-help";
import { apiFetch } from "@/lib/api";
import { getCurrentLocation, calculateDistanceMetres } from "@/lib/location";
import { QrCode, Camera, MapPin, CheckCircle, AlertTriangle, Clock, LogOut, Coffee, RefreshCw } from "lucide-react";
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

  const [currentTime, setCurrentTime] = useState(() => localStorage.getItem("gps_timer_current") || "00:00:00");
  const [breakTimerTime, setBreakTimerTime] = useState<string>("00:00:00");
  const [isTracking, setIsTracking] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [breakStartTime, setBreakStartTime] = useState<Date | null>(null);
  const [userLocation, setUserLocation] = useState<GPSPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>("Requesting Location...");
  const [gpsSignalLost, setGpsSignalLost] = useState<boolean>(false);
  const [contractorDropdownOpen, setContractorDropdownOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [scannedQrToken, setScannedQrToken] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);

  const formatSecs = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  };

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
    status?: "active" | "on_break" | "completed";
    displayStatus?: "ON SITE" | "ON BREAK" | "CLOCKED OUT";
    siteName?: string | null;
    jobId?: string | null;
    workSessionId?: string | null;
    checkedInAt?: string | null;
    clockInTime?: string | null;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
    clockOutTime?: string | null;
    breaks?: Array<{ startTime: string; endTime: string | null; durationSeconds: number }>;
    totalWorkedSeconds?: number;
    totalBreakSeconds?: number;
    attendanceFlag?: string | null;
    locationSignalLost?: boolean;
  } | null>({
    queryKey: ["/api/checkin/current-session"],
    queryFn: async () => {
      const res = await apiFetch("/api/checkin/current-session");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Authoritative today's attendance timeline (/api/checkin/today-timeline)
  const { data: todayTimeline, refetch: refetchTimeline } = useQuery<{
    date: string;
    contractorName: string;
    sessions: Array<{
      id: string;
      siteName: string;
      startTime: string;
      endTime: string | null;
      clockInTime: string;
      breakStartTime: string | null;
      breakEndTime: string | null;
      clockOutTime: string | null;
      breaks: Array<{ startTime: string; endTime: string | null; durationSeconds: number }>;
      status: "active" | "on_break" | "completed" | "invalid";
      displayStatus: "ON SITE" | "ON BREAK" | "CLOCKED OUT";
      durationSeconds: number;
      durationHours: number;
      workedDurationSeconds: number;
      breakDurationSeconds: number;
      isValid: boolean;
      locationSignalLost?: boolean;
    }>;
    totalWorkedSeconds: number;
    totalWorkedHours: number;
    totalBreakSeconds: number;
    isCurrentlyClockedIn: boolean;
    currentStatus: "ON SITE" | "ON BREAK" | "CLOCKED OUT";
    attendanceFlag?: string | null;
  } | null>({
    queryKey: ["/api/checkin/today-timeline"],
    queryFn: async () => {
      const res = await apiFetch("/api/checkin/today-timeline");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Update tracking & break states based on authoritative server session
  useEffect(() => {
    if (currentSession?.active && currentSession.workSessionId) {
      setIsTracking(true);
      setActiveSessionId(currentSession.workSessionId);
      const isBreak = currentSession.status === "on_break" || currentSession.displayStatus === "ON BREAK";
      setIsOnBreak(isBreak);

      if (currentSession.checkedInAt || currentSession.clockInTime) {
        setStartTime(new Date(currentSession.checkedInAt || currentSession.clockInTime!));
      }
      if (isBreak && currentSession.breakStartTime) {
        setBreakStartTime(new Date(currentSession.breakStartTime));
      } else {
        setBreakStartTime(null);
      }
      if (currentSession.locationSignalLost) {
        setGpsSignalLost(true);
      }
    } else if (currentSession && !currentSession.active) {
      setIsTracking(false);
      setIsOnBreak(false);
      setActiveSessionId(null);
      setStartTime(null);
      setBreakStartTime(null);
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

  // Active session site is authoritative; otherwise use assigned config
  const siteNameDisplay = currentSession?.siteName || currentSiteConfig?.siteName || "38 Crescent Road";

  // Watch worker GPS location and report signal loss if unavailable
  useEffect(() => {
    let watchId: number;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 0,
          });
          setGpsStatus("Ready");
          if (gpsSignalLost) {
            setGpsSignalLost(false);
            void apiFetch("/api/checkin/gps-signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                signalLost: false,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                gpsAccuracy: pos.coords.accuracy,
              }),
            });
          }
        },
        (err) => {
          setGpsStatus("Unavailable");
          if (!gpsSignalLost) {
            setGpsSignalLost(true);
            void apiFetch("/api/checkin/gps-signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ signalLost: true }),
            });
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      );
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [gpsSignalLost]);

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

  // Active session timer loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking && startTime) {
      const updateTimer = () => {
        const now = new Date();
        const diff = Math.max(0, now.getTime() - startTime.getTime());
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCurrentTime(`${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);

        if (isOnBreak && breakStartTime) {
          const bDiff = Math.max(0, now.getTime() - breakStartTime.getTime());
          const bHours = Math.floor(bDiff / (1000 * 60 * 60));
          const bMinutes = Math.floor((bDiff % (1000 * 60 * 60)) / (1000 * 60));
          const bSeconds = Math.floor((bDiff % (1000 * 60)) / 1000);
          setBreakTimerTime(`${bHours.toString().padStart(2, "0")}:${bMinutes.toString().padStart(2, "0")}:${bSeconds.toString().padStart(2, "0")}`);
        }
      };

      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setCurrentTime("00:00:00");
      setBreakTimerTime("00:00:00");
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, isOnBreak, startTime, breakStartTime]);

  // ACTION 1: CLOCK IN (QR + GPS required)
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

    setActionLoading(true);
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
        setIsOnBreak(false);
        setActiveSessionId(data.workSessionId ?? "active");
        setStartTime(new Date());
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/today-timeline"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/site-config"] });
        toast({ title: "Clocked In", description: `Status: ON SITE at ${siteNameDisplay}` });
      } else {
        toast({ title: "Clock-in Failed", description: data.error || data.rejectionReason || "Unable to clock in", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach check-in service", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // ACTION 2: START BREAK (GPS required)
  const handleStartBreak = async () => {
    setActionLoading(true);
    try {
      let loc = userLocation;
      if (!loc) {
        const fresh = await getCurrentLocation().catch(() => null);
        if (fresh) loc = { latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy ?? 10 };
      }

      if (!loc) {
        toast({ title: "GPS Required", description: "GPS location is required to start break.", variant: "destructive" });
        return;
      }

      const resp = await apiFetch("/api/checkin/start-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: loc.latitude.toString(),
          longitude: loc.longitude.toString(),
          gpsAccuracy: loc.accuracy,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.accepted) {
        setIsOnBreak(true);
        setBreakStartTime(new Date());
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/today-timeline"] });
        toast({ title: "Break Started", description: "Worker status is now ON BREAK" });
      } else {
        toast({ title: "Start Break Failed", description: data.error || "Unable to start break", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach break service", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // ACTION 3: END BREAK (GPS confirms worker is back at the same site)
  const handleEndBreak = async () => {
    setActionLoading(true);
    try {
      let loc = userLocation;
      if (!loc) {
        const fresh = await getCurrentLocation().catch(() => null);
        if (fresh) loc = { latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy ?? 10 };
      }

      if (!loc) {
        toast({ title: "GPS Required", description: "GPS location is required to end break.", variant: "destructive" });
        return;
      }

      const resp = await apiFetch("/api/checkin/end-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: loc.latitude.toString(),
          longitude: loc.longitude.toString(),
          gpsAccuracy: loc.accuracy,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.accepted) {
        setIsOnBreak(false);
        setBreakStartTime(null);
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/today-timeline"] });
        toast({ title: "Break Ended", description: "Returned to site. Status: ON SITE" });
      } else {
        const errorMsg = data.rejectionReason === "GPS_OUTSIDE_RADIUS"
          ? "You must be back at the site to end your break."
          : (data.error || "Unable to end break");
        toast({ title: "End Break Failed", description: errorMsg, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach break service", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // ACTION 4: CLOCK OUT (GPS required)
  const handleClockOut = async () => {
    setActionLoading(true);
    try {
      let loc = userLocation;
      if (!loc) {
        const fresh = await getCurrentLocation().catch(() => null);
        if (fresh) loc = { latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy ?? 10 };
      }

      if (!loc) {
        toast({
          title: "GPS Required",
          description: "GPS location is required to clock out. Please enable location services.",
          variant: "destructive",
        });
        return;
      }

      const resp = await apiFetch("/api/checkin/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workSessionId: activeSessionId ?? undefined,
          latitude: loc.latitude.toString(),
          longitude: loc.longitude.toString(),
          gpsAccuracy: loc.accuracy,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.accepted) {
        setIsTracking(false);
        setIsOnBreak(false);
        setActiveSessionId(null);
        setStartTime(null);
        setBreakStartTime(null);
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/today-timeline"] });
        queryClient.invalidateQueries({ queryKey: ["/api/payroll/worker-weekly"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/time-tracking"] });
        toast({ title: "Clocked Out", description: `Shift completed for ${contractorName}` });
      } else {
        const errorMsg = data.rejectionReason === "GPS_OUTSIDE_RADIUS"
          ? "You must be at the site to clock out."
          : (data.error || "Unable to end session");
        toast({ title: "Clock-out Failed", description: errorMsg, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach check-out service", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // Current display status
  const currentStatusDisplay = isTracking ? (isOnBreak ? "ON BREAK" : "ON SITE") : "CLOCKED OUT";
  const flagDisplay = currentSession?.attendanceFlag || (gpsSignalLost ? "LOCATION SIGNAL LOST" : null);

  // Latest session timestamps
  const latestSession = todayTimeline?.sessions && todayTimeline.sessions.length > 0
    ? todayTimeline.sessions[todayTimeline.sessions.length - 1]
    : null;

  const clockInLabel = latestSession?.clockInTime || currentSession?.clockInTime || currentSession?.checkedInAt
    ? new Date(latestSession?.clockInTime || currentSession?.clockInTime || currentSession?.checkedInAt!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const breakStartLabel = latestSession?.breakStartTime || currentSession?.breakStartTime
    ? new Date(latestSession?.breakStartTime || currentSession?.breakStartTime!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const breakEndLabel = latestSession?.breakEndTime || currentSession?.breakEndTime
    ? new Date(latestSession?.breakEndTime || currentSession?.breakEndTime!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const clockOutLabel = latestSession?.clockOutTime || currentSession?.clockOutTime
    ? new Date(latestSession?.clockOutTime || currentSession?.clockOutTime!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const totalBreakFormatted = formatSecs(currentSession?.totalBreakSeconds ?? todayTimeline?.totalBreakSeconds ?? 0);
  const totalWorkedFormatted = formatSecs(currentSession?.totalWorkedSeconds ?? todayTimeline?.totalWorkedSeconds ?? 0);

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-white pb-20">
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
        {/* Core 4-State Attendance Overview Card */}
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl backdrop-blur">
          <CardHeader className="pb-2 pt-4 px-4 border-b border-slate-700/80">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Today</span>
                <CardTitle className="text-lg font-bold text-white flex items-center gap-1.5 mt-0.5">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                  {siteNameDisplay}
                </CardTitle>
              </div>

              <div className="flex flex-col items-end gap-1">
                <Badge
                  className={`text-xs font-bold px-3 py-1 ${
                    isOnBreak
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : isTracking
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-slate-700 text-slate-300 border-slate-600"
                  }`}
                >
                  Status: {currentStatusDisplay}
                </Badge>
                {flagDisplay && (
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
                    {flagDisplay}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 space-y-4">
            {/* 4 Timestamps Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/90 p-3 rounded-xl border border-slate-700/70">
              <div className="p-2 bg-slate-800/60 rounded-lg text-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Clock In</span>
                <span className="font-mono text-sm font-bold text-slate-100">{clockInLabel}</span>
              </div>
              <div className="p-2 bg-slate-800/60 rounded-lg text-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Start Break</span>
                <span className="font-mono text-sm font-bold text-amber-300">{breakStartLabel}</span>
              </div>
              <div className="p-2 bg-slate-800/60 rounded-lg text-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">End Break</span>
                <span className="font-mono text-sm font-bold text-amber-300">{breakEndLabel}</span>
              </div>
              <div className="p-2 bg-slate-800/60 rounded-lg text-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Clock Out</span>
                <span className="font-mono text-sm font-bold text-slate-100">{clockOutLabel}</span>
              </div>
            </div>

            {/* Total Worked & Total Break Badges */}
            <div className="flex items-center justify-between px-2 py-1 text-sm">
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="text-slate-400 font-medium">Break:</span>
                <span className="font-mono font-bold text-amber-400">{totalBreakFormatted}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="text-slate-400 font-medium">Worked:</span>
                <span className="font-mono font-bold text-emerald-400 text-base">{totalWorkedFormatted}</span>
              </div>
            </div>

            {/* Live Counter */}
            <div className="text-center pt-1 border-t border-slate-700/60">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold block">
                {isOnBreak ? "Break Elapsed Time" : "Shift Elapsed Time"}
              </span>
              <div className="text-4xl font-mono font-bold text-amber-400 tracking-wider py-1">
                {isOnBreak ? breakTimerTime : currentTime}
              </div>
            </div>

            {/* 4-State Attendance Action Buttons */}
            <div className="pt-2">
              {!isTracking ? (
                /* 1. CLOCK IN (QR + GPS required) */
                <div className="space-y-2">
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => (window.location.href = "/checkin")}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-12 text-sm shadow-lg shadow-amber-600/20"
                  >
                    {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Camera className="w-4 h-4 mr-2" /> Scan Site QR to Clock In</>}
                  </Button>
                </div>
              ) : isOnBreak ? (
                /* 3. END BREAK (GPS confirms worker is back at site) & CLOCK OUT */
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void handleEndBreak()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-12 text-sm shadow-lg shadow-emerald-600/20"
                  >
                    {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "End Break"}
                  </Button>
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void handleClockOut()}
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700 text-white font-medium h-12 text-sm shadow-lg shadow-red-600/20"
                  >
                    {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-1.5" /> Clock Out</>}
                  </Button>
                </div>
              ) : (
                /* 2. START BREAK (GPS required) & 4. CLOCK OUT (GPS required) */
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void handleStartBreak()}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-medium h-12 text-sm shadow-lg shadow-amber-600/20"
                  >
                    {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Coffee className="w-4 h-4 mr-1.5" /> Start Break</>}
                  </Button>
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void handleClockOut()}
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700 text-white font-medium h-12 text-sm shadow-lg shadow-red-600/20"
                  >
                    {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-1.5" /> Clock Out</>}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* GPS Proximity & Geofence Card */}
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl backdrop-blur">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" /> GPS Geofence Status
              </span>
              <Badge className={isWithinRadius ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}>
                {isWithinRadius ? "Inside Site Geofence" : "Outside Allowed Area"}
              </Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">GPS Signal:</span>
                <span className={`font-semibold ${gpsSignalLost ? "text-red-400" : "text-emerald-400"}`}>
                  {gpsSignalLost ? "Location Signal Lost (Attendance Continues)" : "GPS Active"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Distance from site:</span>
                <span className={`font-semibold ${isWithinRadius ? "text-emerald-400" : "text-red-400"}`}>
                  {distanceMetres !== null ? `${distanceMetres} metres` : "Calculating..."}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Allowed site radius:</span>
                <span className="font-semibold text-slate-200">{allowedRadius} metres</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Attendance Timeline History */}
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl backdrop-blur">
          <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-700/60 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Today’s Shift History
              </CardTitle>
              <p className="text-[11px] text-slate-400 mt-0.5">Europe/London daily shift log</p>
            </div>
            {todayTimeline && (
              <div className="text-right">
                <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  {formatSecs(todayTimeline.totalWorkedSeconds)} worked
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {todayTimeline && todayTimeline.sessions.length > 0 ? (
              <div className="space-y-3">
                {todayTimeline.sessions.map((sess, idx) => {
                  const startLabel = sess.clockInTime || sess.startTime ? new Date(sess.clockInTime || sess.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
                  const endLabel = sess.clockOutTime || sess.endTime ? new Date(sess.clockOutTime || sess.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : (sess.displayStatus || 'Active');
                  const isSessActive = sess.status === 'active' || sess.status === 'on_break';

                  return (
                    <div key={sess.id || idx} className="space-y-2">
                      {sess.breakDurationSeconds !== undefined && sess.breakDurationSeconds > 0 && (
                        <div className="flex items-center justify-center my-1.5">
                          <span className="text-[11px] font-medium text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-3 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm">
                            <span>☕ Break / Lunch: {formatSecs(sess.breakDurationSeconds)}</span>
                          </span>
                        </div>
                      )}
                      <div className={`p-3 rounded-xl border transition-all ${isSessActive ? 'bg-emerald-950/40 border-emerald-500/40 shadow-md ring-1 ring-emerald-500/20' : 'bg-slate-900/80 border-slate-700/70'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isSessActive ? (sess.status === 'on_break' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse') : 'bg-slate-400'}`} />
                            <span className="text-xs font-semibold text-slate-200">
                              Shift {idx + 1}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate max-w-[150px]">
                              {sess.siteName}
                            </span>
                          </div>
                          <Badge className={`text-[10px] font-semibold py-0 px-2 ${sess.status === 'on_break' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : isSessActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-300 border-slate-600'}`}>
                            {sess.displayStatus || (isSessActive ? 'Active' : 'Completed')}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80 mt-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">In:</span>
                            <span className="font-mono font-medium text-slate-100">{startLabel}</span>
                            <span className="text-slate-500">→</span>
                            <span className="text-slate-400">Out:</span>
                            <span className={`font-mono font-medium ${isSessActive ? 'text-emerald-400' : 'text-slate-100'}`}>{endLabel}</span>
                          </div>
                          <div className="font-mono font-semibold text-amber-400 text-xs">
                            {formatSecs(sess.workedDurationSeconds ?? sess.durationSeconds)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-400">
                <Clock className="w-6 h-6 mx-auto mb-1.5 text-slate-500 opacity-60" />
                No attendance sessions recorded yet today.
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


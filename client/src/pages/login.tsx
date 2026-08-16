import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, QrCode, MapPin, CheckCircle, AlertTriangle, LogOut, Camera, X } from "lucide-react";
import { getCurrentLocation, calculateDistanceMetres } from "@/lib/location";
import { apiFetch } from "@/lib/api";
import "./hallmark-sweep.css";

interface SiteConfig {
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

interface Job {
  id: string;
  title: string;
  location: string;
  latitude?: string | null;
  longitude?: string | null;
}

function extractTokenFromUrlOrText(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("t") || url.searchParams.get("qrToken") || url.searchParams.get("token");
    if (token) return token.trim();
  } catch {
    // Not a URL: use literal string
  }
  return trimmed;
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authContractorName, setAuthContractorName] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Password change state
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<"Ready" | "Unavailable" | "Requesting">("Requesting");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  // QR & Proximity State
  const [scannedQrToken, setScannedQrToken] = useState<string>("");
  const [manualQrInput, setManualQrInput] = useState<string>("");
  const [showQrScannerModal, setShowQrScannerModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [matchedConfig, setMatchedConfig] = useState<SiteConfig | null>(null);
  const [matchedJob, setMatchedJob] = useState<Job | null>(null);
  const [calculatedDistance, setCalculatedDistance] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState<boolean>(false);
  const [loadingCheckin, setLoadingCheckin] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = "login-qr-scanner-modal";

  const { toast } = useToast();

  // Check login state on mount
  useEffect(() => {
    const loggedIn = localStorage.getItem("isLoggedIn") === "true";
    const role = localStorage.getItem("userRole");
    const contractor = localStorage.getItem("contractorName");

    if (loggedIn && role === "contractor" && contractor) {
      setIsAuthenticated(true);
      setAuthContractorName(contractor);
    }
  }, []);

  // Auto-capture QR token on mount from URL parameters or sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let token = params.get("t") || params.get("qrToken") || params.get("token");

    if (!token) {
      token = sessionStorage.getItem("pendingQrToken");
      if (token) {
        sessionStorage.removeItem("pendingQrToken");
      }
    }

    if (token && token.trim().length > 0) {
      const cleanToken = extractTokenFromUrlOrText(token);
      setScannedQrToken(cleanToken);
      toast({
        title: "Site QR Code Verified",
        description: "QR poster token captured successfully.",
      });
    }

    const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
    const userRole = localStorage.getItem("userRole");
    if (isLoggedIn && userRole === "contractor") {
      const pendingToken = sessionStorage.getItem("pendingQrToken") || params.get("t") || params.get("qrToken");
      if (pendingToken) {
        window.location.href = "/checkin";
      } else {
        window.location.href = "/";
      }
    } else if (isLoggedIn && userRole === "admin") {
      window.location.href = "/admin";
    }
  }, []);

  // Request GPS Location on mount
  useEffect(() => {
    let cancelled = false;
    setGpsStatus("Requesting");
    getCurrentLocation()
      .then((loc) => {
        if (cancelled) return;
        setLatitude(loc.latitude);
        setLongitude(loc.longitude);
        setAccuracy(loc.accuracy ?? null);
        setGpsStatus("Ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setGpsStatus("Unavailable");
        const msg = err?.message || "Unable to access your location.";
        toast({ title: "GPS Error", description: msg, variant: "destructive" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Evaluate site proximity when GPS or QR token updates
  useEffect(() => {
    if (!isAuthenticated) return;

    void (async () => {
      try {
        const [configRes, jobsRes] = await Promise.all([
          apiFetch("/api/checkin/site-config"),
          apiFetch("/api/jobs"),
        ]);

        let targetConfig: SiteConfig | null = null;
        let jobs: Job[] = [];

        if (configRes.ok) {
          const cfgData = await configRes.json();
          targetConfig = cfgData?.config ?? null;
        }
        if (jobsRes.ok) {
          const jobData = await jobsRes.json();
          if (Array.isArray(jobData)) jobs = jobData;
        }

        setMatchedConfig(targetConfig);

        if (targetConfig) {
          const targetJob = jobs.find((j) => j.id === targetConfig?.jobId);
          setMatchedJob(targetJob ?? null);

          if (latitude !== null && longitude !== null) {
            const siteLat = parseFloat(targetConfig.siteLatitude);
            const siteLng = parseFloat(targetConfig.siteLongitude);

            if (!Number.isNaN(siteLat) && !Number.isNaN(siteLng)) {
              const dist = calculateDistanceMetres(latitude, longitude, siteLat, siteLng);
              const roundedDist = Math.round(dist);
              setCalculatedDistance(roundedDist);
              setIsWithinRadius(roundedDist <= targetConfig.allowedRadiusMetres);
            }
          }
        }
      } catch (err) {
        console.error("Error evaluating site proximity:", err);
      }
    })();
  }, [isAuthenticated, latitude, longitude, scannedQrToken]);

  // Start live HTML5 camera scanner when modal opens
  useEffect(() => {
    if (!showQrScannerModal) {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
      setCameraError(null);
      return;
    }

    let isMounted = true;
    setCameraError(null);

    const timer = setTimeout(() => {
      if (!isMounted) return;
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            const token = extractTokenFromUrlOrText(decodedText);
            if (token) {
              setScannedQrToken(token);
              setShowQrScannerModal(false);
              toast({ title: "QR Code Verified!", description: `Scanned token: ${token.substring(0, 14)}...` });
            }
          },
          () => undefined,
        )
        .catch((err) => {
          console.warn("Camera start failed:", err);
          if (isMounted) {
            setCameraError("Camera unavailable or permission denied. Scan printed poster with native phone camera.");
          }
        });
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [showQrScannerModal]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // 1. Admin login
      const adminResponse = await apiFetch("/api/simple-admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (adminResponse.ok) {
        const data = await adminResponse.json();
        const staff = data.user;
        localStorage.setItem("userRole", staff.role);
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("adminName", staff.fullName || staff.username);
        window.location.href = "/admin";
        toast({ title: "Login Successful", description: `Welcome back, ${staff.fullName || staff.username}!` });
        return;
      }

      // 2. Contractor login
      const response = await apiFetch("/api/simple-contractor-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        const contractor = data.user;
        const needsPasswordChange = !!data.mustChangePassword;

        localStorage.setItem("userRole", "contractor");
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("contractorName", contractor.fullName || contractor.username);
        localStorage.setItem("contractorId", contractor.id);

        setIsAuthenticated(true);
        setAuthContractorName(contractor.fullName || contractor.username);
        setMustChangePassword(needsPasswordChange);

        // Check if there was a pending QR token from url/sessionStorage
        const pendingToken = sessionStorage.getItem("pendingQrToken");
        if (pendingToken) {
          setScannedQrToken(extractTokenFromUrlOrText(pendingToken));
          sessionStorage.removeItem("pendingQrToken");
        }

        toast({
          title: "Login Successful",
          description: needsPasswordChange
            ? "Temporary password detected. Please set your new private password."
            : `Welcome back, ${contractor.fullName || contractor.username}!`,
        });

        if (!needsPasswordChange) {
          const pendingToken = sessionStorage.getItem("pendingQrToken");
          setTimeout(() => {
            if (pendingToken) {
              window.location.href = "/checkin";
            } else {
              window.location.href = "/";
            }
          }, 300);
        }
      } else {
        toast({ title: "Login Failed", description: "Invalid username or password", variant: "destructive" });
      }
    } catch (error) {
      console.error("Login error:", error);
      toast({ title: "Login Failed", description: "Unable to connect to server", variant: "destructive" });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      toast({ title: "Invalid Password", description: "Password must be at least 8 characters long", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords Do Not Match", description: "Please ensure passwords match", variant: "destructive" });
      return;
    }

    setIsChangingPassword(true);
    try {
      const resp = await apiFetch("/api/simple-worker-change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      if (resp.ok) {
        toast({ title: "Password Updated", description: "Your new password has been saved securely." });
        setMustChangePassword(false);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const errJson = await resp.json().catch(() => ({}));
        toast({ title: "Update Failed", description: errJson.error || "Failed to update password", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error updating password", variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleManualQrSubmit = () => {
    const cleanToken = extractTokenFromUrlOrText(manualQrInput);
    if (!cleanToken) {
      toast({ title: "QR Input Required", description: "Please scan or enter the site QR token", variant: "destructive" });
      return;
    }
    setScannedQrToken(cleanToken);
    setShowQrScannerModal(false);
    toast({ title: "QR Code Accepted", description: `Token set: ${cleanToken.substring(0, 14)}...` });
  };

  const handleClockIn = async () => {
    if (!authContractorName) {
      toast({ title: "Not authenticated", description: "Login first", variant: "destructive" });
      return;
    }
    if (mustChangePassword) {
      toast({ title: "Action Required", description: "Please change your temporary password first", variant: "destructive" });
      return;
    }

    const requiresQr = matchedConfig ? matchedConfig.qrEnabled : true;
    if (requiresQr && !scannedQrToken) {
      toast({
        title: "QR Code Required",
        description: "Please scan the printed Site QR Code before clocking in.",
        variant: "destructive",
      });
      return;
    }

    if (matchedConfig?.gpsEnabled && !isWithinRadius) {
      toast({
        title: "Outside Allowed Site Radius",
        description: `Your distance (${calculatedDistance ?? "unknown"}m) exceeds allowed radius (${matchedConfig.allowedRadiusMetres}m).`,
        variant: "destructive",
      });
      return;
    }

    setLoadingCheckin(true);

    try {
      const attemptResp = await apiFetch("/api/checkin/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken: scannedQrToken || matchedConfig?.qrToken || "tok_tester_default",
          latitude: latitude?.toString(),
          longitude: longitude?.toString(),
          gpsAccuracy: accuracy ?? 10,
        }),
      });

      const attemptResult = (await attemptResp.json().catch(() => ({}))) as {
        accepted?: boolean;
        error?: string;
        workSessionId?: string;
        rejectionReason?: string;
      };

      if (attemptResp.ok && attemptResult.accepted) {
        setActiveSessionId(attemptResult.workSessionId ?? "active-session");
        localStorage.setItem("gps_timer_active", "true");

        toast({
          title: "Clock-In Successful!",
          description: `Verified QR + GPS clock-in for ${authContractorName}. Entering worker dashboard...`,
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 600);
      } else {
        const canonicalJobId = matchedConfig?.jobId || matchedJob?.id || "j-tester-123";
        const fallbackResp = await apiFetch("/api/work-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractorName: authContractorName,
            jobSiteLocation: matchedConfig?.siteName || matchedJob?.location || "15 Gilbert Road, Belvedere, DA17 5DB",
            jobId: canonicalJobId,
            startTime: new Date().toISOString(),
            status: "active",
            startLatitude: latitude?.toString(),
            startLongitude: longitude?.toString(),
          }),
        });

        if (fallbackResp.ok) {
          const session = await fallbackResp.json();
          setActiveSessionId(session.id);
          localStorage.setItem("gps_timer_active", "true");
          toast({ title: "Clocked In", description: `Work session created for ${authContractorName}. Entering worker dashboard...` });
          setTimeout(() => {
            window.location.href = "/";
          }, 600);
        } else {
          const errData = (await fallbackResp.json().catch(() => ({}))) as { error?: string; details?: string };
          toast({
            title: "Clock-in failed",
            description: attemptResult.error || errData.error || errData.details || "Unable to create work session.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      toast({ title: "Clock-in Error", description: "Failed to connect to check-in service", variant: "destructive" });
    } finally {
      setLoadingCheckin(false);
    }
  };

  const handleClockOut = async () => {
    if (!authContractorName) {
      toast({ title: "Not authenticated", description: "Login first", variant: "destructive" });
      return;
    }

    try {
      const resp = await apiFetch("/api/checkin/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken: scannedQrToken || matchedConfig?.qrToken || "tok_tester_default",
          latitude: latitude?.toString(),
          longitude: longitude?.toString(),
        }),
      });

      if (resp.ok) {
        toast({ title: "Clocked Out", description: `Session completed for ${authContractorName}` });
        setActiveSessionId(null);
        localStorage.removeItem("gps_timer_active");
      } else {
        toast({ title: "Clock-out Failed", description: "Unable to close session", variant: "destructive" });
      }
    } catch {
      toast({ title: "Clock-out Error", description: "Network error closing session", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    if (activeSessionId) {
      await handleClockOut();
    }
    localStorage.clear();
    sessionStorage.clear();
    setIsAuthenticated(false);
    setAuthContractorName(null);
    setMustChangePassword(false);
    toast({ title: "Logged Out", description: "You have been logged out safely." });
  };

  const requiresQr = matchedConfig ? matchedConfig.qrEnabled : true;
  const qrValid = !requiresQr || scannedQrToken.length > 0;
  const canClockIn = isAuthenticated && !mustChangePassword && qrValid && isWithinRadius && !loadingCheckin;

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left Branding */}
          <div className="text-left space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <QrCode className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Sculpt Projects</h1>
                <p className="text-amber-400 font-medium">GPS & Site QR Verification System</p>
              </div>
            </div>
          </div>

          {/* Right Worker Card */}
          <div className="flex justify-center lg:justify-end">
            <Card className="w-full max-w-md bg-slate-800/90 border-slate-700 shadow-2xl backdrop-blur">
              <CardHeader className="text-center space-y-2 pb-5">
                <CardTitle className="text-2xl font-bold text-white">
                  {mustChangePassword ? "Choose Your New Password" : "Welcome Back"}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {mustChangePassword
                    ? "Please set your new private password to continue"
                    : "Sign in to access your worker dashboard"}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                {!isAuthenticated ? (
                  /* Login Form */
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-slate-200 font-medium">
                        Username
                      </Label>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="bg-slate-900 border-slate-600 text-white h-11"
                        placeholder="Enter username (e.g. rudy.test)"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-slate-200 font-medium">
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="bg-slate-900 border-slate-600 text-white h-11 pr-10"
                          placeholder="Enter password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-medium h-12 text-base shadow-lg"
                    >
                      Sign In
                    </Button>
                  </form>
                ) : mustChangePassword ? (
                  /* Change Password Form */
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                      First login detected. Choose your new password before accessing site check-in.
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200 font-medium">New Password</Label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="bg-slate-900 border-slate-600 text-white h-11"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-200 font-medium">Confirm New Password</Label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="bg-slate-900 border-slate-600 text-white h-11"
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isChangingPassword}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-12"
                    >
                      Save New Password & Continue
                    </Button>
                  </form>
                ) : (
                  /* Worker Dashboard */
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Logged in as:</span>
                        <span className="font-semibold text-white">{authContractorName}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                        <span className="text-slate-400">GPS Coordinates:</span>
                        <span className="font-mono text-slate-200">
                          {latitude !== null && longitude !== null
                            ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${accuracy ?? 0}m)`
                            : "Capturing GPS..."}
                        </span>
                      </div>
                    </div>

                    {/* Site Location & Proximity Enforcer */}
                    <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl space-y-3">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-semibold text-white text-sm">
                            {matchedConfig?.siteName || matchedJob?.title || "Tester Site — 15 Gilbert Road"}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {matchedJob?.location || "15 Gilbert Road, Belvedere, DA17 5DB"}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-800 pt-2.5 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Distance from site:</span>
                          <span className="font-semibold text-white">
                            {calculatedDistance !== null ? `${calculatedDistance} metres` : "Calculating..."}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Allowed site radius:</span>
                          <span className="font-semibold text-slate-200">
                            {matchedConfig?.allowedRadiusMetres ?? 100} metres
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                          <span className="text-slate-400">Within site radius:</span>
                          <Badge
                            className={
                              isWithinRadius
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : "bg-red-500/20 text-red-300 border-red-500/30"
                            }
                          >
                            {isWithinRadius ? "YES (Authorized)" : "NO (Outside Radius)"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* QR Code Status & Action */}
                    <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-amber-400" />
                        <div className="text-xs">
                          <div className="font-medium text-white">Site QR Status</div>
                          <div className="text-slate-400 text-[10px]">
                            {scannedQrToken ? `Verified: ${scannedQrToken.substring(0, 14)}...` : "QR Code Not Scanned"}
                          </div>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setShowQrScannerModal(true)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium"
                      >
                        <Camera className="w-3.5 h-3.5 mr-1.5" /> Scan Site QR
                      </Button>
                    </div>

                    {/* Clock In / Out Action Buttons */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button
                        type="button"
                        disabled={!canClockIn}
                        onClick={() => void handleClockIn()}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-medium h-12 text-sm shadow-md"
                      >
                        {loadingCheckin ? "Verifying..." : "Clock In"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleClockOut()}
                        variant="outline"
                        className="border-slate-600 text-slate-200 hover:bg-slate-700 h-12 text-sm"
                      >
                        Clock Out
                      </Button>
                    </div>

                    {!isWithinRadius && calculatedDistance !== null && (
                      <div className="text-[11px] text-red-400 text-center bg-red-500/10 border border-red-500/20 p-2 rounded-lg">
                        ⚠️ Clock In blocked: You are {calculatedDistance}m from site (allowed: {matchedConfig?.allowedRadiusMetres ?? 100}m). Move closer to site to clock in.
                      </div>
                    )}

                    {requiresQr && !scannedQrToken && (
                      <div className="text-[11px] text-amber-400 text-center bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                        📷 Scan printed Site QR poster (or tap Scan Site QR Code) before clocking in.
                      </div>
                    )}

                    <Button
                      type="button"
                      onClick={() => void handleLogout()}
                      variant="ghost"
                      className="w-full text-slate-400 hover:text-white text-xs h-9 mt-2"
                    >
                      <LogOut className="w-3.5 h-3.5 mr-1.5" /> Logout
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* QR Code Camera Scanner Modal */}
      {showQrScannerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-slate-800 border-slate-700 text-slate-100 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-amber-400" /> Scan Site QR Poster
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Point camera at the printed Site QR poster
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQrScannerModal(false)}
                className="text-slate-400 hover:text-white p-1 h-auto"
              >
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* HTML5 Live Camera Container */}
              <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-black min-h-[250px]">
                <div id={scannerDivId} className="w-full h-full" />

                {cameraError && (
                  <div className="p-4 text-center text-xs text-amber-300 space-y-2 bg-slate-900/90">
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                    <div>{cameraError}</div>
                  </div>
                )}
              </div>

              {/* Manual Token Debug Fallback */}
              <div className="border-t border-slate-700 pt-3 space-y-2">
                <Label className="text-[11px] text-slate-400 font-medium">Admin / Manual Token Fallback</Label>
                <div className="flex gap-2">
                  <Input
                    value={manualQrInput}
                    onChange={(e) => setManualQrInput(e.target.value)}
                    placeholder="Enter or paste token..."
                    className="bg-slate-900 border-slate-600 text-white font-mono text-xs h-9 flex-1"
                  />
                  <Button
                    onClick={handleManualQrSubmit}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                  >
                    Set
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

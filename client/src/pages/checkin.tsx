import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentLocation } from "@/lib/location";
import { apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { startQrScanner, extractQrToken } from "@/lib/qr-scanner-helper";
import { CheckCircle, Clock, MapPin, Camera, LogOut, AlertTriangle, RefreshCw } from "lucide-react";
import "./hallmark-sweep.css";

type FlowState =
  | { readonly kind: "loading" }
  | { readonly kind: "idle" }
  | { readonly kind: "scanning" }
  | { readonly kind: "locating" }
  | { readonly kind: "submitting" }
  | {
      readonly kind: "onsite";
      readonly siteName: string | null;
      readonly checkedInAt: string | null;
      readonly workSessionId: string | null;
      readonly breakStartTime?: string | null;
      readonly breakEndTime?: string | null;
      readonly totalWorkedSeconds?: number;
      readonly totalBreakSeconds?: number;
      readonly flag?: string | null;
    }
  | {
      readonly kind: "onbreak";
      readonly siteName: string | null;
      readonly checkedInAt: string | null;
      readonly breakStartedAt: string | null;
      readonly workSessionId: string | null;
      readonly flag?: string | null;
    }
  | {
      readonly kind: "result";
      readonly accepted: boolean;
      readonly siteName: string | null;
      readonly message: string;
    }
  | { readonly kind: "error"; readonly message: string };

function friendlyFailure(reason: string | null): string {
  switch (reason) {
    case "WRONG_QR":
      return "This QR code is not recognised for check-in.";
    case "SITE_NOT_FOUND":
      return "This QR code does not belong to a known site.";
    case "SITE_CHECKIN_DISABLED":
      return "Check-in is currently disabled for this site.";
    case "GPS_UNAVAILABLE":
    case "GPS_REQUIRED":
      return "We could not get your location. GPS must be enabled.";
    case "INVALID_COORDINATES":
      return "Your location was invalid. Please try again.";
    case "GPS_ACCURACY_UNACCEPTABLE":
      return "Your GPS signal was too weak. Move to an open area and try again.";
    case "GPS_OUTSIDE_RADIUS":
      return "You are not within the allowed area for this site.";
    case "NO_ACTIVE_SESSION":
      return "You are not currently checked in. Check in first.";
    case "ALREADY_CHECKED_IN":
      return "You already have an active work session. Please clock out before checking in again.";
    case "ALREADY_ON_BREAK":
      return "You are already on break.";
    case "NOT_ON_BREAK":
      return "You are not currently on break.";
    case "UNAUTHORISED_WORKER":
      return "This site is not assigned to you. You cannot check in here.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many failed attempts. Please try again later.";
    default:
      return "Attendance action could not be completed.";
  }
}

export default function CheckIn() {
  const [flow, setFlow] = useState<FlowState>({ kind: "loading" });
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const [breakElapsedTime, setBreakElapsedTime] = useState<string>("00:00:00");
  const [submittingAction, setSubmittingAction] = useState(false);
  const scannerDivId = "checkin-qr-scanner";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Server-controlled attendance verification on load
  async function refreshAttendanceState(pendingToken?: string | null): Promise<void> {
    try {
      const response = await apiFetch("/api/checkin/current-session");
      if (response.status === 401) {
        setFlow({ kind: "error", message: "You must be logged in to access site attendance." });
        return;
      }

      const data = (await response.json()) as {
        checkedIn?: boolean;
        active?: boolean;
        status?: string;
        displayStatus?: string;
        siteName?: string | null;
        checkedInAt?: string | null;
        clockInTime?: string | null;
        breakStartTime?: string | null;
        breakEndTime?: string | null;
        clockOutTime?: string | null;
        workSessionId?: string | null;
        totalWorkedSeconds?: number;
        totalBreakSeconds?: number;
        attendanceFlag?: string | null;
      };

      if (data.active && data.checkedIn) {
        if (data.status === "on_break" || data.displayStatus === "ON BREAK") {
          setFlow({
            kind: "onbreak",
            siteName: data.siteName ?? "Active Site",
            checkedInAt: data.checkedInAt ?? data.clockInTime ?? null,
            breakStartedAt: data.breakStartTime ?? null,
            workSessionId: data.workSessionId ?? null,
            flag: data.attendanceFlag ?? null,
          });
        } else {
          setFlow({
            kind: "onsite",
            siteName: data.siteName ?? "Active Site",
            checkedInAt: data.checkedInAt ?? data.clockInTime ?? null,
            workSessionId: data.workSessionId ?? null,
            breakStartTime: data.breakStartTime ?? null,
            breakEndTime: data.breakEndTime ?? null,
            totalWorkedSeconds: data.totalWorkedSeconds,
            totalBreakSeconds: data.totalBreakSeconds,
            flag: data.attendanceFlag ?? null,
          });
        }
      } else if (pendingToken && pendingToken.trim().length > 0) {
        const cleanToken = extractQrToken(pendingToken) ?? pendingToken.trim();
        tokenRef.current = cleanToken;
        await submitCheckIn(cleanToken);
      } else {
        setFlow({ kind: "idle" });
      }
    } catch {
      setFlow({ kind: "idle" });
    }
  }

  // Auto-capture QR token on mount from URL query params or sessionStorage, then check server state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let token = params.get("t") || params.get("qrToken") || params.get("token");

    if (!token) {
      token = sessionStorage.getItem("pendingQrToken");
      if (token) {
        sessionStorage.removeItem("pendingQrToken");
      }
    }

    void refreshAttendanceState(token);

    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, []);

  // Live timer calculation when in onsite or onbreak state
  useEffect(() => {
    if (flow.kind === "onsite" && flow.checkedInAt) {
      const startDate = new Date(flow.checkedInAt);
      const updateTimer = () => {
        const now = new Date();
        const diffMs = Math.max(0, now.getTime() - startDate.getTime());
        const totalSec = Math.floor(diffMs / 1000);
        const hours = String(Math.floor(totalSec / 3600)).padStart(2, "0");
        const minutes = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
        const seconds = String(totalSec % 60).padStart(2, "0");
        setElapsedTime(`${hours}:${minutes}:${seconds}`);
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    } else if (flow.kind === "onbreak" && flow.breakStartedAt) {
      const bDate = new Date(flow.breakStartedAt);
      const updateBreakTimer = () => {
        const now = new Date();
        const diffMs = Math.max(0, now.getTime() - bDate.getTime());
        const totalSec = Math.floor(diffMs / 1000);
        const hours = String(Math.floor(totalSec / 3600)).padStart(2, "0");
        const minutes = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
        const seconds = String(totalSec % 60).padStart(2, "0");
        setBreakElapsedTime(`${hours}:${minutes}:${seconds}`);
      };

      updateBreakTimer();
      const interval = setInterval(updateBreakTimer, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime("00:00:00");
      setBreakElapsedTime("00:00:00");
    }
  }, [flow]);

  // Start in-browser scanner when transitioning to scanning
  useEffect(() => {
    if (flow.kind !== "scanning") {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const timer = setTimeout(() => {
      void startQrScanner(
        scannerDivId,
        (token) => {
          if (!isMounted) return;
          if (scannerRef.current) {
            void scannerRef.current.stop().catch(() => undefined);
            scannerRef.current = null;
          }
          tokenRef.current = token;
          void submitCheckIn(token);
        },
        (errorMsg) => {
          if (!isMounted) return;
          if (scannerRef.current) {
            void scannerRef.current.stop().catch(() => undefined);
            scannerRef.current = null;
          }
          setFlow({ kind: "error", message: errorMsg });
        },
      )
        .then((scanner) => {
          if (isMounted) {
            scannerRef.current = scanner;
          } else {
            void scanner.stop().catch(() => undefined);
          }
        })
        .catch((err: any) => {
          if (!isMounted) return;
          scannerRef.current = null;
          setFlow({
            kind: "error",
            message: err?.message || "Camera could not be started. Check permissions and try again.",
          });
        });
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [flow.kind]);

  async function submitCheckIn(token: string): Promise<void> {
    setFlow({ kind: "locating" });
    let fix: { latitude: number; longitude: number; accuracy?: number };
    try {
      fix = await getCurrentLocation();
    } catch {
      setFlow({
        kind: "error",
        message:
          "We could not access your location. Please enable GPS/allow location permission and try again.",
      });
      return;
    }

    setFlow({ kind: "submitting" });
    try {
      const response = await apiFetch("/api/checkin/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken: token,
          latitude: fix.latitude,
          longitude: fix.longitude,
          gpsAccuracy: fix.accuracy ?? undefined,
        }),
      });

      if (response.status === 401) {
        setFlow({ kind: "error", message: "You must be logged in to check in." });
        return;
      }
      if (response.status === 409) {
        const data = await response.json().catch(() => ({}));
        setFlow({
          kind: "result",
          accepted: false,
          siteName: data.siteName ?? null,
          message: data.error || friendlyFailure("ALREADY_CHECKED_IN"),
        });
        return;
      }
      if (response.status === 429) {
        setFlow({ kind: "result", accepted: false, siteName: null, message: friendlyFailure("TOO_MANY_ATTEMPTS") });
        return;
      }
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || errData.message || `Server error (${response.status})`;
        setFlow({
          kind: "result",
          accepted: false,
          siteName: null,
          message: errData.rejectionReason ? friendlyFailure(errData.rejectionReason) : errMsg,
        });
        return;
      }

      const data = (await response.json()) as {
        accepted?: boolean;
        siteName?: string | null;
        rejectionReason?: string | null;
        workSessionId?: string | null;
        error?: string;
      };

      if (data.accepted) {
        setFlow({
          kind: "result",
          accepted: true,
          siteName: data.siteName ?? "Site",
          message: `Clocked in — ${data.siteName ?? "Site"}. Status: ON SITE.`,
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 700);
      } else {
        const msg = data.error || (data.rejectionReason ? friendlyFailure(data.rejectionReason) : "Attendance action could not be completed.");
        setFlow({
          kind: "result",
          accepted: false,
          siteName: null,
          message: msg,
        });
      }
    } catch {
      setFlow({ kind: "error", message: "Could not reach Job Tracker. Check your connection and try again." });
    }
  }

  // START BREAK — GPS required
  async function submitStartBreak(): Promise<void> {
    setSubmittingAction(true);
    try {
      const coords = await getCurrentLocation().catch(() => null);
      if (!coords) {
        setFlow({ kind: "result", accepted: false, siteName: null, message: "GPS location is required to start break." });
        return;
      }

      const response = await apiFetch("/api/checkin/start-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: coords.latitude.toString(),
          longitude: coords.longitude.toString(),
          gpsAccuracy: coords.accuracy ?? 10,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.accepted) {
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/today-timeline"] });
        const breakTime = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        setFlow({
          kind: "result",
          accepted: true,
          siteName: data.siteName ?? "Site",
          message: `Break started at ${breakTime}. Status: ON BREAK.`,
        });
      } else {
        setFlow({
          kind: "result",
          accepted: false,
          siteName: null,
          message: data.error || friendlyFailure(data.rejectionReason ?? null),
        });
      }
    } catch {
      setFlow({ kind: "error", message: "Could not start break. Check your connection and try again." });
    } finally {
      setSubmittingAction(false);
    }
  }

  // END BREAK — GPS confirms worker is back at the site
  async function submitEndBreak(): Promise<void> {
    setSubmittingAction(true);
    try {
      const coords = await getCurrentLocation().catch(() => null);
      if (!coords) {
        setFlow({ kind: "result", accepted: false, siteName: null, message: "GPS location is required to end break." });
        return;
      }

      const response = await apiFetch("/api/checkin/end-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: coords.latitude.toString(),
          longitude: coords.longitude.toString(),
          gpsAccuracy: coords.accuracy ?? 10,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.accepted) {
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/today-timeline"] });
        const returnTime = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        setFlow({
          kind: "result",
          accepted: true,
          siteName: data.siteName ?? "Site",
          message: `Returned to site at ${returnTime}. Status: ON SITE.`,
        });
      } else {
        const errorMsg = data.rejectionReason === "GPS_OUTSIDE_RADIUS"
          ? "You must be back at the site to end your break."
          : (data.error || friendlyFailure(data.rejectionReason ?? null));
        setFlow({
          kind: "result",
          accepted: false,
          siteName: null,
          message: errorMsg,
        });
      }
    } catch {
      setFlow({ kind: "error", message: "Could not end break. Check your connection and try again." });
    } finally {
      setSubmittingAction(false);
    }
  }

  // CLOCK OUT — GPS required within site geofence
  async function submitCheckOut(workSessionId?: string | null): Promise<void> {
    setSubmittingAction(true);
    try {
      let coords: { latitude: number; longitude: number; accuracy?: number } | null = null;
      try {
        coords = await getCurrentLocation();
      } catch {
        setFlow({
          kind: "result",
          accepted: false,
          siteName: null,
          message: "We could not get your location. GPS must be enabled to clock out.",
        });
        setSubmittingAction(false);
        return;
      }

      const response = await apiFetch("/api/checkin/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workSessionId: workSessionId ?? undefined,
          latitude: coords.latitude.toString(),
          longitude: coords.longitude.toString(),
          gpsAccuracy: coords.accuracy ?? 10,
        }),
      });

      if (response.status === 401) {
        setFlow({ kind: "error", message: "You must be logged in to clock out." });
        return;
      }

      const data = (await response.json()) as {
        accepted?: boolean;
        closed?: boolean;
        siteName?: string | null;
        rejectionReason?: string | null;
        error?: string;
        message?: string;
      };

      if (data.accepted && data.closed) {
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkin/today-timeline"] });
        queryClient.invalidateQueries({ queryKey: ["/api/payroll/worker-weekly"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/time-tracking"] });
        const checkedOutAt = new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
        setFlow({
          kind: "result",
          accepted: true,
          siteName: data.siteName ?? "Site",
          message: `Clocked out successfully at ${checkedOutAt}. Redirecting to dashboard…`,
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 700);
      } else {
        const failureMsg = data.rejectionReason === "GPS_OUTSIDE_RADIUS"
          ? "You must be at the site to clock out."
          : (data.error || (data.rejectionReason ? friendlyFailure(data.rejectionReason) : "Unable to complete clock out."));

        setFlow({
          kind: "result",
          accepted: false,
          siteName: null,
          message: failureMsg,
        });
      }
    } catch {
      setFlow({ kind: "error", message: "Could not reach Job Tracker. Check your connection and try again." });
    } finally {
      setSubmittingAction(false);
    }
  }

  async function beginScan(): Promise<void> {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => undefined);
      scannerRef.current = null;
    }
    setFlow({ kind: "scanning" });
  }

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/90 border-slate-700 shadow-2xl backdrop-blur">
        <CardHeader className="text-center pb-3 border-b border-slate-700/80">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-2">
            <Clock className="w-6 h-6 text-amber-400" />
          </div>
          <CardTitle className="text-xl font-bold text-white tracking-tight">Site Attendance</CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Sculpt Projects 4-State Attendance
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {/* Loading State */}
          {flow.kind === "loading" && (
            <div className="text-center py-8 space-y-3">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-300 font-medium">Checking attendance status…</p>
            </div>
          )}

          {/* STATE 1: NOT CLOCKED IN */}
          {flow.kind === "idle" && (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-slate-900/80 border border-slate-700/80 rounded-2xl space-y-2">
                <Badge className="bg-slate-700 text-slate-300 border-slate-600 font-semibold px-3 py-1">
                  Status: CLOCKED OUT / Not Clocked In
                </Badge>
                <p className="text-xs text-slate-400 pt-1">
                  Point your camera at the printed Site QR poster to verify your GPS location and clock in.
                </p>
              </div>

              <Button
                onClick={() => void beginScan()}
                size="lg"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-12 text-sm shadow-lg shadow-amber-600/20"
              >
                <Camera className="w-4 h-4 mr-2" /> Scan Site QR to Clock In
              </Button>
            </div>
          )}

          {/* Camera Scanning Modal */}
          {flow.kind === "scanning" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300 text-center font-medium">Point rear camera at the printed Site QR poster…</p>
              <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-black min-h-[260px]">
                <div id={scannerDivId} className="w-full h-full" />
              </div>
              <Button
                variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                onClick={() => {
                  void scannerRef.current?.stop().catch(() => undefined);
                  scannerRef.current = null;
                  setFlow({ kind: "idle" });
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* STATE 2: ON SITE (CLOCKED IN & WORKING) */}
          {flow.kind === "onsite" && (
            <div className="space-y-5 text-center">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide">Status: ON SITE</span>
                  </div>
                  {flow.flag && (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
                      {flow.flag}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1 text-left border-t border-emerald-500/20 pt-2 text-xs">
                  <div className="text-base font-bold text-white flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{flow.siteName ?? "Active Job Site"}</span>
                  </div>
                  {flow.checkedInAt && (
                    <div className="flex justify-between text-slate-300 pt-1 font-mono">
                      <span>Clock In:</span>
                      <span className="font-bold text-emerald-300">
                        {new Date(flow.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  {flow.breakStartTime && (
                    <div className="flex justify-between text-slate-400 font-mono">
                      <span>Break Out:</span>
                      <span>{new Date(flow.breakStartTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {flow.breakEndTime && (
                    <div className="flex justify-between text-slate-400 font-mono">
                      <span>Break Return:</span>
                      <span>{new Date(flow.breakEndTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                </div>

                {/* Elapsed Time Counter */}
                <div className="pt-2 border-t border-emerald-500/20">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-medium">Session Elapsed</span>
                  <span className="text-3xl font-mono font-bold text-amber-400 tracking-wider">
                    {elapsedTime}
                  </span>
                </div>
              </div>

              {/* Action Buttons: START BREAK & CLOCK OUT */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  disabled={submittingAction}
                  onClick={() => void submitStartBreak()}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-medium h-12 text-sm shadow-lg shadow-amber-600/20"
                >
                  {submittingAction ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Start Break"}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  disabled={submittingAction}
                  onClick={() => void submitCheckOut(flow.workSessionId)}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium h-12 text-sm shadow-lg shadow-red-600/20"
                >
                  {submittingAction ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-1.5" /> Clock Out</>}
                </Button>
              </div>
            </div>
          )}

          {/* STATE 3: ON BREAK */}
          {flow.kind === "onbreak" && (
            <div className="space-y-5 text-center">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">Status: ON BREAK</span>
                  </div>
                  {flow.flag && (
                    <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px]">
                      {flow.flag}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1 text-left border-t border-amber-500/20 pt-2 text-xs">
                  <div className="text-base font-bold text-white flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{flow.siteName ?? "Active Job Site"}</span>
                  </div>
                  {flow.checkedInAt && (
                    <div className="flex justify-between text-slate-400 font-mono">
                      <span>Clock In:</span>
                      <span>{new Date(flow.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {flow.breakStartedAt && (
                    <div className="flex justify-between text-amber-300 font-mono font-bold">
                      <span>Break Started:</span>
                      <span>{new Date(flow.breakStartedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                </div>

                {/* Break Live Timer */}
                <div className="pt-2 border-t border-amber-500/20">
                  <span className="text-[10px] text-amber-400/80 uppercase tracking-widest block font-medium">Break Time Elapsed</span>
                  <span className="text-3xl font-mono font-bold text-amber-400 tracking-wider">
                    {breakElapsedTime}
                  </span>
                </div>
              </div>

              {/* Action Buttons: END BREAK (GPS verified at site) & CLOCK OUT */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  disabled={submittingAction}
                  onClick={() => void submitEndBreak()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-12 text-sm shadow-lg shadow-emerald-600/20"
                >
                  {submittingAction ? <RefreshCw className="w-4 h-4 animate-spin" /> : "End Break"}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  disabled={submittingAction}
                  onClick={() => void submitCheckOut(flow.workSessionId)}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium h-12 text-sm shadow-lg shadow-red-600/20"
                >
                  {submittingAction ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-1.5" /> Clock Out</>}
                </Button>
              </div>
            </div>
          )}

          {flow.kind === "locating" && (
            <div className="text-center py-6 space-y-2">
              <RefreshCw className="w-7 h-7 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-200">Requesting GPS position…</p>
            </div>
          )}

          {flow.kind === "submitting" && (
            <div className="text-center py-6 space-y-2">
              <RefreshCw className="w-7 h-7 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-200">Verifying site QR & GPS proximity…</p>
            </div>
          )}

          {/* Result State */}
          {flow.kind === "result" && (
            <div className="text-center space-y-4 py-2">
              <div
                className={`p-4 rounded-2xl border ${
                  flow.accepted
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-red-500/10 border-red-500/30 text-red-300"
                }`}
              >
                {flow.accepted ? (
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                )}
                <p className="text-sm font-semibold">{flow.message}</p>
              </div>

              <Button
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium"
                onClick={() => void refreshAttendanceState()}
              >
                Continue
              </Button>
            </div>
          )}

          {/* Error State */}
          {flow.kind === "error" && (
            <div className="text-center space-y-4 py-2">
              <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                <p className="text-sm font-semibold">{flow.message}</p>
              </div>
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
                onClick={() => void refreshAttendanceState()}
              >
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


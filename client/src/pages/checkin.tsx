import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentLocation } from "@/lib/location";
import { apiFetch } from "@/lib/api";
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
      return "We could not get your location. GPS must be enabled to check in.";
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
    case "UNAUTHORISED_WORKER":
      return "This site is not assigned to you. You cannot check in here.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many failed attempts. Please try again later.";
    default:
      return "Check-in could not be completed.";
  }
}

export default function CheckIn() {
  const [flow, setFlow] = useState<FlowState>({ kind: "loading" });
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const scannerDivId = "checkin-qr-scanner";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Server-controlled attendance verification on load
  async function refreshAttendanceState(pendingToken?: string | null): Promise<void> {
    try {
      const response = await apiFetch("/api/checkin/current-session");
      if (response.status === 401) {
        setFlow({ kind: "error", message: "You must be logged in to check in or out." });
        return;
      }

      const data = (await response.json()) as {
        checkedIn?: boolean;
        active?: boolean;
        siteName?: string | null;
        checkedInAt?: string | null;
        workSessionId?: string | null;
      };

      if (data.active && data.checkedIn) {
        // STATE 2: Worker is already clocked in
        setFlow({
          kind: "onsite",
          siteName: data.siteName ?? "Active Site",
          checkedInAt: data.checkedInAt ?? null,
          workSessionId: data.workSessionId ?? null,
        });
      } else if (pendingToken && pendingToken.trim().length > 0) {
        // Not clocked in, but incoming URL has QR token
        const cleanToken = extractQrToken(pendingToken) ?? pendingToken.trim();
        tokenRef.current = cleanToken;
        await submitCheckIn(cleanToken);
      } else {
        // STATE 1: Worker is not clocked in
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

  // Live timer calculation when in onsite / clocked-in state
  useEffect(() => {
    if (flow.kind !== "onsite" || !flow.checkedInAt) {
      setElapsedTime("00:00:00");
      return;
    }

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

      const data = (await response.json()) as {
        accepted?: boolean;
        siteName?: string | null;
        rejectionReason?: string | null;
        workSessionId?: string | null;
      };

      if (data.accepted) {
        setFlow({
          kind: "result",
          accepted: true,
          siteName: data.siteName ?? "Site",
          message: `Checked in — ${data.siteName ?? "Site"}. Redirecting to dashboard…`,
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 700);
      } else {
        setFlow({
          kind: "result",
          accepted: false,
          siteName: null,
          message: friendlyFailure(data.rejectionReason ?? null),
        });
      }
    } catch {
      setFlow({ kind: "error", message: "Could not reach Job Tracker. Check your connection and try again." });
    }
  }

  // Clock Out requires GPS verification within site geofence, NO QR required, NO camera opened!
  async function submitCheckOut(workSessionId?: string | null): Promise<void> {
    setSubmittingCheckout(true);
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
        setSubmittingCheckout(false);
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
        setFlow({ kind: "error", message: "You must be logged in to check out." });
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
      setSubmittingCheckout(false);
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
            Sculpt Projects Field Operations
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
                  Status: Not Clocked In
                </Badge>
                <p className="text-xs text-slate-400 pt-1">
                  Point your camera at the printed Site QR poster to verify your GPS location and begin work.
                </p>
              </div>

              <Button
                onClick={() => void beginScan()}
                size="lg"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-12 text-sm shadow-lg shadow-amber-600/20"
              >
                <Camera className="w-4 h-4 mr-2" /> Scan Site QR Code
              </Button>
            </div>
          )}

          {/* Camera Scanning Modal / Container */}
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

          {/* STATE 2: CLOCKED IN (ONSITE) */}
          {flow.kind === "onsite" && (
            <div className="space-y-5 text-center">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300 uppercase tracking-wide">Work Session Active</span>
                </div>

                <div className="space-y-1">
                  <div className="text-lg font-bold text-white flex items-center justify-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{flow.siteName ?? "Active Job Site"}</span>
                  </div>
                  {flow.checkedInAt && (
                    <p className="text-xs text-slate-400">
                      Clocked in at:{" "}
                      <span className="font-mono text-slate-200 font-medium">
                        {new Date(flow.checkedInAt).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                  )}
                </div>

                {/* Elapsed Time Counter */}
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-medium">Elapsed Time</span>
                  <span className="text-3xl font-mono font-bold text-amber-400 tracking-wider">
                    {elapsedTime}
                  </span>
                </div>
              </div>

              {/* Direct 1-Tap Clock Out Button - NO QR, NO CAMERA */}
              <Button
                variant="destructive"
                size="lg"
                disabled={submittingCheckout}
                onClick={() => void submitCheckOut(flow.workSessionId)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium h-12 text-sm shadow-lg shadow-red-600/20"
              >
                {submittingCheckout ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Ending Session…
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 mr-2" /> Clock Out
                  </>
                )}
              </Button>
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

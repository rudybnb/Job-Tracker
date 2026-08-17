import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentLocation } from "@/lib/location";
import { apiFetch } from "@/lib/api";
import { startQrScanner, extractQrToken } from "@/lib/qr-scanner-helper";

type FlowState =
  | { readonly kind: "idle" }
  | { readonly kind: "scanning" }
  | { readonly kind: "checkingSession" }
  | { readonly kind: "locating" }
  | { readonly kind: "submitting" }
  | {
      readonly kind: "onsite";
      readonly siteName: string | null;
      readonly checkedInAt: string | null;
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
      return "You are not currently checked in at this site. Check in first.";
    case "UNAUTHORISED_WORKER":
      return "This site is not assigned to you. You cannot check in here.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many failed attempts. Please try again later.";
    default:
      return "Check-in could not be completed.";
  }
}

export default function CheckIn() {
  const [flow, setFlow] = useState<FlowState>({ kind: "idle" });
  const scannerDivId = "checkin-qr-scanner";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Auto-capture QR token on mount from URL query params or sessionStorage
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
      const cleanToken = extractQrToken(token) ?? token.trim();
      tokenRef.current = cleanToken;
      void checkCurrentSession(cleanToken).then((active) => {
        if (!active) {
          void submitCheckIn(cleanToken);
        }
      });
    }

    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, []);

  // Initialize camera scanner when flow state transitions to scanning (after DOM element is mounted)
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
          void checkCurrentSession(token).then((active) => {
            if (!active) {
              void submitCheckIn(token);
            }
          });
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

  async function checkCurrentSession(token: string): Promise<boolean> {
    setFlow({ kind: "checkingSession" });
    tokenRef.current = token;
    try {
      const response = await apiFetch(
        `/api/checkin/current-session?qrToken=${encodeURIComponent(token)}`,
      );
      if (response.status === 401) {
        setFlow({ kind: "error", message: "You must be logged in to check in or out." });
        return false;
      }
      const data = (await response.json()) as {
        checkedIn?: boolean;
        active?: boolean;
        siteName?: string | null;
        checkedInAt?: string | null;
      };
      if (data.checkedIn && data.active) {
        setFlow({
          kind: "onsite",
          siteName: data.siteName ?? "Site",
          checkedInAt: data.checkedInAt ?? null,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

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
      if (response.status === 429) {
        setFlow({ kind: "result", accepted: false, siteName: null, message: friendlyFailure("TOO_MANY_ATTEMPTS") });
        return;
      }
      const data = (await response.json()) as {
        accepted?: boolean;
        siteName?: string | null;
        rejectionReason?: string | null;
      };
      if (data.accepted) {
        setFlow({
          kind: "result",
          accepted: true,
          siteName: data.siteName ?? "Site",
          message: `Checked in — ${data.siteName ?? "Site"}. Redirecting to dashboard...`,
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
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

  async function submitCheckOut(token: string): Promise<void> {
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
      const response = await apiFetch("/api/checkin/checkout", {
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
        setFlow({ kind: "error", message: "You must be logged in to check out." });
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
        closed?: boolean;
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
          message: `Checked out — ${data.siteName ?? "Site"} at ${checkedOutAt}`,
        });
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

  async function beginScan(): Promise<void> {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => undefined);
      scannerRef.current = null;
    }
    setFlow({ kind: "scanning" });
  }

  return (
    <div className="checkin-page" style={{ padding: "1rem", maxWidth: "520px", margin: "0 auto" }}>
      <Card>
        <CardHeader>
          <CardTitle>Site Check In / Out</CardTitle>
          <CardDescription>
            Scan the site QR poster, then we verify your phone GPS before accepting your check-in or check-out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flow.kind === "idle" && (
            <div style={{ textAlign: "center" }}>
              <Button onClick={() => void beginScan()} size="lg">
                Scan Site QR Code
              </Button>
            </div>
          )}

          {flow.kind === "scanning" && (
            <div>
              <p style={{ marginBottom: "0.5rem" }}>Point your camera at the site QR code…</p>
              <div id={scannerDivId} style={{ width: "100%" }} />
              <Button
                variant="outline"
                style={{ marginTop: "0.75rem" }}
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

          {flow.kind === "checkingSession" && (
            <p style={{ textAlign: "center" }}>Checking your current site session…</p>
          )}

          {flow.kind === "onsite" && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#15803d" }}>
                {flow.siteName ? `You are on site at ${flow.siteName}` : "You are currently checked in"}
              </p>
              {flow.checkedInAt && (
                <p style={{ color: "#6b7280", marginBlock: "0.5rem" }}>
                  Checked in at{" "}
                  {new Date(flow.checkedInAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {tokenRef.current && (
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => void submitCheckOut(tokenRef.current!)}
                >
                  Check Out
                </Button>
              )}
            </div>
          )}

          {flow.kind === "locating" && (
            <p style={{ textAlign: "center" }}>Requesting your GPS position…</p>
          )}

          {flow.kind === "submitting" && (
            <p style={{ textAlign: "center" }}>Verifying site QR and GPS…</p>
          )}

          {flow.kind === "result" && (
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: flow.accepted ? "#15803d" : "#b91c1c",
                }}
              >
                {flow.message}
              </p>
              <Button style={{ marginTop: "0.75rem" }} onClick={() => setFlow({ kind: "idle" })}>
                Done
              </Button>
            </div>
          )}

          {flow.kind === "error" && (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#b91c1c", marginBottom: "0.75rem" }}>{flow.message}</p>
              <Button onClick={() => void beginScan()}>Try Again</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function extractToken(decodedText: string): string | null {
  try {
    const url = new URL(decodedText);
    const token = url.searchParams.get("t") || url.searchParams.get("qrToken") || url.searchParams.get("token");
    if (token && token.trim().length > 0) return token.trim();
  } catch {
    // Not a URL: treat the raw decoded value as the token.
    if (decodedText.trim().length > 0) return decodedText.trim();
  }
  return null;
}

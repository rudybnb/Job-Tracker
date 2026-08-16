import { useEffect, useState } from "react";
import AppTopBar from "@/components/AppTopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { getCurrentLocation } from "@/lib/location";
import { parseDmsOrDecimal, lookupUkPostcodeOrAddress } from "@/lib/geo-utils";
import { MapPin, QrCode, RefreshCw, Printer, Compass, CheckCircle, AlertTriangle, Lock } from "lucide-react";
import "./hallmark-sweep.css";

interface SiteCheckinConfig {
  readonly id: string;
  readonly jobId: string;
  readonly siteName: string | null;
  readonly siteLatitude: string;
  readonly siteLongitude: string;
  readonly allowedRadiusMetres: number;
  readonly qrEnabled: boolean;
  readonly gpsEnabled: boolean;
  readonly qrToken: string;
}

interface JobOption {
  readonly id: string;
  readonly title: string;
  readonly location: string;
  readonly address?: string | null;
  readonly postcode?: string | null;
  readonly latitude?: string | null;
  readonly longitude?: string | null;
}

interface QrView {
  readonly siteName: string | null;
  readonly payload: string;
  readonly dataUrl: string;
}



export default function AdminSiteCheckin() {
  const [configs, setConfigs] = useState<SiteCheckinConfig[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [qrView, setQrView] = useState<QrView | null>(null);

  const [selectedJobId, setSelectedJobId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteLatitude, setSiteLatitude] = useState("");
  const [siteLongitude, setSiteLongitude] = useState("");
  const [radius, setRadius] = useState("100");
  const [qrEnabled, setQrEnabled] = useState(true);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [reportedAccuracy, setReportedAccuracy] = useState<number | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  async function load() {
    setLoading(true);
    setUnauthorized(false);
    try {
      const [configsRes, jobsRes] = await Promise.all([
        apiFetch("/api/admin/site-checkin/configs"),
        apiFetch("/api/jobs"),
      ]);

      if (configsRes.status === 401 || jobsRes.status === 401) {
        setUnauthorized(true);
        return;
      }

      if (configsRes.ok) {
        const data = (await configsRes.json()) as { configs: SiteCheckinConfig[] };
        setConfigs(data.configs || []);
      }
      if (jobsRes.ok) {
        const jobData = (await jobsRes.json()) as JobOption[];
        setJobs(jobData || []);
      }
    } catch {
      setMessage({ text: "Failed to connect to site check-in services.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function selectJob(jobId: string) {
    setSelectedJobId(jobId);
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      setSiteName(`${job.title} — ${job.location}`);
      if (job.latitude) setSiteLatitude(job.latitude);
      if (job.longitude) setSiteLongitude(job.longitude);

      // Check if config already exists for this job
      const existingConfig = configs.find((c) => c.jobId === jobId);
      if (existingConfig) {
        setSiteLatitude(existingConfig.siteLatitude);
        setSiteLongitude(existingConfig.siteLongitude);
        setRadius(existingConfig.allowedRadiusMetres.toString());
        setQrEnabled(existingConfig.qrEnabled);
        setGpsEnabled(existingConfig.gpsEnabled);
        if (existingConfig.siteName) setSiteName(existingConfig.siteName);
      }
    }
  }

  function editConfig(config: SiteCheckinConfig) {
    setSelectedJobId(config.jobId);
    setSiteName(config.siteName ?? "");
    setSiteLatitude(config.siteLatitude);
    setSiteLongitude(config.siteLongitude);
    setRadius(config.allowedRadiusMetres.toString());
    setQrEnabled(config.qrEnabled);
    setGpsEnabled(config.gpsEnabled);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePostcodeLookup() {
    const job = jobs.find((j) => j.id === selectedJobId);
    const searchQuery = job?.address || job?.postcode || job?.location || siteName;

    if (!searchQuery) {
      setMessage({ text: "Select a job or enter a site name/address first.", type: "error" });
      return;
    }

    setGeocoding(true);
    setMessage({ text: `Geocoding address: "${searchQuery}"...`, type: "info" });

    const result = await lookupUkPostcodeOrAddress(searchQuery);
    setGeocoding(false);

    if (result) {
      setSiteLatitude(result.latitude.toFixed(6));
      setSiteLongitude(result.longitude.toFixed(6));
      setMessage({
        text: `Found location: Lat ${result.latitude.toFixed(6)}, Lng ${result.longitude.toFixed(6)}. Please confirm before saving.`,
        type: "success",
      });
    } else {
      setMessage({
        text: `Could not resolve GPS coordinates for "${searchQuery}". Please enter decimal coordinates or use device location.`,
        type: "error",
      });
    }
  }

  async function handleCurrentLocation() {
    setGeocoding(true);
    setMessage({ text: "Requesting current GPS coordinates from browser...", type: "info" });
    try {
      const loc = await getCurrentLocation();
      setSiteLatitude(loc.latitude.toFixed(6));
      setSiteLongitude(loc.longitude.toFixed(6));
      if (loc.accuracy !== undefined) {
        setReportedAccuracy(Math.round(loc.accuracy));
      }
      setMessage({
        text: `Captured current GPS location (accuracy: ±${Math.round(loc.accuracy ?? 0)}m). Confirm and save policy.`,
        type: "success",
      });
    } catch (err: any) {
      setMessage({
        text: err?.message || "Location permission denied or GPS unavailable.",
        type: "error",
      });
    } finally {
      setGeocoding(false);
    }
  }

  async function saveConfig() {
    setMessage(null);

    const parsedLat = parseDmsOrDecimal(siteLatitude);
    const parsedLng = parseDmsOrDecimal(siteLongitude);
    const parsedRadius = Number(radius);

    if (parsedLat === null || parsedLat < -90 || parsedLat > 90) {
      setMessage({ text: "Latitude must be a valid decimal number between -90 and +90 (e.g. 51.491306).", type: "error" });
      return;
    }

    if (parsedLng === null || parsedLng < -180 || parsedLng > 180) {
      setMessage({ text: "Longitude must be a valid decimal number between -180 and +180 (e.g. 0.148139).", type: "error" });
      return;
    }

    if (Number.isNaN(parsedRadius) || parsedRadius <= 0) {
      setMessage({ text: "Allowed GPS radius must be a positive number of metres (e.g. 100).", type: "error" });
      return;
    }

    const formattedLat = parsedLat.toFixed(6);
    const formattedLng = parsedLng.toFixed(6);

    setSiteLatitude(formattedLat);
    setSiteLongitude(formattedLng);
    setLoading(true);

    try {
      const response = await apiFetch("/api/admin/site-checkin/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          siteName: siteName.trim(),
          siteLatitude: formattedLat,
          siteLongitude: formattedLng,
          allowedRadiusMetres: parsedRadius,
          qrEnabled,
          gpsEnabled,
          keepExistingToken: true,
        }),
      });

      const data = (await response.json()) as { config?: SiteCheckinConfig; error?: string };
      if (!response.ok) {
        setMessage({ text: data.error ?? "Failed to save site check-in policy.", type: "error" });
        return;
      }

      setMessage({ text: `Successfully saved site check-in policy for "${siteName}".`, type: "success" });
      await load();
    } catch {
      setMessage({ text: "Failed to save site check-in policy.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function showQr(config: SiteCheckinConfig) {
    try {
      const response = await apiFetch(`/api/admin/site-checkin/configs/${config.id}/qr`);
      const data = (await response.json()) as QrView;
      if (response.ok) {
        setQrView(data);
      } else {
        setMessage({ text: "Could not load QR code.", type: "error" });
      }
    } catch {
      setMessage({ text: "Could not load QR code.", type: "error" });
    }
  }

  async function rotateToken(config: SiteCheckinConfig) {
    try {
      const response = await apiFetch(`/api/admin/site-checkin/configs/${config.id}/rotate-token`, {
        method: "POST",
      });
      const data = (await response.json()) as { qrToken?: string; error?: string };
      if (response.ok) {
        setMessage({ text: "New QR token generated. Previous QR code invalidated.", type: "success" });
        await load();
        await showQr({ ...config, qrToken: data.qrToken ?? config.qrToken });
      } else {
        setMessage({ text: data.error ?? "Could not rotate token.", type: "error" });
      }
    } catch {
      setMessage({ text: "Could not rotate token.", type: "error" });
    }
  }

  function printQrCode(siteTitle: string, dataUrl: string, payload: string) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Site QR Code - ${siteTitle}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 40px; color: #0f172a; }
            .logo-mark { font-size: 28px; font-weight: 800; color: #d97706; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
            .sub-title { font-size: 14px; text-transform: uppercase; color: #64748b; margin-bottom: 24px; letter-spacing: 2px; }
            h1 { font-size: 24px; color: #0f172a; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
            img.qr { width: 340px; height: 340px; border: 4px solid #0f172a; padding: 16px; border-radius: 16px; background: #ffffff; }
            .instructions { margin-top: 28px; font-size: 15px; color: #334155; max-width: 440px; margin-left: auto; margin-right: auto; line-height: 1.6; text-align: left; background: #f8fafc; padding: 16px 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .instructions ol { margin: 8px 0 0 20px; padding: 0; }
            .token-info { font-family: monospace; font-size: 10px; color: #94a3b8; margin-top: 16px; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="logo-mark">Sculpt Projects</div>
          <div class="sub-title">Site QR Check-In Poster</div>
          <h1>${siteTitle}</h1>
          <img class="qr" src="${dataUrl}" alt="Site Check-In QR Code" />
          <div class="instructions">
            <strong>Worker Clock-In Instructions:</strong>
            <ol>
              <li>Open <strong>Job Tracker</strong> on your mobile phone.</li>
              <li>Tap <strong>Scan Site QR Code</strong>.</li>
              <li>Scan this QR poster while standing at the site to verify your location.</li>
            </ol>
          </div>
          <div class="token-info">${payload}</div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  if (unauthorized) {
    return (
      <div className="hallmark-sweep min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        <AppTopBar />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-800 border-slate-700 text-slate-100 shadow-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl text-white">Admin Authentication Required</CardTitle>
              <CardDescription className="text-slate-400">
                You must be logged in as an Admin to manage Site QR and GPS policies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => (window.location.href = "/login")}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-12"
              >
                Go to Admin Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="hallmark-sweep min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      <AppTopBar />

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <QrCode className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Site QR & GPS Management</h1>
              <p className="text-amber-400 text-sm font-medium">Sculpt Projects Field Operations</p>
            </div>
          </div>
          <Button
            onClick={() => void load()}
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 self-start md:self-auto"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh Data
          </Button>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-3 ${
              message.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-300"
                : message.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-blue-500/10 border-blue-500/30 text-blue-300"
            }`}
          >
            {message.type === "error" ? (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle className="w-5 h-5 shrink-0" />
            )}
            <div className="text-sm font-medium">{message.text}</div>
          </div>
        )}

        {/* Form Card */}
        <Card className="bg-slate-800/80 border-slate-700 shadow-xl backdrop-blur">
          <CardHeader>
            <CardTitle className="text-xl text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-400" /> Configure Site QR & GPS Policy
            </CardTitle>
            <CardDescription className="text-slate-400">
              Set exact site coordinates, allowed GPS geofence radius, and generate printable QR codes for workers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Job / Site Selector */}
            <div className="space-y-2">
              <Label className="text-slate-200 font-medium">Select Job / Site</Label>
              <select
                className="w-full rounded-lg border border-slate-600 bg-slate-900 text-white px-3 py-3 text-sm focus:border-amber-500 focus:outline-none"
                value={selectedJobId}
                onChange={(e) => selectJob(e.target.value)}
              >
                <option value="">Select a job site…</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} — {job.location}
                  </option>
                ))}
              </select>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label className="text-slate-200 font-medium">Site Display Name (shown to workers on check-in)</Label>
              <Input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. Woolwich Church — 165 Powis Street"
                className="bg-slate-900 border-slate-600 text-white h-11"
              />
            </div>

            {/* Address Lookup & Current Location Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button
                type="button"
                onClick={() => void handlePostcodeLookup()}
                disabled={geocoding || !selectedJobId}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium h-11"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Find Location from Address/Postcode
              </Button>
              <Button
                type="button"
                onClick={() => void handleCurrentLocation()}
                disabled={geocoding}
                variant="outline"
                className="border-slate-600 text-slate-200 hover:bg-slate-700 h-11"
              >
                <Compass className="w-4 h-4 mr-2" />
                Use My Current Location
              </Button>
            </div>

            {/* Coordinates Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-200 font-medium">Decimal Latitude (-90 to +90)</Label>
                <Input
                  value={siteLatitude}
                  onChange={(e) => setSiteLatitude(e.target.value)}
                  placeholder="e.g. 51.491306"
                  className="bg-slate-900 border-slate-600 text-white h-11 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200 font-medium">Decimal Longitude (-180 to +180)</Label>
                <Input
                  value={siteLongitude}
                  onChange={(e) => setSiteLongitude(e.target.value)}
                  placeholder="e.g. 0.148139"
                  className="bg-slate-900 border-slate-600 text-white h-11 font-mono text-sm"
                />
              </div>
            </div>

            {reportedAccuracy !== null && (
              <div className="text-xs text-slate-400">Captured device GPS accuracy: ±{reportedAccuracy} metres</div>
            )}

            {/* Radius and Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-2">
              <div className="space-y-2">
                <Label className="text-slate-200 font-medium">Allowed GPS Radius (metres)</Label>
                <Input
                  type="number"
                  min={1}
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white h-11"
                />
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 flex items-center justify-between h-11">
                <span className="text-sm font-medium text-slate-200">Require QR Code</span>
                <input
                  type="checkbox"
                  checked={qrEnabled}
                  onChange={(e) => setQrEnabled(e.target.checked)}
                  className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                />
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 flex items-center justify-between h-11">
                <span className="text-sm font-medium text-slate-200">Require GPS Geofence</span>
                <input
                  type="checkbox"
                  checked={gpsEnabled}
                  onChange={(e) => setGpsEnabled(e.target.checked)}
                  className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                />
              </div>
            </div>

            <Button
              onClick={() => void saveConfig()}
              disabled={loading || !selectedJobId}
              className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-medium h-12 text-base shadow-lg"
            >
              Save Site QR & GPS Policy
            </Button>
          </CardContent>
        </Card>

        {/* Configured Sites List Card */}
        <Card className="bg-slate-800/80 border-slate-700 shadow-xl backdrop-blur">
          <CardHeader>
            <CardTitle className="text-xl text-white flex items-center justify-between">
              <span>Configured Site Check-In Policies ({configs.length})</span>
            </CardTitle>
            <CardDescription className="text-slate-400">
              Active sites currently configured for QR code + GPS clock-in verification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No site check-in policies configured yet. Select a job above to create one.</div>
            ) : (
              <div className="space-y-4">
                {configs.map((config) => {
                  const linkedJob = jobs.find((j) => j.id === config.jobId);
                  return (
                    <div
                      key={config.id}
                      className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-base">{config.siteName ?? linkedJob?.title ?? config.jobId}</span>
                          <Badge className={config.qrEnabled ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700 text-slate-400"}>
                            QR {config.qrEnabled ? "Active" : "Disabled"}
                          </Badge>
                          <Badge className={config.gpsEnabled ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-700 text-slate-400"}>
                            GPS {config.gpsEnabled ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Coords: {config.siteLatitude}, {config.siteLongitude} · Radius: {config.allowedRadiusMetres}m
                        </div>
                        {linkedJob?.address && <div className="text-xs text-slate-400">Address: {linkedJob.address}</div>}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => editConfig(config)}
                          className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void showQr(config)}
                          className="border-slate-700 text-amber-400 hover:bg-amber-500/10"
                        >
                          <QrCode className="w-4 h-4 mr-1.5" /> View QR
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void rotateToken(config)}
                          className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                          <RefreshCw className="w-4 h-4 mr-1.5" /> Rotate QR
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* QR Code Viewer Modal */}
        {qrView && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setQrView(null)}
          >
            <Card
              className="w-full max-w-md bg-slate-800 border-slate-700 text-slate-100 shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader>
                <CardTitle className="text-xl text-white">{qrView.siteName ?? "Site QR Code"}</CardTitle>
                <CardDescription className="text-slate-400 text-xs">Print or present this QR code at the job site for worker check-in.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex flex-col items-center">
                <div className="p-3 bg-white rounded-2xl shadow-inner inline-block border-4 border-amber-500/40">
                  <img src={qrView.dataUrl} alt="Site QR code" className="w-64 h-64 mx-auto" />
                </div>
                <div className="text-[10px] text-slate-400 font-mono break-all max-w-xs">{qrView.payload}</div>
                <div className="flex gap-2 w-full pt-2">
                  <Button
                    onClick={() => printQrCode(qrView.siteName ?? "Job Site", qrView.dataUrl, qrView.payload)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  >
                    <Printer className="w-4 h-4 mr-2" /> Print QR Poster
                  </Button>
                  <Button onClick={() => setQrView(null)} variant="outline" className="flex-1 border-slate-600 text-slate-300">
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

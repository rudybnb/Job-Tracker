import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import "./jobs.css";

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
  const [message, setMessage] = useState<string | null>(null);
  const [qrView, setQrView] = useState<QrView | null>(null);

  const [selectedJobId, setSelectedJobId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteLatitude, setSiteLatitude] = useState("");
  const [siteLongitude, setSiteLongitude] = useState("");
  const [radius, setRadius] = useState("100");
  const [qrEnabled, setQrEnabled] = useState(true);
  const [gpsEnabled, setGpsEnabled] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [configsRes, jobsRes] = await Promise.all([
        apiFetch("/api/admin/site-checkin/configs"),
        apiFetch("/api/jobs"),
      ]);
      if (configsRes.ok) {
        const data = (await configsRes.json()) as { configs: SiteCheckinConfig[] };
        setConfigs(data.configs);
      }
      if (jobsRes.ok) {
        const jobData = (await jobsRes.json()) as JobOption[];
        setJobs(jobData);
      }
    } catch {
      setMessage("Failed to load site check-in data.");
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
    }
  }

  async function saveConfig() {
    setMessage(null);
    setLoading(true);
    try {
      const response = await apiFetch("/api/admin/site-checkin/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          siteName,
          siteLatitude,
          siteLongitude,
          allowedRadiusMetres: Number(radius),
          qrEnabled,
          gpsEnabled,
          keepExistingToken: true,
        }),
      });
      const data = (await response.json()) as { config?: SiteCheckinConfig; error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to save config.");
        return;
      }
      setMessage("Saved. QR token kept unchanged.");
      await load();
    } catch {
      setMessage("Failed to save config.");
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
        setMessage("Could not load QR.");
      }
    } catch {
      setMessage("Could not load QR.");
    }
  }

  async function rotateToken(config: SiteCheckinConfig) {
    try {
      const response = await apiFetch(`/api/admin/site-checkin/configs/${config.id}/rotate-token`, {
        method: "POST",
      });
      const data = (await response.json()) as { qrToken?: string; error?: string };
      if (response.ok) {
        setMessage("New QR token generated. Print the new QR and replace the old one.");
        await load();
        await showQr({ ...config, qrToken: data.qrToken ?? config.qrToken });
      } else {
        setMessage(data.error ?? "Could not rotate token.");
      }
    } catch {
      setMessage("Could not rotate token.");
    }
  }

  return (
    <div className="admin-page" style={{ padding: "1rem", maxWidth: "860px", margin: "0 auto" }}>
      <h1 className="sculpt-page-title">Site Check-In (QR + GPS)</h1>

      {message && <p style={{ margin: "0.5rem 0", color: "#475569" }}>{message}</p>}

      <Card style={{ marginBottom: "1rem" }}>
        <CardHeader>
          <CardTitle>Configure a site</CardTitle>
          <CardDescription>
            One site check-in policy per job. Radius, QR and GPS toggles apply to this site only.
          </CardDescription>
        </CardHeader>
        <CardContent style={{ display: "grid", gap: "0.75rem" }}>
          <div>
            <Label>Job / Site</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedJobId}
              onChange={(e) => selectJob(e.target.value)}
            >
              <option value="">Select a job…</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} — {job.location}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Site name (shown to worker on success)</Label>
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <div>
              <Label>Latitude</Label>
              <Input value={siteLatitude} onChange={(e) => setSiteLatitude(e.target.value)} />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input value={siteLongitude} onChange={(e) => setSiteLongitude(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.5rem", alignItems: "end" }}>
            <div>
              <Label>Allowed GPS radius (metres)</Label>
              <Input value={radius} onChange={(e) => setRadius(e.target.value)} type="number" min={1} />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <input type="checkbox" checked={qrEnabled} onChange={(e) => setQrEnabled(e.target.checked)} /> QR
              </Label>
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <input type="checkbox" checked={gpsEnabled} onChange={(e) => setGpsEnabled(e.target.checked)} /> GPS
              </Label>
            </div>
          </div>
          <div>
            <Button onClick={() => void saveConfig()} disabled={loading || !selectedJobId}>
              Save site check-in
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site check-in configs</CardTitle>
        </CardHeader>
        <CardContent>
          {configs.length === 0 && <p>No site check-in configs yet.</p>}
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {configs.map((config) => (
              <div
                key={config.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <strong>{config.siteName ?? config.jobId}</strong>
                  <div className="text-sm text-muted-foreground">
                    {config.siteLatitude}, {config.siteLongitude} · radius {config.allowedRadiusMetres}m
                    {" · "}
                    QR {config.qrEnabled ? "on" : "off"} · GPS {config.gpsEnabled ? "on" : "off"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button variant="outline" onClick={() => void showQr(config)}>
                    View QR
                  </Button>
                  <Button variant="outline" onClick={() => void rotateToken(config)}>
                    New QR
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {qrView && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setQrView(null)}
        >
          <Card onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", textAlign: "center" }}>
            <CardHeader>
              <CardTitle>{qrView.siteName ?? "Site QR"}</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={qrView.dataUrl}
                alt="Site QR code"
                style={{ width: "100%", maxWidth: "360px", imageRendering: "pixelated" }}
              />
              <p className="text-xs text-muted-foreground break-all" style={{ marginTop: "0.5rem" }}>
                {qrView.payload}
              </p>
              <Button style={{ marginTop: "0.75rem" }} onClick={() => setQrView(null)}>
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "./live-clock-monitor.css";

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  return (
    <div className="lm-logout">
      <div className="lm-logout__inner">
        <span className="lm-logout__role">Admin</span>
        <button
          onClick={handleLogout}
          className="lm-logout__button"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default function LiveClockMonitor() {
  const queryClient = useQueryClient();
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  // Correction Modal State
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [corrDate, setCorrDate] = useState("");
  const [corrClockIn, setCorrClockIn] = useState("");
  const [corrBreakOut, setCorrBreakOut] = useState("");
  const [corrBreakReturn, setCorrBreakReturn] = useState("");
  const [corrClockOut, setCorrClockOut] = useState("");
  const [corrStatus, setCorrStatus] = useState("completed");
  const [corrReason, setCorrReason] = useState("");
  const [corrAuditLogs, setCorrAuditLogs] = useState<any[]>([]);
  const [isSavingCorr, setIsSavingCorr] = useState(false);
  const [corrError, setCorrError] = useState("");

  // Fetch active work sessions
  const { data: activeSessions = [], isLoading: activeLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/active-sessions'],
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  const handleOpenCorrection = async (session: any) => {
    setEditingSession(session);
    setCorrError("");

    // Base date
    const baseDateStr = session.clockInTime
      ? new Date(session.clockInTime).toISOString().slice(0, 10)
      : (session.startTime ? new Date(session.startTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setCorrDate(baseDateStr);

    const toTimeInput = (iso?: string | null) => {
      if (!iso) return "";
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      } catch {
        return "";
      }
    };

    setCorrClockIn(toTimeInput(session.clockInTime || session.startTime));
    setCorrBreakOut(toTimeInput(session.breakOutTime || session.breakStartTime));
    setCorrBreakReturn(toTimeInput(session.breakReturnTime || session.breakEndTime));
    setCorrClockOut(toTimeInput(session.clockOutTime || session.endTime));
    setCorrStatus(session.clockOutTime || session.endTime ? "completed" : (session.status === 'on_break' ? "on_break" : "active"));
    setCorrReason(session.attendanceFlag === 'ATTENDANCE REVIEW REQUIRED' ? 'Attendance review & correction by Admin' : '');

    // Fetch existing audit corrections
    try {
      const resp = await fetch(`/api/admin/attendance-corrections/${session.id}`);
      if (resp.ok) {
        const logs = await resp.json();
        setCorrAuditLogs(logs);
      } else {
        setCorrAuditLogs([]);
      }
    } catch {
      setCorrAuditLogs([]);
    }
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    if (!corrReason.trim()) {
      setCorrError("Please enter a reason for this attendance correction.");
      return;
    }
    if (!corrClockIn) {
      setCorrError("Clock In time is required.");
      return;
    }

    setIsSavingCorr(true);
    setCorrError("");

    try {
      const buildIso = (timeStr: string) => {
        if (!timeStr) return null;
        return new Date(`${corrDate}T${timeStr}:00`).toISOString();
      };

      const payload = {
        workSessionId: editingSession.id,
        clockInTime: buildIso(corrClockIn),
        breakStartTime: corrBreakOut ? buildIso(corrBreakOut) : null,
        breakEndTime: corrBreakReturn ? buildIso(corrBreakReturn) : null,
        clockOutTime: corrClockOut ? buildIso(corrClockOut) : null,
        status: corrClockOut ? "completed" : corrStatus,
        reason: corrReason.trim(),
        adminUser: localStorage.getItem('adminName') || 'Admin',
      };

      const resp = await fetch("/api/admin/attendance-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const errJson = await resp.json();
        throw new Error(errJson.error || "Failed to save correction.");
      }

      await queryClient.invalidateQueries({ queryKey: ['/api/admin/active-sessions'] });
      setEditingSession(null);
    } catch (err: any) {
      setCorrError(err.message || "Failed to save correction.");
    } finally {
      setIsSavingCorr(false);
    }
  };



  // Fetch contractor locations for live GPS tracking
  const [contractorLocations, setContractorLocations] = useState<Record<string, any>>({});

  useEffect(() => {
    if (activeSessions.length > 0) {
      const fetchLocations = async () => {
        const locations: Record<string, any> = {};
        
        for (const session of activeSessions) {
          try {
            const response = await fetch(`/api/contractor-location/${encodeURIComponent(session.contractorName)}`);
            if (response.ok) {
              const locationData = await response.json();
              locations[session.contractorName] = locationData;
            }
          } catch (error) {
            console.log(`No GPS location for ${session.contractorName}`);
          }
        }
        
        setContractorLocations(locations);
      };

      fetchLocations();
      const locationInterval = setInterval(fetchLocations, 30000); // Update every 30 seconds

      return () => clearInterval(locationInterval);
    }
  }, [activeSessions]);

  const adminName = localStorage.getItem('adminName') || 'Admin';
  const adminInitials = adminName.split(' ').map((name) => name[0]).join('').slice(0, 2) || 'AD';
  const gpsTrackedCount = activeSessions.filter((session: any) => {
    const location = contractorLocations[session.contractorName];
    return location && location.latitude && location.longitude;
  }).length;
  const missingGpsCount = Math.max(activeSessions.length - gpsTrackedCount, 0);

  return (
    <div className="lm-page">
      <header className="lm-topbar">
        <div className="lm-brand" aria-label="Sculpt Projects admin dashboard">
          <div className="lm-brand__mark">
            <img src="/sculpt-projects-logo.png" alt="" aria-hidden="true" />
          </div>
          <div className="lm-brand__copy">
            <strong>Sculpt Projects</strong>
            <small>Operations dashboard</small>
          </div>
        </div>

        <nav className="lm-desktop-nav" aria-label="Primary admin sections">
          <button type="button" onClick={() => window.location.href = '/admin'}>Dashboard</button>
          <button type="button" onClick={() => window.location.href = '/job-assignments'}>Jobs</button>
          <button type="button" className="is-active" aria-current="page">Live</button>
          <button type="button" onClick={() => window.location.href = '/admin'}>Admin</button>
          <button type="button" onClick={() => window.location.href = '/upload'}>Upload</button>
        </nav>

        <div className="lm-topbar__status">
          <span className="lm-online"><i aria-hidden="true"></i>Live</span>
          <button
            type="button"
            className="lm-menu-button"
            aria-expanded={showAvatarDropdown}
            onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
          >
            Menu
          </button>
          <button
            type="button"
            onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
            className="lm-avatar"
            aria-label={`Signed in as ${adminName}`}
          >
            {adminInitials}
          </button>
          <LogoutButton />

          {showAvatarDropdown && (
            <div className="lm-menu" role="menu">
              <div className="lm-menu__identity">
                <strong>{adminName}</strong>
                <span>Admin access</span>
              </div>
              <div className="lm-menu__items">
                <button 
                  onClick={() => window.location.href = '/admin'}
                  className="lm-menu-item"
                  role="menuitem"
                >
                  <i className="fas fa-tachometer-alt" aria-hidden="true"></i>
                  <span>Admin Dashboard</span>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/payroll-overview'}
                  className="lm-menu-item"
                  role="menuitem"
                >
                  <i className="fas fa-clock" aria-hidden="true"></i>
                  <span>Time Tracking</span>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/job-assignments'}
                  className="lm-menu-item"
                  role="menuitem"
                >
                  <i className="fas fa-tasks" aria-hidden="true"></i>
                  <span>Job Assignments</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="lm-shell">
        <section className="lm-hero" aria-labelledby="live-monitor-title">
          <div className="lm-hero__copy">
            <p className="lm-kicker">Live monitor</p>
            <h1 id="live-monitor-title">Workers onsite, clocked in, and traceable.</h1>
            <span>Real-time contractor attendance and GPS signal status for active work sessions.</span>
          </div>

          <div className="lm-metrics" aria-label="Live attendance totals">
            <div>
              <strong>{activeSessions.length}</strong>
              <span>Active workers</span>
            </div>
            <div>
              <strong>{gpsTrackedCount}</strong>
              <span>GPS tracked</span>
            </div>
            <div>
              <strong>{missingGpsCount}</strong>
              <span>No GPS signal</span>
            </div>
          </div>
        </section>

        <section className="lm-panel" aria-labelledby="active-workers-title">
          <div className="lm-panel__head">
            <div>
              <p className="lm-kicker">Attendance signal</p>
              <h2 id="active-workers-title">Active Workers</h2>
            </div>
            <div className="lm-live-pill">
              <i aria-hidden="true"></i>
              <span>Refreshes every 10 seconds</span>
            </div>
          </div>

          <div className="lm-panel__body">
          {activeLoading ? (
              <div className="lm-empty lm-empty--loading">
                <div className="lm-spinner" aria-hidden="true"></div>
                <strong>Loading live sessions...</strong>
              </div>
) : activeSessions.length > 0 ? (
              <div className="lm-worker-grid">
              {activeSessions.map((session: any) => {
                const location = contractorLocations[session.contractorName];
                const hasLocation = location && location.latitude && location.longitude;
                const statusLabel = session.displayStatus || (session.status === 'on_break' ? 'ON BREAK' : session.status === 'checked_out' ? 'CHECKED OUT' : 'ON SITE');
                const statusClass = statusLabel === 'ON BREAK' ? 'lm-status--break' : statusLabel === 'CHECKED OUT' ? 'lm-status--checked-out' : 'lm-status--active';
                
                const formatTimelineSecs = (secs: number) => {
                  const h = Math.floor(secs / 3600);
                  const m = Math.floor((secs % 3600) / 60);
                  if (h === 0) return `${m}m`;
                  return `${h}h ${m.toString().padStart(2, "0")}m`;
                };

                const totalWorkedDisplay = formatTimelineSecs(session.totalDailyWorkedSeconds ?? session.todayTimeline?.totalWorkedSeconds ?? 0);
                const totalBreakDisplay = formatTimelineSecs(session.totalDailyBreakSeconds ?? session.todayTimeline?.totalBreakSeconds ?? 0);

                const clockInDisplay = session.clockInTime
                  ? new Date(session.clockInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  : (session.startedAt || '—');

                const breakOutDisplay = session.breakOutTime || session.breakOutAt
                  ? (session.breakOutAt || new Date(session.breakOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
                  : '—';

                const breakReturnDisplay = session.breakReturnTime || session.breakReturnAt
                  ? (session.breakReturnAt || new Date(session.breakReturnTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
                  : '—';

                const clockOutDisplay = session.clockOutTime || session.checkedOutAt
                  ? (session.checkedOutAt || new Date(session.clockOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
                  : '—';

                const flag = session.attendanceFlag;
                const isSignalLost = session.locationSignalLost || flag === 'LOCATION SIGNAL LOST';
                const isReviewRequired = flag === 'ATTENDANCE REVIEW REQUIRED';

                return (
                    <article key={session.id} className="lm-worker-card">
                      <div className="lm-worker-card__head">
                        <div className="lm-worker-identity">
                          <span className={`lm-signal ${isSignalLost ? 'lm-signal--warn' : hasLocation ? 'lm-signal--good' : 'lm-signal--warn'}`} aria-hidden="true"></span>
                          <div>
                            <h3>{session.contractorName}</h3>
                            <p>{session.jobSiteLocation || 'Unknown job site'}</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {isSignalLost && (
                            <span className="lm-flag-badge lm-flag-badge--signal-lost">Location Signal Lost</span>
                          )}
                          {isReviewRequired && (
                            <span className="lm-flag-badge lm-flag-badge--review">Attendance Review Required</span>
                          )}
                          <span className={`lm-status ${statusClass}`}>{statusLabel}</span>
                        </div>
                      </div>

                      {/* 4 Exact Timestamps */}
                      <div className="lm-spec-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                        <div>
                          <span>Clock In</span>
                          <strong>{clockInDisplay}</strong>
                        </div>
                        <div>
                          <span>Break Out</span>
                          <strong>{breakOutDisplay}</strong>
                        </div>
                        <div>
                          <span>Break Return</span>
                          <strong>{breakReturnDisplay}</strong>
                        </div>
                        <div>
                          <span>Clock Out</span>
                          <strong>{clockOutDisplay}</strong>
                        </div>
                      </div>

                      {/* Worked & Break Summaries */}
                      <div className="lm-spec-grid">
                        <div>
                          <span>Total Worked Today</span>
                          <strong style={{ color: '#10b981' }}>{totalWorkedDisplay}</strong>
                        </div>
                        <div>
                          <span>Total Break Today</span>
                          <strong style={{ color: '#f59e0b' }}>{totalBreakDisplay}</strong>
                        </div>
                      </div>

                      {/* Today's Attendance Timeline */}
                      {session.todayTimeline && session.todayTimeline.sessions && session.todayTimeline.sessions.length > 0 && (
                        <div className="lm-timeline-block">
                          <div className="lm-timeline-block__head">
                            <span>Today’s Shift Timeline</span>
                            <strong>{formatTimelineSecs(session.todayTimeline.totalWorkedSeconds)} worked</strong>
                          </div>
                          <div className="lm-timeline-stepper">
                            {session.todayTimeline.sessions.map((tSess: any, idx: number) => {
                              const sStart = tSess.clockInTime || tSess.startTime ? new Date(tSess.clockInTime || tSess.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
                              const sEnd = tSess.clockOutTime || tSess.endTime ? new Date(tSess.clockOutTime || tSess.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : (tSess.displayStatus || 'Active');
                              const isSessActive = tSess.status === 'active' || tSess.status === 'on_break';

                              return (
                                <div key={tSess.id || idx} className="lm-timeline-node">
                                  {tSess.breakDurationSeconds !== undefined && tSess.breakDurationSeconds > 0 && (
                                    <div className="lm-timeline-break">
                                      <span>☕ Break Duration: {formatTimelineSecs(tSess.breakDurationSeconds)}</span>
                                    </div>
                                  )}
                                  <div className={`lm-timeline-pill ${isSessActive ? 'lm-timeline-pill--active' : 'lm-timeline-pill--completed'}`}>
                                    <div className="lm-timeline-pill__info">
                                      <span className="lm-timeline-pill__num">#{idx + 1}</span>
                                      <span className="lm-timeline-pill__time">{sStart} → {sEnd}</span>
                                      <span className="lm-timeline-pill__site">{tSess.siteName}</span>
                                    </div>
                                    <span className="lm-timeline-pill__dur">{formatTimelineSecs(tSess.workedDurationSeconds ?? tSess.durationSeconds)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {hasLocation && (
                        <div className="lm-gps-note">
                          <i className="fas fa-location-dot" aria-hidden="true"></i>
                          <span>
                            Last GPS: {new Date(location.lastUpdate).toLocaleTimeString('en-GB', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </span>
                        </div>
                      )}

                      {/* Admin Attendance Review & Correction Action */}
                      <div className="lm-card-actions">
                        <button
                          type="button"
                          onClick={() => handleOpenCorrection(session)}
                          className={`lm-btn-correct ${isReviewRequired ? 'lm-btn-correct--warn' : ''}`}
                        >
                          <i className="fas fa-edit" aria-hidden="true"></i>
                          <span>{isReviewRequired ? 'Review & Correct Shift' : 'Admin Edit Shift'}</span>
                        </button>
                      </div>
                    </article>
                );
              })}
            </div>
          ) : (
              <div className="lm-empty">
                <div className="lm-empty__mark">
                  <i className="fas fa-user-clock" aria-hidden="true"></i>
                </div>
                <div>
                  <h3>No workers currently active</h3>
                  <p>Clocked-in contractors will appear here automatically when active sessions are reported.</p>
                </div>
              </div>
          )}
          </div>
        </section>
      </main>

      <nav className="lm-mobile-nav" aria-label="Primary">
        <div className="lm-mobile-nav__grid">
          <button type="button" onClick={() => window.location.href = '/admin'}>
            <i className="fas fa-home" aria-hidden="true"></i>
            <span>Dashboard</span>
          </button>
          <button type="button" onClick={() => window.location.href = '/job-assignments'}>
            <i className="fas fa-briefcase" aria-hidden="true"></i>
            <span>Jobs</span>
          </button>
          <button type="button" className="is-active" aria-current="page">
            <i className="fas fa-clock" aria-hidden="true"></i>
            <span>Live</span>
          </button>
          <button type="button" onClick={() => window.location.href = '/admin'}>
            <i className="fas fa-user-cog" aria-hidden="true"></i>
            <span>Admin</span>
          </button>
          <button type="button" onClick={() => window.location.href = '/upload'}>
            <i className="fas fa-upload" aria-hidden="true"></i>
            <span>Upload</span>
          </button>
        </div>
      </nav>

      {/* Admin Correction Modal */}
      {editingSession && (
        <div className="lm-modal-backdrop" onClick={() => setEditingSession(null)}>
          <div className="lm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lm-modal__head">
              <div>
                <h2>Admin Attendance Review & Correction</h2>
                <p>{editingSession.contractorName} • {editingSession.jobSiteLocation || 'Job Site'}</p>
              </div>
              <button
                type="button"
                className="lm-modal__close"
                onClick={() => setEditingSession(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveCorrection}>
              <div className="lm-modal__body">
                {corrError && (
                  <div style={{ padding: '0.75rem', background: '#451a1a', border: '1px solid #7f1d1d', borderRadius: '0.5rem', color: '#fca5a5', fontSize: '0.875rem' }}>
                    {corrError}
                  </div>
                )}

                <div className="lm-form-group">
                  <label>Shift Date</label>
                  <input
                    type="date"
                    className="lm-input"
                    value={corrDate}
                    onChange={(e) => setCorrDate(e.target.value)}
                    required
                  />
                </div>

                <div className="lm-form-grid">
                  <div className="lm-form-group">
                    <label>Clock In Time (Required)</label>
                    <input
                      type="time"
                      className="lm-input"
                      value={corrClockIn}
                      onChange={(e) => setCorrClockIn(e.target.value)}
                      required
                    />
                  </div>

                  <div className="lm-form-group">
                    <label>Clock Out Time (Optional)</label>
                    <input
                      type="time"
                      className="lm-input"
                      value={corrClockOut}
                      onChange={(e) => setCorrClockOut(e.target.value)}
                      placeholder="Leave blank if active"
                    />
                  </div>
                </div>

                <div className="lm-form-grid">
                  <div className="lm-form-group">
                    <label>Break Out Time (Optional)</label>
                    <input
                      type="time"
                      className="lm-input"
                      value={corrBreakOut}
                      onChange={(e) => setCorrBreakOut(e.target.value)}
                    />
                  </div>

                  <div className="lm-form-group">
                    <label>Break Return Time (Optional)</label>
                    <input
                      type="time"
                      className="lm-input"
                      value={corrBreakReturn}
                      onChange={(e) => setCorrBreakReturn(e.target.value)}
                    />
                  </div>
                </div>

                <div className="lm-form-group">
                  <label>Session Status</label>
                  <select
                    className="lm-input"
                    value={corrStatus}
                    onChange={(e) => setCorrStatus(e.target.value)}
                  >
                    <option value="completed">Completed (Shift Closed)</option>
                    <option value="active">Active (On Site)</option>
                    <option value="on_break">On Break</option>
                  </select>
                </div>

                <div className="lm-form-group">
                  <label>Reason for Correction (Audit Requirement)</label>
                  <textarea
                    className="lm-textarea"
                    rows={3}
                    placeholder="e.g. Corrected legacy 18:00 auto-logout. Worker finished at 16:30."
                    value={corrReason}
                    onChange={(e) => setCorrReason(e.target.value)}
                    required
                  ></textarea>
                </div>

                {/* Audit History */}
                {corrAuditLogs.length > 0 && (
                  <div className="lm-audit-section">
                    <h4>Audit History ({corrAuditLogs.length} previous correction{corrAuditLogs.length > 1 ? 's' : ''})</h4>
                    {corrAuditLogs.map((log: any) => {
                      let oldV: any = {};
                      let newV: any = {};
                      try {
                        oldV = typeof log.oldValues === 'string' ? JSON.parse(log.oldValues) : log.oldValues;
                      } catch {}
                      try {
                        newV = typeof log.newValues === 'string' ? JSON.parse(log.newValues) : log.newValues;
                      } catch {}

                      const fmtTime = (iso?: string | null) => {
                        if (!iso) return '—';
                        try {
                          return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        } catch {
                          return '—';
                        }
                      };

                      return (
                        <div key={log.id} className="lm-audit-item">
                          <div className="lm-audit-item__meta">
                            <strong style={{ color: '#60a5fa' }}>Admin: {log.adminUser}</strong>
                            <span>{new Date(log.createdAt).toLocaleString('en-GB')}</span>
                          </div>
                          <div style={{ marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ color: '#ef4444' }}>
                              <strong>Original:</strong> In: {fmtTime(oldV.startTime)} | Out: {fmtTime(oldV.endTime)} ({oldV.totalHours ? `${oldV.totalHours}h` : oldV.status})
                            </div>
                            <div style={{ color: '#10b981' }}>
                              <strong>Corrected:</strong> In: {fmtTime(newV.startTime)} | Out: {fmtTime(newV.endTime)} ({newV.totalHours ? `${newV.totalHours}h` : newV.status})
                            </div>
                            <div>
                              <strong>Reason:</strong> {log.reason}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lm-modal__foot">
                <button
                  type="button"
                  className="lm-btn-cancel"
                  onClick={() => setEditingSession(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="lm-btn-save"
                  disabled={isSavingCorr}
                >
                  {isSavingCorr ? "Saving..." : "Apply & Clear Review Warning"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

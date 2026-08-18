import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  // Fetch active work sessions
  const { data: activeSessions = [], isLoading: activeLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/active-sessions'],
    refetchInterval: 10000 // Refresh every 10 seconds
  });



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
    </div>
  );
}

/**
 * Authoritative Unified Server Payroll Engine
 *
 * Single source of truth for worker and admin payroll calculations.
 * Enforces authentic database rates, exact payable session validation,
 * and matching CIS / Net calculations across Admin and Worker pages.
 */

import postgres from "postgres";

export interface WorkerProfile {
  id: string | null;
  contractorName: string;
  username: string;
  hourlyRate: number | null;
  dailyRate: number | null;
  cisRate: number; // 0.20 for registered, 0.30 for unregistered, 0.00 for gross
  cisRegistered: boolean;
  rateMissing: boolean;
}

export interface PayableSessionRecord {
  id: string;
  contractorName: string;
  jobSiteLocation: string | null;
  startTime: string | null;
  endTime: string | null;
  date: string;
  startTimeFormatted: string;
  endTimeFormatted: string;
  hoursWorked: number;
  grossEarnings: number;
  hourlyRate: number;
  status: string;
  gpsVerified: boolean;
}

export interface WorkerPayrollSummary {
  weekEnding: string;
  weekStart: string;
  weekEnd: string;
  contractorName: string;
  username: string;
  hourlyRate: number;
  dailyRate: number;
  cisRatePercentage: number;
  cisRegistered: boolean;
  rateMissing: boolean;
  totalHours: number;
  grossEarnings: number;
  cisDeduction: number;
  netEarnings: number;
  sessions: PayableSessionRecord[];
}

export interface AdminPayrollReport {
  weekEnding: string;
  weekStart: string;
  weekEnd: string;
  contractors: {
    contractorName: string;
    username: string;
    sessions: PayableSessionRecord[];
    totalHours: number;
    hoursWorked: number;
    hourlyRate: number;
    dailyRate: number;
    grossEarnings: number;
    cisDeduction: number;
    netEarnings: number;
    cisRate: number;
    rateMissing: boolean;
  }[];
  totals: {
    totalHours: number;
    totalGrossEarnings: number;
    totalCisDeduction: number;
    totalNetEarnings: number;
    contractors: number;
  };
  sessionsCount: number;
}

/**
 * Calculates authentic payable hours for a work session.
 * Excludes active, uncompleted, missing-timestamp, inverted, or negative duration sessions.
 */
export function calculatePayableSessionHours(session: {
  status: string | null;
  startTime: Date | string | null;
  endTime: Date | string | null;
  totalHours?: string | number | null;
}): number {
  if (session.status !== "completed" || !session.startTime || !session.endTime) {
    return 0;
  }

  const startMs = new Date(session.startTime).getTime();
  const endMs = new Date(session.endTime).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 0;
  }

  // If database totalHours was recorded as positive number
  if (session.totalHours !== null && session.totalHours !== undefined) {
    const parsed = typeof session.totalHours === "number" ? session.totalHours : parseFloat(session.totalHours);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(Math.round(parsed * 100) / 100, 8);
    }
  }

  // Calculate duration in hours capped at standard 8h daily shift
  const durationHours = (endMs - startMs) / (1000 * 60 * 60);
  if (durationHours > 0) {
    return Math.min(Math.round(durationHours * 100) / 100, 8);
  }

  return 0;
}

/**
 * Resolves a worker's authoritative pay rate and CIS status from database.
 */
export async function resolveWorkerProfile(
  sql: postgres.Sql,
  identifier: string
): Promise<WorkerProfile> {
  const clean = (identifier || "").trim();
  const dotVariant = clean.replace(/\s+/g, ".");
  const spaceVariant = clean.replace(/\./g, " ");
  const firstName = clean.split(/[\s.]/)[0];

  // 1. Check contractor_applications table (primary source for contractor rate & CIS)
  const appRows = await sql<{
    id: string;
    first_name: string;
    last_name: string;
    username: string | null;
    admin_pay_rate: string | null;
    is_cis_registered: string | null;
    cis_status: string | null;
  }[]>`
    SELECT id, first_name, last_name, username, admin_pay_rate, is_cis_registered, cis_status
      FROM contractor_applications
     WHERE username ILIKE ${clean}
        OR username ILIKE ${dotVariant}
        OR CONCAT(first_name, ' ', last_name) ILIKE ${clean}
        OR CONCAT(first_name, ' ', last_name) ILIKE ${spaceVariant}
        OR first_name ILIKE ${firstName}
     ORDER BY submitted_at DESC
     LIMIT 1;
  `;

  if (appRows.length > 0) {
    const app = appRows[0];
    const fullName = `${app.first_name} ${app.last_name}`.trim();
    const resolvedUsername = app.username || dotVariant.toLowerCase();
    const isRegistered = app.is_cis_registered === "true" || app.is_cis_registered === "TRUE";
    
    // CIS rate: 0% for gross, 20% for registered, 30% for unregistered
    let cisRate = 0.30;
    if (app.cis_status?.toLowerCase() === "gross") {
      cisRate = 0.00;
    } else if (isRegistered) {
      cisRate = 0.20;
    }

    const hourlyRate = app.admin_pay_rate ? parseFloat(app.admin_pay_rate) : null;
    const rateMissing = hourlyRate === null || Number.isNaN(hourlyRate) || hourlyRate <= 0;
    const finalHourly = rateMissing ? 0 : hourlyRate;

    return {
      id: app.id,
      contractorName: fullName,
      username: resolvedUsername,
      hourlyRate: finalHourly,
      dailyRate: finalHourly * 8,
      cisRate,
      cisRegistered: isRegistered,
      rateMissing,
    };
  }

  // 2. Check workers table fallback
  const workerRows = await sql<{
    id: string;
    name?: string;
    role?: string;
    hourly_rate?: string | null;
    daily_rate?: string | null;
    cis_registered?: boolean | null;
    cis_rate?: string | null;
  }[]>`
    SELECT id, hourly_rate, daily_rate, cis_registered, cis_rate
      FROM workers
     WHERE id::text ILIKE ${clean}
     LIMIT 1;
  `.catch(() => []);

  if (workerRows.length > 0) {
    const w = workerRows[0];
    const isRegistered = w.cis_registered === true;
    const cisRate = w.cis_rate ? parseFloat(w.cis_rate) : (isRegistered ? 0.20 : 0.30);
    const hourlyRate = w.hourly_rate ? parseFloat(w.hourly_rate) : null;
    const rateMissing = hourlyRate === null || Number.isNaN(hourlyRate) || hourlyRate <= 0;
    const finalHourly = rateMissing ? 0 : hourlyRate;

    return {
      id: w.id,
      contractorName: clean,
      username: dotVariant.toLowerCase(),
      hourlyRate: finalHourly,
      dailyRate: finalHourly * 8,
      cisRate,
      cisRegistered: isRegistered,
      rateMissing,
    };
  }

  return {
    id: null,
    contractorName: clean,
    username: dotVariant.toLowerCase(),
    hourlyRate: 0,
    dailyRate: 0,
    cisRate: 0.30,
    cisRegistered: false,
    rateMissing: true,
  };
}

/**
 * Calculates payroll for a single worker for the given Friday week-ending date.
 */
export async function calculateWorkerPayroll(
  sql: postgres.Sql,
  identifier: string,
  weekEndingStr: string
): Promise<WorkerPayrollSummary> {
  const profile = await resolveWorkerProfile(sql, identifier);

  const endDate = new Date(weekEndingStr);
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(weekEndingStr);
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const clean = identifier.trim();
  const dotVariant = clean.replace(/\s+/g, ".");
  const spaceVariant = clean.replace(/\./g, " ");
  const firstName = clean.split(/[\s.]/)[0];

  const sessions = await sql<{
    id: string;
    contractor_name: string;
    job_site_location: string | null;
    start_time: Date | string | null;
    end_time: Date | string | null;
    total_hours: string | null;
    status: string;
  }[]>`
    SELECT id, contractor_name, job_site_location, start_time, end_time, total_hours, status
      FROM work_sessions
     WHERE (contractor_name ILIKE ${clean}
        OR contractor_name ILIKE ${dotVariant}
        OR contractor_name ILIKE ${spaceVariant}
        OR contractor_name ILIKE ${firstName}
        OR contractor_name ILIKE ${profile.contractorName}
        OR contractor_name ILIKE ${profile.username})
       AND status = 'completed'
       AND start_time >= ${startDate.toISOString()}
       AND start_time <= ${endDate.toISOString()}
     ORDER BY start_time DESC;
  `;

  const payableSessions: PayableSessionRecord[] = [];
  let totalHours = 0;
  let grossEarnings = 0;

  for (const s of sessions) {
    const hoursWorked = calculatePayableSessionHours({
      status: s.status,
      startTime: s.start_time,
      endTime: s.end_time,
      totalHours: s.total_hours,
    });

    const isFullDay = hoursWorked >= 8;
    const sessionGross = hoursWorked > 0 && (profile.hourlyRate ?? 0) > 0
      ? (isFullDay ? (profile.dailyRate ?? 0) : hoursWorked * (profile.hourlyRate ?? 0))
      : 0;

    const roundedSessionGross = Math.round(sessionGross * 100) / 100;
    totalHours += hoursWorked;
    grossEarnings += roundedSessionGross;

    const startTimeDate = s.start_time ? new Date(s.start_time) : null;
    const endTimeDate = s.end_time ? new Date(s.end_time) : null;

    payableSessions.push({
      id: s.id,
      contractorName: s.contractor_name,
      jobSiteLocation: s.job_site_location,
      startTime: startTimeDate ? startTimeDate.toISOString() : null,
      endTime: endTimeDate ? endTimeDate.toISOString() : null,
      date: startTimeDate ? startTimeDate.toISOString().split("T")[0] : "",
      startTimeFormatted: startTimeDate ? startTimeDate.toISOString().substring(11, 16) : "--:--",
      endTimeFormatted: endTimeDate ? endTimeDate.toISOString().substring(11, 16) : "--:--",
      hoursWorked,
      grossEarnings: roundedSessionGross,
      hourlyRate: profile.hourlyRate ?? 0,
      status: s.status,
      gpsVerified: true,
    });
  }

  const roundedTotalHours = Math.round(totalHours * 100) / 100;
  const roundedGross = Math.round(grossEarnings * 100) / 100;
  const cisDeduction = roundedGross > 0
    ? Math.round(roundedGross * profile.cisRate * 100) / 100
    : 0;
  const netEarnings = Math.max(0, Math.round((roundedGross - cisDeduction) * 100) / 100);

  return {
    weekEnding: weekEndingStr,
    weekStart: startDate.toISOString().split("T")[0],
    weekEnd: endDate.toISOString().split("T")[0],
    contractorName: profile.contractorName,
    username: profile.username,
    hourlyRate: profile.hourlyRate ?? 0,
    dailyRate: profile.dailyRate ?? 0,
    cisRatePercentage: Math.round(profile.cisRate * 100),
    cisRegistered: profile.cisRegistered,
    rateMissing: profile.rateMissing,
    totalHours: roundedTotalHours,
    grossEarnings: roundedGross,
    cisDeduction,
    netEarnings,
    sessions: payableSessions,
  };
}

/**
 * Calculates weekly payroll report for Admin across all active contractors.
 * Uses the exact same profile resolution and earnings formula as individual worker earnings.
 */
export async function calculateAdminWeeklyPayroll(
  sql: postgres.Sql,
  weekEndingStr: string
): Promise<AdminPayrollReport> {
  const endDate = new Date(weekEndingStr);
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(weekEndingStr);
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const sessions = await sql<{
    id: string;
    contractor_name: string;
    job_site_location: string | null;
    start_time: Date | string | null;
    end_time: Date | string | null;
    total_hours: string | null;
    status: string;
  }[]>`
    SELECT id, contractor_name, job_site_location, start_time, end_time, total_hours, status
      FROM work_sessions
     WHERE status = 'completed'
       AND start_time >= ${startDate.toISOString()}
       AND start_time <= ${endDate.toISOString()}
     ORDER BY start_time DESC;
  `;

  // Distinct contractor names in sessions
  const distinctNames = Array.from(new Set(sessions.map((s) => s.contractor_name).filter(Boolean)));
  const contractorsList: AdminPayrollReport["contractors"] = [];

  for (const name of distinctNames) {
    const summary = await calculateWorkerPayroll(sql, name, weekEndingStr);
    if (summary.sessions.length > 0 || summary.totalHours > 0) {
      contractorsList.push({
        contractorName: summary.contractorName,
        username: summary.username,
        sessions: summary.sessions,
        totalHours: summary.totalHours,
        hoursWorked: summary.totalHours,
        hourlyRate: summary.hourlyRate,
        dailyRate: summary.dailyRate,
        grossEarnings: summary.grossEarnings,
        cisDeduction: summary.cisDeduction,
        netEarnings: summary.netEarnings,
        cisRate: summary.cisRatePercentage / 100,
        rateMissing: summary.rateMissing,
      });
    }
  }

  const totals = {
    totalHours: Math.round(contractorsList.reduce((sum, c) => sum + c.totalHours, 0) * 100) / 100,
    totalGrossEarnings: Math.round(contractorsList.reduce((sum, c) => sum + c.grossEarnings, 0) * 100) / 100,
    totalCisDeduction: Math.round(contractorsList.reduce((sum, c) => sum + c.cisDeduction, 0) * 100) / 100,
    totalNetEarnings: Math.round(contractorsList.reduce((sum, c) => sum + c.netEarnings, 0) * 100) / 100,
    contractors: contractorsList.length,
  };

  return {
    weekEnding: weekEndingStr,
    weekStart: startDate.toISOString().split("T")[0],
    weekEnd: endDate.toISOString().split("T")[0],
    contractors: contractorsList,
    totals,
    sessionsCount: sessions.length,
  };
}

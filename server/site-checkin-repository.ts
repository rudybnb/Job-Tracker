/**
 * Phase QR-1 — Site Check-In persistence boundary.
 *
 * SiteCheckinStore is the interface used by routes and unit tests (tests provide
 * an in-memory fake). PostgresSiteCheckinStore is the live implementation backed
 * by postgres-js, following the executor/adapter pattern used elsewhere in this
 * codebase.
 */

import type postgres from "postgres";
import type {
  CheckInAttemptRow,
  CheckInIdentity,
  SiteCheckinConfig,
  WorkSessionDraft,
} from "./site-checkin.ts";

export interface SiteCheckinConfigRecord extends SiteCheckinConfig {
  readonly qrToken: string;
  readonly createdBy: string | null;
}

export interface UpsertSiteCheckinConfigInput {
  readonly jobId: string;
  readonly siteName: string | null;
  readonly siteLatitude: string;
  readonly siteLongitude: string;
  readonly allowedRadiusMetres: number;
  readonly qrEnabled: boolean;
  readonly gpsEnabled: boolean;
  readonly qrToken: string;
  readonly qrTokenHash: string;
  readonly qrTokenExpiresAt: Date | null;
  readonly createdBy: string;
}

export interface SiteCheckinStore {
  findConfigByTokenHash(tokenHash: string): Promise<SiteCheckinConfigRecord | null>;
  findConfigByJobId(jobId: string): Promise<SiteCheckinConfigRecord | null>;
  listConfigs(): Promise<SiteCheckinConfigRecord[]>;
  createOrUpdateConfig(input: UpsertSiteCheckinConfigInput): Promise<SiteCheckinConfigRecord>;
  rotateConfigToken(
    configId: string,
    qrToken: string,
    qrTokenHash: string,
    qrTokenExpiresAt: Date | null,
    rotatedBy: string,
  ): Promise<void>;
  applyCheckInAttempt(
    attempt: CheckInAttemptRow,
    workSessionDraft: WorkSessionDraft | null,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; duplicate: boolean }>;

  applyCheckOutAttempt(
    attempt: CheckInAttemptRow,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; closed: boolean }>;

  getAllWorkSessions(): Promise<{ id: string; contractorName: string; jobSiteLocation: string | null; startTime: Date | string | null; endTime: Date | string | null; status: string; jobId: string | null; workerId: string | null; contractorId: string | null }[]>;

  findActiveSession(jobId: string, identityLabel: string): Promise<{ id: string; startTime: Date | string | null; status: string } | null>;

  findActiveSessionForWorker(identityLabel: string): Promise<{ id: string; jobId: string | null; jobSiteLocation: string | null; startTime: Date | string | null; status: string } | null>;

  closeWorkSession(sessionId: string, endTime: string, identityLabel?: string): Promise<boolean>;
}

interface ConfigDbRow {
  readonly id: string;
  readonly job_id: string;
  readonly site_name: string | null;
  readonly site_latitude: string;
  readonly site_longitude: string;
  readonly allowed_radius_metres: number;
  readonly qr_enabled: boolean;
  readonly gps_enabled: boolean;
  readonly qr_token_hash: string;
  readonly qr_token_expires_at: Date | string | null;
  readonly created_by: string | null;
}

function configFromRow(row: ConfigDbRow): SiteCheckinConfigRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    siteName: row.site_name,
    siteLatitude: row.site_latitude,
    siteLongitude: row.site_longitude,
    allowedRadiusMetres: row.allowed_radius_metres,
    qrEnabled: row.qr_enabled,
    gpsEnabled: row.gps_enabled,
    qrTokenHash: row.qr_token_hash,
    qrToken: "",
    qrTokenExpiresAt: row.qr_token_expires_at,
    createdBy: row.created_by,
    contractorId: null,
  };
}

/**
 * Live Postgres implementation. Writes for a check-in attempt and its linked
 * work session happen in ONE transaction so a rejected attempt can never leave
 * a half-created session, and an accepted attempt always links its session.
 */
export class PostgresSiteCheckinStore implements SiteCheckinStore {
  private readonly sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  async findConfigByTokenHash(tokenHash: string): Promise<SiteCheckinConfigRecord | null> {
    const rows = await this.sql<ConfigDbRow[]>`
      SELECT id, job_id, site_name, site_latitude, site_longitude,
             allowed_radius_metres, qr_enabled, gps_enabled,
             qr_token_hash, qr_token_expires_at, created_by
        FROM site_checkin_config
       WHERE qr_token_hash = ${tokenHash}
         AND (qr_token_expires_at IS NULL OR qr_token_expires_at > now())
       LIMIT 1
    `;
    return rows.length === 1 ? configFromRow(rows[0]) : null;
  }

  async findConfigByJobId(jobId: string): Promise<SiteCheckinConfigRecord | null> {
    const rows = await this.sql<ConfigDbRow[]>`
      SELECT id, job_id, site_name, site_latitude, site_longitude,
             allowed_radius_metres, qr_enabled, gps_enabled,
             qr_token_hash, qr_token_expires_at, created_by
        FROM site_checkin_config
       WHERE job_id = ${jobId}
       LIMIT 1
    `;
    return rows.length === 1 ? configFromRow(rows[0]) : null;
  }

  async listConfigs(): Promise<SiteCheckinConfigRecord[]> {
    const rows = await this.sql<ConfigDbRow[]>`
      SELECT id, job_id, site_name, site_latitude, site_longitude,
             allowed_radius_metres, qr_enabled, gps_enabled,
             qr_token_hash, qr_token_expires_at, created_by
        FROM site_checkin_config
       ORDER BY site_name NULLS LAST, created_at
    `;
    return rows.map(configFromRow);
  }

  async createOrUpdateConfig(input: UpsertSiteCheckinConfigInput): Promise<SiteCheckinConfigRecord> {
    const rows = await this.sql<ConfigDbRow[]>`
      INSERT INTO site_checkin_config (
        job_id, site_name, site_latitude, site_longitude, allowed_radius_metres,
        qr_enabled, gps_enabled, qr_token_hash, qr_token_expires_at, created_by
      ) VALUES (
        ${input.jobId}, ${input.siteName}, ${input.siteLatitude}, ${input.siteLongitude},
        ${input.allowedRadiusMetres}, ${input.qrEnabled}, ${input.gpsEnabled},
        ${input.qrTokenHash}, ${input.qrTokenExpiresAt}, ${input.createdBy}
      )
      ON CONFLICT (job_id) DO UPDATE SET
        site_name = EXCLUDED.site_name,
        site_latitude = EXCLUDED.site_latitude,
        site_longitude = EXCLUDED.site_longitude,
        allowed_radius_metres = EXCLUDED.allowed_radius_metres,
        qr_enabled = EXCLUDED.qr_enabled,
        gps_enabled = EXCLUDED.gps_enabled,
        qr_token_hash = EXCLUDED.qr_token_hash,
        qr_token_expires_at = EXCLUDED.qr_token_expires_at,
        created_by = EXCLUDED.created_by,
        updated_at = now()
      RETURNING id, job_id, site_name, site_latitude, site_longitude,
                allowed_radius_metres, qr_enabled, gps_enabled,
                qr_token_hash, qr_token_expires_at, created_by
    `;
    return configFromRow(rows[0]);
  }

  async applyCheckOutAttempt(
    attempt: CheckInAttemptRow,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; closed: boolean }> {
    return this.sql.begin(async (tx) => {
      const dbTx = tx as unknown as postgres.Sql;

      const activeRows = await dbTx<{ id: string }[]>`
        SELECT id FROM work_sessions
         WHERE job_id = ${attempt.jobId}
           AND contractor_name = ${identity.identityLabel}
           AND status = 'active'
         ORDER BY start_time DESC
         LIMIT 1
      `;

      const targetSessionId = activeRows.length === 1 ? activeRows[0].id : null;
      let closed = false;

      if (targetSessionId && attempt.accepted) {
        await dbTx`
          UPDATE work_sessions
             SET end_time = ${attempt.attemptTime},
                 status = 'completed'
           WHERE id = ${targetSessionId}
        `;
        closed = true;
      }

      const attemptRows = await dbTx<{ id: string }[]>`
        INSERT INTO site_checkin_attempt (
          worker_id, contractor_id, job_id, site_checkin_config_id,
          identity_label, attempt_time, qr_valid, submitted_latitude,
          submitted_longitude, gps_accuracy_metres, calculated_distance_metres,
          permitted_radius_metres, gps_valid, accepted, rejection_reason
        ) VALUES (
          ${attempt.workerId ?? null}, ${attempt.contractorId ?? null}, ${attempt.jobId ?? null},
          ${attempt.siteCheckinConfigId ?? null}, ${identity.label},
          ${attempt.attemptTime}, ${attempt.qrValid}, ${attempt.submittedLatitude ?? null},
          ${attempt.submittedLongitude ?? null}, ${attempt.gpsAccuracyMetres ?? null},
          ${attempt.calculatedDistanceMetres ?? null}, ${attempt.permittedRadiusMetres ?? null},
          ${attempt.gpsValid}, ${attempt.accepted}, ${attempt.rejectionReason ?? null}
        )
        RETURNING id
      `;

      return {
        attemptId: attemptRows[0].id,
        workSessionId: targetSessionId,
        closed,
      };
    });
  }

  async rotateConfigToken(
    configId: string,
    qrToken: string,
    qrTokenHash: string,
    qrTokenExpiresAt: Date | null,
    rotatedBy: string,
  ): Promise<void> {
    await this.sql`
      UPDATE site_checkin_config
         SET qr_token_hash = ${qrTokenHash},
             qr_token_expires_at = ${qrTokenExpiresAt},
             created_by = ${rotatedBy},
             updated_at = now()
        WHERE id = ${configId}
    `;
  }

  async applyCheckInAttempt(
    attempt: CheckInAttemptRow,
    workSessionDraft: WorkSessionDraft | null,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; duplicate: boolean }> {
    return this.sql.begin(async (tx) => {
      const dbTx = tx as unknown as postgres.Sql;

      let createdSessionId: string | null = null;
      let duplicate = false;

      if (attempt.accepted && workSessionDraft) {
        const existingActive = await (dbTx<{ id: string }[]>`
          SELECT id FROM work_sessions
           WHERE job_id = ${workSessionDraft.jobId}
             AND contractor_name = ${identity.label}
             AND status = 'active'
           LIMIT 1
        ` as unknown as Promise<{ id: string }[]>);

        if (existingActive.length > 0) {
          duplicate = true;
          createdSessionId = existingActive[0].id;
        } else {
          const nowIso = new Date().toISOString();
          const sessionRows = await (dbTx<{ id: string }[]>`
            INSERT INTO work_sessions (
              contractor_name, job_site_location, start_time, end_time, status,
              job_id, worker_id, contractor_id
            ) VALUES (
              ${identity.label}, ${workSessionDraft.jobSiteLocation},
              ${nowIso}, ${null},
              'active', ${workSessionDraft.jobId},
              ${attempt.workerId ?? null}, ${attempt.contractorId ?? null}
            )
            RETURNING id
          ` as unknown as Promise<{ id: string }[]>);
          createdSessionId = sessionRows[0].id;
        }
      }

      const attemptRows = await (dbTx<{ id: string }[]>`
        INSERT INTO site_checkin_attempt (
          worker_id, contractor_id, job_id, site_checkin_config_id,
          identity_label, attempt_time, qr_valid, submitted_latitude,
          submitted_longitude, gps_accuracy_metres, calculated_distance_metres,
          permitted_radius_metres, gps_valid, accepted, rejection_reason
        ) VALUES (
          ${attempt.workerId ?? null}, ${attempt.contractorId ?? null}, ${attempt.jobId ?? null},
          ${attempt.siteCheckinConfigId ?? null}, ${identity.label},
          ${attempt.attemptTime}, ${attempt.qrValid}, ${attempt.submittedLatitude ?? null},
          ${attempt.submittedLongitude ?? null}, ${attempt.gpsAccuracyMetres ?? null},
          ${attempt.calculatedDistanceMetres ?? null}, ${attempt.permittedRadiusMetres ?? null},
          ${attempt.gpsValid}, ${attempt.accepted}, ${attempt.rejectionReason ?? null}
        )
        RETURNING id
      ` as unknown as Promise<{ id: string }[]>);

      return {
        attemptId: attemptRows[0].id,
        workSessionId: createdSessionId,
        duplicate,
      };
    });
  }

  async getAllWorkSessions(): Promise<{ id: string; contractorName: string; jobSiteLocation: string | null; startTime: Date | string | null; endTime: Date | string | null; status: string; jobId: string | null; workerId: string | null; contractorId: string | null }[]> {
    const rows = await this.sql<{ id: string; contractor_name: string; job_site_location: string | null; start_time: Date | string | null; end_time: Date | string | null; status: string; job_id: string | null; worker_id: string | null; contractor_id: string | null }[]>`
      SELECT id, contractor_name, job_site_location, start_time, end_time, status, job_id, worker_id, contractor_id
        FROM work_sessions
       ORDER BY start_time DESC NULLS LAST
    `;
    return rows.map((r) => ({
      id: r.id,
      contractorName: r.contractor_name,
      jobSiteLocation: r.job_site_location,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status,
      jobId: r.job_id,
      workerId: r.worker_id,
      contractorId: r.contractor_id,
    }));
  }

  async findActiveSession(jobId: string, identityLabel: string): Promise<{ id: string; startTime: Date | string | null; status: string } | null> {
    const rows = await this.sql<{ id: string; start_time: Date | string | null; status: string }[]>`
      SELECT id, start_time, status
        FROM work_sessions
       WHERE job_id = ${jobId}
         AND contractor_name = ${identityLabel}
         AND status = 'active'
       ORDER BY start_time DESC
       LIMIT 1
    `;
    return rows.length === 1 ? { id: rows[0].id, startTime: rows[0].start_time, status: rows[0].status } : null;
  }

  async findActiveSessionForWorker(identityLabel: string): Promise<{ id: string; jobId: string | null; jobSiteLocation: string | null; startTime: Date | string | null; status: string } | null> {
    const cleanLabel = (identityLabel || "").trim();
    const dotVariant = cleanLabel.replace(/\s+/g, ".");
    const spaceVariant = cleanLabel.replace(/\./g, " ");

    const rows = await this.sql<{ id: string; job_id: string | null; job_site_location: string | null; start_time: Date | string | null; status: string }[]>`
      SELECT id, job_id, job_site_location, start_time, status
        FROM work_sessions
       WHERE (contractor_name = ${cleanLabel}
          OR contractor_name ILIKE ${cleanLabel}
          OR contractor_name ILIKE ${dotVariant}
          OR contractor_name ILIKE ${spaceVariant})
         AND status = 'active'
       ORDER BY start_time DESC
       LIMIT 1
    `;
    return rows.length === 1 ? {
      id: rows[0].id,
      jobId: rows[0].job_id,
      jobSiteLocation: rows[0].job_site_location,
      startTime: rows[0].start_time,
      status: rows[0].status,
    } : null;
  }

  async closeWorkSession(sessionId: string, endTime: string, identityLabel?: string): Promise<boolean> {
    const session = await this.sql<{ start_time: Date | string | null }[]>`
      SELECT start_time FROM work_sessions WHERE id = ${sessionId}
    `;
    let totalHours: string | null = null;
    if (session.length > 0 && session[0].start_time) {
      const startMs = new Date(session[0].start_time).getTime();
      const endMs = new Date(endTime).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
        const hours = (endMs - startMs) / (1000 * 60 * 60);
        totalHours = Math.min(hours, 8).toFixed(2);
      }
    }

    const rows = await this.sql<{ id: string }[]>`
      UPDATE work_sessions
         SET end_time = ${endTime},
             status = 'completed',
             total_hours = COALESCE(${totalHours}, total_hours)
       WHERE id = ${sessionId}
         AND status = 'active'
       RETURNING id
    `;
    return rows.length === 1;
  }
}

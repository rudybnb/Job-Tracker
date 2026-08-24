CREATE TABLE IF NOT EXISTS "job_assignment_status_events" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
  "assignment_id" text NOT NULL REFERENCES "job_assignments"("id") ON DELETE CASCADE,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_assignment_status_events_actor_type_check"
    CHECK ("actor_type" IN ('worker', 'admin', 'system')),
  CONSTRAINT "job_assignment_status_events_actor_id_check"
    CHECK ("actor_type" = 'system' OR "actor_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_assignment_status_events_assignment_created_idx"
  ON "job_assignment_status_events" ("assignment_id", "created_at" DESC);

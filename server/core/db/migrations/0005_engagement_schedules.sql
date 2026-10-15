-- Insights snapshots and the inactivity win-back email have handlers now (docs/blueprint/15 §3.3, §3.6).
UPDATE "job_schedules" SET "enabled" = true WHERE "name" IN ('insights.daily', 'engagement.inactivity');

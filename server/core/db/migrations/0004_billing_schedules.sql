-- Phase 11: billing handlers exist now, so their schedules run (docs/blueprint/15 §3.6).
UPDATE "job_schedules" SET "enabled" = true WHERE "name" IN ('billing.daily', 'billing.renewal-reminders');

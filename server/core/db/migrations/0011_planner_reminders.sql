-- Planner reminders (ARCHITECTURE §8.8): two bell-only schedules and their notification templates. Reference data
-- also in scripts/seed.ts; inserts never overwrite admin edits. No schema change.
-- last_slot = now(): the first run waits for the next real slot instead of catching up on deploy day.
INSERT INTO "job_schedules" ("name", "cron", "tz", "enabled", "last_slot") VALUES
  ('planner.weekly', '0 19 * * 0', 'Asia/Jakarta', true, now()),
  ('planner.reminders', '0 18 * * *', 'Asia/Jakarta', true, now())
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
INSERT INTO "notification_templates" ("id", "key", "name", "title", "body", "action_label", "action_url", "icon", "level", "variables") VALUES
  ('notif-planner_week_open', 'planner_week_open', 'Rencana minggu depan', 'Minggu depan baru {{count}} dari {{target}} postingan', 'Isi hari kosong dari Bank Ide atau siapkan konten untuk momen belanja.', 'Buka Kalender', '{{calendarUrl}}', 'i-lucide-calendar-range', 'info',
    '[{"token":"count","label":"Terisi","sample":"1"},{"token":"target","label":"Target per minggu","sample":"3"},{"token":"calendarUrl","label":"Tautan kalender","sample":"/app/calendar"}]'::jsonb),
  ('notif-planner_idea_due', 'planner_idea_due', 'Ide untuk besok', 'Besok: {{title}}{{#more}} (+{{more}} ide lain){{/more}}', 'Ide ini belum jadi postingan. Jadikan sekarang supaya terbit tepat waktu.', 'Buka Kalender', '{{calendarUrl}}', 'i-lucide-lightbulb', 'info',
    '[{"token":"title","label":"Ide","sample":"Review sunscreen setelah 7 hari"},{"token":"more","label":"Ide lain","sample":"2"},{"token":"calendarUrl","label":"Tautan kalender","sample":"/app/calendar"}]'::jsonb)
ON CONFLICT ("key") DO NOTHING;

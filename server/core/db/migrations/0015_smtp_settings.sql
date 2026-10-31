-- SMTP as a second email driver (used when the Resend key is empty). Additive: the previous release ignores these keys.
INSERT INTO "app_settings" ("key", "value", "group", "type", "label", "is_secret")
VALUES
  ('email.smtpHost', '', 'email', 'string', 'Server SMTP', false),
  ('email.smtpPort', '587', 'email', 'number', 'Port SMTP', false),
  ('email.smtpUser', '', 'email', 'string', 'Nama pengguna SMTP', false),
  ('email.smtpPassword', '', 'email', 'secret', 'Kata sandi SMTP', true)
ON CONFLICT ("key") DO NOTHING;

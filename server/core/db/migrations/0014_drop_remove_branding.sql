-- Every Etalase now shows the Socialz.id block, so the removeBranding plan feature is gone. Data-only: the key is
-- dropped from stored plans; the previous release reads a missing key as false and shows the footer, which matches.
UPDATE "plans" SET "features" = "features" - 'removeBranding', "updated_at" = now() WHERE "features" ? 'removeBranding';

-- Data only (no schema change): two new first-time moments. A workspace that already has an active auto-reply
-- rule or a product link must not get its celebration late. The existing value wins, so a re-run keeps the first stamp.
UPDATE "workspaces" w SET "milestones" = jsonb_strip_nulls(jsonb_build_object(
  'firstRuleActive', (SELECT to_jsonb(min(dr.created_at)) FROM "dm_rules" dr WHERE dr.workspace_id = w.id AND dr.active),
  'firstLinkAdded', (SELECT to_jsonb(min(l.created_at)) FROM "links" l WHERE l.workspace_id = w.id)
)) || w."milestones"
WHERE w.deleted_at IS NULL;

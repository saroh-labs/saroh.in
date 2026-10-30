-- The two free tools that were on saroh.in before publish control (#1253,
-- extends DEC-193): /tools/link-preview (live 5 Oct 2026) and
-- /tools/qr-code-maker (live 17 Oct 2026). Seeded LIVE, each with one
-- history row ("seeded"), so the site keeps them once its build reads the
-- publish list. Data only, and idempotent: a path that already has a
-- record (published, taken off or archived since) is left as it is, and
-- gets no second history row.

WITH seeded AS (
    INSERT INTO "SearchPage" ("id", "path", "status", "liveSince", "changedAt")
    VALUES
        ('sp' || replace(gen_random_uuid()::text, '-', ''), '/tools/link-preview', 'LIVE', TIMESTAMP '2026-10-04 18:30:00', CURRENT_TIMESTAMP),
        ('sp' || replace(gen_random_uuid()::text, '-', ''), '/tools/qr-code-maker', 'LIVE', TIMESTAMP '2026-10-16 18:30:00', CURRENT_TIMESTAMP)
    ON CONFLICT ("path") DO NOTHING
    RETURNING "path"
)
INSERT INTO "SearchPageEvent" ("id", "path", "action", "fromStatus", "toStatus", "byUserId", "at")
SELECT 'spe' || replace(gen_random_uuid()::text, '-', ''), "path", 'seeded', NULL, 'LIVE', 'migration', CURRENT_TIMESTAMP
FROM seeded;

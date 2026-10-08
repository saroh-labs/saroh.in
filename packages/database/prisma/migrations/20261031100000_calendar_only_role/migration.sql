-- #868 (DEC-105 follow-up, owner decision 2026-10-08): someone taking
-- bookings with no login, later given one, joins as "Calendar only" by
-- default — their own diary, nothing else.
--
-- 1. An invitation may name the diary person it gives a login to. Accepting
--    links them to the new membership; while open, the invite is counted
--    once, as that diary person (`billing/metering.ts`).
-- 2. Every business that already has someone on the diary gets the
--    "Calendar only" role (key `calendar-only`), with the list a role made
--    from now on is created with (`CALENDAR_ONLY_ACTIONS` in
--    `packages/database/src/calendar-only-role.ts`). A business that made a
--    role with that key itself keeps it as it is.
--
-- Additive and idempotent. The API before this release reads neither the
-- column nor the role, and an unused role changes nobody's access.

ALTER TABLE "OrganizationInvitation" ADD COLUMN IF NOT EXISTS "staffId" TEXT;

CREATE INDEX IF NOT EXISTS "OrganizationInvitation_staffId_idx"
    ON "OrganizationInvitation"("staffId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'OrganizationInvitation_staffId_fkey'
    ) THEN
        ALTER TABLE "OrganizationInvitation"
            ADD CONSTRAINT "OrganizationInvitation_staffId_fkey"
            FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

INSERT INTO "OrganizationRole"
    ("id", "organizationId", "key", "label", "actions", "ringTone", "createdAt", "updatedAt")
SELECT 'cor' || replace(gen_random_uuid()::text, '-', ''),
       o."id",
       'calendar-only',
       'Calendar only',
       ARRAY['org:read', 'module:read', 'booking:read', 'booking:write', 'service:read']::TEXT[],
       'neutral',
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Organization" o
WHERE EXISTS (SELECT 1 FROM "StaffMember" s WHERE s."organizationId" = o."id")
ON CONFLICT ("organizationId", "key") DO NOTHING;

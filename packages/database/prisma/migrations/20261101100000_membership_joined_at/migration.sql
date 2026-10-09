-- #800 (owner decision 2026-10-09): moving to a lower plan pauses the team
-- members past the new plan's limit — the owner and the earliest to join
-- stay. Membership had no join time, so it gets one.
--
-- Backfill: the invitation the person accepted into this business, when
-- there is one; otherwise the later of when their account and the
-- business began (they can't have joined before either). New rows take
-- now().
--
-- Additive and idempotent. The API before this release never reads the
-- column.

ALTER TABLE "Membership"
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Membership" AS m
SET "createdAt" = COALESCE(
    (
        SELECT MIN(i."acceptedAt")
        FROM "OrganizationInvitation" AS i
        JOIN "User" AS u ON lower(u."email") = lower(i."email")
        WHERE i."organizationId" = m."organizationId"
          AND u."id" = m."userId"
          AND i."acceptedAt" IS NOT NULL
    ),
    GREATEST(
        (SELECT u."createdAt" FROM "User" AS u WHERE u."id" = m."userId"),
        (SELECT o."createdAt" FROM "Organization" AS o WHERE o."id" = m."organizationId")
    ),
    m."createdAt"
);

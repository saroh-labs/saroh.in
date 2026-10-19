-- DEC-170, #1038: alerts addressed to one person, and what a booking
-- rules notice opens.
--
-- 1. `Notification.staffId`: the person on the diary a booking rules
--    request (or its answer) is about, so the notice opens Hours and time
--    off on them. Informational, no FK, like the other target columns.
--    Nullable: older rows open the page without a person. A notice for
--    one person alone uses the existing `userId`.
--
-- 2. `notification:read-own`: every role that signs in reads the alerts
--    addressed to them alone. The built-in roles get it in code
--    (`organization-policy.ts`); a stored role (Calendar only, and the
--    roles a business made) gains it here, except a Reviewer's, which has
--    no bell. Data only, idempotent: a role that already holds it is left
--    as it is. A role made from now on is offered it like any other.

ALTER TABLE "Notification" ADD COLUMN "staffId" TEXT;

UPDATE "OrganizationRole"
SET "actions" = array_append("actions", 'notification:read-own'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" <> 'REVIEWER'
  AND NOT ('notification:read-own' = ANY("actions"));

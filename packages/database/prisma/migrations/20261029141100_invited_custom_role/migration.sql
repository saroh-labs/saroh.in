-- UX-004: give back the role people were invited at.
--
-- Data only. Until this release, accepting an invitation stored any role a
-- business made (say "Front desk") as MEMBER, so the person worked with a
-- Member's powers and the role's own never reached them.
--
-- A membership is put back only when all of this holds, so nothing anyone
-- chose since is overwritten:
--   - its invitation was ACCEPTED, at a role that is not a built-in;
--   - that role still exists in the same business;
--   - the invitation's address is the member's own;
--   - the membership still holds MEMBER, what the old accept wrote;
--   - nobody changed their role after they joined (no
--     `membership.role.update` for them in that business since acceptedAt).
--
-- Idempotent: a membership put back no longer holds MEMBER.

UPDATE "Membership" AS m
SET "role" = i."role"
FROM "OrganizationInvitation" AS i
JOIN "User" AS u ON lower(u."email") = lower(i."email")
JOIN "OrganizationRole" AS r
  ON r."organizationId" = i."organizationId" AND r."key" = i."role"
WHERE i."status" = 'ACCEPTED'
  AND i."role" NOT IN ('OWNER', 'ADMIN', 'MEMBER', 'REVIEWER')
  AND m."organizationId" = i."organizationId"
  AND m."userId" = u."id"
  AND m."role" = 'MEMBER'
  AND NOT EXISTS (
    SELECT 1
    FROM "AuditEvent" AS a
    WHERE a."organizationId" = m."organizationId"
      AND a."action" = 'membership.role.update'
      AND a."targetId" = m."userId"
      AND a."createdAt" >= COALESCE(i."acceptedAt", i."updatedAt")
  );

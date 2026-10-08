-- Opening-day invites (marketing plan U31; KTD-17). Additive.
--
-- An invite link carries a random token; only its SHA-256 is stored, unique
-- so a link names one entry. It is single use (the entry's "joinedAt"), bound
-- to the entry's email and expires ("inviteExpiresAt"). "inviteSentAt" says
-- the email left; "joinedOrganizationId" is the business made with it.

ALTER TABLE "WaitlistSignup" ADD COLUMN "inviteTokenHash" TEXT,
ADD COLUMN "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN "inviteSentAt" TIMESTAMP(3),
ADD COLUMN "joinedOrganizationId" TEXT;

CREATE UNIQUE INDEX "WaitlistSignup_inviteTokenHash_key" ON "WaitlistSignup"("inviteTokenHash");

-- A token always has an end, and only an invited entry has one.
ALTER TABLE "WaitlistSignup" ADD CONSTRAINT "WaitlistSignup_invite_token_check"
    CHECK ("inviteTokenHash" IS NULL OR ("inviteExpiresAt" IS NOT NULL AND "invitedAt" IS NOT NULL));

-- Joined with an invite means a business was made with it.
ALTER TABLE "WaitlistSignup" ADD CONSTRAINT "WaitlistSignup_joined_org_check"
    CHECK ("joinedOrganizationId" IS NULL OR "joinedAt" IS NOT NULL);

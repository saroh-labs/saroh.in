-- Who may review a site, and how anyone joins an organization at all (#276).
--
-- REVIEWER has existed in the policy since #193 and nothing could ever write
-- it: memberships were only ever created as OWNER, at onboarding. So the whole
-- Review feature had no second person in it. Two tables close that.

-- SiteReviewer: one person, one site.
--
-- The org role grants site:read/comment/approve; this says WHICH site. A
-- reviewer is brought in to look at one site, and "reviewer" must not come to
-- mean "reads every site this business has".
CREATE TABLE "SiteReviewer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteReviewer_pkey" PRIMARY KEY ("id")
);

-- One grant per person per site; re-inviting must not stack rows.
CREATE UNIQUE INDEX "SiteReviewer_siteId_userId_key" ON "SiteReviewer" ("siteId", "userId");
CREATE INDEX "SiteReviewer_organizationId_idx" ON "SiteReviewer" ("organizationId");
-- Every site-list read by a reviewer filters on this.
CREATE INDEX "SiteReviewer_userId_idx" ON "SiteReviewer" ("userId");

ALTER TABLE "SiteReviewer"
    ADD CONSTRAINT "SiteReviewer_organizationId_fkey" FOREIGN KEY ("organizationId")
        REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteReviewer"
    ADD CONSTRAINT "SiteReviewer_siteId_fkey" FOREIGN KEY ("siteId")
        REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteReviewer"
    ADD CONSTRAINT "SiteReviewer_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull, not cascade: the grant survives the granter leaving, the same way
-- an approval survives its author.
ALTER TABLE "SiteReviewer"
    ADD CONSTRAINT "SiteReviewer_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId")
        REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OrganizationInvitation: an offer to join at an org role.
--
-- Distinct from StoreInvitation, which invites to a Store with the store role
-- vocabulary. Organization is the tenant root (ADR-001) and org roles are what
-- authorization is decided from.
--
-- The token is stored HASHED. The plaintext exists only in the invitee's email,
-- so a leaked row cannot be used to join an organization — the same rule the
-- share links follow.
CREATE TABLE "OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    -- Sites a REVIEWER invite grants on accept. Empty for every other role, and
    -- held here rather than as rows because the invitee has no User row yet.
    "siteIds" TEXT[],
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- The accept path looks an invitation up by hash alone.
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation" ("tokenHash");
-- One live invite per email per org: re-inviting refreshes the row.
CREATE UNIQUE INDEX "OrganizationInvitation_organizationId_email_key" ON "OrganizationInvitation" ("organizationId", "email");
CREATE INDEX "OrganizationInvitation_organizationId_idx" ON "OrganizationInvitation" ("organizationId");

ALTER TABLE "OrganizationInvitation"
    ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId")
        REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull: an invitation outlives the person who sent it.
ALTER TABLE "OrganizationInvitation"
    ADD CONSTRAINT "OrganizationInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId")
        REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

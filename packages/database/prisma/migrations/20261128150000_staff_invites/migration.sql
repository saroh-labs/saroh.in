-- Staff invites (DEC-169, admin console redesign U24): add a teammate who
-- has no Saroh account yet. The email carries a one-time link valid for 7
-- days; only a sha256 of its token is stored here. Accepting needs the
-- person's own verified email to match, and makes the grant, the roles and
-- the profile in one transaction. Saroh's, not a business's, so it has no
-- organizationId and no row-level policy (rls-coverage.test.ts lists it in
-- NOT_TENANT_OWNED).
--
-- The roles are checked against the registry by the API, and again by
-- PlatformAdminRoleAssignment_role_check when they are granted, so no second
-- list of role names is kept here.

-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" TEXT[],
    "worksAs" TEXT NOT NULL,
    "onCommission" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "platformAdminId" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id"),
    -- An address, lower-cased, and a name to greet them by.
    CONSTRAINT "StaffInvite_email_check" CHECK (
        "email" <> '' AND "email" = lower("email")
    ),
    CONSTRAINT "StaffInvite_name_check" CHECK ("name" <> ''),
    -- At least one console role.
    CONSTRAINT "StaffInvite_roles_check" CHECK (cardinality("roles") > 0),
    -- The job, as on the profile (staff-profile.ts STAFF_JOBS).
    CONSTRAINT "StaffInvite_worksAs_check" CHECK (
        "worksAs" IN ('ACCOUNT_MANAGER_JOB', 'FINDS_BUSINESSES', 'OTHER')
    ),
    -- A sha256, hex: never the token.
    CONSTRAINT "StaffInvite_tokenHash_check" CHECK (
        "tokenHash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "StaffInvite_sendCount_check" CHECK ("sendCount" > 0),
    -- Accepted by someone, at a time, into a grant: all three or none.
    CONSTRAINT "StaffInvite_accepted_check" CHECK (
        ("acceptedAt" IS NULL AND "acceptedByUserId" IS NULL AND "platformAdminId" IS NULL)
        OR ("acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL AND "platformAdminId" IS NOT NULL)
    ),
    -- Withdrawn by someone, at a time: both or neither.
    CONSTRAINT "StaffInvite_withdrawn_check" CHECK (
        ("withdrawnAt" IS NULL) = ("withdrawnByUserId" IS NULL)
    ),
    -- An invite ends one way: accepted or withdrawn, never both.
    CONSTRAINT "StaffInvite_one_ending_check" CHECK (
        "acceptedAt" IS NULL OR "withdrawnAt" IS NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvite_email_idx" ON "StaffInvite"("email");

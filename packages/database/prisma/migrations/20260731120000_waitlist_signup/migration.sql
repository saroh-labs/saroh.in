-- Pre-launch waitlist captured from the public marketing site.
--
-- Deliberately tenant-less: a signup happens before any Organization or User
-- exists, so there is no organizationId and nothing to scope by.
--
-- The unique index on "email" is what makes a repeat submission an idempotent
-- no-op instead of a duplicate row; the service normalizes (trim + lowercase)
-- before it gets here, so "A@B.com " and "a@b.com" collide as they should.

CREATE TABLE "WaitlistSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "ipHash" TEXT,
    "invitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaitlistSignup_email_key" ON "WaitlistSignup"("email");

CREATE INDEX "WaitlistSignup_createdAt_idx" ON "WaitlistSignup"("createdAt");

CREATE INDEX "WaitlistSignup_invitedAt_idx" ON "WaitlistSignup"("invitedAt");

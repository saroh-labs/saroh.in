-- Sign-in help from the operator console (admin console redesign U9).
--
-- "Mark verified" records that staff did it, apart from the person's own
-- proof: `User.emailVerifiedByStaffAt`. Staff-marked verification never
-- counts as the person's own for attribution or a staff invite.
--
-- "Change sign-in email" keeps a record of each change and holds the new
-- address's sign-in code for 24 hours unless a second, different staff
-- member confirms. Saroh's, not a business's, so it has no organizationId
-- and no row-level policy (rls-coverage.test.ts lists it in
-- NOT_TENANT_OWNED).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedByStaffAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SignInEmailChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldEmail" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "codeHeldUntil" TIMESTAMP(3) NOT NULL,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "codeSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInEmailChange_pkey" PRIMARY KEY ("id"),
    -- The second pair of eyes is never the first.
    CONSTRAINT "SignInEmailChange_second_confirmer_check" CHECK (
        "confirmedByUserId" IS NULL
        OR "confirmedByUserId" <> "requestedByUserId"
    ),
    -- Confirmed by someone, at a time: both or neither.
    CONSTRAINT "SignInEmailChange_confirmed_check" CHECK (
        ("confirmedByUserId" IS NULL) = ("confirmedAt" IS NULL)
    ),
    CONSTRAINT "SignInEmailChange_new_address_check" CHECK (
        "newEmail" <> '' AND "newEmail" <> "oldEmail"
    )
);

-- CreateIndex
CREATE INDEX "SignInEmailChange_userId_createdAt_idx" ON "SignInEmailChange"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SignInEmailChange_newEmail_idx" ON "SignInEmailChange"("newEmail");

-- AddForeignKey
ALTER TABLE "SignInEmailChange" ADD CONSTRAINT "SignInEmailChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

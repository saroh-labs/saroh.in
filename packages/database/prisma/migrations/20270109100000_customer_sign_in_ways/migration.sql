-- A merchant site's sign-in ways and phone-only customer accounts (DEC-196).
-- The business picks the ways its customers sign in and their order; empty
-- means not chosen (email, then WhatsApp where it works). A customer account
-- needs a verified email or a verified phone, at least one. Every existing
-- account has an email, so the check holds on every row today.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN "customerSignInWays" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CustomerAccount" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "emailVerifiedAt" DROP NOT NULL;

-- A verified email or a verified phone, at least one.
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_email_or_phone" CHECK (
    ("email" IS NOT NULL AND "emailVerifiedAt" IS NOT NULL)
    OR ("phoneE164" IS NOT NULL AND "phoneVerifiedAt" IS NOT NULL)
);

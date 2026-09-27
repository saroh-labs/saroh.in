-- A contact for every paying customer (DEC-041, C2): a store customer's link
-- to a contact records why it exists. The backfill, a payment and a site
-- sign-in make links no team member made, so `linkedByUserId` becomes
-- nullable and a `reason` is added. Every existing row reads MANUAL with its
-- user, with no data backfill. Safe to deploy before the code that writes
-- it: a column with a default, and a NOT NULL relaxed.

-- CreateEnum
CREATE TYPE "CustomerLinkReason" AS ENUM ('MANUAL', 'BACKFILL', 'PAYMENT', 'SITE_ACCOUNT');

-- AlterTable
ALTER TABLE "CustomerIdentityLink" ALTER COLUMN "linkedByUserId" DROP NOT NULL,
ADD COLUMN     "reason" "CustomerLinkReason" NOT NULL DEFAULT 'MANUAL';

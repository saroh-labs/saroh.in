-- Billing profiles (DEC-167): who Saroh bills, owned by a person and used
-- by any of their businesses, one customer at the billing provider each.
-- Replaces DEC-165's one customer per business, which the provider refuses
-- for an owner's second business (same email and phone).

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "gstin" TEXT,
    "gstState" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "billingEmail" TEXT NOT NULL,
    "phone" TEXT,
    "provider" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "contactWithheld" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id"),
    -- One email per owner is compared lower-case, so it is kept lower-case.
    CONSTRAINT "BillingProfile_email_lower" CHECK ("billingEmail" = lower("billingEmail")),
    CONSTRAINT "BillingProfile_email_present" CHECK (length(btrim("billingEmail")) > 0)
);

-- CreateIndex
CREATE INDEX "BillingProfile_ownerUserId_idx" ON "BillingProfile"("ownerUserId");
CREATE UNIQUE INDEX "BillingProfile_ownerUserId_billingEmail_key" ON "BillingProfile"("ownerUserId", "billingEmail");
CREATE UNIQUE INDEX "BillingProfile_provider_providerCustomerId_key" ON "BillingProfile"("provider", "providerCustomerId");

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "billingProfileId" TEXT;
CREATE INDEX "Organization_billingProfileId_idx" ON "Organization"("billingProfileId");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "BillingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingCheckout" ADD COLUMN "billingProfileId" TEXT;
ALTER TABLE "SarohInvoice" ADD COLUMN "billingProfileId" TEXT;

-- Data: an owner's businesses get one profile, keyed (as a profile must be)
-- by the first owner's sign-in email, which Saroh's invoices billed until
-- now. Its details are the owner's oldest business's. Another business of
-- the same owner joins it only when its own legal name and GSTIN are the
-- same: one with a different GST identity is left without a profile, and
-- its owner chooses or makes one before its next payment, so no invoice is
-- addressed to another business's GSTIN. The profile keeps the provider
-- customer of its oldest joined business that has one; any other stays on
-- its BillingCustomer row for an operator (the table is no longer read, and
-- goes in a later release).
CREATE TEMP TABLE billing_profile_move AS
SELECT DISTINCT ON (m."organizationId")
       m."organizationId" AS org_id,
       m."userId" AS owner_id,
       lower(btrim(u."email")) AS email,
       o."createdAt" AS org_created,
       COALESCE(NULLIF(btrim(bp."legalName"), ''), o."name") AS legal_name,
       NULLIF(btrim(bp."taxId"), '') AS gstin
  FROM "Membership" m
  JOIN "User" u ON u."id" = m."userId"
  JOIN "Organization" o ON o."id" = m."organizationId"
  LEFT JOIN "BusinessProfile" bp ON bp."organizationId" = o."id"
 WHERE m."role" = 'OWNER' AND length(btrim(u."email")) > 0
 ORDER BY m."organizationId", m."createdAt", m."id";

CREATE TEMP TABLE billing_profile_source AS
SELECT DISTINCT ON (owner_id, email) owner_id, email, org_id, legal_name, gstin
  FROM billing_profile_move
 ORDER BY owner_id, email, org_created, org_id;

-- The businesses that join their owner's profile.
CREATE TEMP TABLE billing_profile_join AS
SELECT mv.org_id, mv.owner_id, mv.email, mv.org_created
  FROM billing_profile_move mv
  JOIN billing_profile_source src ON src.owner_id = mv.owner_id AND src.email = mv.email
 WHERE mv.legal_name = src.legal_name
   AND mv.gstin IS NOT DISTINCT FROM src.gstin;

INSERT INTO "BillingProfile" (
    "id", "ownerUserId", "legalName", "gstin", "gstState", "addressLine1", "addressLine2",
    "city", "postalCode", "billingEmail", "phone", "provider", "providerCustomerId",
    "contactWithheld", "syncedAt", "createdAt", "updatedAt"
)
SELECT 'bprof_' || replace(gen_random_uuid()::text, '-', ''),
       src.owner_id,
       src.legal_name,
       src.gstin,
       bp."gstState",
       bp."addressLine1", bp."addressLine2", bp."city", bp."postalCode",
       src.email,
       bp."phone",
       'RAZORPAY',
       c."providerCustomerId",
       COALESCE(c."contactWithheld", false),
       c."syncedAt",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM billing_profile_source src
  LEFT JOIN "BusinessProfile" bp ON bp."organizationId" = src.org_id
  LEFT JOIN LATERAL (
      SELECT bc."providerCustomerId", bc."contactWithheld", bc."syncedAt"
        FROM billing_profile_join j
        JOIN "BillingCustomer" bc ON bc."organizationId" = j.org_id
       WHERE j.owner_id = src.owner_id AND j.email = src.email
         AND bc."providerCustomerId" IS NOT NULL
       ORDER BY j.org_created, j.org_id
       LIMIT 1
  ) c ON true;

UPDATE "Organization" o
   SET "billingProfileId" = p."id"
  FROM billing_profile_join j
  JOIN "BillingProfile" p ON p."ownerUserId" = j.owner_id AND p."billingEmail" = j.email
 WHERE o."id" = j.org_id;

DROP TABLE billing_profile_join;
DROP TABLE billing_profile_source;
DROP TABLE billing_profile_move;

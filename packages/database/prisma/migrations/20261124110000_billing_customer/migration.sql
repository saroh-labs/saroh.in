-- The business as Saroh's billing provider's customer, one per business
-- and provider, made at sign-up (owner, 17 Oct 2026). Nullable id: the
-- row can exist before the provider has made the customer.
-- CreateTable
CREATE TABLE "BillingCustomer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "contactWithheld" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_organizationId_provider_key" ON "BillingCustomer"("organizationId", "provider");

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security (org_isolation, FORCE): one business's.
ALTER TABLE "BillingCustomer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingCustomer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BillingCustomer"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

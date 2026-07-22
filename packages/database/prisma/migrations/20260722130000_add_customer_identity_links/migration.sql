-- #120 — explicit CRM Contact ↔ commerce Customer identity links.
-- Structural only; links are created by the customer-workspace service after a
-- user confirms a suggestion (never an automatic merge).

-- CreateTable
CREATE TABLE "CustomerIdentityLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentityLink_contactId_customerId_key" ON "CustomerIdentityLink"("contactId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerIdentityLink_organizationId_idx" ON "CustomerIdentityLink"("organizationId");

-- AddForeignKey
ALTER TABLE "CustomerIdentityLink" ADD CONSTRAINT "CustomerIdentityLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentityLink" ADD CONSTRAINT "CustomerIdentityLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentityLink" ADD CONSTRAINT "CustomerIdentityLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

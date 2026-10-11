-- A business's social links, whether its website shows the registered
-- address, and each address's place on Google Maps (DEC-125). Additive:
-- three columns on "BusinessProfile" and one on "StoreSettings", which keep
-- their org_isolation policies (they read the row's own or its store's
-- "organizationId", not its columns). Every business before it has no
-- links, its site does not show its registered address until the owner
-- chooses that, and "Get directions" searches for the address.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "registeredAddressMapUrl" TEXT,
ADD COLUMN     "siteShowsRegisteredAddress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "socialLinks" JSONB;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "mapUrl" TEXT;

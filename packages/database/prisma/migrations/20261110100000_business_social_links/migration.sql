-- A business's social links and whether its website shows the registered
-- address (DEC-125). Additive: two columns on "BusinessProfile", which keeps
-- its org_isolation policy (it reads the row's "organizationId", not its
-- columns). Every business before it has no links, and its site does not
-- show its registered address until the owner chooses that.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "siteShowsRegisteredAddress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "socialLinks" JSONB;

-- OrganizationRole: a role, and the permissions it grants.
--
-- A business invents the roles it needs and the owner ticks what each may do.
-- The four built-ins are seeded per organization as `system` rows so every
-- role renders the same way on Team, and so a business that has invented
-- nothing behaves exactly as it did before this table existed.
CREATE TABLE "OrganizationRole" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key"            TEXT NOT NULL,
    "label"          TEXT NOT NULL,
    -- OrgAction values. Empty is legal: a half-built role is not an invalid one.
    "actions"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ringTone"       TEXT NOT NULL DEFAULT 'slate',
    "system"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationRole_pkey" PRIMARY KEY ("id")
);

-- `Membership.role` and `OrganizationInvitation.role` hold the KEY, so it has
-- to be unique within the business. It is deliberately not a foreign key:
-- a membership must survive its role being renamed or removed, and a dangling
-- key resolves to the read-only floor rather than to an error nobody can sign
-- in past.
CREATE UNIQUE INDEX "OrganizationRole_organizationId_key_key"
    ON "OrganizationRole"("organizationId", "key");
CREATE INDEX "OrganizationRole_organizationId_idx"
    ON "OrganizationRole"("organizationId");

ALTER TABLE "OrganizationRole" ADD CONSTRAINT "OrganizationRole_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolated on its own organizationId, like every other tenant-owned table.
ALTER TABLE "OrganizationRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "OrganizationRole"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

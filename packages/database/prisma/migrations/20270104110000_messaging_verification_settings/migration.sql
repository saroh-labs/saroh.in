-- Whether a business has Saroh send its customers a code, per module (#1242).
-- CreateTable
CREATE TABLE "MessagingVerificationSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module" "VerificationModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingVerificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingVerificationSetting_organizationId_module_key" ON "MessagingVerificationSetting"("organizationId", "module");

-- AddForeignKey
ALTER TABLE "MessagingVerificationSetting" ADD CONSTRAINT "MessagingVerificationSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "MessagingVerificationSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagingVerificationSetting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "MessagingVerificationSetting";
CREATE POLICY "org_isolation" ON "MessagingVerificationSetting"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactNoteAllergen" (
    "noteId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "ContactNoteAllergen_pkey" PRIMARY KEY ("noteId","allergenId")
);

-- CreateIndex
CREATE INDEX "ContactNote_contactId_createdAt_idx" ON "ContactNote"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactNote_organizationId_idx" ON "ContactNote"("organizationId");

-- CreateIndex
CREATE INDEX "ContactNoteAllergen_allergenId_idx" ON "ContactNoteAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "ContactNoteAllergen_organizationId_idx" ON "ContactNoteAllergen"("organizationId");

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNoteAllergen" ADD CONSTRAINT "ContactNoteAllergen_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ContactNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNoteAllergen" ADD CONSTRAINT "ContactNoteAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "StoreAllergen"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNoteAllergen" ADD CONSTRAINT "ContactNoteAllergen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (org_isolation, FORCE), the shape every org-owned table has.
ALTER TABLE "ContactNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ContactNote"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "ContactNoteAllergen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactNoteAllergen" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ContactNoteAllergen"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));


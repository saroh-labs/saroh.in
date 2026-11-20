-- DEC-227: a person's exception to one Free business, and the index the
-- unconfirmed-upload sweep reads.
ALTER TABLE "User" ADD COLUMN "extraFreeBusinesses" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Media_status_createdAt_idx" ON "Media"("status", "createdAt");

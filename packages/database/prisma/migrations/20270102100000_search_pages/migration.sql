-- Search pages published from the admin console (DEC-193): one publish
-- record per page path on saroh.in (`/for/<slug>`) and its history. Saroh's
-- own site, no organization, so no row-level security policy (both tables
-- are named in `packages/database/src/rls-coverage.test.ts`). Additive only.

-- CreateEnum
CREATE TYPE "SearchPageStatus" AS ENUM ('LIVE', 'UNPUBLISHED', 'ARCHIVED', 'DRAFT');

-- CreateTable
CREATE TABLE "SearchPage" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "SearchPageStatus" NOT NULL,
    "liveSince" TIMESTAMP(3),
    "takenOffAt" TIMESTAMP(3),
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" TEXT,

    CONSTRAINT "SearchPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchPageEvent" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "SearchPageStatus",
    "toStatus" "SearchPageStatus" NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchPageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchPage_path_key" ON "SearchPage"("path");

-- CreateIndex
CREATE INDEX "SearchPageEvent_path_at_idx" ON "SearchPageEvent"("path", "at");


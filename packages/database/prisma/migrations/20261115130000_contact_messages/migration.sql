-- Messages people send from saroh.in/contact (DEC-137): what it is about, who
-- wrote it and what they wrote. Read by staff in the admin console, deleted
-- 12 months after they arrive. No organization: the writer need not have an
-- account, so the table carries no row-level security policy (it is named in
-- `packages/database/src/rls-coverage.test.ts`, as the waitlist is).

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT,
    "message" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

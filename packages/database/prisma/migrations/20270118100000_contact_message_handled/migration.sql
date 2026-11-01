-- Messages from saroh.in/contact get a handled state (admin audit, 1 Nov):
-- when staff marked one handled after replying from the team's mailbox, and
-- who. Null while open. Additive only; no organization, so no RLS change.
-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN "handledAt" TIMESTAMP(3),
ADD COLUMN "handledByUserId" TEXT;

-- A review invitation's message (MARKETING_CLAIMS D11, 2026-10-07): review
-- invitations go through the business's own email provider, and only a send
-- the provider accepted shows as sent and counts towards the three sends.
-- The Message records which invitation it carried. Additive only: one
-- nullable column, its foreign key and an index; the previous API ignores it.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "reviewInvitationId" TEXT;

-- CreateIndex
CREATE INDEX "Message_reviewInvitationId_createdAt_idx" ON "Message"("reviewInvitationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_reviewInvitationId_fkey" FOREIGN KEY ("reviewInvitationId") REFERENCES "ReviewInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

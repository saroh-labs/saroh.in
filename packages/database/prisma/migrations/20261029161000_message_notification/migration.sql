-- UX-014: a customer's message from their site account reaches the team.
--
-- The `customer-message.notify` job writes one inbox notice for the first
-- message a customer sends after the team last answered or opened their
-- thread. The notice opens on the contact (`contactId`), and is unique on
-- the message that raised it, so a job run twice notifies once.
-- Additive: two nullable columns and a unique index; no rows change.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "messageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_messageId_type_key" ON "Notification"("messageId", "type");

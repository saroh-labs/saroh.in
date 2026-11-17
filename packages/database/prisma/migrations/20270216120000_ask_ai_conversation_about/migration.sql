-- Ask AI knows the page (AF 9): a conversation keeps where it started,
-- sealed like its title, so the panel's list can say so.

-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN     "aboutAuthTag" TEXT,
ADD COLUMN     "aboutCiphertext" TEXT,
ADD COLUMN     "aboutIv" TEXT;

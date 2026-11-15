-- An AI app's publish requests (DEC-215 as amended 12 Nov 2026): the person
-- confirms in Saroh, so a request says which app and whose connection made
-- it, and how and by whom it was settled. RLS is the table's own, unchanged.
ALTER TABLE "McpPublishCode" ADD COLUMN "clientName" TEXT NOT NULL DEFAULT 'AI app';
ALTER TABLE "McpPublishCode" ADD COLUMN "requestedByUserId" TEXT;
ALTER TABLE "McpPublishCode" ADD COLUMN "outcome" TEXT;
ALTER TABLE "McpPublishCode" ADD COLUMN "decidedByUserId" TEXT;

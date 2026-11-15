-- Ask AI's drafts (DEC-220, plan 2026-11-13-001 U5): a change Ask AI
-- drafted, kept server-side until the person confirms it, so Confirm and
-- Undo name only an id. Deleted with its conversation.
--
-- A new table only, additive, no backfill. The image still serving during
-- the deploy reads none of it. Its input, values and card are sealed by
-- the API (AI_TEXT_ENC_KEY); no column holds customer text in the clear.

-- CreateEnum
CREATE TYPE "AskAiDraftStatus" AS ENUM ('DRAFTED', 'CONFIRMED', 'UNDONE', 'EXPIRED', 'REFUSED');

-- CreateTable
CREATE TABLE "AskAiDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "status" "AskAiDraftStatus" NOT NULL DEFAULT 'DRAFTED',
    "refusal" TEXT,
    "targetId" TEXT,
    "targetUpdatedAt" TIMESTAMP(3),
    "bodyCiphertext" TEXT NOT NULL,
    "bodyIv" TEXT NOT NULL,
    "bodyAuthTag" TEXT NOT NULL,
    "redraftOfId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskAiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AskAiDraft_organizationId_userId_createdAt_idx" ON "AskAiDraft"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AskAiDraft_conversationId_idx" ON "AskAiDraft"("conversationId");

-- AddForeignKey
ALTER TABLE "AskAiDraft" ADD CONSTRAINT "AskAiDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAiDraft" ADD CONSTRAINT "AskAiDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A refusal says why; a confirmed or undone draft says when.
ALTER TABLE "AskAiDraft" ADD CONSTRAINT "AskAiDraft_refusal_check"
  CHECK (("status" = 'REFUSED') = ("refusal" IS NOT NULL)
         AND ("status" NOT IN ('CONFIRMED', 'UNDONE') OR "confirmedAt" IS NOT NULL)
         AND ("status" <> 'UNDONE' OR "undoneAt" IS NOT NULL));

-- Row-level security (#53): a business's own drafts only.
ALTER TABLE "AskAiDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AskAiDraft" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AskAiDraft"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

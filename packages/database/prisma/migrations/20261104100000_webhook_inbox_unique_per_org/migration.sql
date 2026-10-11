-- PAY-05 (#106, docs/architecture/PAYMENTS_WEBHOOKS_SECURITY_REVIEW.md): the
-- merchant webhook inbox was unique on (provider, providerEventId) across
-- every business. A business signs the bodies sent to its own endpoint, so
-- one that guessed the id of another business's next delivery could claim it
-- first, and the real payment was answered "duplicate" and never reconciled.
-- The key is now per business: (organizationId, provider, providerEventId).
--
-- Safe on existing data: the old key is the new one without organizationId,
-- so no two rows that satisfy it can collide under the new one. The check
-- below proves that before anything changes, and stops the migration rather
-- than drop a row if it ever fails. The new index is built before the old
-- one goes, so a duplicate delivery is refused at every moment.
--
-- organizationId stays nullable: the inbox writer always sets it (the org in
-- the webhook URL), and Postgres treats NULLs as distinct, so a row from
-- before that rule — if any exists — can never collide. Its index on
-- organizationId alone is kept, unchanged.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "WebhookEvent"
        GROUP BY "organizationId", "provider", "providerEventId"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'WebhookEvent has duplicate (organizationId, provider, providerEventId) rows; resolve them before this migration';
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_organizationId_provider_providerEventId_key" ON "WebhookEvent"("organizationId", "provider", "providerEventId");

-- DropIndex
DROP INDEX "WebhookEvent_provider_providerEventId_key";

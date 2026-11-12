-- Outbound webhooks (plan 2026-11-10-001, U13): the secret a roll replaced
-- keeps signing for 24 hours, and the delivery log keeps the receiver's answer.
ALTER TABLE "WebhookEndpoint" ADD COLUMN "previousSecretCiphertext" TEXT,
ADD COLUMN "previousSecretIv" TEXT,
ADD COLUMN "previousSecretAuthTag" TEXT,
ADD COLUMN "previousSecretUntil" TIMESTAMP(3);

ALTER TABLE "WebhookDelivery" ADD COLUMN "responseSnippet" TEXT,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

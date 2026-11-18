-- Instagram connects through Facebook Login for Business (plan saroh-social
-- 2026-11-18-001, 18 Nov): the channel keeps the linked Facebook Page's id.
ALTER TABLE "SocialChannel" ADD COLUMN "pageId" TEXT;

-- The kind of place a business is (DEC-216), and the gallery template its
-- owner picked before signing up.
--
-- Expand only: two nullable columns, no rewrite. No backfill: DEC-189's
-- setup trade (SALON, GYM) was never stored, and its sample services stop
-- being samples once kept or edited, so they can't say it reliably. A
-- business without one reads as not said, which is today's behaviour.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "startTemplate" TEXT,
ADD COLUMN     "trade" TEXT;

-- The template kinds (`TEMPLATE_KINDS` in @saroh/templates). Prisma cannot
-- declare a CHECK, so it lives here only.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_trade_check"
    CHECK ("trade" IS NULL OR "trade" IN ('salon', 'gym', 'clinic', 'coach', 'food', 'shop', 'creator', 'other'));

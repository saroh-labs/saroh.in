-- A Global business's address region (DEC-204): its state, province or
-- region by its country's rules. Additive and nullable: no default, no
-- backfill; India's state stays in "gstState".
ALTER TABLE "BusinessProfile" ADD COLUMN "region" TEXT;

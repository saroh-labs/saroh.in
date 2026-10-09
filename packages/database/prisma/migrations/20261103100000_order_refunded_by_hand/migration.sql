-- #865 (owner decision 2026-10-09, DEC-116): a refund recorded by hand may
-- be any amount up to what is left unrefunded on the order. The order keeps
-- what was handed back outside Saroh, so the next refund knows what is left
-- and the money panel, Spent and takings read it net.
--
-- No backfill: an order recorded refunded before this reads REFUNDED, and
-- nothing is left on it either way. Additive and idempotent; the API before
-- this release never reads the column.

ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "refundedByHand" DECIMAL(12,2) NOT NULL DEFAULT 0;

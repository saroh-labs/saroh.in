-- "Updates in your customers' Messages" (12 Oct 2026): a business's own
-- choice to have Saroh post order, booking and invoice updates into a
-- customer's account thread on its site. Additive with a default of true
-- (on, the owner's default), so every business, with or without a profile
-- row, reads as on, and the previous API image, which never reads it, is
-- unaffected. The table's row-level security is unchanged.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "accountUpdates" BOOLEAN NOT NULL DEFAULT true;

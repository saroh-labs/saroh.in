-- Offline payment at the site's checkout (2026-10-06, the owner's rule:
-- online needs a paid plan, Free takes money offline). A customer may choose
-- "Pay when you collect" or "Pay on delivery"; the order is made unpaid,
-- promises its units at once and is marked paid by staff, as a staff
-- pay-later order is.
--
-- Additive (expand only): two NOT NULL columns with a default, which the
-- previous API image never reads or writes. No backfill: every existing
-- storefront keeps online-only checkout on a plan that takes money online,
-- and every existing order was not placed to be paid on handover.
--
-- Rollback: the previous image ignores both columns.

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "offerPayOnHandover" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "payOnHandover" BOOLEAN NOT NULL DEFAULT false;

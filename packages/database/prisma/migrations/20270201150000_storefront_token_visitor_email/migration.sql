-- A storefront token carries the visitor's email its orders and bookings
-- must use; a guest's API order names the token it came with (plan
-- 2026-11-10-001, U7 review).
ALTER TABLE "StorefrontToken" ADD COLUMN "visitorEmail" TEXT;
ALTER TABLE "Order" ADD COLUMN "storefrontTokenId" TEXT;

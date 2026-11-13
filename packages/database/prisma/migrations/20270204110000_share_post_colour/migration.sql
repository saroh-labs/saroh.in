-- #1378 (owner, 12 Nov 2026): own posts may be drawn in the Colour card,
-- the Offer card's ground with the headline in place of a discount.
-- Data only: no row changes; the check takes one more style.

ALTER TABLE "SharePost" DROP CONSTRAINT "SharePost_style_check";
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_style_check"
  CHECK ("style" IN ('photo', 'price', 'offer', 'simple', 'colour'));

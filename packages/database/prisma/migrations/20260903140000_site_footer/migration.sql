-- The site footer (#202).
--
-- `{ format, value }`, the shape a richText section already carries, so the
-- same sanitizer and later the same editor serve both. Null means the merchant
-- has not written one, and renders no footer element at all rather than an
-- empty coloured band.
ALTER TABLE "Site" ADD COLUMN "footer" JSONB;

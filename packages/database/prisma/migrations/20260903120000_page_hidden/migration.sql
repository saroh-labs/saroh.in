-- Page visibility (#197).
--
-- The sibling of Section.hidden, and deliberately the same shape. A hidden
-- page keeps its path, title, versions and sections in the draft; publish
-- simply omits it from the immutable snapshot. Existing rows default to
-- visible, which is what they already were.
--
-- Absent-means-visible the whole way through: an older client that never sends
-- the field cannot take a page off a live site by omission.
ALTER TABLE "Page" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

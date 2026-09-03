-- Section visibility (#189 follow-up).
--
-- Hiding is not deletion: the section keeps its order and its copy in the
-- draft, and publish simply omits it from the immutable snapshot. Existing
-- rows default to visible, which is what they already were.
ALTER TABLE "Section" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

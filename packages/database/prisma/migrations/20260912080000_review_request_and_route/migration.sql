-- Review becomes a soft publish in fact, not only in name (#278, #193).
--
-- Three facts the model could not hold: that a review was ASKED FOR and not yet
-- answered; WHICH DRAFT an approval was about; and which route a publication
-- actually took. Without the first there was no pending state at all. Without
-- the second, approve → edit three sections → publish still read "Approved".
-- Without the third, "a reviewer approved this" and "nobody was ever asked"
-- were indistinguishable in version history.

-- The draft a REQUESTED or APPROVED row is about: a hash of the snapshot
-- publishing would write, minus its timestamp. Null on CHANGES_REQUESTED and
-- BYPASSED, which record an act rather than a state of the work, and null on
-- every row written before this column existed.
ALTER TABLE "SiteApproval" ADD COLUMN "draftFingerprint" TEXT;

-- APPROVED | BYPASSED | NONE, written inside the publish transaction. Null on
-- publications from before this column, which is the honest answer: nothing
-- recorded which route they took.
ALTER TABLE "Publication" ADD COLUMN "reviewRoute" TEXT;

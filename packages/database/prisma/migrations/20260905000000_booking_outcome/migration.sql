-- How an appointment actually went (#241).
--
-- Separate from `status` on purpose. `status` says whether the booking stands;
-- this says how it went. Collapsing them would make "cancelled in advance" and
-- "did not turn up" the same fact about a customer, when they are two of the
-- most different things a merchant can be told.
--
-- Nullable with no default and no backfill: every booking already on the books
-- happened before anyone could record an outcome, and inventing one for them
-- would be fabricating attendance history. Null means "nobody has said", which
-- is the truth for all of them.
ALTER TABLE "Booking" ADD COLUMN "outcome" TEXT;

-- Finding the ones that still need an answer is the whole workflow, so it gets
-- an index: past, not cancelled, no outcome yet.
CREATE INDEX "Booking_organizationId_outcome_endAt_idx"
    ON "Booking" ("organizationId", "outcome", "endAt");

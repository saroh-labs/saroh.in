-- One live subscription per person per plan (ADR-007 review, #432). A second
-- is a double-click, and it would bill them twice every period. Fails if a
-- business already has two live ones for the same person and plan; cancel
-- the newer one by hand, then run this again.
CREATE UNIQUE INDEX "CustomerSubscription_one_live_per_person" ON "CustomerSubscription"("planId", "contactId") WHERE (status <> 'CANCELLED');

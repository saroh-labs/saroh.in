-- The custom-domain re-check chain (#860): `domains.recheck` re-checks
-- custom domains every five minutes (ownership until verified, hosting
-- after). Additive: one waiting run of the chain at a time, like the
-- renewal chain (ADR-007). The image still serving during the deploy
-- never queues it.

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Job_one_pending_domains_recheck" ON "Job"("type") WHERE (type = 'domains.recheck' AND status = 'PENDING');

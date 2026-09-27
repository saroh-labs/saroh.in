-- A store customer's links, found by the customer (review C-2): the
-- Customers list's unlinked payers, the payment path's "already linked?"
-- and the backfill each ask "is this store customer linked?", and the only
-- index on the table that names "customerId" leads with "contactId".
-- Additive: the previous API image reads the table the same way.

-- CreateIndex
CREATE INDEX "CustomerIdentityLink_customerId_idx" ON "CustomerIdentityLink"("customerId");

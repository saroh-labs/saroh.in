-- Owner decision, 13 Nov 2026 (DEC-048 amended, DEC-074): a location's
-- team takes and changes that location's orders.
--
-- Data only. Since the business role always wins over a storefront role
-- (DEC-048 as amended 12 Nov 2026), counter staff who took orders as a
-- storefront Editor lost it. Every business's "Storefront team" role (key
-- `storefront-team`, F16) gains `order:create` and `order:edit`, which a
-- role made from now on is created with (`STOREFRONT_TEAM_ACTIONS`). Both
-- imply `order:read`; the API narrows all of it, payments taken at the
-- counter included, to the storefronts each person works on
-- (`orders/order-location.ts`). No refunds, cancels, export, customers or
-- payment settings.
--
-- Run with the API image that narrows them: before it, a Storefront team
-- holder could take orders at every storefront. Idempotent: a role that
-- already holds an action keeps one copy.

UPDATE "OrganizationRole"
SET "actions" = array_append("actions", 'order:create'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'storefront-team'
  AND NOT ('order:create' = ANY("actions"));

UPDATE "OrganizationRole"
SET "actions" = array_append("actions", 'order:edit'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'storefront-team'
  AND NOT ('order:edit' = ANY("actions"));

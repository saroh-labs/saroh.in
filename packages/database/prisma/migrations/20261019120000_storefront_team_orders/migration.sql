-- DEC-074: a location's team sees and moves that location's orders.
--
-- Data only. Every business's "Storefront team" role (key
-- `storefront-team`, F16) made before this release gains `order:stage`,
-- which a role made from now on is created with
-- (`STOREFRONT_TEAM_ACTIONS`). The API narrows it to the orders of the
-- storefronts each person works on (`orders/order-location.ts`).
--
-- Between this migration and the new API image, the API before it would
-- show a Storefront team holder every storefront's orders in the kitchen's
-- view (no money): roll the image straight after. Idempotent: a role that
-- already holds it is left as it is.

UPDATE "OrganizationRole"
SET "actions" = array_append("actions", 'order:stage'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'storefront-team'
  AND NOT ('order:stage' = ANY("actions"));

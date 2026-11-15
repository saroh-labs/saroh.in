-- Scale one seeded business up for a load run (docs/architecture/runbooks/API_LOAD_TEST.md).
-- Copies its customers and orders (with their items) :copies times and its
-- bookings ten times that,
-- every copy a new id, so list and search routes read a realistic table.
-- A seeded copy on this machine only:  psql "$LOAD_DATABASE_URL" -v org=seed_org -v copies=20 -f e2e/load/scale.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE n AS SELECT generate_series(1, :copies) AS i;

CREATE TEMP TABLE c AS SELECT * FROM "Customer" WHERE "organizationId" = :'org';
CREATE TEMP TABLE cmap AS SELECT c.id AS old, c.id || '_l' || n.i AS new, n.i FROM c, n;
INSERT INTO "Customer"
SELECT (jsonb_populate_record(c, jsonb_build_object(
    'id', m.new,
    'email', CASE WHEN c.email IS NULL THEN NULL ELSE 'l' || m.i || '.' || c.email END
))).*
FROM c JOIN cmap m ON m.old = c.id;

CREATE TEMP TABLE o AS SELECT * FROM "Order" WHERE "organizationId" = :'org';
CREATE TEMP TABLE omap AS SELECT o.id AS old, o.id || '_l' || n.i AS new, n.i FROM o, n;
INSERT INTO "Order"
SELECT (jsonb_populate_record(o, jsonb_build_object(
    'id', m.new,
    'orderId', o."orderId" || '-L' || m.i,
    'payTokenHash', NULL,
    'checkoutKey', NULL,
    'customerId', CASE WHEN o."customerId" IS NULL THEN NULL ELSE o."customerId" || '_l' || m.i END
))).*
FROM o JOIN omap m ON m.old = o.id;

INSERT INTO "OrderItem"
SELECT (jsonb_populate_record(oi, jsonb_build_object('id', oi.id || '_l' || m.i, 'orderId', m.new))).*
FROM "OrderItem" oi JOIN omap m ON m.old = oi."orderId";

CREATE TEMP TABLE b AS SELECT * FROM "Booking" WHERE "organizationId" = :'org' AND "orderId" IS NULL;
INSERT INTO "Booking"
SELECT (jsonb_populate_record(b, jsonb_build_object(
    'id', b.id || '_l' || n.i,
    'idempotencyKey', NULL
))).*
FROM b, generate_series(1, :copies * 10) AS n(i);
COMMIT;
ANALYZE "Customer"; ANALYZE "Order"; ANALYZE "OrderItem"; ANALYZE "Booking";

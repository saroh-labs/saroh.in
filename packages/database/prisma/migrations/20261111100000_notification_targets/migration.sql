-- Every notice opens the thing it is about (10 Oct 2026).
--
-- A notice could point at a lead, a review, a contact or a message. A new
-- order, a booking, a failed payment and the website's notices carried a
-- type, a title and a body only, so their inbox rows led nowhere. Four
-- nullable columns, informational like `leadId` (no foreign key): the
-- writers set the one their type requires.
--
-- Additive. The table keeps its `org_isolation` policy; a column needs none
-- of its own. The rows already written are pointed at their order, booking,
-- invoice or site from the claim that recorded them (`CustomerNotice`), so
-- yesterday's notices open too; a row with no claim keeps its nulls and the
-- inbox opens that kind's list.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "siteId" TEXT;

-- An order's notices (new, not collected): the claim names the order.
UPDATE "Notification" n
SET "orderId" = c."orderId"
FROM "CustomerNotice" c
WHERE c."notificationId" = n."id"
  AND c."organizationId" = n."organizationId"
  AND c."orderId" IS NOT NULL
  AND n."type" IN ('order.new', 'order.uncollected');

-- A booking's notices (new, moved, cancelled): the claim names the booking.
UPDATE "Notification" n
SET "bookingId" = c."bookingId"
FROM "CustomerNotice" c
WHERE c."notificationId" = n."id"
  AND c."organizationId" = n."organizationId"
  AND c."bookingId" IS NOT NULL
  AND n."type" IN ('booking.new', 'booking.moved', 'booking.cancelled');

-- A failed payment: the claim is keyed to the payment, which names its
-- invoice ("team:failed:<paymentIntentId>").
UPDATE "Notification" n
SET "invoiceId" = p."invoiceId"
FROM "CustomerNotice" c
JOIN "PaymentIntent" p
  ON p."id" = substring(c."eventKey" from 13)
 AND p."organizationId" = c."organizationId"
WHERE c."notificationId" = n."id"
  AND c."organizationId" = n."organizationId"
  AND c."eventKey" LIKE 'team:failed:%'
  AND p."invoiceId" IS NOT NULL
  AND n."type" = 'payment.failed';

-- A scheduled go-live: the claim is keyed to the test release, which names
-- its site ("team:site:<testReleaseId>:<goLiveAt>").
UPDATE "Notification" n
SET "siteId" = r."siteId"
FROM "CustomerNotice" c
JOIN "SiteTestRelease" r
  ON r."id" = split_part(c."eventKey", ':', 3)
 AND r."organizationId" = c."organizationId"
WHERE c."notificationId" = n."id"
  AND c."organizationId" = n."organizationId"
  AND c."eventKey" LIKE 'team:site:%'
  AND n."type" IN ('site.live', 'site.not_live');

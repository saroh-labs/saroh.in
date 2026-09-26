import { heldStockMismatches } from "../../backfill/held-stock";
import type { Db } from "../helpers";
import {
    gstin as gstinFor,
    RYE_ADDRESS,
    RYE_ADDRESS_PRINTED,
    RYE_GSTIN,
} from "./bakery";
import type { RyeProductPageCounts } from "./check-product-page";
import { checkRyeProductPage } from "./check-product-page";
import type { RyeStockCounts } from "./check-stock";
import { checkRyeStock } from "./check-stock";
import { TIMEZONE } from "./data";
import { istAt } from "./people";
import type { Interval } from "./periods";
import { boundary } from "./periods";

/**
 * What the showcase must never get wrong, checked in the database after it is
 * written: the sums and GST on every invoice, each series' numbers, every
 * service's capacity with the seats open courses hold, the course and pack
 * bookings, and the subscriptions' periods. A seed that fails one of these
 * would put a state on screen the product cannot produce, so a failure stops
 * the run with the rows that broke it.
 *
 * The checks read everything in the businesses they are given — rows a
 * developer added by hand included — because a screen does too.
 */

export interface ShowcaseCounts {
    business: string;
    contacts: number;
    staff: number;
    bookings: number;
    plans: number;
    subscriptions: string;
    packs: number;
    purchases: number;
    redemptions: number;
    courses: number;
    enrolments: number;
    invoices: string;
}

type Row = Record<string, unknown>;

const n = (v: unknown) => Number(v);

export async function checkShowcase(
    prisma: Db,
    now: Date,
    /** Each business, and the id prefix of the rows the showcase wrote in it. */
    businesses: readonly { id: string; name: string; prefix: string }[],
): Promise<ShowcaseCounts[]> {
    const orgs = businesses.map((b) => b.id);
    // Columns hold UTC in `timestamp(3)`; an ISO string cast to `timestamp`
    // compares with them whatever the session's zone is.
    const at = now.toISOString();
    const failures: string[] = [];
    const fail = (what: string, rows: Row[]) => {
        if (rows.length > 0) {
            failures.push(
                `${what}: ${rows.length} — e.g. ${JSON.stringify(rows.slice(0, 3), (_k, v: unknown) => (typeof v === "bigint" ? Number(v) : v))}`,
            );
        }
    };

    // Every invoice: each line is quantity × price less its discount. A
    // receipt's lines sum to its subtotal and subtotal + tax = total. A tax
    // invoice (ADR-008) prices include GST: its lines sum to its total, its
    // subtotal is the taxable value, its tax the GST, and each header sum is
    // the sum of its lines.
    fail(
        "invoice totals that do not add up",
        await prisma.$queryRaw<Row[]>`
            SELECT i.id, i.subtotal::text, i.tax::text, i.total::text, l.sum::text
            FROM "Invoice" i
            LEFT JOIN (
                SELECT "invoiceId", SUM(amount) AS sum,
                       SUM(COALESCE("taxableValue", amount)) AS taxable,
                       SUM(cgst) AS cgst, SUM(sgst) AS sgst, SUM(igst) AS igst,
                       bool_and(amount = quantity * "unitPrice" - discount) AS ok
                FROM "InvoiceLine" GROUP BY "invoiceId"
            ) l ON l."invoiceId" = i.id
            WHERE i."organizationId" = ANY(${orgs})
              AND (l.sum IS NULL OR NOT l.ok OR i.total <> i.subtotal + i.tax
                   OR (i."sellerGstin" IS NULL AND l.sum <> i.subtotal)
                   OR (i."sellerGstin" IS NOT NULL AND (
                       l.sum <> i.total OR l.taxable <> i.subtotal
                       OR l.cgst <> i.cgst OR l.sgst <> i.sgst OR l.igst <> i.igst
                       OR i.tax <> i.cgst + i.sgst + i.igst)))`,
    );

    // GST on every line of a tax invoice, as the API derives it: the
    // taxable value is the inclusive amount at its rate, rounded to the
    // paisa; the rest is tax, CGST + SGST halves in the business's own state
    // (an odd paisa to CGST), IGST in another.
    fail(
        "tax invoice lines whose GST is not their rate's",
        await prisma.$queryRaw<Row[]>`
            SELECT l.id, l.amount::text, l."gstRate"::text, l."taxableValue"::text
            FROM "InvoiceLine" l JOIN "Invoice" i ON i.id = l."invoiceId"
            WHERE i."organizationId" = ANY(${orgs}) AND i."sellerGstin" IS NOT NULL
              AND (l."taxableValue" IS NULL
                OR l."taxableValue" <> round(l.amount * 100 / (100 + COALESCE(l."gstRate", 0)), 2)
                OR l.cgst + l.sgst + l.igst <> l.amount - l."taxableValue"
                OR (i."taxType" = 'INTRA' AND (l.igst <> 0 OR l.cgst - l.sgst NOT IN (0, 0.01)))
                OR (i."taxType" = 'INTER' AND (l.cgst <> 0 OR l.sgst <> 0))
                OR (i."taxType" = 'INTRA') <> (i."placeOfSupply" = i."sellerState"))`,
    );

    // Invoice numbers: in each series (INV-0001…, RC/26-27/0001…, its credit
    // notes' RCCN/26-27/0001…), from 0001 up to the series' sequence, each
    // once, no gaps.
    const numbering = await prisma.$queryRaw<Row[]>`
        WITH nums AS (
            SELECT "organizationId" AS org,
                   regexp_replace(number, '[/-][0-9]+$', '') AS series,
                   COUNT(*) AS numbered,
                   COUNT(DISTINCT number) AS distinct_numbers,
                   MIN(substring(number from '([0-9]+)$')::int) AS lo,
                   MAX(substring(number from '([0-9]+)$')::int) AS hi
            FROM "Invoice"
            WHERE "organizationId" = ANY(${orgs}) AND number IS NOT NULL
            GROUP BY 1, 2
        ), seqs AS (
            SELECT "organizationId" AS org, series, "lastNumber" AS last
            FROM "InvoiceSequence" WHERE "organizationId" = ANY(${orgs})
        )
        SELECT COALESCE(n.org, s.org) AS org, COALESCE(n.series, s.series) AS series,
               COALESCE(s.last, 0) AS last, COALESCE(n.numbered, 0) AS numbered,
               COALESCE(n.distinct_numbers, 0) AS distinct_numbers, n.lo, n.hi
        FROM nums n FULL OUTER JOIN seqs s ON s.org = n.org AND s.series = n.series`;
    fail(
        "invoice numbers with a gap, a repeat or out of step with the sequence",
        numbering.filter(
            (r) =>
                n(r.numbered) !== n(r.distinct_numbers) ||
                n(r.numbered) !== n(r.last) ||
                (n(r.numbered) > 0 && (n(r.lo) !== 1 || n(r.hi) !== n(r.last))),
        ),
    );

    // Each invoice's dates and fields agree with its status. An order's
    // paper and every correction are never due: the order is the ledger.
    fail(
        "invoices whose status and dates disagree",
        await prisma.$queryRaw<Row[]>`
            SELECT id, status FROM "Invoice"
            WHERE "organizationId" = ANY(${orgs}) AND NOT (
                CASE status
                    WHEN 'DRAFT' THEN number IS NULL AND "issuedAt" IS NULL
                        AND "paidAt" IS NULL AND "voidedAt" IS NULL
                    WHEN 'ISSUED' THEN "paidAt" IS NULL AND "voidedAt" IS NULL
                    WHEN 'PAID' THEN "paidAt" >= "issuedAt" AND "paidAt" <= ${at}::timestamp
                        AND "paymentMethod" IS NOT NULL AND "voidedAt" IS NULL
                    WHEN 'VOID' THEN "voidedAt" >= "issuedAt" AND "voidReason" IS NOT NULL
                    WHEN 'CREDITED' THEN "voidedAt" IS NULL
                    ELSE false
                END
                AND (status = 'DRAFT' OR (number IS NOT NULL AND "issuedAt" <= ${at}::timestamp
                    AND "billToName" IS NOT NULL
                    AND ("dueAt" > "issuedAt" OR ("dueAt" IS NULL
                        AND ("orderId" IS NOT NULL OR kind <> 'INVOICE')))))
            )`,
    );

    // What an invoice is for: the row it links to, for that person and price.
    // An order's invoice bills the order as placed: with its supplementary
    // invoices (less any credit note that was not a refund) it comes to the
    // order's total. A correction names an invoice of the same order.
    fail(
        "invoices that do not match what they are for",
        await prisma.$queryRaw<Row[]>`
            SELECT i.id, i.source, i.kind FROM "Invoice" i
            LEFT JOIN "CustomerSubscription" cs ON cs.id = i."subscriptionId"
            LEFT JOIN "CourseEnrollment" ce ON ce.id = i."courseEnrollmentId"
            LEFT JOIN "PackPurchase" pp ON pp.id = i."packPurchaseId"
            LEFT JOIN "Order" o ON o.id = i."orderId"
            LEFT JOIN "Invoice" r ON r.id = i."relatedInvoiceId"
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(c.total) FILTER (WHERE c.kind = 'SUPPLEMENTARY'), 0) AS up,
                       COALESCE(SUM(c.total) FILTER (
                           WHERE c.kind = 'CREDIT_NOTE' AND c."paymentRefundId" IS NULL), 0) AS down
                FROM "Invoice" c WHERE c."relatedInvoiceId" = i.id
            ) fix ON true
            WHERE i."organizationId" = ANY(${orgs}) AND NOT COALESCE(
                (CASE i.kind
                    WHEN 'INVOICE' THEN i."relatedInvoiceId" IS NULL
                    ELSE r."organizationId" = i."organizationId"
                        AND r.kind = 'INVOICE'
                        AND r."orderId" IS NOT DISTINCT FROM i."orderId"
                END) AND
                CASE i.source
                    WHEN 'SUBSCRIPTION' THEN cs."contactId" = i."contactId"
                        AND i.total = cs.price AND i."periodEnd" > i."periodStart"
                        AND i."courseEnrollmentId" IS NULL AND i."packPurchaseId" IS NULL
                    WHEN 'COURSE' THEN ce."contactId" = i."contactId"
                        AND i.total = ce.price
                        AND i."subscriptionId" IS NULL AND i."packPurchaseId" IS NULL
                    WHEN 'PACK' THEN pp."contactId" = i."contactId"
                        AND i.total = pp.price
                        AND i."subscriptionId" IS NULL AND i."courseEnrollmentId" IS NULL
                    WHEN 'MANUAL' THEN i."subscriptionId" IS NULL AND i."orderId" IS NULL
                        AND i."courseEnrollmentId" IS NULL AND i."packPurchaseId" IS NULL
                    WHEN 'ORDER' THEN o."organizationId" = i."organizationId"
                        AND i."subscriptionId" IS NULL AND i."courseEnrollmentId" IS NULL
                        AND i."packPurchaseId" IS NULL
                        AND (i.kind <> 'INVOICE' OR o."paymentStatus" = 'REFUNDED'
                             OR i.total + fix.up - fix.down = o.total)
                    ELSE false
                END, false)`,
    );

    // Capacity: at every confirmed booking's time, the confirmed bookings on
    // that service plus the seats open courses still hold there fit.
    fail(
        "bookings over their service's capacity",
        await prisma.$queryRaw<Row[]>`
            WITH held AS (
                SELECT cs."startAt", cs."endAt", c."serviceId",
                       GREATEST(c.seats - (
                           SELECT COUNT(*) FROM "CourseEnrollment" e
                           WHERE e."courseId" = c.id AND e.status = 'ACTIVE'
                       ), 0) AS unsold
                FROM "CourseSession" cs JOIN "Course" c ON c.id = cs."courseId"
                WHERE c.status = 'OPEN'
            ), load AS (
                SELECT b.id, s.capacity,
                    (SELECT COUNT(*) FROM "Booking" o
                     WHERE o."serviceId" = b."serviceId" AND o.status = 'CONFIRMED'
                       AND o."startAt" < b."endAt" AND o."endAt" > b."startAt") AS confirmed,
                    (SELECT COALESCE(SUM(h.unsold), 0) FROM held h
                     WHERE h."serviceId" = b."serviceId"
                       AND h."startAt" < b."endAt" AND h."endAt" > b."startAt") AS held
                FROM "Booking" b JOIN "Service" s ON s.id = b."serviceId"
                WHERE b."organizationId" = ANY(${orgs}) AND b.status = 'CONFIRMED'
            )
            SELECT id, capacity, confirmed::int, held::int FROM load
            WHERE confirmed + held > capacity`,
    );

    // Courses: people on it within its seats, its seats within the service.
    fail(
        "courses over their seats or their service's capacity",
        await prisma.$queryRaw<Row[]>`
            SELECT c.id FROM "Course" c JOIN "Service" s ON s.id = c."serviceId"
            WHERE c."organizationId" = ANY(${orgs}) AND (c.seats > s.capacity OR (
                SELECT COUNT(*) FROM "CourseEnrollment" e
                WHERE e."courseId" = c.id AND e.status = 'ACTIVE') > c.seats)`,
    );
    fail(
        "course bookings off their course's sessions, service or person",
        await prisma.$queryRaw<Row[]>`
            SELECT b.id FROM "Booking" b
            JOIN "CourseEnrollment" e ON e.id = b."courseEnrollmentId"
            JOIN "Course" c ON c.id = e."courseId"
            WHERE b."organizationId" = ANY(${orgs}) AND (
                b."serviceId" <> c."serviceId" OR b."contactId" <> e."contactId"
                OR b."startAt" <= e."createdAt"
                OR NOT EXISTS (SELECT 1 FROM "CourseSession" cs
                    WHERE cs."courseId" = c.id AND cs."startAt" = b."startAt"
                      AND cs."endAt" = b."endAt")
                OR (e.status = 'ACTIVE' AND b.status <> 'CONFIRMED')
                OR (e.status = 'CANCELLED'
                    AND (b."startAt" > e."cancelledAt") <> (b.status = 'CANCELLED')))`,
    );
    fail(
        "enrolments without exactly one booking per session after they joined",
        await prisma.$queryRaw<Row[]>`
            SELECT e.id AS enrolment, cs.id AS session FROM "CourseEnrollment" e
            JOIN "CourseSession" cs ON cs."courseId" = e."courseId"
                AND cs."startAt" > e."createdAt"
            WHERE e."organizationId" = ANY(${orgs}) AND (
                SELECT COUNT(*) FROM "Booking" b
                WHERE b."courseEnrollmentId" = e.id AND b."startAt" = cs."startAt") <> 1`,
    );

    // Packs: never more classes spent than bought; each on the buyer's own
    // booking of a covered service, before the pack ran out; a cancelled
    // booking's class given back.
    fail(
        "packs with more classes spent than they hold",
        await prisma.$queryRaw<Row[]>`
            SELECT p.id FROM "PackPurchase" p
            WHERE p."organizationId" = ANY(${orgs}) AND (
                SELECT COUNT(*) FROM "PackRedemption" r
                WHERE r."purchaseId" = p.id AND r."reversedAt" IS NULL) > p.credits`,
    );
    fail(
        "classes spent on a booking the pack could not pay for",
        await prisma.$queryRaw<Row[]>`
            SELECT r.id FROM "PackRedemption" r
            JOIN "PackPurchase" p ON p.id = r."purchaseId"
            JOIN "Booking" b ON b.id = r."bookingId"
            WHERE r."organizationId" = ANY(${orgs}) AND (
                b."contactId" <> p."contactId" OR b."startAt" >= p."expiresAt"
                OR r."createdAt" < p."createdAt" OR b."courseEnrollmentId" IS NOT NULL
                OR NOT EXISTS (SELECT 1 FROM "ClassPackService" x
                    WHERE x."packId" = p."packId" AND x."serviceId" = b."serviceId")
                OR (r."reversedAt" IS NULL AND b.status <> 'CONFIRMED'
                    AND NOT b."cancelledLate")
                OR (r."reversedAt" IS NOT NULL
                    AND (b.status <> 'CANCELLED' OR b."cancelledLate")))`,
    );

    // How a booking was paid (U3): a pack's class has its redemption; a
    // membership's names the member's own subscription and stays within the
    // plan's classes a month (a late cancel counts); only a cancelled booking
    // can have been cancelled late.
    fail(
        "bookings whose way of paying disagrees with what paid",
        await prisma.$queryRaw<Row[]>`
            SELECT b.id, b."paidWith" FROM "Booking" b
            LEFT JOIN "PackRedemption" r ON r."bookingId" = b.id
            LEFT JOIN "CustomerSubscription" cs ON cs.id = b."subscriptionId"
            WHERE b."organizationId" = ANY(${orgs}) AND (
                (b."paidWith" IS NOT NULL AND (b."paidWith" = 'PACK') <> (r.id IS NOT NULL))
                OR (b."paidWith" = 'MEMBERSHIP') <> (b."subscriptionId" IS NOT NULL)
                OR (cs.id IS NOT NULL AND cs."contactId" IS DISTINCT FROM b."contactId")
                OR (b."paidWith" IS NOT NULL
                    AND b."paidWith" NOT IN ('MEMBERSHIP', 'PACK', 'PAID', 'DESK'))
                OR (b."cancelledLate" AND b.status <> 'CANCELLED'))`,
    );
    fail(
        "memberships used past their classes a month",
        await prisma.$queryRaw<Row[]>`
            SELECT b."subscriptionId", p."classesPerMonth", COUNT(*)::int AS used
            FROM "Booking" b
            JOIN "CustomerSubscription" cs ON cs.id = b."subscriptionId"
            JOIN "SubscriptionPlan" p ON p.id = cs."planId"
            WHERE b."organizationId" = ANY(${orgs})
              AND (b.status = 'CONFIRMED' OR b."cancelledLate")
              AND p."classesPerMonth" IS NOT NULL
            GROUP BY b."subscriptionId", p."classesPerMonth",
                date_trunc('month', (b."startAt" AT TIME ZONE 'UTC') AT TIME ZONE cs.timezone)
            HAVING COUNT(*) > p."classesPerMonth"`,
    );

    // Who takes a booking (U3): someone who takes that service, never in two
    // places at once, and one instructor for every place in a class session.
    fail(
        "bookings taken by someone who does not take that service",
        await prisma.$queryRaw<Row[]>`
            SELECT b.id FROM "Booking" b
            WHERE b."organizationId" = ANY(${orgs}) AND b."staffId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "StaffService" x
                  WHERE x."staffId" = b."staffId" AND x."serviceId" = b."serviceId"
                    AND x."organizationId" = b."organizationId")`,
    );
    fail(
        "people booked in two places at once",
        await prisma.$queryRaw<Row[]>`
            SELECT a.id AS one, b.id AS other FROM "Booking" a
            JOIN "Booking" b ON b."staffId" = a."staffId" AND a.id < b.id
            JOIN "Service" s ON s.id = a."serviceId"
            WHERE a."organizationId" = ANY(${orgs})
              AND a.status <> 'CANCELLED' AND b.status <> 'CANCELLED'
              AND a."startAt" < b."endAt" AND b."startAt" < a."endAt"
              AND NOT (s.capacity > 1 AND a."serviceId" = b."serviceId"
                       AND a."startAt" = b."startAt")`,
    );
    fail(
        "class sessions with more than one instructor",
        await prisma.$queryRaw<Row[]>`
            SELECT "serviceId", "startAt" FROM "Booking"
            WHERE "organizationId" = ANY(${orgs})
            GROUP BY "serviceId", "startAt"
            HAVING COUNT(DISTINCT COALESCE("staffId", '')) > 1`,
    );
    fail(
        "weekly hours that end before they start or overlap",
        await prisma.$queryRaw<Row[]>`
            SELECT a.id FROM "StaffHours" a
            WHERE a."organizationId" = ANY(${orgs}) AND (
                a."endMinute" <= a."startMinute" OR a."startMinute" < 0
                OR a."endMinute" > 1440 OR a."dayOfWeek" NOT BETWEEN 0 AND 6
                OR EXISTS (SELECT 1 FROM "StaffHours" b
                    WHERE b."staffId" = a."staffId" AND b."dayOfWeek" = a."dayOfWeek"
                      AND b.id <> a.id AND b."startMinute" < a."endMinute"
                      AND a."startMinute" < b."endMinute"))`,
    );

    // Subscriptions the showcase wrote: each invoiced period is the next on
    // its anchor's chain, from the first; the current period is the last one
    // invoiced; the status agrees with the dates.
    for (const b of businesses) {
        const subs = await prisma.customerSubscription.findMany({
            where: { organizationId: b.id, id: { startsWith: b.prefix } },
            include: {
                invoices: {
                    where: { status: { not: "VOID" } },
                    orderBy: { periodStart: "asc" },
                    select: { periodStart: true, periodEnd: true },
                },
            },
        });
        const wrong = subs.filter((s) => {
            const interval = s.interval as Interval;
            const at = (k: number) =>
                boundary(s.anchorAt, interval, s.timezone, k).getTime();
            const chained = s.invoices.every(
                (inv, k) =>
                    inv.periodStart?.getTime() === at(k) &&
                    inv.periodEnd?.getTime() === at(k + 1),
            );
            const k = s.invoices.length - 1;
            const start = s.currentPeriodStart.getTime();
            const end = s.currentPeriodEnd.getTime();
            const local = new Date(s.anchorAt.getTime() + 330 * 60_000);
            const statusOk =
                s.status === "ACTIVE"
                    ? end > now.getTime() && !s.pausedAt && !s.cancelledAt
                    : s.status === "PAUSED"
                      ? s.pausedAt !== null &&
                        s.pausedAt.getTime() >= start &&
                        s.pausedAt.getTime() < end &&
                        !s.cancelAtPeriodEnd
                      : s.cancelledAt !== null &&
                        s.cancelledAt.getTime() >= start &&
                        s.cancelledAt.getTime() <= end &&
                        !s.cancelAtPeriodEnd;
            return !(
                s.timezone === TIMEZONE &&
                local.getUTCHours() === 0 &&
                local.getUTCMinutes() === 0 &&
                k >= 0 &&
                chained &&
                start === at(k) &&
                end === at(k + 1) &&
                statusOk
            );
        });
        fail(
            "subscriptions whose periods break the renewal rules",
            wrong.map((s) => ({ id: s.id })),
        );
    }

    // Stock (#511, #513): each shelf row promises exactly what its open
    // orders' lines hold, a closed order's line holds nothing, and each
    // row's stock log adds up to what is on it. A row promising units no
    // line holds is the state that made a cancel give back, or a fulfilment
    // sell, units nobody promised.
    const held = await heldStockMismatches(prisma, orgs);
    fail(
        "shelf rows whose promised is not what open orders hold",
        held.rows as unknown as Row[],
    );
    fail(
        "order lines holding stock they can't (closed, or on no row)",
        held.lines as unknown as Row[],
    );
    fail(
        "shelf rows whose stock log does not add up to on hand",
        await prisma.$queryRaw<Row[]>`
            SELECT s.id, s."onHand", COALESCE(e.total, 0) AS logged
            FROM "StockLevel" s
            LEFT JOIN (
                SELECT "stockLevelId", SUM(quantity)::int AS total
                FROM "StockEntry" GROUP BY "stockLevelId"
            ) e ON e."stockLevelId" = s.id
            WHERE s."organizationId" = ANY(${orgs})
              AND COALESCE(e.total, 0) <> s."onHand"`,
    );
    // The Stock screen's "Last change" reads the newest entry and who made
    // it: an entry is never later than now, and only one Saroh wrote itself
    // (Track stock turned off, …) is by nobody.
    fail(
        "stock entries dated in the future, or made by nobody",
        await prisma.$queryRaw<Row[]>`
            SELECT id, "organizationId", "createdAt", "actorUserId" FROM "StockEntry"
            WHERE "organizationId" = ANY(${orgs})
              AND ("createdAt" > ${new Date().toISOString()}::timestamptz AT TIME ZONE 'UTC'
                   OR ("actorUserId" IS NULL AND "system" IS NULL))`,
    );

    if (failures.length > 0) {
        throw new Error(
            `The showcase does not reconcile:\n  - ${failures.join("\n  - ")}`,
        );
    }

    const counts: ShowcaseCounts[] = [];
    for (const b of businesses) {
        const where = { organizationId: b.id };
        const [
            contacts,
            staff,
            bookings,
            plans,
            subs,
            packs,
            purchases,
            redemptions,
            courses,
            enrolments,
            invoices,
        ] = await Promise.all([
            prisma.contact.count({ where }),
            prisma.staffMember.count({ where }),
            prisma.booking.count({ where }),
            prisma.subscriptionPlan.count({ where }),
            prisma.customerSubscription.groupBy({
                by: ["status"],
                where,
                _count: true,
            }),
            prisma.classPack.count({ where }),
            prisma.packPurchase.count({ where }),
            prisma.packRedemption.count({
                where: { ...where, reversedAt: null },
            }),
            prisma.course.count({ where }),
            prisma.courseEnrollment.count({ where }),
            prisma.invoice.findMany({
                where,
                select: { status: true, dueAt: true },
            }),
        ]);
        const standing = new Map<string, number>();
        for (const inv of invoices) {
            const key =
                inv.status === "ISSUED" && inv.dueAt && inv.dueAt < now
                    ? "OVERDUE"
                    : inv.status;
            standing.set(key, (standing.get(key) ?? 0) + 1);
        }
        const list = (m: [string, number][]) =>
            m.map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ") || "0";
        counts.push({
            business: b.name,
            contacts,
            staff,
            bookings,
            plans,
            subscriptions: list(subs.map((s) => [s.status, s._count])),
            packs,
            purchases,
            redemptions,
            courses,
            enrolments,
            invoices: list(
                [
                    "PAID",
                    "ISSUED",
                    "OVERDUE",
                    "CREDITED",
                    "VOID",
                    "DRAFT",
                ].flatMap((k): [string, number][] => {
                    const count = standing.get(k);
                    return count ? [[k, count]] : [];
                }),
            ),
        });
    }
    return counts;
}

// --- Rye & Co. ------------------------------------------------------------------

export interface RyeCounts extends RyeStockCounts, RyeProductPageCounts {
    gstin: string;
    products: number;
    orders: number;
    ordersToday: string;
    taxInvoices: number;
    intraState: number;
    interState: number;
    creditNotes: number;
    supplementary: number;
    trade: string;
    subscriptions: string;
    failedRenewals: number;
    changingPlan: number;
    upcomingSkips: number;
    identityLinks: number;
    possibleMatches: number;
    allergyOrders: number;
    series: string;
}

/**
 * What the Rye & Co. films need on screen (U9), checked in the database: GST
 * paper in the RC series with CGST + SGST and IGST, a credit note and a
 * supplementary invoice, an order in each kitchen stage today, one unpaid and
 * one partly refunded, trade invoices paid, due, overdue and drafted, a
 * failed renewal, a possible match, and the allergy case — and that every
 * paid order has exactly one invoice, billed as the API would bill it.
 */
export async function checkRye(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<RyeCounts> {
    const at = now.toISOString();
    const today = istAt(now, 0, 0).toISOString();
    const failures: string[] = [];
    const fail = (what: string, rows: Row[]) => {
        if (rows.length > 0) {
            failures.push(
                `${what}: ${rows.length} — e.g. ${JSON.stringify(rows.slice(0, 3), (_k, v: unknown) => (typeof v === "bigint" ? Number(v) : v))}`,
            );
        }
    };
    const one = async (rows: Promise<Row[]>) => n((await rows)[0]?.n ?? 0);

    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId: orgId },
        select: {
            gstRegistered: true,
            gstState: true,
            taxId: true,
            invoicePrefix: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            postalCode: true,
        },
    });
    const gstin = profile?.taxId ?? "";
    if (
        !profile?.gstRegistered ||
        profile.gstState !== "29" ||
        profile.invoicePrefix !== "RC" ||
        gstin !== RYE_GSTIN ||
        !gstin.startsWith("29")
    ) {
        failures.push(
            `the business is not GST-registered in Karnataka as RC: ${JSON.stringify(profile)}`,
        );
    }
    if (
        profile?.addressLine1 !== RYE_ADDRESS.addressLine1 ||
        profile.addressLine2 !== RYE_ADDRESS.addressLine2 ||
        profile.city !== RYE_ADDRESS.city ||
        profile.postalCode !== RYE_ADDRESS.postalCode
    ) {
        failures.push(
            `the business has no registered address on Hill Road: ${JSON.stringify(profile)}`,
        );
    }
    fail(
        "issued paper without the registered address it was issued with",
        await prisma.$queryRaw<Row[]>`
            SELECT id, number FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND number IS NOT NULL
              AND "sellerAddress" IS DISTINCT FROM ${RYE_ADDRESS_PRINTED}`,
    );
    const buyers = await prisma.invoice.findMany({
        where: { organizationId: orgId, billToGstin: { not: null } },
        select: { id: true, billToGstin: true, billToState: true },
    });
    fail(
        "bill-to GSTINs that do not check out or are not in the bill-to state",
        buyers
            .filter(
                (b) =>
                    !b.billToGstin ||
                    gstinFor(
                        b.billToGstin.slice(0, 2),
                        b.billToGstin.slice(2, 12),
                    ) !== b.billToGstin ||
                    b.billToGstin.slice(0, 2) !== b.billToState,
            )
            .map((b) => ({ id: b.id })),
    );

    fail(
        "paid orders without exactly one invoice, or unpaid ones with one",
        await prisma.$queryRaw<Row[]>`
            SELECT o.id, o."paymentStatus" FROM "Order" o
            WHERE o."organizationId" = ${orgId}
              AND (SELECT COUNT(*) FROM "Invoice" i
                   WHERE i."orderId" = o.id AND i.kind = 'INVOICE')
                  <> CASE WHEN o."paymentStatus" IN ('PAID', 'REFUNDED') THEN 1 ELSE 0 END`,
    );
    fail(
        "order invoices not billed to the order's customer, or taxed in the wrong place",
        await prisma.$queryRaw<Row[]>`
            SELECT i.id FROM "Invoice" i
            JOIN "Order" o ON o.id = i."orderId"
            JOIN "Customer" c ON c.id = o."customerId"
            WHERE i."organizationId" = ${orgId} AND (
                i."billToEmail" <> c.email
                OR i."billToName" <> trim(concat_ws(' ', c."firstName", c."lastName"))
                OR i."sellerGstin" IS NULL
                OR (o.fulfilment = 'COLLECT' AND i."placeOfSupply" <> i."sellerState")
                OR (o.fulfilment = 'DELIVERY'
                    AND (o."deliveryState" = 'Karnataka') <> (i."placeOfSupply" = i."sellerState"))
                OR (o.fulfilment = 'DELIVERY' AND i."billToAddress" IS NULL))`,
    );
    fail(
        "paper outside the RC series, or a credit note outside RCCN",
        await prisma.$queryRaw<Row[]>`
            SELECT id, number FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND number IS NOT NULL
              AND (number !~ '^RC(CN)?/[0-9]{2}-[0-9]{2}/[0-9]{4}$'
                   OR (kind = 'CREDIT_NOTE') <> (number LIKE 'RCCN/%'))`,
    );
    fail(
        "order totals that are not their lines and delivery",
        await prisma.$queryRaw<Row[]>`
            SELECT o.id FROM "Order" o
            WHERE o."organizationId" = ${orgId} AND (
                o.subtotal <> (SELECT SUM(quantity * price) FROM "OrderItem" WHERE "orderId" = o.id)
                OR o.total <> o.subtotal + o.shipping - o.discount)`,
    );

    const stages = await prisma.$queryRaw<Row[]>`
        SELECT stage::text AS stage, COUNT(*) AS n FROM "Order"
        WHERE "organizationId" = ${orgId} AND "createdAt" >= ${today}::timestamp
        GROUP BY 1 ORDER BY 1`;
    const stageCount = (s: string) =>
        n(stages.find((r) => r.stage === s)?.n ?? 0);

    const counts: Omit<
        RyeCounts,
        keyof RyeStockCounts | keyof RyeProductPageCounts
    > = {
        gstin,
        products: await prisma.product.count({
            where: { organizationId: orgId, gstRate: { not: null } },
        }),
        orders: await prisma.order.count({ where: { organizationId: orgId } }),
        ordersToday: stages
            .map((r) => `${n(r.n)} ${String(r.stage).toLowerCase()}`)
            .join(", "),
        taxInvoices: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND "sellerGstin" IS NOT NULL
              AND number IS NOT NULL`),
        intraState: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND cgst > 0 AND sgst > 0`),
        interState: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND igst > 0`),
        creditNotes: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND kind = 'CREDIT_NOTE'
              AND "paymentRefundId" IS NOT NULL AND number LIKE 'RCCN/%'`),
        supplementary: await prisma.invoice.count({
            where: { organizationId: orgId, kind: "SUPPLEMENTARY" },
        }),
        trade: (
            await prisma.$queryRaw<Row[]>`
                SELECT CASE
                    WHEN status = 'ISSUED' AND "dueAt" < ${at}::timestamp THEN 'overdue'
                    WHEN status = 'ISSUED' THEN 'due'
                    ELSE lower(status) END AS state,
                    COUNT(*) AS n
                FROM "Invoice" WHERE "organizationId" = ${orgId} AND source = 'MANUAL'
                GROUP BY 1 ORDER BY 1`
        )
            .map((r) => `${n(r.n)} ${String(r.state)}`)
            .join(", "),
        subscriptions: (
            await prisma.customerSubscription.groupBy({
                by: ["status"],
                where: { organizationId: orgId },
                _count: true,
            })
        )
            .map((s) => `${s._count} ${s.status.toLowerCase()}`)
            .join(", "),
        failedRenewals: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "CustomerSubscription" cs
            JOIN LATERAL (
                SELECT i.* FROM "Invoice" i
                WHERE i."subscriptionId" = cs.id AND i.status <> 'VOID'
                ORDER BY i."periodStart" DESC LIMIT 1
            ) latest ON true
            WHERE cs."organizationId" = ${orgId} AND cs.status = 'ACTIVE'
              AND latest.status = 'ISSUED' AND latest."dueAt" < ${at}::timestamp
              AND latest."createdByUserId" IS NULL`),
        changingPlan: await prisma.customerSubscription.count({
            where: { organizationId: orgId, pendingPlanId: { not: null } },
        }),
        upcomingSkips: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "SubscriptionSkip" k
            JOIN "CustomerSubscription" cs ON cs.id = k."subscriptionId"
            WHERE k."organizationId" = ${orgId} AND cs.status = 'ACTIVE'
              AND k.date > (${at}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
              AND EXTRACT(ISODOW FROM k.date) = cs."collectionWeekday"`),
        identityLinks: await prisma.customerIdentityLink.count({
            where: { organizationId: orgId },
        }),
        possibleMatches: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Customer" cu
            JOIN "Contact" c ON c."organizationId" = cu."organizationId"
                AND lower(c.email) = lower(cu.email)
            WHERE cu."organizationId" = ${orgId}
              AND NOT EXISTS (SELECT 1 FROM "CustomerIdentityLink" l
                  WHERE l."contactId" = c.id AND l."customerId" = cu.id)`),
        allergyOrders: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(DISTINCT o.id) AS n FROM "Order" o
            JOIN "CustomerIdentityLink" l ON l."customerId" = o."customerId"
            JOIN "ContactNote" note ON note."contactId" = l."contactId"
            JOIN "ContactNoteAllergen" na ON na."noteId" = note.id
            JOIN "OrderItem" i ON i."orderId" = o.id
            JOIN "ProductAllergen" pa ON pa."productId" = i."productId"
                AND pa."allergenId" = na."allergenId"
            WHERE o."organizationId" = ${orgId} AND o.stage = 'NEW'
              AND o."createdAt" >= ${today}::timestamp`),
        series: (
            await prisma.invoiceSequence.findMany({
                where: { organizationId: orgId },
                orderBy: { series: "asc" },
                select: { series: true, lastNumber: true },
            })
        )
            .map((s) => `${s.series} → ${s.lastNumber}`)
            .join(", "),
    };

    const has = async (rows: Promise<Row[]>) => (await one(rows)) >= 1;
    const missing = Object.entries({
        "eleven products with a GST rate": counts.products >= 11,
        "an order placed today in each kitchen stage": [
            "NEW",
            "PREPARING",
            "READY",
            "COLLECTED",
            "HANDED_TO_COURIER",
        ].every((s) => stageCount(s) >= 1),
        "orders delivered earlier": await has(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Order" WHERE "organizationId" = ${orgId}
              AND stage = 'DELIVERED' AND "createdAt" < ${today}::timestamp`),
        "a delivery with the courier, its address and tracking link":
            await has(prisma.$queryRaw<Row[]>`
                SELECT COUNT(*) AS n FROM "Order" WHERE "organizationId" = ${orgId}
                  AND stage = 'HANDED_TO_COURIER' AND "trackingUrl" IS NOT NULL
                  AND "deliveryLine1" IS NOT NULL`),
        "an order today whose payment failed": await has(prisma.$queryRaw<
            Row[]
        >`
            SELECT COUNT(*) AS n FROM "Order" WHERE "organizationId" = ${orgId}
              AND "paymentStatus" = 'FAILED' AND stage = 'NEW'
              AND "createdAt" >= ${today}::timestamp`),
        "a partly refunded order": await has(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM (
                SELECT p."orderId", SUM(p."amountCents") AS taken,
                       SUM((SELECT COALESCE(SUM(r."amountCents"), 0) FROM "PaymentRefund" r
                            WHERE r."paymentIntentId" = p.id AND r.status <> 'FAILED')) AS back
                FROM "PaymentIntent" p
                WHERE p."organizationId" = ${orgId} AND p.status = 'SUCCEEDED'
                GROUP BY 1) x
            WHERE back > 0 AND back < taken`),
        "an order edited before preparing": await has(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "OrderEvent" e
            JOIN "Order" o ON o.id = e."orderId"
            WHERE e."organizationId" = ${orgId} AND e.kind = 'EDIT'
              AND e."fromStage" = 'NEW' AND o.stage <> 'NEW'`),
        "tax invoices with CGST and SGST": counts.intraState >= 1,
        "an IGST invoice": counts.interState >= 1,
        "a hand-written invoice to Goa, in IGST": await has(prisma.$queryRaw<
            Row[]
        >`
            SELECT COUNT(*) AS n FROM "Invoice" WHERE "organizationId" = ${orgId}
              AND source = 'MANUAL' AND "billToState" = '30' AND igst > 0
              AND cgst = 0 AND sgst = 0 AND "billToGstin" LIKE '30%'`),
        "a credit note for a refund": counts.creditNotes >= 1,
        "a supplementary invoice": counts.supplementary >= 1,
        "trade invoices paid, due, overdue and drafted": [
            "paid",
            "due",
            "overdue",
            "draft",
        ].every((s) => counts.trade.includes(` ${s}`)),
        "renewals invoiced in the RC series with the loaf at 0%":
            await has(prisma.$queryRaw<Row[]>`
                SELECT COUNT(*) AS n FROM "Invoice" i
                WHERE i."organizationId" = ${orgId} AND i.source = 'SUBSCRIPTION'
                  AND i.number LIKE 'RC/%' AND i.tax = 0 AND i."createdByUserId" IS NULL`),
        "a failed renewal": counts.failedRenewals >= 1,
        "a paused subscription": counts.subscriptions.includes(" paused"),
        "a plan change at renewal": counts.changingPlan >= 1,
        "a skipped collection to come": counts.upcomingSkips >= 1,
        "subscribers linked to their store customers":
            counts.identityLinks >= 1,
        "exactly one possible match": counts.possibleMatches === 1,
        "an order today whose line holds an allergen the customer's note names":
            counts.allergyOrders >= 1,
    }).flatMap(([what, ok]) => (ok ? [] : [what]));
    if (missing.length > 0) failures.push(`missing: ${missing.join("; ")}`);
    // The stock films' shelves, log, checks and collections (#526).
    const stock = await checkRyeStock(prisma, orgId);
    failures.push(...stock.failures);
    // The Product Detail and Editor films' details, reviews and codes (#522).
    const page = await checkRyeProductPage(prisma, orgId);
    failures.push(...page.failures);

    if (failures.length > 0) {
        throw new Error(
            `Rye & Co. failed its checks:\n  - ${failures.join("\n  - ")}`,
        );
    }
    return { ...counts, ...stock.counts, ...page.counts };
}

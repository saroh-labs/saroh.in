import type { Db } from "../helpers";
import { TIMEZONE } from "./data";
import type { Interval } from "./periods";
import { boundary } from "./periods";

/**
 * What the showcase must never get wrong, checked in the database after it is
 * written: the sums on every invoice, the business's invoice numbers, every
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
                `${what}: ${rows.length} — e.g. ${JSON.stringify(rows.slice(0, 3))}`,
            );
        }
    };

    // Every invoice: lines × price = amounts, Σ amounts = subtotal, subtotal
    // + tax = total.
    fail(
        "invoice totals that do not add up",
        await prisma.$queryRaw<Row[]>`
            SELECT i.id, i.subtotal::text, i.tax::text, i.total::text, l.sum::text
            FROM "Invoice" i
            LEFT JOIN (
                SELECT "invoiceId", SUM(amount) AS sum,
                       bool_and(amount = quantity * "unitPrice") AS ok
                FROM "InvoiceLine" GROUP BY "invoiceId"
            ) l ON l."invoiceId" = i.id
            WHERE i."organizationId" = ANY(${orgs})
              AND (l.sum IS NULL OR NOT l.ok OR l.sum <> i.subtotal
                   OR i.total <> i.subtotal + i.tax)`,
    );

    // Invoice numbers: INV-0001 up to the sequence, each once, no gaps.
    const numbering = await prisma.$queryRaw<Row[]>`
        SELECT o.id, COALESCE(s."lastNumber", 0) AS last,
               COUNT(i.number) AS numbered,
               COUNT(DISTINCT i.number) AS distinct_numbers,
               MIN(substr(i.number, 5)::int) AS lo,
               MAX(substr(i.number, 5)::int) AS hi
        FROM "Organization" o
        LEFT JOIN "InvoiceSequence" s ON s."organizationId" = o.id
        LEFT JOIN "Invoice" i ON i."organizationId" = o.id AND i.number IS NOT NULL
        WHERE o.id = ANY(${orgs})
        GROUP BY o.id, s."lastNumber"`;
    fail(
        "invoice numbers with a gap, a repeat or out of step with the sequence",
        numbering.filter(
            (r) =>
                n(r.numbered) !== n(r.distinct_numbers) ||
                n(r.numbered) !== n(r.last) ||
                (n(r.numbered) > 0 && (n(r.lo) !== 1 || n(r.hi) !== n(r.last))),
        ),
    );

    // Each invoice's dates and fields agree with its status.
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
                    ELSE false
                END
                AND (status = 'DRAFT' OR (number IS NOT NULL AND "issuedAt" <= ${at}::timestamp
                    AND "dueAt" > "issuedAt" AND "billToName" IS NOT NULL))
            )`,
    );

    // What an invoice is for: the row it links to, for that person and price.
    fail(
        "invoices that do not match what they are for",
        await prisma.$queryRaw<Row[]>`
            SELECT i.id, i.source FROM "Invoice" i
            LEFT JOIN "CustomerSubscription" cs ON cs.id = i."subscriptionId"
            LEFT JOIN "CourseEnrollment" ce ON ce.id = i."courseEnrollmentId"
            LEFT JOIN "PackPurchase" pp ON pp.id = i."packPurchaseId"
            WHERE i."organizationId" = ANY(${orgs}) AND NOT COALESCE(
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
                    WHEN 'MANUAL' THEN i."subscriptionId" IS NULL
                        AND i."courseEnrollmentId" IS NULL AND i."packPurchaseId" IS NULL
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
                OR (r."reversedAt" IS NULL AND b.status <> 'CONFIRMED')
                OR (r."reversedAt" IS NOT NULL AND b.status <> 'CANCELLED'))`,
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
            bookings,
            plans,
            subscriptions: list(subs.map((s) => [s.status, s._count])),
            packs,
            purchases,
            redemptions,
            courses,
            enrolments,
            invoices: list(
                ["PAID", "ISSUED", "OVERDUE", "VOID", "DRAFT"].flatMap(
                    (k): [string, number][] => {
                        const count = standing.get(k);
                        return count ? [[k, count]] : [];
                    },
                ),
            ),
        });
    }
    return counts;
}

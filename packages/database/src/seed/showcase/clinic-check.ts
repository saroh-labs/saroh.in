import type { Db } from "../helpers";
import {
    KAVI,
    KAVI_ADDRESS,
    KAVI_ADDRESS_PRINTED,
    KAVI_GST,
    KAVI_GSTIN,
    KAVI_SAC,
} from "./clinic-data";
import { istAt } from "./people";

export interface KaviCounts {
    gstin: string;
    services: number;
    onBookingPage: number;
    dentists: number;
    bookings: number;
    thisWeek: string;
    attended: number;
    noShows: number;
    lateCancels: number;
    upcoming: number;
    paidOnline: number;
    closures: string;
    invoices: string;
    attention: string;
}

type Row = Record<string, unknown>;

const n = (v: unknown) => Number(v);

/**
 * What the films and the units verified on Kavi Dental need (E29), checked in
 * the database: an exempt, GST-registered clinic whose every line is 0% with
 * SAC 9993; its services on the booking page and the hidden one off it; two
 * dentists each with bookings this week, only ever inside their hours, off
 * their day off and out of the Diwali closure; attended visits, a no-show and
 * a late cancel; bills paid online, paid at the desk, due and overdue; and
 * Needs attention with a sensitive entry and a booking-page suggestion.
 */
export async function checkKavi(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<KaviCounts> {
    const at = now.toISOString();
    const weekFrom = istAt(now, -3, 0).toISOString();
    const weekTo = istAt(now, 7, 0).toISOString();
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
    if (
        !profile?.gstRegistered ||
        profile.gstState !== KAVI_GST.state ||
        profile.invoicePrefix !== KAVI_GST.prefix ||
        profile.taxId !== KAVI_GSTIN ||
        profile.addressLine1 !== KAVI_ADDRESS.addressLine1 ||
        profile.city !== KAVI_ADDRESS.city ||
        profile.postalCode !== KAVI_ADDRESS.postalCode
    ) {
        failures.push(
            `the clinic is not GST-registered on 12th Main as KD: ${JSON.stringify(profile)}`,
        );
    }

    // Exempt: every service and every line at 0% with SAC 9993, no tax.
    fail(
        "services that are not exempt healthcare",
        await prisma.$queryRaw<Row[]>`
            SELECT id, "gstRate"::text, "sacCode" FROM "Service"
            WHERE "organizationId" = ${orgId} AND "deletedAt" IS NULL
              AND ("gstRate" IS DISTINCT FROM 0 OR "sacCode" IS DISTINCT FROM ${KAVI_SAC})`,
    );
    fail(
        "invoice lines that are not exempt",
        await prisma.$queryRaw<Row[]>`
            SELECT l.id, l."gstRate"::text, l."hsnSac" FROM "InvoiceLine" l
            JOIN "Invoice" i ON i.id = l."invoiceId"
            WHERE i."organizationId" = ${orgId}
              AND (l."gstRate" IS DISTINCT FROM 0 OR l."hsnSac" IS DISTINCT FROM ${KAVI_SAC}
                   OR l.cgst + l.sgst + l.igst <> 0 OR i.tax <> 0)`,
    );
    fail(
        "paper outside the KD series or without the registered address",
        await prisma.$queryRaw<Row[]>`
            SELECT id, number FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND number IS NOT NULL
              AND (number !~ '^KD/[0-9]{2}-[0-9]{2}/[0-9]{4}$'
                   OR "sellerGstin" IS DISTINCT FROM ${KAVI_GSTIN}
                   OR "sellerAddress" IS DISTINCT FROM ${KAVI_ADDRESS_PRINTED})`,
    );

    // The diary: a dentist on every booking, on a start their week offers
    // (inside their hours, on the service's step from the window's start),
    // never in a closure or on a day off the showcase wrote.
    fail(
        "bookings without a dentist",
        await prisma.$queryRaw<Row[]>`
            SELECT id FROM "Booking"
            WHERE "organizationId" = ${orgId} AND "staffId" IS NULL`,
    );
    fail(
        "bookings off their dentist's week",
        await prisma.$queryRaw<Row[]>`
            WITH b AS (
                SELECT b.id, b."staffId", s."durationMinutes" AS len,
                       (b."startAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' AS local,
                       EXTRACT(EPOCH FROM b."endAt" - b."startAt") / 60 AS minutes
                FROM "Booking" b JOIN "Service" s ON s.id = b."serviceId"
                WHERE b."organizationId" = ${orgId} AND b.status <> 'CANCELLED'
            )
            SELECT id FROM b
            WHERE minutes <> len OR NOT EXISTS (
                SELECT 1 FROM "StaffHours" h
                WHERE h."staffId" = b."staffId"
                  AND h."dayOfWeek" = EXTRACT(DOW FROM b.local)
                  AND h."startMinute" <= EXTRACT(HOUR FROM b.local) * 60 + EXTRACT(MINUTE FROM b.local)
                  AND EXTRACT(HOUR FROM b.local) * 60 + EXTRACT(MINUTE FROM b.local) + len <= h."endMinute"
                  AND (EXTRACT(HOUR FROM b.local) * 60 + EXTRACT(MINUTE FROM b.local) - h."startMinute")::int % len = 0)`,
    );
    fail(
        "bookings in a closure or on a dentist's day off",
        await prisma.$queryRaw<Row[]>`
            SELECT b.id FROM "Booking" b
            WHERE b."organizationId" = ${orgId} AND b.status <> 'CANCELLED'
              AND (EXISTS (SELECT 1 FROM "BusinessClosure" c
                      WHERE c."organizationId" = b."organizationId"
                        AND c.id LIKE ${`${KAVI.prefix}%`}
                        AND c."startAt" < b."endAt" AND b."startAt" < c."endAt")
                OR EXISTS (SELECT 1 FROM "StaffTimeOff" o
                      WHERE o."staffId" = b."staffId" AND o.id LIKE ${`${KAVI.prefix}%`}
                        AND o."startAt" < b."endAt" AND b."startAt" < o."endAt"))`,
    );

    // The booking page's list (public-booking-page.ts): shown, active, of
    // this site or none.
    const site = await prisma.site.findFirst({
        where: { organizationId: orgId, currentPublicationId: { not: null } },
        select: { id: true },
    });
    const pageServices = site
        ? await prisma.service.findMany({
              where: {
                  organizationId: orgId,
                  deletedAt: null,
                  status: "ACTIVE",
                  showOnBookingPage: true,
                  OR: [{ siteId: null }, { siteId: site.id }],
              },
              select: {
                  id: true,
                  durationMinutes: true,
                  locationType: true,
                  meetingUrl: true,
                  visits: true,
                  depositMode: true,
              },
          })
        : [];
    const hidden = await prisma.service.count({
        where: {
            organizationId: orgId,
            deletedAt: null,
            status: "ACTIVE",
            showOnBookingPage: false,
        },
    });
    const listed = new Set(pageServices.map((s) => s.id));
    const hiddenListed = await prisma.service.count({
        where: {
            organizationId: orgId,
            showOnBookingPage: false,
            id: { in: Array.from(listed) },
        },
    });

    const perDentist = await prisma.$queryRaw<Row[]>`
        SELECT m.name, COUNT(b.id) AS n FROM "StaffMember" m
        LEFT JOIN "Booking" b ON b."staffId" = m.id AND b.status <> 'CANCELLED'
            AND b."startAt" >= ${weekFrom}::timestamp AND b."startAt" < ${weekTo}::timestamp
        WHERE m."organizationId" = ${orgId} AND m.status = 'ACTIVE'
        GROUP BY m.name ORDER BY m.name`;
    const where = { organizationId: orgId };
    const invoiceStates = await prisma.$queryRaw<Row[]>`
        SELECT CASE
                   WHEN status = 'ISSUED' AND "dueAt" < ${at}::timestamp THEN 'overdue'
                   WHEN status = 'ISSUED' THEN 'due'
                   WHEN source = 'BOOKING' THEN 'paid online'
                   ELSE 'paid at the desk' END AS state,
               COUNT(*) AS n
        FROM "Invoice" WHERE "organizationId" = ${orgId}
        GROUP BY 1 ORDER BY 1`;
    const attention = await prisma.$queryRaw<Row[]>`
        SELECT CASE WHEN status = 'SUGGESTED' THEN lower(source::text) || ' suggestion'
                    WHEN sensitive THEN 'sensitive' ELSE 'shared' END AS state,
               COUNT(*) AS n
        FROM "ContactAttention"
        WHERE "organizationId" = ${orgId} AND "removedAt" IS NULL
        GROUP BY 1 ORDER BY 1`;
    const list = (rows: Row[], key: string) =>
        rows.map((r) => `${n(r.n)} ${String(r[key])}`).join(", ");

    const counts: KaviCounts = {
        gstin: profile?.taxId ?? "",
        services: await prisma.service.count({
            where: { ...where, deletedAt: null },
        }),
        onBookingPage: pageServices.length,
        dentists: await prisma.staffMember.count({
            where: { ...where, status: "ACTIVE", hours: { some: {} } },
        }),
        bookings: await prisma.booking.count({ where }),
        thisWeek: list(perDentist, "name"),
        attended: await prisma.booking.count({
            where: { ...where, outcome: "ATTENDED" },
        }),
        noShows: await prisma.booking.count({
            where: { ...where, outcome: "NO_SHOW" },
        }),
        lateCancels: await prisma.booking.count({
            where: { ...where, status: "CANCELLED", cancelledLate: true },
        }),
        upcoming: await prisma.booking.count({
            where: { ...where, status: "CONFIRMED", startAt: { gt: now } },
        }),
        paidOnline: await prisma.booking.count({
            where: { ...where, paidWith: "PAID" },
        }),
        closures: (
            await prisma.businessClosure.findMany({
                where: { ...where, endAt: { gt: now } },
                select: { reason: true, startAt: true },
                orderBy: { startAt: "asc" },
            })
        )
            .map(
                (c) =>
                    // The Kolkata date the closure starts on.
                    `${c.reason ?? ""} from ${new Date(c.startAt.getTime() + 330 * 60_000).toISOString().slice(0, 10)}`,
            )
            .join(", "),
        invoices: list(invoiceStates, "state"),
        attention: list(attention, "state"),
    };

    const has = async (rows: Promise<Row[]>) => (await one(rows)) >= 1;
    const state = (s: string) => counts.invoices.includes(` ${s}`);
    const missing = Object.entries({
        "a published site": site !== null,
        "five services on the booking page": counts.onBookingPage >= 5,
        "a service hidden from the booking page, and off it":
            hidden >= 1 && hiddenListed === 0,
        "a service shorter than half an hour on the page": pageServices.some(
            (s) => s.durationMinutes < 30,
        ),
        "a service at the clinic or by video, with its link": pageServices.some(
            (s) => s.locationType === "EITHER" && !!s.meetingUrl,
        ),
        "a treatment of three visits with a 50% deposit": pageServices.some(
            (s) => s.visits === 3 && s.depositMode === "PERCENT_50",
        ),
        "a storefront with the clinic's address and hours, nothing listed":
            await has(prisma.$queryRaw<Row[]>`
                SELECT COUNT(*) AS n FROM "Store" st
                JOIN "StoreSettings" ss ON ss."storeId" = st.id
                WHERE st."organizationId" = ${orgId} AND st."deletedAt" IS NULL
                  AND ss.kind = 'SHOP' AND ss.address IS NOT NULL
                  AND jsonb_array_length(ss."openingHours") = 7
                  AND NOT EXISTS (SELECT 1 FROM "ProductListing" l WHERE l."storeId" = st.id)`),
        "a free-cancel window of 24 hours": await has(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "BookingRules"
            WHERE "organizationId" = ${orgId} AND "freeCancelHours" = 24`),
        "two dentists, each with bookings this week":
            counts.dentists >= 2 &&
            perDentist.length >= 2 &&
            perDentist.every((r) => n(r.n) >= 1),
        "a Member on the desk": await has(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Membership"
            WHERE "organizationId" = ${orgId} AND role = 'MEMBER'`),
        "a dentist's day off this week": await has(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "StaffTimeOff"
            WHERE "organizationId" = ${orgId}
              AND "startAt" < ${weekTo}::timestamp AND "endAt" > ${at}::timestamp`),
        "the Diwali closure to come": counts.closures.includes("Diwali"),
        "attended visits": counts.attended >= 1,
        "a no-show": counts.noShows >= 1,
        "a late cancel": counts.lateCancels >= 1,
        "bookings to come": counts.upcoming >= 1,
        "a booking paid online": counts.paidOnline >= 1,
        "bills paid online, paid at the desk, due and overdue": [
            "paid online",
            "paid at the desk",
            "due",
            "overdue",
        ].every(state),
        "a sensitive Needs attention entry":
            counts.attention.includes(" sensitive"),
        "a note from the booking page waiting as a suggestion":
            counts.attention.includes(" booking_page suggestion"),
    }).flatMap(([what, ok]) => (ok ? [] : [what]));
    if (missing.length > 0) failures.push(`missing: ${missing.join("; ")}`);

    if (failures.length > 0) {
        throw new Error(
            `Kavi Dental failed its checks:\n  - ${failures.join("\n  - ")}`,
        );
    }
    return counts;
}

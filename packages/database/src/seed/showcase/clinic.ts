import type { Prisma } from "@prisma/client";

import { PLAN } from "../data";
import type { Db } from "../helpers";
import { writeSite } from "../helpers";
import {
    KAVI,
    KAVI_ADDRESS,
    KAVI_ADDRESS_PRINTED,
    KAVI_DENTISTS,
    KAVI_GST,
    KAVI_GSTIN,
    KAVI_MODULES,
    KAVI_NAME,
    KAVI_OPENING_HOURS,
    KAVI_PHONE_E164,
    KAVI_RULES,
    KAVI_SAC,
    KAVI_SERVICES,
    kaviId,
} from "./clinic-data";
import type { KaviInvoice, KaviWorld } from "./clinic-plan";
import { planKavi, serviceIdOf, staffIdOf } from "./clinic-plan";
import { KAVI_SITE } from "./clinic-site";
import { TIMEZONE } from "./data";
import { istAt, minuteOf } from "./people";

export { checkKavi } from "./clinic-check";
export type { KaviCounts } from "./clinic-check";
export { KAVI } from "./clinic-data";

/**
 * Kavi Dental (E29): the clinic the round-2 booking designs are drawn on — a
 * dental practice on 12th Main, Indiranagar, owned by `demo@saroh.dev`, with
 * two dentists, Divya Kamath on the desk as a Member, and a published site
 * whose booking page lists its services. Healthcare is exempt, so it is
 * GST-registered in Karnataka and every service and invoice line is 0%, SAC
 * 9993 (numbers KD/26-27/0001…).
 *
 * STRUCTURE — the business, its GST standing, team, modules, the one
 * storefront (a SHOP with opening hours and nothing listed, where E9's
 * treatment orders will go), the site, the services, the dentists with what
 * they take and their weekly hours, and the booking rules — is upserted on
 * seeded ids.
 *
 * VOLUME — the Diwali closure, a dentist's day off, the patients and their
 * Needs attention entries, the diary, what was paid online and the desk's
 * bills — is planned by `clinic-plan.ts` from `now` and cleared and written
 * again each run. It is a film set: browser checks on it are read-only, and
 * writes happen on Northwind.
 */

const CURRENCY = "INR";

/** Paise as a Decimal(12,2) string: 120000 → "1200.00". */
const rupees = (paise: number) =>
    `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;

interface Context {
    prisma: Db;
    now: Date;
    demoUserId: string;
    /** Divya, who works the desk: a Member. */
    deskUserId: string;
}

export async function seedClinic(
    ctx: Context,
): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now, demoUserId } = ctx;
    const orgId = KAVI.orgId;
    const createdAt = istAt(now, -150, 10 * 60);

    // --- the business, its GST standing, team, modules and plan
    await prisma.organization.upsert({
        where: { slug: KAVI.slug },
        update: { name: KAVI_NAME },
        create: { id: orgId, name: KAVI_NAME, slug: KAVI.slug, createdAt },
    });
    const profile = {
        legalName: "Kavi Dental Care LLP",
        country: "India",
        taxId: KAVI_GSTIN,
        contactEmail: "desk@kavidental.example.in",
        timezone: TIMEZONE,
        gstRegistered: true,
        gstState: KAVI_GST.state,
        ...KAVI_ADDRESS,
        invoicePrefix: KAVI_GST.prefix,
        // The public phone its site shows (DEC-053): Visit us, the booking
        // page's header and "Or call Kavi Dental" on the sign-in sheet.
        phone: KAVI_PHONE_E164,
    };
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: profile,
        create: { id: kaviId("profile"), organizationId: orgId, ...profile },
    });
    for (const [userId, role, key] of [
        [demoUserId, "OWNER", "demo"],
        [ctx.deskUserId, "MEMBER", "desk"],
    ] as const) {
        await prisma.membership.upsert({
            where: { organizationId_userId: { organizationId: orgId, userId } },
            update: { role },
            create: {
                id: kaviId("membership", key),
                organizationId: orgId,
                userId,
                role,
            },
        });
    }
    for (const moduleKey of KAVI_MODULES) {
        await prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: { organizationId: orgId, moduleKey },
            },
            update: { status: "ENABLED" },
            create: {
                id: kaviId("module", moduleKey.toLowerCase()),
                organizationId: orgId,
                moduleKey,
                status: "ENABLED",
                enabledAt: createdAt,
                enabledByUserId: demoUserId,
            },
        });
        const flagKey = `MODULE_${moduleKey}`;
        await prisma.featureFlagOverride.upsert({
            where: {
                flagKey_organizationId: { flagKey, organizationId: orgId },
            },
            update: { enabled: true },
            create: {
                id: kaviId("flagoverride", moduleKey.toLowerCase()),
                flagKey,
                organizationId: orgId,
                enabled: true,
            },
        });
    }
    const plan = await prisma.plan.findUniqueOrThrow({
        where: { key_version: { key: PLAN.key, version: PLAN.version } },
        select: { id: true },
    });
    await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId: plan.id, status: "ACTIVE" },
        create: {
            id: kaviId("subscription"),
            organizationId: orgId,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodEnd: istAt(now, 30, 9 * 60),
        },
    });
    // Online payment on the booking page (E11 is checked here).
    await prisma.merchantPaymentProvider.upsert({
        where: {
            organizationId_provider: {
                organizationId: orgId,
                provider: "RAZORPAY",
            },
        },
        update: { status: "CONNECTED" },
        create: {
            id: kaviId("payments", "razorpay"),
            organizationId: orgId,
            provider: "RAZORPAY",
            status: "CONNECTED",
            // Placeholders: the seed never fabricates a usable credential.
            encryptedCredentials: "seed-not-a-real-credential",
            credentialsIv: "seed-iv",
            credentialsAuthTag: "seed-tag",
        },
    });
    await writeStorefront(prisma, { orgId, createdAt, demoUserId });

    // Volume first, so nothing below trips over last run's rows.
    await clearVolume(prisma);

    // --- the site, then the services it offers (Service.siteId)
    const siteId = await writeSite(prisma, {
        fixture: KAVI_SITE,
        orgId,
        userId: demoUserId,
        now,
        ids: {
            site: kaviId("site"),
            page: (p) => kaviId("page", p),
            pageVersion: (p) => kaviId("pageversion", p),
            section: (p, n) => kaviId("section", p, n),
            sectionKey: (p, n) => kaviId("sectionkey", p, n),
            form: (p, n) => kaviId("form", p, n),
            publication: kaviId("publication"),
        },
        pipelineId: null,
        serviceId: serviceIdOf,
        footer: {
            format: "text",
            value: "Kavi Dental · 12th Main, Indiranagar, Bengaluru · +91 80 4099 2210",
        },
    });
    for (let i = 0; i < KAVI_SERVICES.length; i++) {
        const s = KAVI_SERVICES[i];
        const data = {
            name: s.name,
            description: s.description,
            durationMinutes: s.minutes,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            capacity: 1,
            priceCents: s.pricePaise,
            currency: CURRENCY,
            gstRate: "0",
            sacCode: KAVI_SAC,
            status: "ACTIVE",
            deletedAt: null,
            locationType: s.locationType,
            meetingUrl: s.meetingUrl,
            visits: s.visits,
            depositMode: s.depositMode,
            showOnBookingPage: s.shown,
            siteId: s.shown ? siteId : null,
        };
        await prisma.service.upsert({
            where: { id: serviceIdOf(i) },
            update: data,
            create: {
                id: serviceIdOf(i),
                organizationId: orgId,
                timezone: TIMEZONE,
                // In fixture order, a minute apart: the booking page lists
                // services by when they were made.
                createdAt: new Date(createdAt.getTime() + i * 60_000),
                ...data,
            },
        });
    }

    // --- the dentists, what each takes, their weeks, and the booking rules
    await writeDentists(prisma, { orgId, createdAt });
    await prisma.bookingRules.upsert({
        where: { organizationId: orgId },
        update: { ...KAVI_RULES },
        create: {
            id: kaviId("bookingrules"),
            organizationId: orgId,
            ...KAVI_RULES,
            createdAt,
        },
    });

    // --- the dated world
    const world = planKavi({
        now,
        orgId,
        ownerUserId: demoUserId,
        deskUserId: ctx.deskUserId,
    });
    await writeWorld(prisma, world);

    return { id: orgId, name: KAVI_NAME, prefix: KAVI.prefix };
}

/** The one storefront: a SHOP with the clinic's address and hours, nothing listed. */
async function writeStorefront(
    prisma: Db,
    a: { orgId: string; createdAt: Date; demoUserId: string },
) {
    await prisma.store.upsert({
        where: { slug: KAVI.storeSlug },
        update: { name: KAVI_NAME, organizationId: a.orgId, deletedAt: null },
        create: {
            id: KAVI.storeId,
            organizationId: a.orgId,
            name: KAVI_NAME,
            slug: KAVI.storeSlug,
            description: "Dental care in Indiranagar.",
            createdAt: a.createdAt,
        },
    });
    await prisma.storeOwner.upsert({
        where: {
            storeId_userId: { storeId: KAVI.storeId, userId: a.demoUserId },
        },
        update: { role: "OWNER" },
        create: {
            id: kaviId("storeowner"),
            storeId: KAVI.storeId,
            userId: a.demoUserId,
            role: "OWNER",
        },
    });
    const settings = {
        currency: CURRENCY,
        timezone: TIMEZONE,
        kind: "SHOP",
        address: "12th Main, Indiranagar, Bengaluru 560038",
        openingHours: KAVI_OPENING_HOURS.map((d) => ({ ...d })),
        collectionEnabled: false,
        taxEnabled: false,
    };
    await prisma.storeSettings.upsert({
        where: { storeId: KAVI.storeId },
        update: settings,
        create: {
            id: kaviId("storesettings"),
            storeId: KAVI.storeId,
            ...settings,
        },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId: KAVI.storeId },
        update: {},
        create: { id: kaviId("storefeatures"), storeId: KAVI.storeId },
    });
}

async function writeDentists(
    prisma: Db,
    a: { orgId: string; createdAt: Date },
) {
    const ids = KAVI_DENTISTS.map(staffIdOf);
    for (let i = 0; i < KAVI_DENTISTS.length; i++) {
        const d = KAVI_DENTISTS[i];
        const data = {
            name: d.name,
            title: d.title,
            status: "ACTIVE",
            archivedAt: null,
        };
        await prisma.staffMember.upsert({
            where: { id: ids[i] },
            update: data,
            create: {
                id: ids[i],
                organizationId: a.orgId,
                ...data,
                createdAt: a.createdAt,
            },
        });
    }
    // What each takes and their weekly hours ARE the fixture: rewritten whole.
    await prisma.staffService.deleteMany({ where: { staffId: { in: ids } } });
    await prisma.staffHours.deleteMany({ where: { staffId: { in: ids } } });
    await prisma.staffService.createMany({
        data: KAVI_DENTISTS.flatMap((d, i) =>
            d.services.map((service) => ({
                id: kaviId("staffservice", d.key, service),
                organizationId: a.orgId,
                staffId: ids[i],
                serviceId: serviceIdOf(service),
                createdAt: a.createdAt,
            })),
        ),
    });
    await prisma.staffHours.createMany({
        data: KAVI_DENTISTS.flatMap((d, i) =>
            d.hours.flatMap((w, k) =>
                w.days.map((dayOfWeek) => ({
                    id: kaviId("staffhours", d.key, k, dayOfWeek),
                    organizationId: a.orgId,
                    staffId: ids[i],
                    dayOfWeek,
                    startMinute: minuteOf(w.from),
                    endMinute: minuteOf(w.to),
                    createdAt: a.createdAt,
                })),
            ),
        ),
    });
}

/**
 * This business's seeded volume, children first. Rows a developer added by
 * hand keep their place (they have no seed id).
 */
async function clearVolume(prisma: Db) {
    const where = { id: { startsWith: KAVI.prefix } };
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.paymentAttempt.deleteMany({ where });
    await prisma.paymentIntent.deleteMany({ where });
    await prisma.contactAttention.deleteMany({
        where: {
            OR: [where, { contactId: { startsWith: KAVI.prefix } }],
        },
    });
    await prisma.bookingEvent.deleteMany({ where });
    await prisma.booking.deleteMany({ where });
    // The treatments' orders (E9), after their visits.
    await prisma.orderItem.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.customerIdentityLink.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
    await prisma.staffTimeOff.deleteMany({ where });
    await prisma.businessClosure.deleteMany({ where });
}

async function writeWorld(prisma: Db, w: KaviWorld) {
    await prisma.businessClosure.createMany({ data: w.closures });
    await prisma.staffTimeOff.createMany({ data: w.timeOff });
    await prisma.contact.createMany({ data: w.contacts });
    await writeOrders(prisma, w.orders);
    await prisma.booking.createMany({ data: w.bookings });
    await prisma.bookingEvent.createMany({ data: w.events });
    await prisma.contactAttention.createMany({ data: w.attention });
    await writeInvoices(prisma, w.invoices, w.sequences);
    await prisma.paymentIntent.createMany({ data: w.intents });
    await prisma.paymentAttempt.createMany({ data: w.attempts });
}

/**
 * The treatments' orders (E9, DEC-050), before the bookings that are their
 * visits: each at the clinic's one storefront, its store customer found by
 * the patient's email and linked to their contact, one line billing the
 * service (no stock). Numbered after any order made here by hand.
 */
async function writeOrders(prisma: Db, orders: KaviWorld["orders"]) {
    const orgId = KAVI.orgId;
    const storeId = KAVI.storeId;
    const taken = new Set(
        // Any of the business's orders (P3, DEC-066: one series).
        (
            await prisma.order.findMany({
                where: { store: { organizationId: orgId } },
                select: { orderId: true },
            })
        ).map((o) => o.orderId),
    );
    let n = 0;
    const nextNumber = () => {
        for (;;) {
            n += 1;
            const number = `ORD-${String(n).padStart(3, "0")}`;
            if (!taken.has(number)) return number;
        }
    };
    for (const o of orders) {
        const svc = KAVI_SERVICES[o.service];
        const price = rupees(svc.pricePaise);
        await prisma.customer.create({
            data: {
                id: o.customerId,
                storeId,
                organizationId: orgId,
                email: o.email,
                firstName: o.first,
                lastName: o.last,
                phone: o.phone,
                createdAt: o.placedAt,
            },
        });
        await prisma.customerIdentityLink.create({
            data: {
                id: o.linkId,
                organizationId: orgId,
                contactId: o.contactId,
                customerId: o.customerId,
                reason: "BOOKING",
                createdAt: o.placedAt,
            },
        });
        await prisma.order.create({
            data: {
                id: o.id,
                storeId,
                organizationId: orgId,
                orderId: nextNumber(),
                customerId: o.customerId,
                currency: CURRENCY,
                subtotal: price,
                // Exempt: 0% inside the price.
                tax: "0.00",
                total: price,
                fulfilment: o.fulfilment,
                paymentStatus: o.paidAt ? "PAID" : "UNPAID",
                paidAt: o.paidAt,
                createdAt: o.placedAt,
                items: {
                    create: {
                        id: o.itemId,
                        serviceId: serviceIdOf(o.service),
                        quantity: 1,
                        price,
                        stockRow: "NONE",
                    },
                },
            },
        });
    }
}

/**
 * The invoices and their lines, every line exempt, and each series' counter
 * at its last number so the API's next follows on. An invoice someone issued
 * by hand here keeps its number; the seed refuses rather than hand the same
 * number out twice.
 */
async function writeInvoices(
    prisma: Db,
    docs: readonly KaviInvoice[],
    sequences: KaviWorld["sequences"],
) {
    const orgId = KAVI.orgId;
    const planned = new Map(sequences.map((s) => [s.series, s.lastNumber]));
    const byHand = await prisma.invoice.findMany({
        where: {
            organizationId: orgId,
            number: { not: null },
            NOT: { id: { startsWith: KAVI.prefix } },
        },
        select: { number: true },
    });
    const handLast = new Map<string, number>();
    for (const { number } of byHand) {
        const m = /^(.*)[/-](\d+)$/.exec(number ?? "");
        if (!m) continue;
        const n = Number(m[2]);
        if (n <= (planned.get(m[1]) ?? 0)) {
            throw new Error(
                `${KAVI_NAME} has an invoice issued by hand (${number}) that holds a number ` +
                    `the showcase needs. Run db:seed:reset, then seed again.`,
            );
        }
        handLast.set(m[1], Math.max(n, handLast.get(m[1]) ?? 0));
    }

    const invoices: Prisma.InvoiceCreateManyInput[] = docs.map((d) => {
        const total = d.lines.reduce((s, l) => s + l.quantity * l.unitPaise, 0);
        return {
            id: d.id,
            organizationId: orgId,
            number: d.number,
            status: d.status,
            kind: "INVOICE",
            bookingId: d.bookingId,
            orderId: d.orderId,
            contactId: d.contactId,
            billToName: d.billToName,
            billToEmail: d.billToEmail,
            sellerGstin: KAVI_GSTIN,
            sellerState: KAVI_GST.state,
            sellerAddress: KAVI_ADDRESS_PRINTED,
            placeOfSupply: KAVI_GST.state,
            taxType: "INTRA",
            cgst: "0.00",
            sgst: "0.00",
            igst: "0.00",
            currency: CURRENCY,
            subtotal: rupees(total),
            tax: "0.00",
            total: rupees(total),
            issuedAt: d.issuedAt,
            dueAt: d.dueAt,
            paidAt: d.paidAt,
            paymentMethod: d.paymentMethod,
            paymentReference: d.paymentReference,
            paymentNote: d.paymentNote,
            source: d.source,
            createdByUserId: d.createdByUserId,
            createdAt: d.createdAt,
            updatedAt: d.paidAt ?? d.issuedAt,
        };
    });
    const lines: Prisma.InvoiceLineCreateManyInput[] = docs.flatMap((d) =>
        d.lines.map((l, position) => {
            const amount = rupees(l.quantity * l.unitPaise);
            return {
                id: `${d.id}_line_${position}`,
                organizationId: orgId,
                invoiceId: d.id,
                position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: rupees(l.unitPaise),
                amount,
                discount: "0.00",
                hsnSac: KAVI_SAC,
                gstRate: "0",
                taxableValue: amount,
                cgst: "0.00",
                sgst: "0.00",
                igst: "0.00",
                orderItemId: l.orderItemId ?? null,
            };
        }),
    );
    await prisma.invoice.createMany({ data: invoices });
    await prisma.invoiceLine.createMany({ data: lines });

    // Each counter written only when it moves, so a re-run inside the same
    // half hour leaves the row (and its updatedAt) as it was.
    const series = Array.from(
        new Set([
            ...Array.from(planned.keys()),
            ...Array.from(handLast.keys()),
        ]),
    ).sort();
    await prisma.invoiceSequence.deleteMany({
        where: { organizationId: orgId, series: { notIn: series } },
    });
    const current = new Map(
        (
            await prisma.invoiceSequence.findMany({
                where: { organizationId: orgId },
                select: { series: true, lastNumber: true },
            })
        ).map((s) => [s.series, s.lastNumber]),
    );
    for (const s of series) {
        const lastNumber = Math.max(planned.get(s) ?? 0, handLast.get(s) ?? 0);
        if (current.get(s) === lastNumber) continue;
        await prisma.invoiceSequence.upsert({
            where: {
                organizationId_series: { organizationId: orgId, series: s },
            },
            update: { lastNumber },
            create: { organizationId: orgId, series: s, lastNumber },
        });
    }
}

import type { Prisma } from "@prisma/client";

import { backfillInvoicePayments } from "../../backfill/invoice-payments";
import { assertDatabaseTarget } from "../../database-target";
import { alignOrderNumberSequence } from "../../order-number";
import { OWNER_EMAIL } from "../data";
import type { Db } from "../helpers";
import {
    balanceStockLog,
    listProductAt,
    setStockLevel,
    syncStorefrontFulfilmentTypes,
    writeSite,
} from "../helpers";
import { seedPlanId } from "../pricing";
import { deleteSeeded } from "../run";
import { upsertPipeline } from "../showcase/crm";
import type { Rng } from "../showcase/random";
import { createRng } from "../showcase/random";
import { writeTraffic } from "../showcase/traffic";
import type {
    GlobalBusiness,
    GlobalManualInvoice,
    GlobalService,
} from "./data";
import {
    FIRST_NAMES,
    GLOBAL_BUSINESSES,
    LAST_NAMES,
    ONLINE_BOOKINGS_A_MONTH,
    ORDERS_A_MONTH,
} from "./data";
import { morningZone } from "./morning-zone";

/**
 * Lay the Global demo businesses over the base seed (global edition plan,
 * U11): `pnpm --filter @saroh/database db:seed:global`. The Indian showcase
 * stays untouched; these rows are `seed_gl_<key>_…`, removed and written
 * again whole each run, and the business's edition, currency and zone are set
 * as Global's setup sets them. Nothing here queues a job or connects a provider.
 *
 * Dates are relative to now on each business's own clock, so re-seed before a
 * capture for "today" to look like today.
 */

const PREFIX = "seed_gl_";
/** Free's `orders` and `bookings` rows in dev's catalogue. */
const FREE_MONTHLY_CAP = 20;
const DAY = 86_400_000;
const money = (cents: number) => (cents / 100).toFixed(2);

/** Minutes past local midnight, on the local day `dayOffset` from today. */
function zonedAt(
    now: Date,
    zone: string,
    dayOffset: number,
    minute: number,
): Date {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const part = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const naive = Date.UTC(
        part("year"),
        part("month") - 1,
        part("day") + dayOffset,
        0,
        minute,
    );
    return new Date(naive - offsetMs(new Date(naive), zone));
}

function offsetMs(at: Date, zone: string): number {
    const local = new Date(at.toLocaleString("en-US", { timeZone: zone }));
    const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
    return local.getTime() - utc.getTime();
}

function weekdayOf(now: Date, zone: string, dayOffset: number): number {
    const noon = zonedAt(now, zone, dayOffset, 720);
    const name = noon.toLocaleDateString("en-US", {
        timeZone: zone,
        weekday: "short",
    });
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** "2026-11": the calendar month a moment falls in, where the business is. */
const monthOf = (at: Date, zone: string) =>
    at.toLocaleDateString("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
    });

const minuteOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};

interface Person {
    contactId: string;
    customerId: string;
    name: string;
    first: string;
    last: string;
    email: string;
    phone: string;
    createdAt: Date;
}

interface Doc {
    id: string;
    status: "DRAFT" | "ISSUED" | "PAID";
    source: "BOOKING" | "MANUAL" | "ORDER";
    bookingId?: string;
    orderId?: string;
    contactId?: string;
    billToName: string;
    billToEmail: string | null;
    issuedAt: Date;
    dueAt: Date | null;
    paidAt: Date | null;
    paymentMethod: string | null;
    taxLabel?: string;
    taxBps?: number;
    lines: {
        description: string;
        quantity: number;
        unit: number;
        orderItemId?: string;
    }[];
}

export async function seedGlobal(clock: Date = new Date()): Promise<void> {
    const target = assertDatabaseTarget();
    console.log(`[global] target: ${target.database} on ${target.host}`);
    const { prisma } = await import("../../client");
    const now = new Date(Math.floor(clock.getTime() / 1_800_000) * 1_800_000);
    console.log(
        `[global] zone (SHOTS_ZONE for the capture): ${morningZone(now)}`,
    );
    const demo = await prisma.user.findUniqueOrThrow({
        where: { email: OWNER_EMAIL },
        select: { id: true },
    });
    await deleteSeeded(prisma, PREFIX);
    await prisma.stockEntry.deleteMany({
        where: { organization: { id: { startsWith: PREFIX } } },
    });
    for (const fixture of GLOBAL_BUSINESSES) {
        const biz = { ...fixture, zone: morningZone(now) };
        await seedOne(prisma, biz, now, demo.id);
    }
    const ids = GLOBAL_BUSINESSES.map((b) => `${PREFIX}${b.key}_org`);
    await syncStorefrontFulfilmentTypes(prisma, ids);
    for (const orgId of ids) {
        await balanceStockLog(prisma, { organizationId: orgId, at: now });
        await alignOrderNumberSequence(prisma, orgId);
    }
    const ledger = await backfillInvoicePayments(prisma, {
        organizationIds: ids,
    });
    if (ledger.skipped.length > 0) {
        throw new Error("[global] paid invoices the ledger can't hold");
    }
    await checkGlobal(prisma, ids);
    console.log("[global] done.");
}

async function seedOne(
    prisma: Db,
    biz: GlobalBusiness,
    now: Date,
    demoUserId: string,
) {
    const sid = (...parts: (string | number)[]) =>
        [`${PREFIX}${biz.key}`, ...parts].join("_");
    const orgId = sid("org");
    const rng = (concern: string) => createRng(hash(`${biz.key}/${concern}`));
    const at = (day: number, minute: number) =>
        zonedAt(now, biz.zone, day, minute);
    const createdAt = at(-200, 600);

    await prisma.organization.create({
        data: {
            id: orgId,
            name: biz.name,
            slug: biz.slug,
            edition: "GLOBAL",
            currency: biz.currency,
            createdAt,
        },
    });
    await prisma.businessProfile.create({
        data: {
            id: sid("profile"),
            organizationId: orgId,
            legalName: biz.legalName,
            country: biz.country,
            contactEmail: biz.contactEmail,
            timezone: biz.zone,
            gstRegistered: false,
            yearStartMonth: 1,
            taxName: biz.taxName,
            taxRate: biz.taxRate,
            taxId: biz.taxId,
            addressLine1: biz.addressLine1,
            city: biz.state ? `${biz.city}, ${biz.state}` : biz.city,
            postalCode: biz.postalCode,
            phone: biz.phone(0),
            invoiceStyle: biz.invoiceStyle,
            invoiceColour: biz.invoiceColour,
            payNote:
                "Pay by card at the desk, or by bank transfer: ask us for details.",
        },
    });
    const membership = await prisma.membership.create({
        data: {
            id: sid("membership", "demo"),
            organizationId: orgId,
            userId: demoUserId,
            role: "OWNER",
        },
    });
    for (const moduleKey of biz.modules) {
        await prisma.organizationModule.create({
            data: {
                id: sid("module", moduleKey.toLowerCase()),
                organizationId: orgId,
                moduleKey,
                status: "ENABLED",
                enabledAt: createdAt,
                enabledByUserId: demoUserId,
            },
        });
        await prisma.featureFlagOverride.create({
            data: {
                id: sid("flagoverride", moduleKey.toLowerCase()),
                flagKey: `MODULE_${moduleKey}`,
                organizationId: orgId,
                enabled: true,
            },
        });
    }
    // Free's limits and locks apply here, as they would on Global.
    await prisma.featureFlagOverride.create({
        data: {
            id: sid("flagoverride", "plan-enforcement"),
            flagKey: "PLAN_ENFORCEMENT",
            organizationId: orgId,
            enabled: true,
        },
    });
    // Free: the only plan a Global business can be on today.
    await prisma.subscription.create({
        data: {
            id: sid("subscription"),
            organizationId: orgId,
            // The wall clock: `now` is rounded down, to before a catalogue just imported.
            planId: await seedPlanId(prisma, new Date(), "free"),
            status: "ACTIVE",
            currentPeriodEnd: at(30, 540),
        },
    });

    // --- storefronts
    const storeIds = biz.stores.map((s) => sid("store", s.key));
    for (let i = 0; i < biz.stores.length; i++) {
        const s = biz.stores[i];
        await prisma.store.create({
            data: {
                id: storeIds[i],
                organizationId: orgId,
                name: s.name,
                createdAt,
            },
        });
        await prisma.storeOwner.create({
            data: {
                id: sid("storeowner", s.key),
                storeId: storeIds[i],
                userId: demoUserId,
                role: "OWNER",
            },
        });
        await prisma.storeSettings.create({
            data: {
                id: sid("storesettings", s.key),
                storeId: storeIds[i],
                currency: biz.currency,
                timezone: biz.zone,
                kind: s.kind ?? "SHOP",
                address: `${biz.addressLine1}, ${biz.city}${biz.state ? `, ${biz.state}` : ""} ${biz.postalCode}`,
                openingHours: biz.hours.map((h) => ({ ...h })),
                collectionEnabled: true,
                shippingEnabled: false,
                taxEnabled: false,
            },
        });
        await prisma.storeFeatures.create({
            data: {
                id: sid("storefeatures", s.key),
                storeId: storeIds[i],
                ecommerceEnabled: false,
                blogsEnabled: false,
            },
        });
    }

    // --- the site, then what it offers
    const shownServices = biz.services.filter((s) => !s.hidden);
    const siteId = await writeSite(prisma, {
        fixture: {
            slug: biz.slug,
            name: biz.name,
            subdomain: biz.slug,
            published: true,
            createdDaysAgo: 150,
            pages: [
                {
                    path: "/",
                    title: "Home",
                    isHome: true,
                    sections: [
                        {
                            type: "hero",
                            content: {
                                heading: biz.site.heading,
                                subheading: biz.site.text,
                                cta: { ...biz.site.cta, style: "primary" },
                                onToday: shownServices.length > 0,
                            },
                        },
                        ...(shownServices.length
                            ? [
                                  {
                                      type: "servicesList" as const,
                                      services: shownServices.map((s) =>
                                          biz.services.indexOf(s),
                                      ),
                                      content: {
                                          heading: biz.site.servicesHeading,
                                          showPrices: true,
                                      },
                                  },
                              ]
                            : []),
                        {
                            type: "features",
                            content: {
                                ...biz.site.features,
                                items: [...biz.site.features.items],
                            },
                        },
                    ],
                },
                {
                    path: "/visit",
                    title: "Visit us",
                    sections: [
                        {
                            type: "enquiry",
                            form: {
                                name: "Ask us",
                                fields: [
                                    {
                                        name: "name",
                                        label: "Your name",
                                        type: "text",
                                        required: true,
                                    },
                                    {
                                        name: "email",
                                        label: "Email",
                                        type: "email",
                                        required: true,
                                    },
                                    {
                                        name: "message",
                                        label: "Your message",
                                        type: "textarea",
                                        required: true,
                                    },
                                ],
                            },
                            content: {
                                title: "Ask us anything",
                                description: "We reply within a day.",
                                submitLabel: "Send",
                                successMessage: "Thanks. We'll reply soon.",
                            },
                        },
                        {
                            type: "richText",
                            content: { format: "html", value: biz.site.visit },
                        },
                    ],
                },
            ],
        },
        orgId,
        userId: demoUserId,
        now,
        ids: {
            site: sid("site"),
            page: (p) => sid("page", p),
            pageVersion: (p) => sid("pageversion", p),
            section: (p, n) => sid("section", p, n),
            sectionKey: (p, n) => sid("sectionkey", p, n),
            form: (p, n) => sid("form", p, n),
            publication: sid("publication"),
        },
        pipelineId: null,
        serviceId: (i) => sid("service", biz.services[i].key),
        footer: { format: "text", value: biz.site.footer },
    });
    for (let i = 0; i < biz.services.length; i++) {
        const s = biz.services[i];
        await prisma.service.create({
            data: {
                id: sid("service", s.key),
                organizationId: orgId,
                name: s.name,
                description: s.description,
                durationMinutes: s.minutes,
                capacity: s.capacity,
                priceCents: s.price,
                currency: biz.currency,
                timezone: biz.zone,
                status: "ACTIVE",
                locationType: s.locationType ?? "IN_PERSON",
                meetingUrl: s.meetingUrl ?? null,
                visits: s.visits ?? 1,
                depositMode: "NONE",
                showOnBookingPage: !s.hidden,
                siteId: s.hidden ? null : siteId,
                createdAt: new Date(createdAt.getTime() + i * 60_000),
            },
        });
        for (const [k, c] of Array.from((s.classAt ?? []).entries())) {
            await prisma.availabilityRule.createMany({
                data: c.days.map((dayOfWeek) => ({
                    id: sid("rule", s.key, k, dayOfWeek),
                    organizationId: orgId,
                    serviceId: sid("service", s.key),
                    dayOfWeek,
                    startMinute: minuteOf(c.at),
                    endMinute: minuteOf(c.at) + s.minutes,
                    createdAt,
                    updatedAt: createdAt,
                })),
            });
        }
    }

    // A service books inside its own weekly hours: its people's, together.
    for (const service of biz.services) {
        if (service.classAt) continue;
        const windows = biz.staff
            .filter((t) => t.services.includes(service.key))
            .flatMap((t) => t.hours);
        const days = Array.from(new Set(windows.flatMap((w) => [...w.days])));
        await prisma.availabilityRule.createMany({
            data: days.map((dayOfWeek) => {
                const open = windows.filter((w) => w.days.includes(dayOfWeek));
                return {
                    id: sid("rule", service.key, dayOfWeek),
                    organizationId: orgId,
                    serviceId: sid("service", service.key),
                    dayOfWeek,
                    startMinute: Math.min(...open.map((w) => minuteOf(w.from))),
                    endMinute: Math.max(...open.map((w) => minuteOf(w.to))),
                    createdAt,
                    updatedAt: createdAt,
                };
            }),
        });
    }

    // --- who is on the diary
    for (const s of biz.staff) {
        await prisma.staffMember.create({
            data: {
                id: sid("staff", s.key),
                organizationId: orgId,
                name: s.name,
                title: s.title,
                status: "ACTIVE",
                membershipId: s.owner ? membership.id : null,
                createdAt,
            },
        });
        await prisma.staffService.createMany({
            data: s.services.map((k) => ({
                id: sid("staffservice", s.key, k),
                organizationId: orgId,
                staffId: sid("staff", s.key),
                serviceId: sid("service", k),
                createdAt,
            })),
        });
        await prisma.staffHours.createMany({
            data: s.hours.flatMap((w, k) =>
                w.days.map((dayOfWeek) => ({
                    id: sid("staffhours", s.key, k, dayOfWeek),
                    organizationId: orgId,
                    staffId: sid("staff", s.key),
                    dayOfWeek,
                    startMinute: minuteOf(w.from),
                    endMinute: minuteOf(w.to),
                    createdAt,
                })),
            ),
        });
    }
    await prisma.bookingRules.create({
        data: {
            id: sid("bookingrules"),
            organizationId: orgId,
            ...biz.rules,
            createdAt,
        },
    });

    // --- people
    const people = makePeople(biz, rng("people"), sid, at);
    const regularOf = new Map(biz.regulars.map((r, i) => [r.key, people[i]]));
    await prisma.contact.createMany({
        data: people.map((p, i) => ({
            id: p.contactId,
            organizationId: orgId,
            email: p.email,
            firstName: p.first,
            lastName: p.last,
            phone: p.phone,
            source: i % 3 === 0 ? "WEBSITE" : "WALK_IN",
            createdAt: p.createdAt,
            updatedAt: p.createdAt,
        })),
    });
    const attention: Prisma.ContactAttentionCreateManyInput[] = [];
    const notes: Prisma.ContactNoteCreateManyInput[] = [];
    biz.regulars.forEach((r, i) => {
        r.attention?.forEach((a, k) =>
            attention.push({
                id: sid("attention", r.key, k),
                organizationId: orgId,
                contactId: people[i].contactId,
                kind: a.kind,
                label: a.label,
                detail: a.detail,
                sensitive: a.sensitive,
                source: "STAFF",
                status: "ACTIVE",
                createdByUserId: demoUserId,
                createdAt: at(-40, 600),
                updatedAt: at(-40, 600),
            }),
        );
        r.notes?.forEach((body, k) =>
            notes.push({
                id: sid("note", r.key, k),
                organizationId: orgId,
                contactId: people[i].contactId,
                body,
                createdByUserId: demoUserId,
                createdAt: at(-40, 610),
                updatedAt: at(-40, 610),
            }),
        );
    });

    // The pipeline, so its module is ready and Home doesn't ask for a first lead.
    const stageNames = ["New", "Talking", "Won"];
    const stages = await upsertPipeline(prisma, {
        orgId,
        pipelineId: sid("pipeline"),
        stageId: (i) => sid("stage", i),
        name: "Enquiries",
        stages: stageNames,
    });
    await prisma.lead.createMany({
        data: stageNames.map((stage, i) => ({
            id: sid("lead", i),
            organizationId: orgId,
            contactId: people[people.length - 1 - i].contactId,
            pipelineId: sid("pipeline"),
            stageId: stages[i],
            title: `${people[people.length - 1 - i].name}: ${stage === "Won" ? "regular order" : "first visit"}`,
            status: stage === "Won" ? "WON" : "OPEN",
            createdAt: at(-20 + i * 5, 600),
            updatedAt: at(-20 + i * 5, 600),
        })),
    });

    const docs: Doc[] = [];

    // --- catalogue and orders
    if (biz.products.length) {
        const placed = await writeCatalogue(
            prisma,
            biz,
            sid,
            storeIds,
            orgId,
            at,
        );
        await writeOrders(prisma, biz, sid, {
            orgId,
            storeIds,
            people,
            placed,
            docs,
            now,
            at,
            rng: rng("orders"),
            regularOf,
        });
    }

    // --- the diary
    const bookings: (Prisma.BookingCreateManyInput & { id: string })[] = [];
    const events: Prisma.BookingEventCreateManyInput[] = [];
    // One person: what's booked already, so nothing lands on top of it.
    const busy: [number, number][] = [];
    const onlineByMonth = new Map<string, number>();
    const free = (startAt: Date, minutes: number) => {
        const from = startAt.getTime();
        const to = from + minutes * 60_000;
        return busy.every(([s, e]) => to <= s || from >= e);
    };
    const book = (b: {
        id: string;
        service: GlobalService;
        person: Person;
        startAt: Date;
        staffKey: string | null;
        orderId?: string;
        visitNumber?: number;
        intakeNote?: string;
        courseEnrollmentId?: string;
        status?: "CONFIRMED" | "CANCELLED";
        roll: number;
    }) => {
        const endAt = new Date(
            b.startAt.getTime() + b.service.minutes * 60_000,
        );
        busy.push([b.startAt.getTime(), endAt.getTime()]);
        const past = endAt < now;
        const cancelled = b.status === "CANCELLED";
        const hoursAgo = (now.getTime() - endAt.getTime()) / 3_600_000;
        const outcome =
            !past || cancelled
                ? null
                : hoursAgo < 12 && b.roll < 0.5
                  ? null
                  : b.roll < 0.92
                    ? "ATTENDED"
                    : "NO_SHOW";
        const madeAt = new Date(
            Math.min(
                b.startAt.getTime() - (1 + b.roll * 9) * DAY,
                now.getTime() - (0.6 + b.roll * 12) * DAY,
            ),
        );
        // Some made on the site, up to its month's share; the rest at the desk.
        const madeIn = monthOf(madeAt, biz.zone);
        const made = onlineByMonth.get(madeIn) ?? 0;
        const bookedOnline =
            !cancelled &&
            !b.courseEnrollmentId &&
            b.roll < 0.4 &&
            made < ONLINE_BOOKINGS_A_MONTH;
        if (bookedOnline) onlineByMonth.set(madeIn, made + 1);
        bookings.push({
            id: b.id,
            organizationId: orgId,
            serviceId: sid("service", b.service.key),
            contactId: b.person.contactId,
            startAt: b.startAt,
            endAt,
            timezone: biz.zone,
            status: cancelled ? "CANCELLED" : "CONFIRMED",
            outcome,
            cancelledAt: cancelled
                ? new Date(Math.min(b.startAt.getTime() - DAY, now.getTime()))
                : null,
            bookerName: b.person.name,
            bookerEmail: b.person.email,
            bookerPhone: b.person.phone,
            staffId: b.staffKey ? sid("staff", b.staffKey) : null,
            bookedOnline,
            paidWith: b.service.price ? "DESK" : null,
            orderId: b.orderId,
            visitNumber: b.visitNumber,
            intakeNote: b.intakeNote,
            courseEnrollmentId: b.courseEnrollmentId,
            snapshot: {
                service: {
                    id: sid("service", b.service.key),
                    name: b.service.name,
                    durationMinutes: b.service.minutes,
                    bufferBeforeMinutes: 0,
                    bufferAfterMinutes: 0,
                    capacity: b.service.capacity,
                    timezone: biz.zone,
                    priceCents: b.service.price,
                    currency: biz.currency,
                    locationType: b.service.locationType ?? "IN_PERSON",
                    meetingUrl: b.service.meetingUrl ?? null,
                },
                slot: {
                    startAt: b.startAt.toISOString(),
                    endAt: endAt.toISOString(),
                },
                booker: {
                    name: b.person.name,
                    email: b.person.email,
                    phone: b.person.phone,
                },
            },
            createdAt: madeAt,
            updatedAt: madeAt,
        });
        events.push({
            id: `${b.id}_e_booked`,
            bookingId: b.id,
            organizationId: orgId,
            type: "BOOKED",
            toStartAt: b.startAt,
            createdAt: madeAt,
        });
        if (outcome) {
            events.push({
                id: `${b.id}_e_outcome`,
                bookingId: b.id,
                organizationId: orgId,
                type: outcome,
                actorUserId: demoUserId,
                fromStartAt: b.startAt,
                createdAt: new Date(
                    Math.min(endAt.getTime() + 45 * 60_000, now.getTime()),
                ),
            });
        }
        return { outcome, endAt, cancelled };
    };

    // Courses, before the rows that point at them. Each session is a booking,
    // and with Payments off the enrolment issues no invoice, as the API's does.
    const enrolments: Prisma.CourseEnrollmentCreateManyInput[] = [];
    const sessions: Prisma.CourseSessionCreateManyInput[] = [];
    const courseRows: Prisma.CourseCreateManyInput[] = [];
    (biz.courses ?? []).forEach((c, ci) => {
        const service = biz.services.find((s) => s.key === c.service);
        if (!service) throw new Error(`${biz.name}: no service ${c.service}`);
        const courseId = sid("course", ci);
        // The gym is shut on Sundays: the course runs on the Monday instead.
        const firstDay =
            c.startsInDays +
            (weekdayOf(now, biz.zone, c.startsInDays) === 0 ? 1 : 0);
        const opened = at(firstDay - 21, 600);
        courseRows.push({
            id: courseId,
            organizationId: orgId,
            serviceId: sid("service", c.service),
            name: c.name,
            description: c.description,
            price: money(c.price),
            currency: biz.currency,
            seats: c.seats,
            status: "OPEN",
            createdAt: opened,
            updatedAt: opened,
        });
        const starts = Array.from({ length: c.sessions }, (_, k) =>
            at(firstDay + k * 7, minuteOf(c.at)),
        );
        starts.forEach((startAt, si) =>
            sessions.push({
                id: sid("coursesession", ci, si),
                organizationId: orgId,
                courseId,
                startAt,
                endAt: new Date(startAt.getTime() + service.minutes * 60_000),
                createdAt: opened,
            }),
        );
        for (let e = 0; e < c.enrolled; e++) {
            const person = people[e];
            const joined = at(firstDay - 14 + e, 700);
            const enrollmentId = sid("enrollment", ci, e);
            enrolments.push({
                id: enrollmentId,
                organizationId: orgId,
                courseId,
                contactId: person.contactId,
                status: "ACTIVE",
                price: money(c.price),
                currency: biz.currency,
                createdByUserId: demoUserId,
                createdAt: joined,
                updatedAt: joined,
            });
            starts.forEach((startAt, si) =>
                book({
                    id: sid("coursebooking", ci, e, si),
                    service,
                    person,
                    startAt,
                    staffKey: biz.staff[0].key,
                    courseEnrollmentId: enrollmentId,
                    roll: ((e * 7 + si * 3) % 10) / 13,
                }),
            );
        }
    });
    if (courseRows.length) {
        await prisma.course.createMany({ data: courseRows });
        await prisma.courseSession.createMany({ data: sessions });
        await prisma.courseEnrollment.createMany({ data: enrolments });
    }

    // Treatments sold as orders (E9): a root canal part-way through its visits.
    const treatments =
        biz.key === "clinic"
            ? planTreatments(biz, sid, {
                  regularOf,
                  at,
                  now,
                  orgId,
                  storeId: storeIds[0],
                  docs,
                  book,
              })
            : [];
    for (const t of treatments) {
        await prisma.customer.create({ data: t.customer });
        await prisma.customerIdentityLink.create({ data: t.link });
        await prisma.order.create({ data: t.order });
    }

    if (biz.services.length) {
        planDiary(biz, sid, {
            people,
            regularOf,
            book,
            free,
            docs,
            now,
            at,
            rng: rng("diary"),
        });
    }

    for (let k = 0; k < bookings.length; k += 1000) {
        await prisma.booking.createMany({ data: bookings.slice(k, k + 1000) });
    }
    for (let k = 0; k < events.length; k += 1000) {
        await prisma.bookingEvent.createMany({
            data: events.slice(k, k + 1000),
        });
    }
    if (attention.length) {
        await prisma.contactAttention.createMany({ data: attention });
    }
    if (notes.length) await prisma.contactNote.createMany({ data: notes });

    // A note from the booking page, on the regular's next visit.
    for (const r of biz.regulars) {
        if (!r.bookingNote) continue;
        const person = regularOf.get(r.key);
        const next = bookings
            .filter(
                (b) =>
                    b.contactId === person?.contactId &&
                    (b.startAt as Date) > now &&
                    b.status === "CONFIRMED",
            )
            .sort(
                (a, b) =>
                    (a.startAt as Date).getTime() -
                    (b.startAt as Date).getTime(),
            )
            .at(0);
        if (!next || !person)
            throw new Error(`${r.key}: no visit to hang a note on`);
        await prisma.contactAttention.create({
            data: {
                id: sid("attention", r.key, "note"),
                organizationId: orgId,
                contactId: person.contactId,
                kind: "MEDICAL",
                label: r.bookingNote.label,
                detail: r.bookingNote.detail,
                sensitive: true,
                source: "BOOKING_PAGE",
                status: "SUGGESTED",
                bookingId: next.id,
                createdAt: next.createdAt as Date,
                updatedAt: next.createdAt as Date,
            },
        });
    }

    // A trade customer in the contacts, as an invoice to them leaves one.
    const billed = new Map<string, string>();
    for (const m of biz.manualInvoices) {
        if (billed.has(m.email)) continue;
        const own = people.find((p) => p.email === m.email);
        if (own) {
            billed.set(m.email, own.contactId);
            continue;
        }
        const contactId = sid("contact", "trade", m.key);
        billed.set(m.email, contactId);
        await prisma.contact.create({
            data: {
                id: contactId,
                organizationId: orgId,
                email: m.email,
                company: m.billTo,
                firstName: m.billTo,
                source: "WALK_IN",
                createdAt: at(-m.daysAgo - 10, 600),
                updatedAt: at(-m.daysAgo - 10, 600),
            },
        });
    }
    for (const m of biz.manualInvoices) {
        docs.push({
            ...manualDoc(biz, sid, m, at),
            contactId: billed.get(m.email),
        });
    }
    await writeInvoices(prisma, biz, sid, orgId, docs);

    // Enquiries from the site's form, what Insights counts.
    const enquiryRng = rng("enquiries");
    await prisma.submission.createMany({
        data: Array.from({ length: 24 }, (_, i) => {
            const person = people[enquiryRng.int(0, people.length - 1)];
            return {
                id: sid("submission", i),
                organizationId: orgId,
                formId: sid("form", 1, 0),
                contactId: person.contactId,
                data: {
                    name: person.name,
                    email: person.email,
                    message: "Do you have anything free this week?",
                },
                createdAt: at(
                    -enquiryRng.int(1, 45),
                    600 + enquiryRng.int(0, 400),
                ),
            };
        }),
    });

    await writeTraffic(prisma, {
        orgId,
        now,
        kind: "bakery",
        paths: [
            { path: "/", weight: biz.services.length ? 0.4 : 0.7 },
            { path: "/visit", weight: 0.3 },
            ...(biz.services.length ? [{ path: "/book", weight: 0.3 }] : []),
        ],
        trendBase: 110,
        trendSlope: 0.5,
        weekendFactor: 0.8,
        idFor: (iso, key) => sid("agg", iso, key),
        idPrefix: sid("agg", ""),
        noiseOffset: hash(biz.key) % 97,
    });

    console.log(
        `[global] ${biz.name}: ${people.length} people, ${bookings.length} bookings, ${docs.length} invoices`,
    );
}

function hash(key: string): number {
    let h = 2166136261;
    for (const ch of key) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** "+1 202 555 0101", as a person types it; the business's own stays E.164. */
const written = (e164: string) =>
    e164.startsWith("+44")
        ? `+44 ${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`
        : `+1 ${e164.slice(2, 5)} ${e164.slice(5, 8)} ${e164.slice(8)}`;

function makePeople(
    biz: GlobalBusiness,
    rng: Rng,
    sid: (...parts: (string | number)[]) => string,
    at: (day: number, minute: number) => Date,
): Person[] {
    const used = new Set<string>();
    const person = (
        first: string,
        last: string,
        key: string,
        n: number,
    ): Person => {
        const local = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
        let email = `${local}@example.com`;
        for (let i = 2; used.has(email); i++)
            email = `${local}${i}@example.com`;
        used.add(email);
        return {
            contactId: sid("contact", key),
            customerId: sid("customer", key),
            name: `${first} ${last}`,
            first,
            last,
            email,
            phone: written(biz.phone(n + 1)),
            createdAt: at(-rng.int(40, 190), 600),
        };
    };
    const out = biz.regulars.map((r, i) => ({
        ...person(r.first, r.last, r.key, i),
        createdAt: at(-195, 600),
    }));
    for (let i = 0; i < biz.people; i++) {
        out.push(
            person(
                rng.pick(FIRST_NAMES),
                rng.pick(LAST_NAMES),
                String(i),
                biz.regulars.length + i,
            ),
        );
    }
    return out;
}

/** Stock and photos for each product, at each location. */
async function writeCatalogue(
    prisma: Db,
    biz: GlobalBusiness,
    sid: (...parts: (string | number)[]) => string,
    storeIds: readonly string[],
    orgId: string,
    at: (day: number, minute: number) => Date,
) {
    for (const c of biz.categories) {
        await prisma.category.create({
            data: {
                id: sid("category", c.key),
                organizationId: orgId,
                name: c.name,
                slug: c.key,
            },
        });
    }
    const valueId = new Map<string, string>();
    for (const [i, o] of Array.from(biz.options.entries())) {
        await prisma.productOption.create({
            data: {
                id: sid("option", o.key),
                organizationId: orgId,
                name: o.name,
                position: i,
            },
        });
        for (const [j, value] of Array.from(o.values.entries())) {
            await prisma.productOptionValue.create({
                data: {
                    id: sid("optionvalue", o.key, j),
                    optionId: sid("option", o.key),
                    organizationId: orgId,
                    value,
                    position: j,
                },
            });
            valueId.set(`${o.key}:${value}`, sid("optionvalue", o.key, j));
        }
    }
    const placed: {
        productId: string;
        name: string;
        price: number;
        weight: number;
        shelves: {
            variantId: string | null;
            title: string | null;
            price: number;
            levels: (string | undefined)[];
            onHand: readonly number[];
        }[];
    }[] = [];
    for (const [i, p] of Array.from(biz.products.entries())) {
        const productId = sid("product", i);
        await prisma.product.create({
            data: {
                id: productId,
                storeId: storeIds[0],
                organizationId: orgId,
                slug: p.slug,
                name: p.name,
                description: `<p>${p.description}</p>`,
                price: p.price,
                mrp: p.was ?? null,
                currency: biz.currency,
                status: "PUBLISHED",
                categoryId: sid("category", p.category),
                optionId: p.option ? sid("option", p.option) : null,
                image: p.photos?.[0]?.url ?? null,
                createdAt: at(-140 + i * 2, 660),
            },
        });
        if (p.photos?.length) {
            await prisma.productImage.createMany({
                data: p.photos.map((img, k) => ({
                    id: sid("image", i, k),
                    productId,
                    organizationId: orgId,
                    url: img.url,
                    alt: img.alt,
                    width: img.width,
                    height: img.height,
                    position: k,
                    creditName: img.creditName,
                    creditUrl: img.creditUrl,
                })),
            });
        }
        const shelves: (typeof placed)[number]["shelves"] = [];
        if (p.variants?.length) {
            for (const [j, v] of Array.from(p.variants.entries())) {
                await prisma.productVariant.create({
                    data: {
                        id: sid("variant", i, j),
                        productId,
                        sku: v.sku,
                        title: v.title,
                        price: v.price,
                        position: j,
                        optionValueId: p.option
                            ? (valueId.get(`${p.option}:${v.title}`) ?? null)
                            : null,
                    },
                });
                shelves.push({
                    variantId: sid("variant", i, j),
                    title: v.title,
                    price: Math.round(Number(v.price) * 100),
                    levels: [],
                    onHand: v.stock,
                });
            }
        } else {
            shelves.push({
                variantId: null,
                title: null,
                price: Math.round(Number(p.price) * 100),
                levels: [],
                onHand: p.stock ?? [],
            });
        }
        for (const [s, storeId] of Array.from(storeIds.entries())) {
            const onThisStore =
                shelves.some((sh) => (sh.onHand[s] ?? 0) > 0) || s === 0;
            if (!onThisStore) continue;
            await listProductAt(prisma, {
                id: sid("listing", i, s),
                orgId,
                storeId,
                productId,
                variants: shelves.flatMap((sh, j) =>
                    sh.variantId
                        ? [
                              {
                                  id: sid("listingvariant", i, s, j),
                                  variantId: sh.variantId,
                              },
                          ]
                        : [],
                ),
            });
            for (const [j, sh] of Array.from(shelves.entries())) {
                if (sh.onHand.length === 0) continue;
                sh.levels[s] = await setStockLevel(prisma, {
                    id: sid("stocklevel", i, s, j),
                    orgId,
                    storeId,
                    productId,
                    variantId: sh.variantId,
                    onHand: sh.onHand[s] ?? 0,
                    promised: 0,
                    lowStockAlert: p.warnAt ?? 3,
                });
            }
        }
        placed.push({
            productId,
            name: p.name,
            price: Math.round(Number(p.price) * 100),
            weight: p.weight,
            shelves,
        });
    }
    return placed;
}

type Placed = Awaited<ReturnType<typeof writeCatalogue>>;

/**
 * Counter orders over five weeks, paid by hand at pick-up or on delivery, each
 * paid one with its invoice; today's in every stage, and one late. Nothing
 * online: no provider, no pay link.
 */
async function writeOrders(
    prisma: Db,
    biz: GlobalBusiness,
    sid: (...parts: (string | number)[]) => string,
    a: {
        orgId: string;
        storeIds: readonly string[];
        people: readonly Person[];
        placed: Placed;
        docs: Doc[];
        now: Date;
        at: (day: number, minute: number) => Date;
        rng: Rng;
        regularOf: Map<string, Person>;
    },
) {
    const { rng, at, now } = a;
    type Stage =
        | "NEW"
        | "PREPARING"
        | "READY"
        | "COLLECTED"
        | "OUT_FOR_DELIVERY"
        | "DELIVERED";
    // Today's board, then history, oldest first.
    const specs: {
        day: number;
        minute: number;
        stage: Stage;
        person?: Person;
        fulfilment: "PICKUP" | "LOCAL_DELIVERY";
        paid: boolean;
    }[] = [];
    const history = biz.orders - 6;
    const inMonth = new Map<string, number>();
    const take = (day: number) => {
        const month = monthOf(at(day, 720), biz.zone);
        const taken = inMonth.get(month) ?? 0;
        if (taken >= ORDERS_A_MONTH) return false;
        inMonth.set(month, taken + 1);
        return true;
    };
    // Today's board counts first: it's this month's, whatever history draws.
    for (const day of [0, 0, 0, 0, 0, -2]) take(day);
    for (let i = 0; i < history; i++) {
        const fulfilment = rng.chance(0.2)
            ? ("LOCAL_DELIVERY" as const)
            : ("PICKUP" as const);
        const day = -rng.int(1, 80);
        if (!take(day)) continue;
        specs.push({
            day,
            minute: rng.int(7 * 60, 16 * 60),
            stage: fulfilment === "PICKUP" ? "COLLECTED" : "DELIVERED",
            fulfilment,
            paid: true,
        });
    }
    const counted = new Map<Person, number>();
    biz.regulars.forEach((r) => {
        const p = a.regularOf.get(r.key);
        if (p && r.orders) counted.set(p, r.orders);
    });
    const maya = a.regularOf.get(biz.regulars[0].key);
    const hhmm = (back: number) => {
        const local = new Date(
            now.toLocaleString("en-US", { timeZone: biz.zone }),
        );
        return Math.max(
            7 * 60,
            local.getHours() * 60 + local.getMinutes() - back,
        );
    };
    specs.push(
        {
            day: 0,
            minute: hhmm(20),
            stage: "NEW",
            person: maya,
            fulfilment: "PICKUP",
            paid: false,
        },
        {
            day: 0,
            minute: hhmm(45),
            stage: "NEW",
            fulfilment: "PICKUP",
            paid: true,
        },
        {
            day: 0,
            minute: hhmm(80),
            stage: "PREPARING",
            fulfilment: "PICKUP",
            paid: false,
        },
        {
            day: 0,
            minute: hhmm(120),
            stage: "READY",
            fulfilment: "PICKUP",
            paid: true,
        },
        {
            day: 0,
            minute: hhmm(160),
            stage: "OUT_FOR_DELIVERY",
            fulfilment: "LOCAL_DELIVERY",
            paid: true,
        },
        {
            day: -2,
            minute: 600,
            stage: "READY",
            fulfilment: "PICKUP",
            paid: false,
        },
    );
    specs.sort(
        (x, y) => at(x.day, x.minute).getTime() - at(y.day, y.minute).getTime(),
    );

    const statusOf: Record<Stage, string> = {
        NEW: "PENDING",
        PREPARING: "PROCESSING",
        READY: "PROCESSING",
        COLLECTED: "DELIVERED",
        OUT_FOR_DELIVERY: "SHIPPED",
        DELIVERED: "DELIVERED",
    };
    const customers = new Map<string, Prisma.CustomerCreateManyInput>();
    const links: Prisma.CustomerIdentityLinkCreateManyInput[] = [];
    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const held = new Map<string, number>();
    specs.forEach((spec, n) => {
        const createdAt = at(spec.day, spec.minute);
        let person = spec.person;
        if (!person) {
            const owed = Array.from(counted.entries()).find(
                ([, left]) => left > 0,
            );
            if (owed && spec.stage !== "NEW") {
                person = owed[0];
                counted.set(owed[0], owed[1] - 1);
            } else {
                const others = a.people.slice(biz.regulars.length);
                person = others[rng.skewed(others.length, 1.6)];
            }
        }
        if (!customers.has(person.customerId)) {
            customers.set(person.customerId, {
                id: person.customerId,
                storeId: a.storeIds[0],
                organizationId: a.orgId,
                email: person.email,
                firstName: person.first,
                lastName: person.last,
                phone: person.phone,
                country: biz.countryName,
                city: biz.city,
                state: biz.state,
                zipCode: biz.postalCode,
                createdAt,
                updatedAt: createdAt,
            });
            links.push({
                id: sid("customerlink", person.customerId),
                organizationId: a.orgId,
                contactId: person.contactId,
                customerId: person.customerId,
                reason: "PAYMENT",
                createdAt,
            });
        }
        // Maya's today, which the screenshots open by name.
        const orderId = spec.person ? sid("order", "maya") : sid("order", n);
        const lineCount =
            1 + (rng.chance(0.4) ? 1 : 0) + (rng.chance(0.15) ? 1 : 0);
        const chosen = new Set<Placed[number]>();
        // Maya's order today holds a loaf: what the allergy note is about.
        if (spec.person) chosen.add(a.placed[0]);
        while (chosen.size < lineCount)
            chosen.add(rng.weighted(a.placed, (p) => p.weight));
        let subtotal = 0;
        const lines: Doc["lines"] = [];
        // On its way, it has left the shelf: only these still hold stock.
        const open =
            spec.stage === "NEW" ||
            spec.stage === "PREPARING" ||
            spec.stage === "READY";
        Array.from(chosen).forEach((p, l) => {
            const shelf = p.shelves[rng.int(0, p.shelves.length - 1)];
            const quantity = shelf.price < 1000 ? rng.int(1, 3) : 1;
            const itemId = sid("orderitem", n, l);
            const level = shelf.levels[0];
            if (open && level)
                held.set(level, (held.get(level) ?? 0) + quantity);
            subtotal += shelf.price * quantity;
            items.push({
                id: itemId,
                orderId,
                productId: p.productId,
                variantId: shelf.variantId,
                quantity,
                price: money(shelf.price),
                stockLevelId: level ?? null,
                heldQuantity: open && level ? quantity : 0,
                soldQuantity: !open && level ? quantity : 0,
            });
            lines.push({
                description: shelf.title ? `${p.name}, ${shelf.title}` : p.name,
                quantity,
                unit: shelf.price,
                orderItemId: itemId,
            });
        });
        const delivery = spec.fulfilment === "LOCAL_DELIVERY";
        const shipping = delivery ? 600 : 0;
        const total = subtotal + shipping;
        const paidAt = spec.paid
            ? new Date(createdAt.getTime() + 20 * 60_000)
            : null;
        orders.push({
            id: orderId,
            storeId: a.storeIds[0],
            organizationId: a.orgId,
            orderId: `ORD-${String(n + 1).padStart(3, "0")}`,
            customerId: person.customerId,
            subtotal: money(subtotal),
            shipping: money(shipping),
            total: money(total),
            currency: biz.currency,
            status: statusOf[spec.stage],
            stage: spec.stage,
            fulfilment: spec.fulfilment,
            paymentStatus: spec.paid ? "PAID" : "UNPAID",
            paidByHand: spec.paid ? money(total) : "0.00",
            paidAt,
            payOnHandover: !spec.paid,
            deliveryName: delivery ? person.name : null,
            deliveryPhone: delivery ? person.phone : null,
            deliveryCity: delivery ? biz.city : null,
            deliveryState: delivery ? biz.state : null,
            deliveryPostalCode: delivery ? biz.postalCode : null,
            createdAt,
            updatedAt: createdAt,
        });
        if (spec.paid) {
            a.docs.push({
                id: sid("invoice", "order", n),
                status: "PAID",
                source: "ORDER",
                orderId,
                contactId: person.contactId,
                billToName: person.name,
                billToEmail: person.email,
                issuedAt: paidAt ?? createdAt,
                dueAt: null,
                paidAt,
                paymentMethod: rng.chance(0.7) ? "CARD" : "CASH",
                lines: [
                    ...lines,
                    ...(shipping
                        ? [
                              {
                                  description: "Delivery",
                                  quantity: 1,
                                  unit: shipping,
                              },
                          ]
                        : []),
                ],
            });
        }
    });
    await prisma.customer.createMany({ data: Array.from(customers.values()) });
    await prisma.customerIdentityLink.createMany({ data: links });
    await prisma.order.createMany({ data: orders });
    await prisma.orderItem.createMany({ data: items });
    for (const [id, promised] of Array.from(held)) {
        await prisma.stockLevel.update({ where: { id }, data: { promised } });
    }
}

/** The diary: one-to-one visits on each person's hours, and the week's classes. */
function planDiary(
    biz: GlobalBusiness,
    sid: (...parts: (string | number)[]) => string,
    a: {
        people: readonly Person[];
        regularOf: Map<string, Person>;
        book: (b: {
            id: string;
            service: GlobalService;
            person: Person;
            startAt: Date;
            staffKey: string | null;
            roll: number;
            status?: "CONFIRMED" | "CANCELLED";
        }) => { outcome: string | null; endAt: Date; cancelled: boolean };
        free: (startAt: Date, minutes: number) => boolean;
        docs: Doc[];
        now: Date;
        at: (day: number, minute: number) => Date;
        rng: Rng;
    },
) {
    const { rng, at, now } = a;
    const pickPerson = () => {
        // Regulars book far more than anyone else.
        return rng.chance(0.03)
            ? a.people[rng.int(0, biz.regulars.length - 1)]
            : a.people[rng.skewed(a.people.length, 1.5)];
    };
    let n = 0;
    const billVisit = (
        id: string,
        person: Person,
        s: GlobalService,
        startAt: Date,
    ) => {
        if (!s.price) return;
        const roll = rng.next();
        const overdue = roll > 0.93;
        a.docs.push({
            id: sid("invoice", "booking", id),
            status: overdue ? "ISSUED" : "PAID",
            source: "BOOKING",
            bookingId: id,
            contactId: person.contactId,
            billToName: person.name,
            billToEmail: person.email,
            issuedAt: new Date(startAt.getTime() + s.minutes * 60_000),
            dueAt: new Date(startAt.getTime() + 14 * DAY),
            paidAt: overdue
                ? null
                : new Date(startAt.getTime() + (s.minutes + 5) * 60_000),
            paymentMethod: overdue ? null : roll < 0.65 ? "CARD" : "CASH",
            lines: [{ description: s.name, quantity: 1, unit: s.price }],
        });
    };

    // Classes first: they're at fixed times, and the rest fits around them.
    for (let day = -45; day <= 21; day++) {
        const weekday = weekdayOf(now, biz.zone, day);
        for (const s of biz.services) {
            for (const c of s.classAt ?? []) {
                if (!c.days.includes(weekday)) continue;
                const teacher = biz.staff.find((t) =>
                    t.services.includes(s.key),
                );
                const filled = rng.int(
                    s.fill?.[0] ?? 1,
                    s.fill?.[1] ?? s.capacity,
                );
                const seats = day > 7 ? Math.ceil(filled / 3) : filled;
                const seen = new Set<Person>();
                for (let k = 0; k < seats; k++) {
                    const person = pickPerson();
                    if (seen.has(person)) continue;
                    seen.add(person);
                    const id = sid("booking", n++);
                    const startAt = at(day, minuteOf(c.at));
                    const { outcome, cancelled } = a.book({
                        id,
                        service: s,
                        person,
                        startAt,
                        staffKey: teacher?.key ?? null,
                        roll: rng.next(),
                    });
                    if (
                        outcome === "ATTENDED" &&
                        !cancelled &&
                        rng.chance(0.35)
                    ) {
                        billVisit(id, person, s, startAt);
                    }
                }
            }
        }
    }
    // Every regular has past visits and a next one, so their page has them.
    const oneToOne = biz.services.filter((s) => s.weight > 0);
    /** The last free start in that day's hours, if the person works that day. */
    const lastFree = (day: number, s: GlobalService) => {
        const staff = biz.staff.find((t) => t.services.includes(s.key));
        const w = staff?.hours.find((h) =>
            h.days.includes(weekdayOf(now, biz.zone, day)),
        );
        if (!staff || !w) return null;
        for (
            let minute = minuteOf(w.to) - s.minutes;
            minute >= minuteOf(w.from);
            minute -= 30
        ) {
            if (a.free(at(day, minute), s.minutes)) {
                return { staff, startAt: at(day, minute) };
            }
        }
        return null;
    };
    biz.regulars.forEach((r, i) => {
        const person = a.regularOf.get(r.key);
        const s = oneToOne.at(0) ?? biz.services.at(0);
        if (!person || !s) return;
        for (let v = 0; v < (r.visits ?? 0); v++) {
            const slot = lastFree(-5 - v * 9 - i, s);
            if (!slot) continue;
            const id = sid("visit", r.key, v);
            const { outcome } = a.book({
                id,
                service: s,
                person,
                startAt: slot.startAt,
                staffKey: slot.staff.key,
                roll: ((v * 3) % 10) / 11,
            });
            if (outcome === "ATTENDED") billVisit(id, person, s, slot.startAt);
        }
        for (let d = 2 + i; d < 14; d++) {
            const slot = lastFree(d, s);
            if (!slot) continue;
            a.book({
                id: sid("visit", r.key, "next"),
                service: s,
                person,
                startAt: slot.startAt,
                staffKey: slot.staff.key,
                roll: 0,
            });
            break;
        }
    });
    // The day to day, in what's left of each day.
    for (let day = -45; day <= 21; day++) {
        const weekday = weekdayOf(now, biz.zone, day);
        for (const staff of biz.staff) {
            const offered = biz.services.filter(
                (s) => s.weight > 0 && staff.services.includes(s.key),
            );
            if (!offered.length) continue;
            for (const w of staff.hours) {
                if (!w.days.includes(weekday)) continue;
                let minute = minuteOf(w.from);
                const end = minuteOf(w.to);
                const busyness = day > 7 ? 0.2 : day > 0 ? 0.4 : 0.5;
                while (minute < end) {
                    const s = rng.weighted(offered, (o) => o.weight);
                    if (minute + s.minutes > end) break;
                    if (
                        a.free(at(day, minute), s.minutes) &&
                        rng.chance(busyness)
                    ) {
                        const id = sid("booking", n++);
                        const person = pickPerson();
                        const startAt = at(day, minute);
                        const { outcome, cancelled } = a.book({
                            id,
                            service: s,
                            person,
                            startAt,
                            staffKey: staff.key,
                            roll: rng.next(),
                            status: rng.chance(0.05)
                                ? "CANCELLED"
                                : "CONFIRMED",
                        });
                        if (outcome === "ATTENDED" && !cancelled)
                            billVisit(id, person, s, startAt);
                        minute += s.minutes;
                    } else {
                        minute += 30;
                    }
                }
            }
        }
    }
}

/** Daniel's root canal (visit 1 attended, 2 coming, 3 not booked) and Grace's whitening. */
function planTreatments(
    biz: GlobalBusiness,
    sid: (...parts: (string | number)[]) => string,
    a: {
        regularOf: Map<string, Person>;
        at: (day: number, minute: number) => Date;
        now: Date;
        orgId: string;
        storeId: string;
        docs: Doc[];
        book: (b: {
            id: string;
            service: GlobalService;
            person: Person;
            startAt: Date;
            staffKey: string | null;
            orderId?: string;
            visitNumber?: number;
            roll: number;
        }) => unknown;
    },
) {
    const { at } = a;
    // The clinic is shut at weekends: the next weekday instead.
    const toWeekday = (day: number) => {
        const weekday = weekdayOf(a.now, biz.zone, day);
        return weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
    };
    const scene = [
        {
            person: "daniel",
            service: "rootcanal",
            number: "ORD-001",
            visits: [
                [-7, 540],
                [4, 600],
            ] as const,
            paid: true,
        },
        {
            person: "grace",
            service: "whitening",
            number: "ORD-002",
            visits: [[3, 780]] as const,
            paid: false,
        },
    ];
    return scene.map((t) => {
        const person = a.regularOf.get(t.person);
        const service = biz.services.find((s) => s.key === t.service);
        if (!person || !service) throw new Error(`${t.person}: no scene`);
        const orderId = sid("order", t.person);
        const placedAt = at(t.visits[0][0] - 3, 620);
        const paidAt = t.paid ? new Date(placedAt.getTime() + 3_600_000) : null;
        const price = money(service.price);
        t.visits.forEach(([day, minute], v) =>
            a.book({
                id: sid("visit", t.person, `treat${v}`),
                service,
                person,
                startAt: at(day + toWeekday(day), minute),
                staffKey: "helen",
                orderId,
                visitNumber: v + 1,
                roll: 0.3,
            }),
        );
        if (t.paid) {
            a.docs.push({
                id: sid("invoice", "treat", t.person),
                status: "PAID",
                source: "ORDER",
                orderId,
                contactId: person.contactId,
                billToName: person.name,
                billToEmail: person.email,
                issuedAt: placedAt,
                dueAt: null,
                paidAt,
                paymentMethod: "CARD",
                lines: [
                    {
                        description: service.name,
                        quantity: 1,
                        unit: service.price,
                        orderItemId: sid("orderitem", t.person),
                    },
                ],
            });
        }
        return {
            customer: {
                id: person.customerId,
                storeId: a.storeId,
                organizationId: a.orgId,
                email: person.email,
                firstName: person.first,
                lastName: person.last,
                phone: person.phone,
                createdAt: placedAt,
            },
            link: {
                id: sid("customerlink", t.person),
                organizationId: a.orgId,
                contactId: person.contactId,
                customerId: person.customerId,
                reason: "BOOKING" as const,
                createdAt: placedAt,
            },
            order: {
                id: orderId,
                storeId: a.storeId,
                organizationId: a.orgId,
                orderId: t.number,
                customerId: person.customerId,
                currency: biz.currency,
                subtotal: price,
                total: price,
                fulfilment:
                    service.locationType === "EITHER"
                        ? ("APPOINTMENT_ONLINE" as const)
                        : ("APPOINTMENT_IN_PERSON" as const),
                paymentStatus: t.paid ? "PAID" : "UNPAID",
                paidByHand: t.paid ? price : "0.00",
                paidAt,
                createdAt: placedAt,
                items: {
                    create: {
                        id: sid("orderitem", t.person),
                        serviceId: sid("service", t.service),
                        quantity: 1,
                        price,
                        stockRow: "NONE" as const,
                    },
                },
            },
        };
    });
}

function manualDoc(
    biz: GlobalBusiness,
    sid: (...parts: (string | number)[]) => string,
    m: GlobalManualInvoice,
    at: (day: number, minute: number) => Date,
): Doc {
    // Today's stays this side of the mid-morning clock.
    const issuedAt = at(-m.daysAgo, m.daysAgo === 0 ? 540 : 600);
    const paidAt = m.paid
        ? at(-m.daysAgo + m.paid.after, m.daysAgo === 0 ? 560 : 660)
        : null;
    return {
        id: sid("invoice", "manual", m.key),
        status: m.draft ? "DRAFT" : m.paid ? "PAID" : "ISSUED",
        source: "MANUAL",
        billToName: m.billTo,
        billToEmail: m.email,
        issuedAt,
        dueAt: new Date(issuedAt.getTime() + m.dueInDays * DAY),
        paidAt,
        paymentMethod: m.paid?.method ?? null,
        taxLabel:
            m.taxed && biz.taxName && biz.taxRate
                ? `${biz.taxName} ${biz.taxRate}%`
                : undefined,
        taxBps:
            m.taxed && biz.taxRate ? Math.round(biz.taxRate * 100) : undefined,
        lines: m.lines.map((l) => ({ ...l })),
    };
}

/** Number in issue order on the plain series; the tax line only on manual papers. */
async function writeInvoices(
    prisma: Db,
    biz: GlobalBusiness,
    sid: (...parts: (string | number)[]) => string,
    orgId: string,
    docs: Doc[],
) {
    const ordered = [...docs].sort(
        (x, y) =>
            x.issuedAt.getTime() - y.issuedAt.getTime() ||
            x.id.localeCompare(y.id),
    );
    let last = 0;
    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    const address = `${biz.addressLine1}, ${biz.city}${biz.state ? `, ${biz.state}` : ""} ${biz.postalCode}`;
    for (const d of ordered) {
        const number =
            d.status === "DRAFT"
                ? null
                : `INV-${String(++last).padStart(4, "0")}`;
        const subtotal = d.lines.reduce((s, l) => s + l.quantity * l.unit, 0);
        const tax = d.taxBps ? Math.round((subtotal * d.taxBps) / 10_000) : 0;
        invoices.push({
            id: d.id,
            organizationId: orgId,
            number,
            status: d.status,
            kind: "INVOICE",
            source: d.source,
            bookingId: d.bookingId,
            orderId: d.orderId,
            contactId: d.contactId,
            billToName: d.billToName,
            billToEmail: d.billToEmail,
            sellerAddress: address,
            sellerName: biz.name,
            sellerLegalName: biz.legalName,
            sellerEmail: biz.contactEmail,
            sellerTaxId: d.taxLabel ? biz.taxId : null,
            taxLabel: d.taxLabel ?? null,
            currency: biz.currency,
            subtotal: money(subtotal),
            tax: money(tax),
            total: money(subtotal + tax),
            issuedAt: d.status === "DRAFT" ? null : d.issuedAt,
            dueAt: d.dueAt,
            paidAt: d.paidAt,
            paymentMethod: d.paymentMethod,
            createdAt: d.issuedAt,
            updatedAt: d.paidAt ?? d.issuedAt,
        });
        d.lines.forEach((l, position) =>
            lines.push({
                id: `${d.id}_line_${position}`,
                organizationId: orgId,
                invoiceId: d.id,
                position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: money(l.unit),
                amount: money(l.quantity * l.unit),
                orderItemId: l.orderItemId ?? null,
            }),
        );
    }
    for (let k = 0; k < invoices.length; k += 1000) {
        await prisma.invoice.createMany({ data: invoices.slice(k, k + 1000) });
    }
    for (let k = 0; k < lines.length; k += 1000) {
        await prisma.invoiceLine.createMany({ data: lines.slice(k, k + 1000) });
    }
    if (last > 0) {
        await prisma.invoiceSequence.create({
            data: { organizationId: orgId, series: "INV", lastNumber: last },
        });
    }
}

/** Stop the run if a Global business could show India's details. */
async function checkGlobal(prisma: Db, orgIds: readonly string[]) {
    const orgs = await prisma.organization.findMany({
        where: { id: { in: [...orgIds] } },
        select: {
            name: true,
            edition: true,
            currency: true,
            businessProfile: { select: { taxId: true, gstRegistered: true } },
        },
    });
    for (const o of orgs) {
        if (
            o.edition !== "GLOBAL" ||
            o.currency === "INR" ||
            o.businessProfile?.gstRegistered
        ) {
            throw new Error(`[global] ${o.name} isn't a Global business`);
        }
    }
    const scoped = { organizationId: { in: [...orgIds] } };
    // What a Free business can be: one person, no Payments and no class packs.
    // Insights and Courses are switches it may turn on (no catalogue row).
    const [members, otherStaff, modules] = await Promise.all([
        prisma.membership.count({ where: scoped }),
        prisma.staffMember.count({ where: { ...scoped, membershipId: null } }),
        prisma.organizationModule.count({
            where: {
                ...scoped,
                moduleKey: { in: ["PAYMENTS", "CLASS_PACKS"] },
            },
        }),
    ]);
    if (members !== orgIds.length || otherStaff > 0 || modules > 0) {
        throw new Error(
            `[global] more than Free: ${members} members, ${otherStaff} staff with no login, ${modules} paid modules`,
        );
    }
    // Free's monthly caps, counted in each business's own months.
    const zones = await prisma.businessProfile.findMany({
        where: scoped,
        select: { organizationId: true, timezone: true },
    });
    for (const { organizationId, timezone } of zones) {
        const zone = timezone ?? "UTC";
        const [orders, online] = await Promise.all([
            prisma.order.findMany({
                where: { organizationId },
                select: { createdAt: true },
            }),
            prisma.booking.findMany({
                where: { organizationId, bookedOnline: true },
                select: { createdAt: true },
            }),
        ]);
        const worst = (rows: { createdAt: Date }[]) => {
            const per = new Map<string, number>();
            for (const r of rows) {
                const m = monthOf(r.createdAt, zone);
                per.set(m, (per.get(m) ?? 0) + 1);
            }
            return Math.max(0, ...Array.from(per.values()));
        };
        if (
            worst(orders) > FREE_MONTHLY_CAP ||
            worst(online) > FREE_MONTHLY_CAP
        ) {
            throw new Error(
                `[global] ${organizationId} over Free's ${FREE_MONTHLY_CAP} a month: ${worst(orders)} orders, ${worst(online)} online bookings`,
            );
        }
    }
    const rupees = await Promise.all([
        prisma.invoice.count({ where: { ...scoped, currency: "INR" } }),
        prisma.order.count({ where: { ...scoped, currency: "INR" } }),
        prisma.service.count({ where: { ...scoped, currency: "INR" } }),
        prisma.contact.count({
            where: { ...scoped, phone: { startsWith: "+91" } },
        }),
    ]);
    if (rupees.some((n) => n > 0)) {
        throw new Error(
            `[global] rupees or +91 on a Global business: ${rupees.join(", ")}`,
        );
    }
}

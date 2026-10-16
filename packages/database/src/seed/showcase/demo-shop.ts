import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import type { SeedSite } from "../data";
import type { Db } from "../helpers";
import {
    dummyPhone,
    id,
    listProductAt,
    setStockLevel,
    utcDay,
    writeSite,
} from "../helpers";
import { seedPlanId } from "../pricing";
import type { SeededService } from "./appointments";
import { bookingRows, planBookings, upsertServices } from "./appointments";
import type { BillingContext, InvoiceSpec, Payment } from "./billing";
import { invoiceRows, rupees } from "./billing";
import type { LeadSpec } from "./crm";
import { planLeads, upsertPipeline } from "./crm";
import type { ModuleKey, ShowcaseService } from "./data";
import { SHOWCASE_KEY, SHOWCASE_SEED, TIMEZONE } from "./data";
import type {
    DemoCategory,
    DemoOption,
    DemoPost,
    DemoProduct,
} from "./demo-shop-types";
import { addMinutes, earliest, hashKey, istAt, istWeekday } from "./people";
import type { Period } from "./periods";
import { boundary, periodLabel } from "./periods";
import type { Rng } from "./random";
import { createRng } from "./random";

/**
 * A per-vertical demo shop (Ammi Ki Barni, Margin Books): one business
 * with a storefront, a catalogue with photos, variants and stock, three
 * months of orders walked through the kitchen stages, the customers and
 * contacts behind them, reviews behind delivered lines, a monthly plan with
 * people on it and its invoices, enquiries and the leads they opened, a
 * published site with its journal, QR codes and their scans, and ninety days
 * of site traffic that agrees with the orders.
 *
 * Structure (business, storefront, catalogue, plans, services, site, posts)
 * is upserted on seeded ids. Volume is cleared and written again each run
 * from a seeded PRNG and a clock rounded to the half hour, so a re-run in the
 * same half hour writes the same rows. Every write of volume is a
 * `createMany`. Every row the API would have left is left the way it would
 * have left it: stages walked in order with an event each, money taken by
 * hand recorded on the order, stock that held, sold and was restocked in a
 * log that adds up to what is on the shelf, invoices chained period by
 * period.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const CURRENCY = "INR";

// --- Configuration ---------------------------------------------------------------

export interface DemoPersonPool {
    first: readonly string[];
    last: readonly string[];
    /** Where they live: line 2 of an address and its PIN. */
    localities: readonly { name: string; zip: string }[];
    city: string;
    state: string;
    /** Lanes, flats and houses for line 1. */
    streets: readonly string[];
}

export interface DemoPlanFixture {
    name: string;
    description: string;
    pricePaise: number;
    /** Share of the subscribers on it. */
    weight: number;
    collectionWeekday: number | null;
    collectionNote: string | null;
    gstRate: string;
    sacCode: string | null;
}

export interface DemoBulkOrder {
    daysAgo: number;
    minute: number;
    lines: readonly { slug: string; variant: string | null; qty: number }[];
    fulfilment: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING";
    note: string;
    /** Paid in advance, by UPI. */
    prepaid: boolean;
}

export interface DemoManualInvoice {
    daysAgo: number;
    lines: readonly {
        description: string;
        quantity: number;
        unitPaise: number;
    }[];
    state: "DRAFT" | "ISSUED" | "PAID";
    /** Paid this many days after issue (PAID only). */
    paidAfterDays?: number;
}

export interface DemoQr {
    code: string;
    place: "COUNTER" | "MIRROR" | "CARD" | "FLYER" | "OTHER";
    placeNote: string | null;
    label: string;
    targetKind: "SITE" | "SHOP" | "BOOK";
    color: string;
    /** Scans on an ordinary day. */
    perDay: number;
    createdDaysAgo: number;
}

export interface DemoDiscount {
    code: string;
    description: string;
    percentBps: number;
    startsDaysAgo: number | null;
    endsInDays: number | null;
}

export interface DemoShopConfig {
    key: string;
    name: string;
    slug: string;
    /** The catalogue plan the business is on ("grow", "pro"). */
    planKey: string;
    modules: readonly ModuleKey[];
    createdDaysAgo: number;
    profile: {
        legalName: string | null;
        type: string;
        phone: string;
        contactEmail: string;
        addressLine1: string;
        addressLine2: string | null;
        city: string;
        postalCode: string;
        gstState: string;
        stateName: string;
    };
    store: {
        name: string;
        description: string;
        address: string;
        openingHours: readonly {
            day: string;
            open: string;
            close: string;
            closed: boolean;
        }[];
        localDeliveryPaise: number;
        freeDeliveryFromPaise: number;
        shippingPaise: number;
    };
    categories: readonly DemoCategory[];
    options: readonly DemoOption[];
    products: readonly DemoProduct[];
    /** Where a product may go: empty is every way the storefront offers. */
    fulfilmentTypes: (
        p: DemoProduct,
    ) => ("PICKUP" | "LOCAL_DELIVERY" | "SHIPPING")[];
    /** The days-ago window it sells in, or null when it sold nothing lately. */
    salesWindow: (p: DemoProduct) => { from: number; to: number } | null;
    /** When the order is ready, from what is on it and when it was placed. */
    readyAt: (
        products: readonly DemoProduct[],
        placedAt: Date,
        now: Date,
    ) => Date;
    /** A line for an open order's notes ("Pick-up Sat 18 Oct"), or null. */
    openNote: (o: { fulfilment: string; readyAt: Date }) => string | null;
    /**
     * After how many minutes from placing an order its storefront calls it
     * late (B17), per way it leaves — set to what this business promises,
     * so Home's Late tags are only the problems the demo designs. Absent:
     * the defaults (2 h, 24 h, 48 h).
     */
    lateAfterMinutes?: {
        PICKUP: number;
        LOCAL_DELIVERY: number;
        SHIPPING: number;
    };
    people: DemoPersonPool;
    volume: {
        days: number;
        ordersPerMonth: number;
        customers: number;
        /** Counter sales to people who left no email. */
        walkInShare: number;
        /** Walk-ins happen on these weekdays only (0 = Sunday). */
        counterDays: readonly number[];
        fulfilment: {
            PICKUP: number;
            LOCAL_DELIVERY: number;
            SHIPPING: number;
        };
        /** Of orders not at the counter, the share placed on the site. */
        onlineShare: number;
        /** Of open orders, the share paid in advance by UPI. */
        prepaidShare: number;
        /**
         * Every order placed on the site is paid ahead (UPI at checkout), so
         * nothing made to order waits days as "pay on collection" — which
         * Home would call not collected while it is still being made.
         */
        onlinePaysAhead?: boolean;
        /** Weekday weights, Sunday first. */
        weekday: readonly number[];
        /** A festival or season's lift on a day, by days ago. */
        bump: (daysAgo: number) => number;
        /** Weights for 1, 2, 3, 4 lines. */
        lines: readonly number[];
        /** Minutes of the day orders come in between. */
        openMinute: number;
        closeMinute: number;
        cancelShare: number;
        refundShare: number;
        refundReasons: readonly string[];
        cancelReasons: readonly string[];
        latePickups: number;
        unpaidDelivered: number;
    };
    bulkOrders: readonly DemoBulkOrder[];
    orderNotes: readonly string[];
    contactNotes: readonly string[];
    plans: readonly DemoPlanFixture[];
    subscriptions: { ongoing: number; paused: number; cancelled: number };
    /** People on a plan who never ordered from the shop. */
    subscriberOnlyContacts: number;
    manualInvoices: readonly DemoManualInvoice[];
    enquiries: {
        formName: string;
        fields: readonly {
            name: string;
            label: string;
            type: "text" | "email" | "tel" | "textarea";
            required?: boolean;
        }[];
        content: {
            title: string;
            description: string;
            submitLabel: string;
            successMessage: string;
        };
        messages: readonly {
            message: string;
            extra?: Record<string, string>;
        }[];
        pipeline: { name: string; stages: readonly string[] };
        notes: readonly string[];
        tasks: readonly string[];
    };
    services: readonly ShowcaseService[];
    bookings: number;
    qr: readonly DemoQr[];
    discounts: readonly DemoDiscount[];
    /** The site, once the products and services have ids. */
    site: (ref: {
        productId: (slug: string) => string;
        storeId: string;
        serviceIndex: (name: string) => number;
    }) => SeedSite;
    footer: string;
    posts: readonly DemoPost[];
    postAuthor: string;
    analytics: {
        /** Weekday views on an ordinary day. */
        viewsPerDay: number;
        weekendFactor: number;
        paths: readonly { path: string; weight: number }[];
    };
    contactSources: readonly { source: string; weight: number }[];
}

export interface DemoShopContext {
    prisma: Db;
    now: Date;
    demoUserId: string;
    /** The one other person on the team, who takes most steps. */
    staffUserId: string;
    staffRole: "ADMIN" | "MEMBER";
}

// --- Small helpers ------------------------------------------------------------------

const toPaise = (r: string) => {
    const [w = "0", f = ""] = r.split(".");
    return Number(w) * 100 + Number((f + "00").slice(0, 2));
};

function paragraphs(text: string): string {
    return text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(
            (p) =>
                `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
        )
        .join("");
}

const digits = (rng: Rng, n: number) =>
    Array.from({ length: n }, () => rng.int(0, 9)).join("");

const later = (...dates: Date[]) =>
    new Date(Math.max(...dates.map((d) => d.getTime())));

/** Minute of the Kolkata day. */
const minuteOfDay = (at: Date) => {
    const local = new Date(at.getTime() + 330 * 60_000);
    return local.getUTCHours() * 60 + local.getUTCMinutes();
};

/** The Kolkata weekday of an instant, 0 = Sunday. */
export const weekdayOf = (at: Date) =>
    new Date(at.getTime() + 330 * 60_000).getUTCDay();

/** "Sat 18 Oct" in Kolkata. */
export const shortDay = (at: Date) =>
    new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: TIMEZONE,
    }).format(at);

type Stage =
    | "NEW"
    | "PREPARING"
    | "READY"
    | "COLLECTED"
    | "OUT_FOR_DELIVERY"
    | "HANDED_TO_COURIER"
    | "DELIVERED";

const STATUS_OF: Record<Stage, string> = {
    NEW: "PENDING",
    PREPARING: "PROCESSING",
    READY: "PROCESSING",
    COLLECTED: "DELIVERED",
    OUT_FOR_DELIVERY: "SHIPPED",
    HANDED_TO_COURIER: "SHIPPED",
    DELIVERED: "DELIVERED",
};

type Fulfilment = "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING";

// --- Seeding ------------------------------------------------------------------------

export interface DemoShopResult {
    id: string;
    name: string;
    prefix: string;
}

export async function seedDemoShop(
    ctx: DemoShopContext,
    cfg: DemoShopConfig,
): Promise<DemoShopResult> {
    const { prisma, now, demoUserId } = ctx;
    const sid = (...parts: (string | number)[]) =>
        id(SHOWCASE_KEY, cfg.key, ...parts);
    const rngFor = (...parts: string[]) =>
        createRng((SHOWCASE_SEED ^ hashKey(cfg.key, ...parts)) >>> 0);
    const orgId = sid("org");
    const storeId = sid("store");
    const createdAt = istAt(now, -cfg.createdDaysAgo, 10 * 60);
    const team = [ctx.staffUserId, demoUserId];

    // --- the business, its team, modules and plan
    await prisma.organization.upsert({
        where: { slug: cfg.slug },
        update: { name: cfg.name },
        create: { id: orgId, name: cfg.name, slug: cfg.slug, createdAt },
    });
    const profile = {
        legalName: cfg.profile.legalName,
        type: cfg.profile.type,
        country: "India",
        contactEmail: cfg.profile.contactEmail,
        phone: cfg.profile.phone,
        timezone: TIMEZONE,
        gstRegistered: false,
        gstState: cfg.profile.gstState,
        addressLine1: cfg.profile.addressLine1,
        addressLine2: cfg.profile.addressLine2,
        city: cfg.profile.city,
        postalCode: cfg.profile.postalCode,
        stockTracking: true,
    };
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: profile,
        create: { id: sid("profile"), organizationId: orgId, ...profile },
    });
    for (const [userId, role, key] of [
        [demoUserId, "OWNER", "demo"],
        [ctx.staffUserId, ctx.staffRole, "staff"],
    ] as const) {
        await prisma.membership.upsert({
            where: { organizationId_userId: { organizationId: orgId, userId } },
            update: { role },
            create: {
                id: sid("membership", key),
                organizationId: orgId,
                userId,
                role,
            },
        });
    }
    for (const moduleKey of cfg.modules) {
        await prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: { organizationId: orgId, moduleKey },
            },
            update: { status: "ENABLED" },
            create: {
                id: sid("module", moduleKey.toLowerCase()),
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
                id: sid("flagoverride", moduleKey.toLowerCase()),
                flagKey,
                organizationId: orgId,
                enabled: true,
            },
        });
    }
    const planId = await seedPlanId(prisma, now, cfg.planKey);
    await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId, status: "ACTIVE" },
        create: {
            id: sid("subscription"),
            organizationId: orgId,
            planId,
            status: "ACTIVE",
            currentPeriodEnd: istAt(now, 20, 0),
        },
    });

    // --- the storefront: a shop with an address, which also delivers
    await prisma.store.upsert({
        where: { id: storeId },
        update: {
            name: cfg.store.name,
            organizationId: orgId,
            deletedAt: null,
        },
        create: {
            id: storeId,
            organizationId: orgId,
            name: cfg.store.name,
            description: cfg.store.description,
            createdAt,
        },
    });
    await prisma.storeOwner.upsert({
        where: { storeId_userId: { storeId, userId: demoUserId } },
        update: { role: "OWNER" },
        create: {
            id: sid("storeowner"),
            storeId,
            userId: demoUserId,
            role: "OWNER",
        },
    });
    const settings = {
        currency: CURRENCY,
        timezone: TIMEZONE,
        kind: "SHOP",
        address: cfg.store.address,
        openingHours: cfg.store.openingHours.map((d) => ({ ...d })),
        collectionEnabled: true,
        // Written every run, so a re-seed puts back the business's own.
        pickupLateAfterMinutes: cfg.lateAfterMinutes?.PICKUP ?? 120,
        localDeliveryLateAfterMinutes:
            cfg.lateAfterMinutes?.LOCAL_DELIVERY ?? 1440,
        shippingLateAfterMinutes: cfg.lateAfterMinutes?.SHIPPING ?? 2880,
        shippingEnabled: true,
        taxEnabled: false,
        freeShippingThreshold: rupees(cfg.store.freeDeliveryFromPaise),
        localDeliveryFee: rupees(cfg.store.localDeliveryPaise),
        shippingFee: rupees(cfg.store.shippingPaise),
    };
    await prisma.storeSettings.upsert({
        where: { storeId },
        update: settings,
        create: { id: sid("storesettings"), storeId, ...settings },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId },
        update: { ecommerceEnabled: true },
        create: { id: sid("storefeatures"), storeId, ecommerceEnabled: true },
    });

    // Volume first, so nothing below trips over last run's rows.
    await clearVolume(prisma, orgId, sid(""));

    // --- categories, options, products, photos, variants, shelves
    const categoryId: Record<string, string> = {};
    for (const c of cfg.categories) {
        const row = await prisma.category.upsert({
            where: {
                organizationId_slug: { organizationId: orgId, slug: c.key },
            },
            update: { name: c.name },
            create: {
                id: sid("category", c.key),
                organizationId: orgId,
                name: c.name,
                slug: c.key,
            },
        });
        categoryId[c.key] = row.id;
    }
    const optionId: Record<string, string> = {};
    const valueId: Record<string, string> = {};
    for (let i = 0; i < cfg.options.length; i++) {
        const o = cfg.options[i];
        const row = await prisma.productOption.upsert({
            where: {
                organizationId_name: { organizationId: orgId, name: o.name },
            },
            update: { position: i },
            create: {
                id: sid("option", o.key),
                organizationId: orgId,
                name: o.name,
                position: i,
            },
        });
        optionId[o.key] = row.id;
        for (let j = 0; j < o.values.length; j++) {
            const v = await prisma.productOptionValue.upsert({
                where: {
                    optionId_value: { optionId: row.id, value: o.values[j] },
                },
                update: { position: j },
                create: {
                    id: sid("optionvalue", o.key, j),
                    optionId: row.id,
                    organizationId: orgId,
                    value: o.values[j],
                    position: j,
                },
            });
            valueId[`${o.key}:${o.values[j]}`] = v.id;
        }
    }

    const shelves = new Map<string, ShelfInfo>();
    const placed: PlacedProduct[] = [];
    for (let i = 0; i < cfg.products.length; i++) {
        placed.push(
            await upsertProduct(prisma, {
                cfg,
                p: cfg.products[i],
                i,
                sid,
                orgId,
                storeId,
                createdAt: istAt(
                    now,
                    -cfg.createdDaysAgo + 5 + (i % 40),
                    11 * 60,
                ),
                trackedAt: createdAt,
                categoryId,
                optionId,
                valueId,
                shelves,
            }),
        );
    }

    // --- plans (Restrict from their subscribers, so upserted)
    const planIds = cfg.plans.map((_, i) => sid("plan", i));
    for (let i = 0; i < cfg.plans.length; i++) {
        const pl = cfg.plans[i];
        const data = {
            name: pl.name,
            description: pl.description,
            price: rupees(pl.pricePaise),
            currency: CURRENCY,
            interval: "MONTH",
            status: "ACTIVE",
            classesPerMonth: null,
            gstRate: pl.gstRate,
            sacCode: pl.sacCode,
        };
        await prisma.subscriptionPlan.upsert({
            where: { id: planIds[i] },
            update: data,
            create: {
                id: planIds[i],
                organizationId: orgId,
                createdAt,
                updatedAt: createdAt,
                ...data,
            },
        });
    }

    // --- services, the pipeline
    const services: SeededService[] = cfg.services.length
        ? await upsertServices(prisma, {
              orgId,
              services: cfg.services,
              serviceId: (i) => sid("service", i),
              ruleId: (i, k) => sid("rule", i, k),
              createdAt,
          })
        : [];
    const pipelineId = sid("pipeline");
    const stageIds = await upsertPipeline(prisma, {
        orgId,
        pipelineId,
        stageId: (i) => sid("stage", i),
        name: cfg.enquiries.pipeline.name,
        stages: cfg.enquiries.pipeline.stages,
    });

    // --- the site, its journal and QR codes
    const site = cfg.site({
        productId: (slug) => {
            const k = cfg.products.findIndex((p) => p.slug === slug);
            if (k < 0) throw new Error(`${cfg.name} has no product "${slug}"`);
            return placed[k].productId;
        },
        storeId,
        serviceIndex: (name) => {
            const k = cfg.services.findIndex((s) => s.name === name);
            if (k < 0) throw new Error(`${cfg.name} has no service "${name}"`);
            return k;
        },
    });
    const siteIds = {
        site: sid("site"),
        page: (p: number) => sid("page", p),
        pageVersion: (p: number) => sid("pageversion", p),
        section: (p: number, n: number) => sid("section", p, n),
        sectionKey: (p: number, n: number) => sid("sectionkey", p, n),
        form: (p: number, n: number) => sid("form", p, n),
        publication: sid("publication"),
    };
    const siteId = await writeSite(prisma, {
        fixture: site,
        orgId,
        userId: demoUserId,
        now,
        ids: siteIds,
        pipelineId,
        serviceId: (i) => sid("service", i),
        footer: { format: "text", value: cfg.footer },
    });
    // The site sells from this storefront (G11): its /shop and grids.
    await prisma.site.update({
        where: { id: siteId },
        data: { storefrontId: storeId },
    });
    const formId = findForm(site, siteIds.form);
    await writePosts(prisma, {
        cfg,
        sid,
        orgId,
        siteId,
        now,
        authorId: demoUserId,
    });
    const qrIds = await writeQrCodes(prisma, { cfg, sid, orgId, siteId, now });

    // --- the volume, planned in memory, then written table by table
    const plan = planVolume({
        cfg,
        now,
        orgId,
        storeId,
        sid,
        rngFor,
        placed,
        shelves,
        team,
        planIds,
        services,
        qrIds,
    });

    await prisma.customer.createMany({ data: plan.customers });
    await createInChunks(plan.contacts, (data) =>
        prisma.contact.createMany({ data }),
    );
    await prisma.customerIdentityLink.createMany({ data: plan.links });
    await prisma.contactNote.createMany({ data: plan.notes });
    await createInChunks(plan.orders, (data) =>
        prisma.order.createMany({ data }),
    );
    await createInChunks(plan.items, (data) =>
        prisma.orderItem.createMany({ data }),
    );
    await createInChunks(plan.events, (data) =>
        prisma.orderEvent.createMany({ data }),
    );
    for (const s of plan.shelfRows) {
        await prisma.stockLevel.update({
            where: { id: s.id },
            data: { onHand: s.onHand, promised: s.promised },
        });
    }
    await createInChunks(plan.stockEntries, (data) =>
        prisma.stockEntry.createMany({ data }),
    );
    await prisma.reviewInvitation.createMany({ data: plan.invitations });
    await prisma.productReview.createMany({ data: plan.reviews });

    // Subscriptions, and every invoice: numbered in the order issued.
    await prisma.customerSubscription.createMany({ data: plan.subscriptions });
    const billing: BillingContext = {
        now,
        orgId,
        id: sid,
        rng: (c) => rngFor("billing", c),
        services,
        contacts: plan.billingContacts,
        pool: [],
        staff: team,
        invoicing: true,
        seller: {
            sellerName: cfg.name,
            sellerLegalName: cfg.profile.legalName,
            sellerEmail: cfg.profile.contactEmail,
            sellerAddress: `${cfg.profile.addressLine1}, ${cfg.profile.city} ${cfg.profile.postalCode}, ${cfg.profile.stateName}`,
        },
    };
    const rows = invoiceRows(billing, plan.invoices);
    await createInChunks(rows.invoices, (data) =>
        prisma.invoice.createMany({ data }),
    );
    await createInChunks(rows.lines, (data) =>
        prisma.invoiceLine.createMany({ data }),
    );
    await prisma.invoiceSequence.upsert({
        where: {
            organizationId_series: { organizationId: orgId, series: "INV" },
        },
        update: { lastNumber: rows.lastNumber },
        create: {
            organizationId: orgId,
            series: "INV",
            lastNumber: rows.lastNumber,
        },
    });

    // Bookings, enquiries and the leads they opened.
    if (services.length > 0) {
        const planned = planBookings(rngFor("bookings"), {
            now,
            services: cfg.services,
            target: cfg.bookings,
            fromDay: -60,
            toDay: 21,
            contacts: plan.billingContacts.length,
            prospects: [],
            prospectServices: [],
            weekdayWeights: [1, 1, 1, 1, 1, 1, 1],
        });
        const diary = bookingRows(planned, {
            now,
            orgId,
            services,
            contacts: plan.billingContacts,
            staffUserIds: [],
            bookingId: (n) => sid("booking", n),
            eventId: (n, kind) => sid("bookingevent", n, kind),
        });
        await createInChunks(diary.bookings, (data) =>
            prisma.booking.createMany({ data }),
        );
        await createInChunks(diary.events, (data) =>
            prisma.bookingEvent.createMany({ data }),
        );
    }
    const specs: LeadSpec[] = plan.enquiries.map((e) => ({
        contactId: e.contactId,
        title: `${e.name} — ${cfg.enquiries.formName}`,
        value: null,
        formId,
        createdAt: e.at,
    }));
    const { leads, activities } = planLeads(rngFor("leads"), specs, {
        now,
        orgId,
        pipelineId,
        stageIds,
        stageNames: cfg.enquiries.pipeline.stages,
        actorUserIds: team,
        notes: cfg.enquiries.notes,
        tasks: cfg.enquiries.tasks,
        wonShare: 0.45,
        lostShare: 0.12,
        leadId: (n) => sid("lead", n),
        activityId: (n, k) => sid("activity", n, k),
    });
    await prisma.lead.createMany({ data: leads });
    await prisma.activity.createMany({ data: activities });
    await prisma.submission.createMany({
        data: plan.enquiries.map((e, n) => ({
            id: sid("submission", n),
            organizationId: orgId,
            formId,
            contactId: e.contactId,
            leadId: sid("lead", n),
            data: e.data,
            createdAt: e.at,
        })),
    });

    await writeDiscounts(prisma, { cfg, sid, orgId, storeId, now });
    await prisma.qrScanDay.createMany({ data: plan.scans });
    await writeAnalytics(prisma, {
        cfg,
        sid,
        orgId,
        now,
        enquiryAt: plan.enquiries.map((e) => e.at),
    });

    console.log(
        `[showcase] ${cfg.name}: ${cfg.products.length} products ` +
            `(${placed.reduce((n, p) => n + p.variantIds.length, 0)} variants), ` +
            `${plan.customers.length} customers, ${plan.orders.length} orders, ` +
            `${plan.reviews.length} reviews, ${plan.subscriptions.length} subscriptions, ` +
            `${rows.invoices.length} invoices, ${plan.enquiries.length} enquiries, ` +
            `${cfg.posts.length} posts`,
    );
    return { id: orgId, name: cfg.name, prefix: sid("") };
}

const CHUNK = 1000;
async function createInChunks<T>(
    rows: T[],
    write: (data: T[]) => Promise<unknown>,
) {
    for (let k = 0; k < rows.length; k += CHUNK)
        await write(rows.slice(k, k + CHUNK));
}

/** This business's volume, children first. Its catalogue, plans and site stay. */
async function clearVolume(prisma: Db, orgId: string, prefix: string) {
    const where = { id: { startsWith: prefix } };
    // The whole stock log and every review: the shop is a film set.
    await prisma.stockEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.productReview.deleteMany({ where: { organizationId: orgId } });
    await prisma.reviewInvitation.deleteMany({
        where: { organizationId: orgId },
    });
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.submission.deleteMany({ where });
    await prisma.activity.deleteMany({ where });
    await prisma.lead.deleteMany({ where });
    await prisma.bookingEvent.deleteMany({ where });
    await prisma.booking.deleteMany({ where });
    await prisma.customerSubscription.deleteMany({ where });
    await prisma.orderEvent.deleteMany({ where });
    await prisma.orderItem.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.customerIdentityLink.deleteMany({ where });
    await prisma.contactNote.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
    await prisma.qrScanDay.deleteMany({ where: { organizationId: orgId } });
    await prisma.analyticsDailyAggregate.deleteMany({
        where: { organizationId: orgId, id: { startsWith: prefix } },
    });
}

// --- Catalogue ------------------------------------------------------------------------

interface ShelfInfo {
    id: string;
    productIndex: number;
    variantIndex: number | null;
    productId: string;
    variantId: string | null;
    target: number;
    warnAt: number;
}

interface PlacedProduct {
    productId: string;
    variantIds: string[];
    /** Shelf ids: the product's, or each variant's in order. */
    shelfIds: (string | null)[];
}

async function upsertProduct(
    prisma: Db,
    a: {
        cfg: DemoShopConfig;
        p: DemoProduct;
        i: number;
        sid: (...parts: (string | number)[]) => string;
        orgId: string;
        storeId: string;
        createdAt: Date;
        trackedAt: Date;
        categoryId: Record<string, string>;
        optionId: Record<string, string>;
        valueId: Record<string, string>;
        shelves: Map<string, ShelfInfo>;
    },
): Promise<PlacedProduct> {
    const { p, i, sid, orgId, storeId } = a;
    const productId = sid("product", i);
    const data = {
        name: p.name,
        description: paragraphs(p.description),
        price: p.price,
        mrp: p.mrp,
        currency: CURRENCY,
        status: p.status,
        archivedAt: null,
        categoryId: a.categoryId[p.category] ?? null,
        optionId: p.option ? (a.optionId[p.option] ?? null) : null,
        howToUse: p.howToUse,
        materials: p.materials,
        keyPoints: p.keyPoints,
        madeHere: p.maker === null,
        maker: p.maker?.name ?? null,
        madeIn: p.maker?.madeIn ?? null,
        returnsMode: p.returnsText ? "OWN" : "STOREFRONT",
        returnsText: p.returnsText,
        gstRate: p.gstRate,
        hsnCode: p.hsnCode,
        image: p.images[0]?.url ?? null,
        stockTracked: p.tracked,
        stockTrackedAt: p.tracked ? a.trackedAt : null,
        fulfilmentTypes: a.cfg.fulfilmentTypes(p),
        shopFields: {
            howToUse: true,
            materials: true,
            keyPoints: true,
            maker: true,
            warranty: false,
            returns: true,
        },
    };
    await prisma.product.upsert({
        where: { id: productId },
        update: data,
        create: {
            id: productId,
            storeId,
            organizationId: orgId,
            slug: p.slug,
            createdAt: a.createdAt,
            ...data,
        },
    });

    // Photos: rewritten whole, in order; the first is the cover.
    await prisma.productVariant.updateMany({
        where: { productId },
        data: { imageId: null },
    });
    await prisma.product.update({
        where: { id: productId },
        data: { seoImageId: null },
    });
    await prisma.productImage.deleteMany({ where: { productId } });
    const imageIds = p.images.map((_, k) => sid("image", i, k));
    await prisma.productImage.createMany({
        data: p.images.map((img, k) => ({
            id: imageIds[k],
            productId,
            organizationId: orgId,
            url: img.url,
            alt: img.alt,
            width: img.width,
            height: img.height,
            position: k,
            creditName: img.creditName,
            creditUrl: img.creditUrl,
            createdAt: a.createdAt,
        })),
    });

    const variantIds: string[] = [];
    for (let j = 0; j < p.variants.length; j++) {
        const v = p.variants[j];
        const variantId = sid("variant", i, j);
        const vdata = {
            sku: v.sku,
            title: v.title,
            price: v.price,
            mrp: v.mrp,
            position: j,
            optionValueId: p.option
                ? (a.valueId[`${p.option}:${v.title}`] ?? null)
                : null,
            imageId: v.image !== null ? (imageIds[v.image] ?? null) : null,
        };
        await prisma.productVariant.upsert({
            where: { id: variantId },
            update: vdata,
            create: {
                id: variantId,
                productId,
                createdAt: a.createdAt,
                ...vdata,
            },
        });
        variantIds.push(variantId);
    }
    await listProductAt(prisma, {
        id: sid("listing", i),
        orgId,
        storeId,
        productId,
        variants: variantIds.map((variantId, j) => ({
            id: sid("listingvariant", i, j),
            variantId,
        })),
    });

    const shelfIds: (string | null)[] = [];
    if (!p.tracked) return { productId, variantIds, shelfIds };
    if (p.variants.length === 0) {
        const shelf = await setStockLevel(prisma, {
            id: sid("stocklevel", i),
            orgId,
            storeId,
            productId,
            onHand: p.stock,
            promised: 0,
            lowStockAlert: p.lowStockAlert,
        });
        shelfIds.push(shelf);
        a.shelves.set(shelf, {
            id: shelf,
            productIndex: i,
            variantIndex: null,
            productId,
            variantId: null,
            target: p.stock,
            warnAt: p.lowStockAlert,
        });
    } else {
        for (let j = 0; j < p.variants.length; j++) {
            const shelf = await setStockLevel(prisma, {
                id: sid("stocklevel", i, j),
                orgId,
                storeId,
                productId,
                variantId: variantIds[j],
                onHand: p.variants[j].stock,
                promised: 0,
                lowStockAlert: p.lowStockAlert,
            });
            shelfIds.push(shelf);
            a.shelves.set(shelf, {
                id: shelf,
                productIndex: i,
                variantIndex: j,
                productId,
                variantId: variantIds[j],
                target: p.variants[j].stock,
                warnAt: p.lowStockAlert,
            });
        }
    }
    return { productId, variantIds, shelfIds };
}

// --- Planning the volume -----------------------------------------------------------------

interface Shopper {
    first: string;
    last: string;
    email: string;
    phone: string;
    line1: string;
    line2: string;
    zip: string;
}

interface Line {
    product: number;
    variant: number | null;
    qty: number;
}

interface PlannedOrder {
    placedAt: Date;
    customer: number | null;
    walkIn: { name: string; phone: string | null } | null;
    fulfilment: Fulfilment;
    online: boolean;
    lines: Line[];
    note: string | null;
    bulk: boolean;
    prepaid: boolean;
}

interface Volume {
    customers: Prisma.CustomerCreateManyInput[];
    contacts: Prisma.ContactCreateManyInput[];
    links: Prisma.CustomerIdentityLinkCreateManyInput[];
    notes: Prisma.ContactNoteCreateManyInput[];
    orders: Prisma.OrderCreateManyInput[];
    items: Prisma.OrderItemCreateManyInput[];
    events: Prisma.OrderEventCreateManyInput[];
    shelfRows: { id: string; onHand: number; promised: number }[];
    stockEntries: Prisma.StockEntryCreateManyInput[];
    invitations: Prisma.ReviewInvitationCreateManyInput[];
    reviews: Prisma.ProductReviewCreateManyInput[];
    subscriptions: Prisma.CustomerSubscriptionCreateManyInput[];
    invoices: InvoiceSpec[];
    billingContacts: {
        id: string;
        name: string;
        email: string;
        phone: string;
        company: string | null;
    }[];
    enquiries: {
        contactId: string;
        name: string;
        at: Date;
        data: Record<string, string>;
    }[];
    scans: Prisma.QrScanDayCreateManyInput[];
}

function makeShoppers(
    rng: Rng,
    pool: DemoPersonPool,
    count: number,
    used: Set<string>,
): Shopper[] {
    const out: Shopper[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 50) {
        const first = rng.pick(pool.first);
        const last = rng.pick(pool.last);
        const base = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
        if (used.has(`${first} ${last}`)) continue;
        used.add(`${first} ${last}`);
        let email = `${base}@example.com`;
        for (let n = 2; used.has(email); n++) email = `${base}${n}@example.com`;
        used.add(email);
        const loc = rng.pick(pool.localities);
        out.push({
            first,
            last,
            email,
            phone: dummyPhone(
                `${rng.pick(["98", "99", "97", "96", "90", "88", "70", "63", "93", "80"])}${rng.int(100, 999)} ${rng.int(10000, 99999)}`,
            ),
            line1: rng
                .pick(pool.streets)
                .replace("{n}", String(rng.int(2, 148))),
            line2: loc.name,
            zip: loc.zip,
        });
    }
    return out;
}

function planVolume(a: {
    cfg: DemoShopConfig;
    now: Date;
    orgId: string;
    storeId: string;
    sid: (...parts: (string | number)[]) => string;
    rngFor: (...parts: string[]) => Rng;
    placed: readonly PlacedProduct[];
    shelves: Map<string, ShelfInfo>;
    team: readonly string[];
    planIds: readonly string[];
    services: readonly SeededService[];
    qrIds: readonly string[];
}): Volume {
    const { cfg, now, orgId, storeId, sid, rngFor, placed } = a;
    const V = cfg.volume;
    const products = cfg.products;
    const staff = a.team[0];
    const owner = a.team[1];
    const v: Volume = {
        customers: [],
        contacts: [],
        links: [],
        notes: [],
        orders: [],
        items: [],
        events: [],
        shelfRows: [],
        stockEntries: [],
        invitations: [],
        reviews: [],
        subscriptions: [],
        invoices: [],
        billingContacts: [],
        enquiries: [],
        scans: [],
    };

    // --- people: customers, then people only on a plan, then enquirers
    const used = new Set<string>();
    const peopleRng = rngFor("people");
    const shoppers = makeShoppers(peopleRng, cfg.people, V.customers, used);
    const planOnly = makeShoppers(
        peopleRng,
        cfg.people,
        cfg.subscriberOnlyContacts,
        used,
    );
    const enquirers = makeShoppers(
        peopleRng,
        cfg.people,
        cfg.enquiries.messages.length,
        used,
    );

    // --- orders: when, who, what and how
    const orderRng = rngFor("orders");
    const days = V.days;
    const dayWeights = Array.from({ length: days + 1 }, (_, k) => {
        const d = -days + k; // -days .. 0
        const growth = 0.85 + (0.3 * k) / days;
        const today =
            d === 0 ? Math.min(1, minuteOfDay(now) / (V.closeMinute - 60)) : 1;
        return V.weekday[istWeekday(now, d)] * V.bump(-d) * growth * today;
    });
    const total = Math.round((V.ordersPerMonth * days) / 30);
    const weightSum = dayWeights.reduce((s, w) => s + w, 0);
    const sellable = (p: DemoProduct, daysAgo: number) => {
        if (p.status !== "PUBLISHED") return false;
        const w = cfg.salesWindow(p);
        return w !== null && daysAgo <= w.from && daysAgo >= w.to;
    };
    const planned: PlannedOrder[] = [];
    // Every customer orders once, then the regulars order again and again.
    const whoRng = rngFor("who");
    const firstOrders = shoppers.map((_, c) => c);
    // How often each comes back: a third once only, most now and then, a
    // fifth regularly and a few every week or two.
    const loyalty = shoppers.map(
        () =>
            whoRng.weighted(
                [
                    { w: 35, x: 0 },
                    { w: 40, x: 1 },
                    { w: 20, x: 3 },
                    { w: 5, x: 8 },
                ],
                (c) => c.w,
            ).x,
    );
    const shopperIndexes = shoppers.map((_, c) => c);
    const repeat = () => {
        const seen = shopperIndexes.filter(
            (c) => loyalty[c] > 0 && !firstOrders.includes(c),
        );
        if (seen.length === 0 || whoRng.chance(0.3)) return null;
        return whoRng.weighted(seen, (c) => loyalty[c]);
    };
    for (let n = 0; n < total; n++) {
        // The day, by weight.
        let r = orderRng.next() * weightSum;
        let k = 0;
        while (k < dayWeights.length - 1 && (r -= dayWeights[k]) > 0) k++;
        const d = -days + k;
        const dow = istWeekday(now, d);
        const walkIn =
            V.walkInShare > 0 &&
            V.counterDays.includes(dow) &&
            orderRng.chance(V.walkInShare);
        const latest =
            d === 0
                ? Math.max(V.openMinute + 5, minuteOfDay(now) - 15)
                : V.closeMinute;
        const minute = orderRng.int(
            V.openMinute,
            Math.max(V.openMinute + 1, latest),
        );
        const placedAt = istAt(now, d, minute);
        if (placedAt > addMinutes(now, -10)) continue;
        const fulfilment: Fulfilment = walkIn
            ? "PICKUP"
            : orderRng.weighted(
                  ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"] as const,
                  (f) => V.fulfilment[f],
              );
        const customer = walkIn
            ? null
            : (repeat() ??
              (firstOrders.length > 0
                  ? (firstOrders.splice(
                        whoRng.int(0, firstOrders.length - 1),
                        1,
                    )[0] ?? 0)
                  : whoRng.skewed(shoppers.length, 1.6)));
        const daysAgo = -d;
        const choices = products
            .map((p, i) => ({ p, i }))
            .filter(
                ({ p }) =>
                    sellable(p, daysAgo) &&
                    (fulfilment !== "SHIPPING" ||
                        cfg.fulfilmentTypes(p).length === 0 ||
                        cfg.fulfilmentTypes(p).includes("SHIPPING")) &&
                    (fulfilment !== "LOCAL_DELIVERY" ||
                        cfg.fulfilmentTypes(p).length === 0 ||
                        cfg.fulfilmentTypes(p).includes("LOCAL_DELIVERY")),
            );
        if (choices.length === 0) continue;
        const lineCount =
            1 +
            orderRng.weighted(
                [0, 1, 2, 3].slice(0, V.lines.length),
                (x) => V.lines[x],
            );
        const lines: Line[] = [];
        for (let l = 0; l < lineCount; l++) {
            const pick = orderRng.weighted(choices, ({ p }) => p.demand);
            if (lines.some((x) => x.product === pick.i)) continue;
            const p = pick.p;
            // The first sizes and editions sell most; every one sells.
            const variant = p.variants.length
                ? p.variants.indexOf(
                      orderRng.weighted(
                          p.variants,
                          (x) => 1 / (1 + 0.35 * p.variants.indexOf(x)),
                      ),
                  )
                : null;
            lines.push({
                product: pick.i,
                variant,
                qty: orderRng.chance(0.18) ? 2 : orderRng.chance(0.04) ? 3 : 1,
            });
        }
        // A line that can't go this way (a pre-order that only ships) is
        // left off; picked first, so every other order draws as before.
        const goes = (l: Line) => {
            const ways = cfg.fulfilmentTypes(products[l.product]);
            return ways.length === 0 || ways.includes(fulfilment);
        };
        if (!lines.every(goes)) {
            const kept = lines.filter(goes);
            if (kept.length === 0) continue;
            lines.splice(0, lines.length, ...kept);
        }
        planned.push({
            placedAt,
            customer,
            walkIn: walkIn
                ? {
                      name: `${orderRng.pick(cfg.people.first)} ${orderRng.pick(cfg.people.last).charAt(0)}.`,
                      phone: orderRng.chance(0.4)
                          ? dummyPhone(
                                `9${digits(orderRng, 4)} ${digits(orderRng, 5)}`,
                            )
                          : null,
                  }
                : null,
            fulfilment,
            online: !walkIn && orderRng.chance(V.onlineShare),
            lines,
            note:
                !walkIn && orderRng.chance(0.14)
                    ? orderRng.pick(cfg.orderNotes)
                    : null,
            bulk: false,
            prepaid:
                fulfilment === "SHIPPING" || orderRng.chance(V.prepaidShare),
        });
    }
    // Anyone not yet given an order gets one, so every customer has paid.
    for (const c of firstOrders) {
        const base = planned[orderRng.int(0, planned.length - 1)];
        planned.push({
            ...base,
            customer: c,
            walkIn: null,
            online: orderRng.chance(V.onlineShare),
            placedAt: addMinutes(base.placedAt, -orderRng.int(20, 300)),
            lines: base.lines.map((l) => ({ ...l })),
        });
    }
    // The big festival orders.
    cfg.bulkOrders.forEach((b, k) => {
        planned.push({
            placedAt: istAt(now, -b.daysAgo, b.minute),
            customer: whoRng.int(0, Math.min(25, shoppers.length - 1)),
            walkIn: null,
            fulfilment: b.fulfilment,
            online: false,
            lines: b.lines.map((l) => {
                const pi = products.findIndex((p) => p.slug === l.slug);
                if (pi < 0)
                    throw new Error(`Bulk order ${k}: no product "${l.slug}"`);
                const vi =
                    l.variant === null
                        ? products[pi].variants.length > 0
                            ? 0
                            : null
                        : products[pi].variants.findIndex(
                              (x) => x.title === l.variant,
                          );
                if (vi !== null && vi < 0)
                    throw new Error(
                        `Bulk order ${k}: no variant "${l.variant}" of ${l.slug}`,
                    );
                return { product: pi, variant: vi, qty: l.qty };
            }),
            note: b.note,
            bulk: true,
            prepaid: b.prepaid,
        });
    });
    if (V.onlinePaysAhead) {
        for (const o of planned) if (o.online) o.prepaid = true;
    }
    planned.sort((x, y) => x.placedAt.getTime() - y.placedAt.getTime());

    // Who has a problem: late pick-ups, delivered and not paid, cancels, refunds.
    const fateRng = rngFor("fates");

    // --- people rows
    const firstAt = new Map<number, Date>();
    for (const o of planned) {
        if (o.customer !== null && !firstAt.has(o.customer))
            firstAt.set(o.customer, o.placedAt);
    }
    const sourceRng = rngFor("sources");
    const contactIndexOfCustomer = new Map<number, number>();
    const addContact = (
        s: Shopper,
        at: Date,
        key: string | number,
        source: string,
    ) => {
        const index = v.billingContacts.length;
        const cid = sid("contact", key);
        v.billingContacts.push({
            id: cid,
            name: `${s.first} ${s.last}`,
            email: s.email,
            phone: s.phone,
            company: null,
        });
        v.contacts.push({
            id: cid,
            organizationId: orgId,
            email: s.email,
            firstName: s.first,
            lastName: s.last,
            phone: s.phone,
            source,
            createdAt: at,
            updatedAt: at,
        });
        return index;
    };
    shoppers.forEach((s, c) => {
        const at = new Date(
            (firstAt.get(c) ?? istAt(now, -40, 11 * 60)).getTime() - HOUR,
        );
        v.customers.push({
            id: sid("customer", c),
            storeId,
            organizationId: orgId,
            email: s.email,
            firstName: s.first,
            lastName: s.last,
            phone: s.phone,
            country: "India",
            state: cfg.people.state,
            city: cfg.people.city,
            zipCode: s.zip,
            createdAt: at,
            updatedAt: at,
        });
        const ci = addContact(
            s,
            at,
            `c${c}`,
            sourceRng.weighted(cfg.contactSources, (x) => x.weight).source,
        );
        contactIndexOfCustomer.set(c, ci);
        v.links.push({
            id: sid("customerlink", c),
            organizationId: orgId,
            contactId: v.billingContacts[ci].id,
            customerId: sid("customer", c),
            reason: "PAYMENT",
            createdAt: at,
        });
    });
    const planOnlyIndex = planOnly.map((s, k) =>
        addContact(
            s,
            istAt(now, -sourceRng.int(60, 300), 12 * 60),
            `p${k}`,
            sourceRng.weighted(cfg.contactSources, (x) => x.weight).source,
        ),
    );

    // --- orders into rows
    const stepRng = rngFor("steps");
    const payRng = rngFor("pay");
    const lateIdx = new Set<number>();
    const unpaidIdx = new Set<number>();
    const linesHeld: { shelf: string; qty: number }[] = [];
    const sales: {
        shelf: string;
        qty: number;
        at: Date;
        orderId: string;
        by: string;
    }[] = [];
    const delivered: {
        order: number;
        at: Date;
        customer: number | null;
        itemIds: string[];
        lines: Line[];
    }[] = [];
    let readyForLate = 0;
    let unpaidLeft = V.unpaidDelivered;

    planned.forEach((o, n) => {
        const orderId = sid("order", n);
        const lineProducts = o.lines.map((l) => products[l.product]);
        const readyAt = o.walkIn
            ? addMinutes(o.placedAt, 2)
            : cfg.readyAt(lineProducts, o.placedAt, now);
        const by = stepRng.chance(0.75) ? staff : owner;
        const moves: { to: Stage; at: Date }[] = [];
        if (o.walkIn) {
            moves.push(
                { to: "PREPARING", at: addMinutes(o.placedAt, 1) },
                { to: "READY", at: addMinutes(o.placedAt, 2) },
                { to: "COLLECTED", at: addMinutes(o.placedAt, 3) },
            );
        } else {
            const prepAt = earliest(
                new Date(readyAt.getTime() - 60 * 60_000),
                later(
                    addMinutes(o.placedAt, 30),
                    istAt(o.placedAt, 1, 9 * 60 + stepRng.int(0, 90)),
                ),
            );
            moves.push({
                to: "PREPARING",
                at: later(addMinutes(o.placedAt, 20), prepAt),
            });
            moves.push({
                to: "READY",
                at: later(addMinutes(o.placedAt, 40), readyAt),
            });
            if (o.fulfilment === "PICKUP") {
                // Most the day it is ready, the rest the next: an open
                // pick-up is one still being made or ready since yesterday.
                const daysToCollect = stepRng.weighted([0, 1], (x) =>
                    x === 0 ? 7 : 3,
                );
                const collect = istAt(
                    readyAt,
                    daysToCollect,
                    stepRng.int(11 * 60, 19 * 60 + 30),
                );
                moves.push({
                    to: "COLLECTED",
                    at: later(addMinutes(readyAt, 30), collect),
                });
            } else if (o.fulfilment === "LOCAL_DELIVERY") {
                const out = later(
                    addMinutes(readyAt, 30),
                    istAt(readyAt, 0, 15 * 60 + stepRng.int(0, 60)),
                );
                moves.push({ to: "OUT_FOR_DELIVERY", at: out });
                moves.push({
                    to: "DELIVERED",
                    at: addMinutes(out, stepRng.int(25, 180)),
                });
            } else {
                const out = addMinutes(readyAt, stepRng.int(60, 20 * 60));
                moves.push({ to: "HANDED_TO_COURIER", at: out });
                moves.push({
                    to: "DELIVERED",
                    at: addMinutes(out, stepRng.int(24 * 60, 2 * 24 * 60)),
                });
            }
        }
        // Problems the business has to act on.
        let fate: "OK" | "CANCELLED" | "REFUNDED" = "OK";
        const fr = fateRng.next();
        if (
            !o.bulk &&
            !o.walkIn &&
            fr < V.cancelShare &&
            o.placedAt < addMinutes(now, -2 * 24 * 60)
        )
            fate = "CANCELLED";
        else if (!o.bulk && !o.walkIn && fr < V.cancelShare + V.refundShare)
            fate = "REFUNDED";
        const readyDaysAgo = (now.getTime() - readyAt.getTime()) / DAY;
        if (
            fate === "OK" &&
            o.fulfilment === "PICKUP" &&
            !o.walkIn &&
            readyForLate < V.latePickups &&
            readyDaysAgo > 5 &&
            readyDaysAgo < 9
        ) {
            readyForLate++;
            lateIdx.add(n);
            moves.splice(moves.findIndex((m) => m.to === "COLLECTED"));
        }
        let steps = moves.filter((m) => m.at <= addMinutes(now, -5));
        if (fate === "CANCELLED") steps = [];
        const stage: Stage = steps.length ? steps[steps.length - 1].to : "NEW";
        const closed =
            STATUS_OF[stage] === "DELIVERED" || STATUS_OF[stage] === "SHIPPED";
        if (fate === "REFUNDED" && !closed) fate = "OK";
        const handedOver = steps.find(
            (m) =>
                m.to === "COLLECTED" ||
                m.to === "OUT_FOR_DELIVERY" ||
                m.to === "HANDED_TO_COURIER",
        );
        const finalAt = steps.length ? steps[steps.length - 1].at : o.placedAt;

        // Money: by hand at handover, or in advance by UPI.
        const subtotal = o.lines.reduce(
            (s, l) => s + l.qty * priceOf(products[l.product], l.variant),
            0,
        );
        const shipping =
            o.fulfilment === "PICKUP"
                ? 0
                : o.fulfilment === "SHIPPING"
                  ? cfg.store.shippingPaise
                  : subtotal >= cfg.store.freeDeliveryFromPaise
                    ? 0
                    : cfg.store.localDeliveryPaise;
        const totalPaise = subtotal + shipping;
        let paidAt: Date | null = null;
        if (o.prepaid) paidAt = addMinutes(o.placedAt, payRng.int(3, 90));
        else if (handedOver)
            paidAt = addMinutes(
                handedOver.at,
                o.fulfilment === "PICKUP" ? 2 : payRng.int(20, 200),
            );
        if (paidAt && paidAt > now)
            paidAt = handedOver ? earliest(now, paidAt) : null;
        if (
            paidAt &&
            !o.prepaid &&
            unpaidLeft > 0 &&
            fate === "OK" &&
            !o.walkIn &&
            o.fulfilment === "LOCAL_DELIVERY" &&
            closed &&
            (now.getTime() - finalAt.getTime()) / DAY < 20 &&
            payRng.chance(0.3)
        ) {
            unpaidLeft--;
            unpaidIdx.add(n);
            paidAt = null;
        }
        if (fate === "CANCELLED" && !o.prepaid) paidAt = null;
        const cancelledAt =
            fate === "CANCELLED"
                ? later(
                      addMinutes(o.placedAt, payRng.int(60, 20 * 60)),
                      addMinutes(paidAt ?? o.placedAt, 10),
                  )
                : null;
        // A cancelled order paid in advance is handed its money back then.
        const refundAt =
            fate === "REFUNDED"
                ? earliest(
                      addMinutes(
                          later(finalAt, paidAt ?? finalAt),
                          payRng.int(3 * 60, 30 * 60),
                      ),
                      addMinutes(now, -30),
                  )
                : cancelledAt && paidAt
                  ? addMinutes(cancelledAt, 5)
                  : null;
        const status = fate === "CANCELLED" ? "CANCELLED" : STATUS_OF[stage];
        const paymentStatus =
            fate === "REFUNDED" || (fate === "CANCELLED" && paidAt)
                ? "REFUNDED"
                : paidAt
                  ? "PAID"
                  : "UNPAID";
        const shopper = o.customer === null ? null : shoppers[o.customer];
        const delivery = o.fulfilment !== "PICKUP" && shopper;
        const lastTouch = [
            o.placedAt,
            finalAt,
            paidAt ?? o.placedAt,
            cancelledAt ?? o.placedAt,
            refundAt ?? o.placedAt,
        ].reduce((x, y) => (y > x ? y : x));
        const openNote =
            STATUS_OF[stage] === "PENDING" || STATUS_OF[stage] === "PROCESSING"
                ? cfg.openNote({ fulfilment: o.fulfilment, readyAt })
                : null;
        const qrHit = o.online && a.qrIds.length > 0 && payRng.chance(0.15);
        v.orders.push({
            id: orderId,
            storeId,
            organizationId: orgId,
            orderId: `ORD-${String(n + 1).padStart(4, "0")}`,
            customerId:
                o.customer === null ? null : sid("customer", o.customer),
            walkInName: o.walkIn?.name ?? null,
            walkInPhone: o.walkIn?.phone ?? null,
            subtotal: rupees(subtotal),
            tax: "0.00",
            shipping: rupees(shipping),
            discount: "0.00",
            total: rupees(totalPaise),
            currency: CURRENCY,
            status,
            paymentStatus,
            paidByHand: paidAt ? rupees(totalPaise) : "0.00",
            refundedByHand:
                paymentStatus === "REFUNDED" ? rupees(totalPaise) : "0.00",
            paidAt,
            placedOnline: o.online,
            payOnHandover: o.online && !o.prepaid,
            stage,
            fulfilment: o.fulfilment,
            deliveryName: delivery ? `${shopper.first} ${shopper.last}` : null,
            deliveryPhone: delivery ? shopper.phone : null,
            deliveryLine1: delivery ? shopper.line1 : null,
            deliveryLine2: delivery ? shopper.line2 : null,
            deliveryCity: delivery ? cfg.people.city : null,
            deliveryState: delivery ? cfg.people.state : null,
            deliveryPostalCode: delivery ? shopper.zip : null,
            notes: [o.note, openNote].filter(Boolean).join(" · ") || null,
            courierName:
                o.fulfilment === "SHIPPING" && handedOver ? "DTDC" : null,
            trackingNumber:
                o.fulfilment === "SHIPPING" && handedOver
                    ? `D${digits(payRng, 9)}`
                    : null,
            sourceCode: qrHit
                ? a.qrIds[payRng.int(0, a.qrIds.length - 1)]
                : null,
            createdAt: o.placedAt,
            updatedAt: lastTouch,
        });

        // Lines, and what they held or sold.
        const open = status === "PENDING" || status === "PROCESSING";
        const itemIds: string[] = [];
        o.lines.forEach((l, k) => {
            const p = products[l.product];
            const place = placed[l.product];
            const shelf = p.tracked
                ? (place.shelfIds[l.variant ?? 0] ?? null)
                : null;
            const itemId = sid("orderitem", n, k);
            itemIds.push(itemId);
            const sold =
                shelf && !open && fate !== "CANCELLED" && handedOver
                    ? l.qty
                    : 0;
            v.items.push({
                id: itemId,
                orderId,
                productId: place.productId,
                variantId:
                    l.variant === null ? null : place.variantIds[l.variant],
                quantity: l.qty,
                price: rupees(priceOf(p, l.variant)),
                stockRow: shelf
                    ? l.variant === null
                        ? "PRODUCT"
                        : "VARIANT"
                    : "NONE",
                stockLevelId: shelf,
                heldQuantity: shelf && open ? l.qty : 0,
                soldQuantity: sold,
            });
            if (shelf && open) linesHeld.push({ shelf, qty: l.qty });
            if (shelf && sold && handedOver)
                sales.push({
                    shelf,
                    qty: l.qty,
                    at: handedOver.at,
                    orderId,
                    by,
                });
        });

        // The steps, in order, each by whoever took it.
        let from: Stage = "NEW";
        steps.forEach((m, k) => {
            v.events.push({
                id: sid("orderevent", n, k),
                organizationId: orgId,
                orderId,
                kind: "STAGE",
                actorUserId: o.walkIn ? owner : by,
                fromStage: from,
                toStage: m.to,
                fromStatus: STATUS_OF[from],
                toStatus: STATUS_OF[m.to],
                createdAt: m.at,
            });
            from = m.to;
        });
        if (cancelledAt) {
            v.events.push({
                id: sid("orderevent", n, "cancel"),
                organizationId: orgId,
                orderId,
                kind: "STATUS",
                actorUserId: by,
                fromStatus: "PENDING",
                toStatus: "CANCELLED",
                note: fateRng.pick(V.cancelReasons),
                createdAt: cancelledAt,
            });
        }
        if (refundAt) {
            v.events.push({
                id: sid("orderevent", n, "refund"),
                organizationId: orgId,
                orderId,
                kind: "REFUND",
                actorUserId: owner,
                note: fateRng.pick(V.refundReasons),
                amountCents: totalPaise,
                createdAt: refundAt,
            });
        }
        if (
            STATUS_OF[stage] === "DELIVERED" &&
            fate === "OK" &&
            paidAt &&
            o.customer !== null
        ) {
            delivered.push({
                order: n,
                at: finalAt,
                customer: o.customer,
                itemIds,
                lines: o.lines,
            });
        }
    });

    // --- the shelves: what open orders hold, and a log that adds up
    const held = new Map<string, number>();
    for (const h of linesHeld)
        held.set(h.shelf, (held.get(h.shelf) ?? 0) + h.qty);
    const openingAt = istAt(now, -(days + 3), 10 * 60);
    let entryN = 0;
    for (const shelf of Array.from(a.shelves.values())) {
        const promised = held.get(shelf.id) ?? 0;
        const onHand = shelf.target + promised;
        v.shelfRows.push({ id: shelf.id, onHand, promised });
        const mine = sales
            .filter((s) => s.shelf === shelf.id)
            .sort((x, y) => y.at.getTime() - x.at.getTime());
        const soldWeekly = mine.reduce((s, x) => s + x.qty, 0) / (days / 7);
        const restock = Math.max(6, Math.round(soldWeekly * 3));
        const cap = restock * 2 + shelf.warnAt;
        const backwards: Prisma.StockEntryCreateManyInput[] = [];
        let cur = onHand;
        const base = {
            organizationId: orgId,
            stockLevelId: shelf.id,
            storeId,
            productId: shelf.productId,
            variantId: shelf.variantId,
        };
        for (const s of mine) {
            backwards.push({
                ...base,
                id: "",
                kind: "SOLD",
                quantity: -s.qty,
                before: cur + s.qty,
                after: cur,
                orderId: s.orderId,
                actorUserId: s.by,
                createdAt: s.at,
            });
            cur += s.qty;
            if (
                cur > cap &&
                cur - restock >= 0 &&
                s.at > addMinutes(openingAt, 3 * 24 * 60)
            ) {
                const at = istAt(s.at, -1, 10 * 60 + 30);
                backwards.push({
                    ...base,
                    id: "",
                    kind: "RECEIVED",
                    quantity: restock,
                    before: cur - restock,
                    after: cur,
                    note: "Restocked",
                    actorUserId: owner,
                    createdAt: at,
                });
                cur -= restock;
            }
        }
        backwards.push({
            ...base,
            id: "",
            kind: "COUNTED",
            quantity: cur,
            before: 0,
            after: cur,
            counted: cur,
            note: "Opening count",
            actorUserId: owner,
            createdAt: openingAt,
        });
        backwards.reverse().forEach((e) => {
            v.stockEntries.push({ ...e, id: sid("stockentry", entryN++) });
        });
    }

    // --- reviews behind delivered lines of the same product and variant
    const reviewRng = rngFor("reviews");
    const usedItems = new Set<string>();
    products.forEach((p, pi) => {
        p.reviews.forEach((r, ri) => {
            const vi = r.variantTitle
                ? p.variants.findIndex((x) => x.title === r.variantTitle)
                : null;
            const candidates = delivered.filter(
                (d) =>
                    d.at < addMinutes(now, -2 * 24 * 60) &&
                    d.lines.some(
                        (l, k) =>
                            l.product === pi &&
                            (vi === null || l.variant === vi) &&
                            !usedItems.has(d.itemIds[k]),
                    ),
            );
            if (candidates.length === 0) return;
            const d = reviewRng.pick(candidates);
            const k = d.lines.findIndex(
                (l, kk) =>
                    l.product === pi &&
                    (vi === null || l.variant === vi) &&
                    !usedItems.has(d.itemIds[kk]),
            );
            const itemId = d.itemIds[k];
            usedItems.add(itemId);
            const shopper = shoppers[d.customer ?? 0];
            const orderId = sid("order", d.order);
            // One invitation an order; each line it reviews hangs off it.
            const invitationId = sid("invitation", d.order);
            const reviewedAt = earliest(
                addMinutes(d.at, reviewRng.int(24 * 60, 6 * 24 * 60)),
                addMinutes(now, -60),
            );
            if (!v.invitations.some((x) => x.id === invitationId))
                v.invitations.push({
                    id: invitationId,
                    organizationId: orgId,
                    orderId,
                    tokenHash: createHash("sha256")
                        .update(invitationId)
                        .digest("hex"),
                    toAddress: shopper.email,
                    expiresAt: addMinutes(d.at, 31 * 24 * 60),
                    completedAt: reviewedAt,
                    updatedAt: reviewedAt,
                    lastSentAt: addMinutes(d.at, 24 * 60),
                    createdAt: addMinutes(d.at, 24 * 60),
                });
            v.reviews.push({
                id: sid("review", pi, ri),
                organizationId: orgId,
                storeId,
                invitationId,
                orderItemId: itemId,
                productId: placed[pi].productId,
                customerId: sid("customer", d.customer ?? 0),
                productName: p.name,
                invitedTo: shopper.email,
                rating: r.rating,
                body: r.body,
                displayName: `${shopper.first} ${shopper.last.charAt(0)}.`,
                status: "PUBLISHED",
                reply: r.reply,
                repliedAt: r.reply
                    ? earliest(
                          addMinutes(reviewedAt, reviewRng.int(60, 30 * 60)),
                          now,
                      )
                    : null,
                createdAt: reviewedAt,
                updatedAt: reviewedAt,
            });
            const last = v.reviews[v.reviews.length - 1];
            if (last.repliedAt) last.updatedAt = last.repliedAt;
        });
    });

    // --- notes on regulars
    const noteRng = rngFor("notes");
    cfg.contactNotes.forEach((body, k) => {
        const c = Math.min(shoppers.length - 1, k * 2);
        const ci = contactIndexOfCustomer.get(c) ?? 0;
        const at = earliest(
            addMinutes(
                new Date(v.contacts[ci].createdAt as Date),
                noteRng.int(2, 40) * 24 * 60,
            ),
            addMinutes(now, -noteRng.int(60, 3000)),
        );
        v.notes.push({
            id: sid("contactnote", k),
            organizationId: orgId,
            contactId: v.billingContacts[ci].id,
            body,
            createdByUserId: noteRng.chance(0.6) ? staff : owner,
            createdAt: at,
            updatedAt: at,
        });
    });

    // --- subscriptions: ongoing and ended, each invoiced period by period
    planSubscriptions(a, v, [
        ...shoppers.map((_, c) => contactIndexOfCustomer.get(c) ?? 0),
        ...planOnlyIndex,
    ]);

    // --- invoices written by hand
    const manualRng = rngFor("manual");
    cfg.manualInvoices.forEach((inv, k) => {
        const contact =
            contactIndexOfCustomer.get(
                manualRng.int(0, Math.min(30, shoppers.length - 1)),
            ) ?? 0;
        const createdAt = earliest(
            istAt(now, -inv.daysAgo, manualRng.int(10 * 60, 18 * 60)),
            addMinutes(now, -120),
        );
        const issuedAt =
            inv.state === "DRAFT"
                ? null
                : addMinutes(createdAt, manualRng.int(5, 40));
        const paid: Payment | null =
            inv.state === "PAID" && issuedAt
                ? {
                      at: earliest(
                          addMinutes(
                              issuedAt,
                              (inv.paidAfterDays ?? 3) * 24 * 60,
                          ),
                          addMinutes(now, -30),
                      ),
                      method: "BANK_TRANSFER",
                      reference: `NEFT ${digits(manualRng, 10)}`,
                  }
                : null;
        v.invoices.push({
            id: sid("invoice", "manual", k),
            contact,
            createdAt,
            issuedAt,
            lines: inv.lines,
            taxPaise: 0,
            source: "MANUAL",
            createdByUserId: owner,
            paid,
            voided: null,
        });
    });

    // --- enquiries through the site's form
    const enquiryRng = rngFor("enquiries");
    cfg.enquiries.messages.forEach((m, k) => {
        const s = enquirers[k];
        const at = earliest(
            istAt(
                now,
                -Math.round(
                    (k * 80) / cfg.enquiries.messages.length +
                        enquiryRng.int(0, 3),
                ),
                enquiryRng.int(9 * 60, 22 * 60),
            ),
            addMinutes(now, -90),
        );
        const ci = addContact(s, at, `e${k}`, "WEBSITE");
        const values: Record<string, string> = {
            name: `${s.first} ${s.last}`,
            email: s.email,
            phone: s.phone,
            ...(m.extra ?? {}),
            message: m.message,
        };
        const fields = cfg.enquiries.fields.map((f) => f.name);
        v.enquiries.push({
            contactId: v.billingContacts[ci].id,
            name: `${s.first} ${s.last}`,
            at,
            data: Object.fromEntries(
                Object.entries(values).filter(([f]) => fields.includes(f)),
            ),
        });
    });

    // --- QR scans: more than the orders they brought
    const scanRng = rngFor("scans");
    cfg.qr.forEach((q, k) => {
        for (let d = Math.min(q.createdDaysAgo, days); d >= 0; d--) {
            const day = utcDay(istAt(now, -d, 12 * 60));
            const n = Math.round(
                q.perDay *
                    V.weekday[istWeekday(now, -d)] *
                    V.bump(d) *
                    (0.5 + scanRng.next()),
            );
            if (n > 0) {
                v.scans.push({
                    qrCodeId: a.qrIds[k],
                    organizationId: orgId,
                    day,
                    count: n,
                });
            }
        }
    });
    void lateIdx;
    void unpaidIdx;
    return v;
}

function priceOf(p: DemoProduct, variant: number | null): number {
    return toPaise(variant === null ? p.price : p.variants[variant].price);
}

/**
 * People on the plans: ongoing (active, a few paused) and ended. Monthly,
 * anchored at the start of the day they joined; one invoice per period up
 * to now or the day it ended, as the renewal job would have issued them.
 */
function planSubscriptions(
    a: {
        cfg: DemoShopConfig;
        now: Date;
        orgId: string;
        sid: (...parts: (string | number)[]) => string;
        rngFor: (...parts: string[]) => Rng;
        team: readonly string[];
        planIds: readonly string[];
    },
    v: Volume,
    pool: readonly number[],
) {
    const { cfg, now, sid } = a;
    if (cfg.plans.length === 0) return;
    const rng = a.rngFor("subscriptions");
    const { ongoing, paused, cancelled } = cfg.subscriptions;
    const count = ongoing + cancelled;
    // Distinct people: one subscription each.
    const people = [...pool];
    for (let i = people.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [people[i], people[j]] = [people[j], people[i]];
    }
    if (people.length < count)
        throw new Error(
            `${cfg.name}: ${count} subscriptions need ${count} people`,
        );
    for (let i = 0; i < count; i++) {
        const contact = people[i];
        const kind: "ACTIVE" | "PAUSED" | "CANCELLED" =
            i < ongoing - paused
                ? "ACTIVE"
                : i < ongoing
                  ? "PAUSED"
                  : "CANCELLED";
        const planIndex = cfg.plans.indexOf(
            rng.weighted(cfg.plans, (p) => p.weight),
        );
        const plan = cfg.plans[planIndex];
        const daysAgo =
            kind === "CANCELLED"
                ? rng.int(70, 330)
                : kind === "PAUSED"
                  ? rng.int(45, 300)
                  : 3 + Math.floor(Math.pow(rng.next(), 0.9) * 320);
        const anchor = istAt(now, -daysAgo, 0);
        const subscribedAt = istAt(now, -daysAgo, rng.int(10 * 60, 20 * 60));
        const at = (k: number) => boundary(anchor, "MONTH", TIMEZONE, k);
        // When it stopped or paused.
        let event = now;
        if (kind === "CANCELLED") {
            const periodsLived = rng.int(
                1,
                Math.max(1, Math.floor(daysAgo / 31) - 1),
            );
            event = earliest(
                addMinutes(
                    at(periodsLived - 1),
                    rng.int(3, 26) * 24 * 60 + rng.int(9 * 60, 20 * 60),
                ),
                addMinutes(now, -24 * 60),
            );
        }
        let n = 0;
        while (at(n + 1) <= event) n += 1;
        const current: Period = { start: at(n), end: at(n + 1) };
        let pausedAt: Date | null = null;
        if (kind === "PAUSED") {
            pausedAt = earliest(
                addMinutes(current.start, rng.int(1, 20) * 24 * 60 + 11 * 60),
                addMinutes(now, -rng.int(60, 2000)),
            );
            if (pausedAt < current.start)
                pausedAt = addMinutes(current.start, 60);
        }
        const cancelledAt =
            kind === "CANCELLED"
                ? rng.chance(0.5) && current.end <= now
                    ? current.end
                    : event
                : null;
        const owes = kind === "ACTIVE" && rng.chance(0.08);
        const subscriptionId = sid("sub", i);
        const staff = rng.pick(a.team);
        let lastIssued = subscribedAt;
        for (let k = 0; k <= n; k++) {
            const period: Period = { start: at(k), end: at(k + 1) };
            const issuedAt =
                k === 0
                    ? subscribedAt
                    : addMinutes(period.start, rng.int(1, 55));
            lastIssued = issuedAt;
            const unpaid =
                owes && k === n && issuedAt.getTime() + 7 * DAY < now.getTime();
            const payAt = addMinutes(issuedAt, rng.int(5, 3 * 24 * 60));
            v.invoices.push({
                id: sid("invoice", "sub", i, k),
                contact,
                createdAt: issuedAt,
                issuedAt,
                lines: [
                    {
                        description: `${plan.name} · ${periodLabel(period, TIMEZONE)}`,
                        quantity: 1,
                        unitPaise: plan.pricePaise,
                    },
                ],
                taxPaise: 0,
                source: "SUBSCRIPTION",
                subscriptionId,
                period,
                createdByUserId: k === 0 ? staff : null,
                paid:
                    unpaid || payAt > now
                        ? null
                        : {
                              at: payAt,
                              method: rng.chance(0.8) ? "UPI" : "CASH",
                              reference: null,
                          },
                voided: null,
            });
        }
        v.subscriptions.push({
            id: subscriptionId,
            organizationId: a.orgId,
            planId: a.planIds[planIndex],
            contactId: v.billingContacts[contact].id,
            status: kind,
            price: rupees(plan.pricePaise),
            currency: CURRENCY,
            interval: "MONTH",
            timezone: TIMEZONE,
            anchorAt: anchor,
            currentPeriodStart: current.start,
            currentPeriodEnd: current.end,
            pausedAt,
            cancelAtPeriodEnd: false,
            cancelledAt,
            createdByUserId: staff,
            collectionWeekday: plan.collectionWeekday,
            collectionNote: plan.collectionNote,
            classesPerPeriod: null,
            classesPerPeriodSetAt: current.start,
            createdAt: subscribedAt,
            updatedAt: earliest(
                now,
                later(
                    lastIssued,
                    cancelledAt ?? lastIssued,
                    pausedAt ?? lastIssued,
                ),
            ),
        });
        const created = v.contacts[contact];
        if ((created.createdAt as Date) > subscribedAt) {
            created.createdAt = addMinutes(subscribedAt, -60 * 24);
            created.updatedAt = created.createdAt;
        }
    }
}

// --- The site's journal, QR codes, discounts, traffic -----------------------------------------

function findForm(
    site: SeedSite,
    formId: (p: number, n: number) => string,
): string {
    for (let p = 0; p < site.pages.length; p++) {
        const sections = site.pages[p].sections;
        for (let n = 0; n < sections.length; n++) {
            if (sections[n].type === "enquiry") return formId(p, n);
        }
    }
    throw new Error(`${site.name} has no enquiry form`);
}

const POST_CATEGORIES = [
    { key: "help", name: "Help" },
    { key: "news", name: "News" },
    { key: "articles", name: "Articles" },
] as const;

async function writePosts(
    prisma: Db,
    a: {
        cfg: DemoShopConfig;
        sid: (...parts: (string | number)[]) => string;
        orgId: string;
        siteId: string;
        now: Date;
        authorId: string;
    },
) {
    const { cfg, sid, siteId, now } = a;
    const categoryId: Record<string, string> = {};
    for (const c of POST_CATEGORIES) {
        const row = await prisma.postCategory.upsert({
            where: { siteId_slug: { siteId, slug: c.key } },
            update: { name: c.name },
            create: {
                id: sid("postcategory", c.key),
                siteId,
                name: c.name,
                slug: c.key,
            },
        });
        categoryId[c.key] = row.id;
    }
    for (let i = 0; i < cfg.posts.length; i++) {
        const p = cfg.posts[i];
        const publishedAt = istAt(now, -p.daysAgo, 9 * 60 + ((i * 37) % 600));
        const data = {
            title: p.title,
            excerpt: p.excerpt,
            content: p.html,
            image: p.image,
            featured: p.featured ?? false,
            categoryId: categoryId[p.category],
            status: "PUBLISHED",
            publishedAt,
        };
        const post = await prisma.post.upsert({
            where: { siteId_slug: { siteId, slug: p.slug } },
            update: data,
            create: {
                id: sid("post", i),
                siteId,
                authorId: a.authorId,
                slug: p.slug,
                createdAt: addMinutes(publishedAt, -3 * 24 * 60),
                ...data,
            },
        });
        // Live: its own publication, rewritten with the post (seeded rows only).
        const category = POST_CATEGORIES.find((c) => c.key === p.category);
        const snapshot = {
            post: {
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                content: p.html,
                image: p.image,
                featured: p.featured ?? false,
                category: category
                    ? { name: category.name, slug: category.key }
                    : null,
                author: cfg.postAuthor,
                publishedAt: publishedAt.toISOString(),
            },
            path: `/blog/${p.slug}`,
            publishedAt: publishedAt.toISOString(),
        };
        const publicationId = sid("postpub", i);
        await prisma.publication.upsert({
            where: { id: publicationId },
            update: { snapshot, publishedAt, path: snapshot.path },
            create: {
                id: publicationId,
                siteId,
                organizationId: a.orgId,
                postId: post.id,
                path: snapshot.path,
                snapshot,
                templateId: "post",
                templateVersion: 1,
                publishedAt,
            },
        });
        await prisma.post.update({
            where: { id: post.id },
            data: { currentPublicationId: publicationId },
        });
    }
}

async function writeQrCodes(
    prisma: Db,
    a: {
        cfg: DemoShopConfig;
        sid: (...parts: (string | number)[]) => string;
        orgId: string;
        siteId: string;
        now: Date;
    },
): Promise<string[]> {
    const ids: string[] = [];
    for (let k = 0; k < a.cfg.qr.length; k++) {
        const q = a.cfg.qr[k];
        const qid = a.sid("qr", k);
        const data = {
            code: q.code,
            targetKind: q.targetKind,
            targetRef: null,
            place: q.place,
            placeNote: q.placeNote,
            label: q.label,
            style: "BRANDED",
            color: q.color,
        };
        await prisma.qrCode.upsert({
            where: { id: qid },
            update: data,
            create: {
                id: qid,
                siteId: a.siteId,
                organizationId: a.orgId,
                createdAt: istAt(a.now, -q.createdDaysAgo, 12 * 60),
                ...data,
            },
        });
        ids.push(qid);
    }
    return ids;
}

async function writeDiscounts(
    prisma: Db,
    a: {
        cfg: DemoShopConfig;
        sid: (...parts: (string | number)[]) => string;
        orgId: string;
        storeId: string;
        now: Date;
    },
) {
    await prisma.discount.deleteMany({
        where: { id: { startsWith: a.sid("discount") } },
    });
    for (const d of a.cfg.discounts) {
        await prisma.discount.create({
            data: {
                id: a.sid("discount", d.code.toLowerCase()),
                organizationId: a.orgId,
                code: d.code,
                description: d.description,
                kind: "PERCENTAGE",
                percentBps: d.percentBps,
                appliesTo: "BUSINESS",
                startsAt:
                    d.startsDaysAgo === null
                        ? null
                        : istAt(a.now, -d.startsDaysAgo, 0),
                endsAt:
                    d.endsInDays === null
                        ? null
                        : istAt(a.now, d.endsInDays, 23 * 60 + 59),
                createdAt: istAt(a.now, -(d.startsDaysAgo ?? 60) - 2, 11 * 60),
                updatedAt: istAt(a.now, -(d.startsDaysAgo ?? 60) - 2, 11 * 60),
            },
        });
    }
}

/**
 * Ninety days of the site's rollups, as the hourly job writes them: views
 * (with each path's share, which add up to the day's views), enquiries from
 * the form's entries, and paid orders less refunded ones from the Order
 * table — so the tiles agree with the lists they open. A festival lifts the
 * traffic as it lifts the orders.
 */
async function writeAnalytics(
    prisma: Db,
    a: {
        cfg: DemoShopConfig;
        sid: (...parts: (string | number)[]) => string;
        orgId: string;
        now: Date;
        enquiryAt: readonly Date[];
    },
) {
    const { cfg, orgId, now } = a;
    const days = 90;
    const since = new Date(utcDay(now).getTime() - (days - 1) * DAY);
    const [paid, refunded] = await Promise.all([
        prisma.order.findMany({
            where: {
                organizationId: orgId,
                paidAt: { gte: since },
                paymentStatus: { in: ["PAID", "REFUNDED"] },
            },
            select: { paidAt: true },
        }),
        prisma.order.findMany({
            where: {
                organizationId: orgId,
                paymentStatus: "REFUNDED",
                updatedAt: { gte: since },
            },
            select: { updatedAt: true },
        }),
    ]);
    const byDay = (dates: (Date | null)[]) => {
        const m = new Map<string, number>();
        for (const d of dates) {
            if (!d) continue;
            const iso = d.toISOString().slice(0, 10);
            m.set(iso, (m.get(iso) ?? 0) + 1);
        }
        return m;
    };
    const orders = byDay(paid.map((o) => o.paidAt));
    const refunds = byDay(refunded.map((o) => o.updatedAt));
    const enquiries = byDay([...a.enquiryAt]);
    const rng = createRng(
        (SHOWCASE_SEED ^ hashKey(cfg.key, "analytics")) >>> 0,
    );
    const rows: Prisma.AnalyticsDailyAggregateCreateManyInput[] = [];
    const today = utcDay(now);
    for (let i = 0; i < days; i++) {
        const date = new Date(today.getTime() - (days - 1 - i) * DAY);
        const iso = date.toISOString().slice(0, 10);
        const daysAgo = days - 1 - i;
        const weekday = date.getUTCDay();
        const weekend = weekday === 0 || weekday === 6;
        // Views follow the orders: a busy order day had a busy site.
        const base =
            cfg.analytics.viewsPerDay *
            (0.85 + (0.3 * i) / days) *
            cfg.volume.bump(daysAgo) *
            (weekend ? cfg.analytics.weekendFactor : 1);
        const views = Math.max(
            12,
            Math.round(
                base * (0.8 + rng.next() * 0.4) + (orders.get(iso) ?? 0) * 6,
            ),
        );
        const uniques = Math.round(views * (0.6 + rng.next() * 0.12));
        const row = (
            key: string,
            type: string,
            dimension: string,
            value: string,
            count: number,
            unique: number,
        ) => {
            if (count > 0) {
                rows.push({
                    id: a.sid("agg", iso, key),
                    organizationId: orgId,
                    siteId: "",
                    date,
                    type,
                    dimension,
                    dimensionValue: value,
                    count,
                    uniqueCount: unique,
                    createdAt: date,
                    updatedAt: date,
                });
            }
        };
        row("views", "site.view", "", "", views, uniques);
        row(
            "enquiries",
            "enquiry.submitted",
            "",
            "",
            enquiries.get(iso) ?? 0,
            0,
        );
        row("orders", "order.paid", "", "", orders.get(iso) ?? 0, 0);
        row("refunds", "order.refunded", "", "", refunds.get(iso) ?? 0, 0);
        let assigned = 0;
        const per = cfg.analytics.paths.map((p) => {
            const count = Math.floor(views * p.weight);
            assigned += count;
            return { path: p.path, count };
        });
        per[0].count += views - assigned;
        for (const p of per) {
            row(
                `path${p.path.replace(/\W+/g, "-")}`,
                "site.view",
                "path",
                p.path,
                p.count,
                Math.min(p.count, Math.max(1, Math.round(p.count * 0.72))),
            );
        }
    }
    await createInChunks(rows, (data) =>
        prisma.analyticsDailyAggregate.createMany({ data }),
    );
}

// --- Checks -----------------------------------------------------------------------------------

export interface DemoShopCheck {
    what: string;
    /** Rows that break it; none is a pass. */
    rows: (prisma: Db, orgId: string, now: Date) => Promise<unknown[]>;
}

/**
 * The open orders Home calls late at `now`: the API's rule (`lateSql`,
 * DEC-045) against each storefront's own thresholds — open, not handed
 * over, placed longer ago than its way's threshold. A demo designs these
 * few, so a check can hold it to exactly them.
 */
export function lateOrders(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<{ orderId: string; stage: string; fulfilment: string }[]> {
    return prisma.$queryRaw`
        SELECT o."orderId", o.stage::text AS stage, o.fulfilment::text AS fulfilment
        FROM "Order" o LEFT JOIN "StoreSettings" ss ON ss."storeId" = o."storeId"
        WHERE o."organizationId" = ${orgId}
          AND o.status IN ('PENDING', 'PROCESSING')
          AND o."paymentStatus" <> 'REFUNDED'
          AND o.stage IN ('NEW', 'PREPARING', 'READY')
          AND o."createdAt" < ${now}::timestamp - make_interval(mins => CASE o.fulfilment::text
                WHEN 'PICKUP' THEN COALESCE(ss."pickupLateAfterMinutes", 120)
                WHEN 'LOCAL_DELIVERY' THEN COALESCE(ss."localDeliveryLateAfterMinutes", 1440)
                WHEN 'SHIPPING' THEN COALESCE(ss."shippingLateAfterMinutes", 2880)
              END)
        ORDER BY o."createdAt"`;
}

/** A check that the only late orders are the `n` designed late pick-ups. */
export function onlyDesignedLatePickups(n: number): DemoShopCheck {
    return {
        what: `late orders other than the ${n} designed late pick-up(s)`,
        rows: async (prisma, orgId, now) => {
            const late = await lateOrders(prisma, orgId, now);
            const designed =
                late.length === n &&
                late.every(
                    (o) => o.fulfilment === "PICKUP" && o.stage === "READY",
                );
            return designed ? [] : late.length ? late : [{ late: 0 }];
        },
    };
}

/**
 * What every demo shop must hold: photos with one cover, products listed,
 * reviews behind delivered lines, promised stock matching open orders, every
 * customer with a contact, every subscription invoiced, the site live with
 * its journal — and the business's own designed states.
 */
export async function checkDemoShop(
    prisma: Db,
    a: {
        orgId: string;
        name: string;
        now: Date;
        checks: readonly DemoShopCheck[];
    },
): Promise<Record<string, number | string>> {
    const { orgId } = a;
    const failures: string[] = [];
    const json = (x: unknown) =>
        JSON.stringify(x, (_k, y: unknown) =>
            typeof y === "bigint" ? Number(y) : y,
        );
    const fail = (what: string, rows: unknown[]) => {
        if (rows.length > 0)
            failures.push(`${what}: ${json(rows.slice(0, 3))}`);
    };
    fail(
        "products without exactly one cover photo, or more than five",
        await prisma.$queryRaw<unknown[]>`
            SELECT p.id FROM "Product" p LEFT JOIN "ProductImage" i ON i."productId" = p.id
            WHERE p."organizationId" = ${orgId}
            GROUP BY p.id HAVING COUNT(i.id) > 5 OR COUNT(i.id) FILTER (WHERE i.position = 0) <> 1`,
    );
    fail(
        "products not listed at the storefront",
        await prisma.$queryRaw<unknown[]>`
            SELECT p.id FROM "Product" p
            LEFT JOIN "ProductListing" l ON l."productId" = p.id
            WHERE p."organizationId" = ${orgId} AND l.id IS NULL`,
    );
    fail(
        "reviews not behind a delivered, paid line of the same product",
        await prisma.$queryRaw<unknown[]>`
            SELECT r.id FROM "ProductReview" r
            LEFT JOIN "OrderItem" i ON i.id = r."orderItemId"
            LEFT JOIN "Order" o ON o.id = i."orderId"
            WHERE r."organizationId" = ${orgId}
              AND (i.id IS NULL OR o.status <> 'DELIVERED' OR o."paymentStatus" <> 'PAID'
                   OR i."productId" <> r."productId" OR o."customerId" <> r."customerId")`,
    );
    fail(
        "paid orders without a paid time, or money recorded that disagrees with the total",
        await prisma.$queryRaw<unknown[]>`
            SELECT id FROM "Order" WHERE "organizationId" = ${orgId}
              AND (("paymentStatus" IN ('PAID', 'REFUNDED')) <> ("paidAt" IS NOT NULL)
                   OR ("paymentStatus" IN ('PAID', 'REFUNDED') AND "paidByHand" <> total)
                   OR ("paymentStatus" = 'REFUNDED' AND "refundedByHand" <> total)
                   OR total <> subtotal + shipping - discount + tax)`,
    );
    fail(
        "order lines that do not add up to the subtotal",
        await prisma.$queryRaw<unknown[]>`
            SELECT o.id FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id
            WHERE o."organizationId" = ${orgId}
            GROUP BY o.id, o.subtotal HAVING SUM(i.price * i.quantity) <> o.subtotal`,
    );
    fail(
        "orders whose stage disagrees with their status",
        await prisma.$queryRaw<unknown[]>`
            SELECT id, stage, status FROM "Order" WHERE "organizationId" = ${orgId}
              AND status <> 'CANCELLED' AND NOT (
                (stage = 'NEW' AND status = 'PENDING') OR
                (stage IN ('PREPARING', 'READY') AND status = 'PROCESSING') OR
                (stage IN ('OUT_FOR_DELIVERY', 'HANDED_TO_COURIER') AND status = 'SHIPPED') OR
                (stage IN ('COLLECTED', 'DELIVERED') AND status = 'DELIVERED'))`,
    );
    fail(
        "orders whose last step is not their stage",
        await prisma.$queryRaw<unknown[]>`
            SELECT o.id FROM "Order" o
            LEFT JOIN LATERAL (SELECT e."toStage" FROM "OrderEvent" e
                WHERE e."orderId" = o.id AND e.kind = 'STAGE' ORDER BY e."createdAt" DESC LIMIT 1) last ON true
            WHERE o."organizationId" = ${orgId} AND o.status <> 'CANCELLED'
              AND COALESCE(last."toStage", 'NEW') <> o.stage`,
    );
    fail(
        "customers with no contact linked",
        await prisma.$queryRaw<unknown[]>`
            SELECT c.id FROM "Customer" c WHERE c."organizationId" = ${orgId}
              AND NOT EXISTS (SELECT 1 FROM "CustomerIdentityLink" l WHERE l."customerId" = c.id)`,
    );
    fail(
        "subscriptions with no invoice",
        await prisma.$queryRaw<unknown[]>`
            SELECT s.id FROM "CustomerSubscription" s WHERE s."organizationId" = ${orgId}
              AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."subscriptionId" = s.id)`,
    );
    fail(
        "anything dated after now",
        await prisma.$queryRaw<unknown[]>`
            SELECT 'order' AS t, id FROM "Order" WHERE "organizationId" = ${orgId} AND ("createdAt" > ${a.now} OR "updatedAt" > ${a.now} OR "paidAt" > ${a.now})
            UNION ALL SELECT 'event', id FROM "OrderEvent" WHERE "organizationId" = ${orgId} AND "createdAt" > ${a.now}
            UNION ALL SELECT 'review', id FROM "ProductReview" WHERE "organizationId" = ${orgId} AND "createdAt" > ${a.now}`,
    );
    const site = await prisma.site.findFirst({
        where: { organizationId: orgId },
        select: {
            currentPublicationId: true,
            storefrontId: true,
            posts: {
                where: {
                    status: "PUBLISHED",
                    currentPublicationId: { not: null },
                },
                select: { categoryId: true },
            },
        },
    });
    if (!site?.currentPublicationId || !site.storefrontId)
        failures.push("the site is not live, or sells from no storefront");
    const byCategory = new Map<string, number>();
    for (const p of site?.posts ?? [])
        byCategory.set(
            p.categoryId ?? "",
            (byCategory.get(p.categoryId ?? "") ?? 0) + 1,
        );
    if (
        byCategory.size < 3 ||
        Array.from(byCategory.values()).some((n) => n < 8)
    ) {
        failures.push(
            `the journal needs at least 8 live posts in each of its 3 categories: ${json(Array.from(byCategory.values()))}`,
        );
    }
    for (const c of a.checks) fail(c.what, await c.rows(prisma, orgId, a.now));
    if (failures.length > 0) {
        throw new Error(
            `${a.name} failed its checks:\n- ${failures.join("\n- ")}`,
        );
    }

    const [
        products,
        variants,
        orders,
        open,
        customers,
        subs,
        invoices,
        reviews,
        posts,
        bookings,
        contacts,
    ] = await Promise.all([
        prisma.product.count({ where: { organizationId: orgId } }),
        prisma.productVariant.count({
            where: { product: { organizationId: orgId } },
        }),
        prisma.order.count({ where: { organizationId: orgId } }),
        prisma.order.count({
            where: {
                organizationId: orgId,
                status: { in: ["PENDING", "PROCESSING"] },
            },
        }),
        prisma.customer.count({ where: { organizationId: orgId } }),
        prisma.customerSubscription.groupBy({
            by: ["status"],
            where: { organizationId: orgId },
            _count: true,
        }),
        prisma.invoice.count({ where: { organizationId: orgId } }),
        prisma.productReview.count({ where: { organizationId: orgId } }),
        prisma.post.count({ where: { site: { organizationId: orgId } } }),
        prisma.booking.count({ where: { organizationId: orgId } }),
        prisma.contact.count({ where: { organizationId: orgId } }),
    ]);
    return {
        business: a.name,
        products,
        variants,
        orders,
        open,
        customers,
        contacts,
        subscriptions: subs
            .map((s) => `${s._count} ${s.status.toLowerCase()}`)
            .join(", "),
        invoices,
        reviews,
        posts,
        bookings,
    };
}

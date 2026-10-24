/**
 * The demo salon and gym (DEC-188, #1191): two businesses anyone can look at
 * from saroh.in's "See a live demo", at `demo-salon` and `demo-gym`.
 *
 * Each is the showcase's own data — Gulmohar Salon & Bridal (services, the
 * people on its diary and their weeks, packs, clubs, opening hours, site)
 * and Pulse Fitness (classes and their weekly times, coaches, packs,
 * memberships, site) — written on fixed `demo_salon_…` / `demo_gym_…` ids:
 *
 * - `Organization.isDemo` is true, so every public write refuses it and its
 *   owner can't sign in (`assertNotDemo`, `refuseDemoOwners`).
 * - Its site is published at its address and its booking page is ready.
 * - It is on Pro through an admin plan override (`EntitlementOverride` kind
 *   `plan`, no end date) and has no `Subscription`, so nothing reads as
 *   paused or over a limit and the renewal job never sees it.
 * - Its owner is an undeliverable `example.com` address with no password and
 *   no Account, made here rather than through Better Auth, so no `signed_up`
 *   event fires. Their only membership is the demo.
 *
 * No bookings, customers, orders or invoices: a demo is looked at, never
 * worked in. Photos are the showcase's links (Unsplash, and the local app's
 * `/demo/` files); how they reach production is deferred (plan U8).
 *
 * Everything is upserted, and the rows that are a fixture's whole set (who
 * takes what, weekly hours, a pack's services) are keyed on their content,
 * so a second run writes no new row. A dry run does the same work in the
 * same transaction and rolls it back.
 *
 * Run: `pnpm --filter @saroh/database db:demo-businesses [--dry-run]`
 */
import type { PrismaClient } from "@prisma/client";

import type { SeedSection, SeedSite } from "../seed/data";
import type { Db } from "../seed/helpers";
import { writeSite } from "../seed/helpers";
import { PULSE, TIMEZONE } from "../seed/showcase/data";
import type { DsSiteSection } from "../seed/showcase/diary-shop-types";
import { minuteOf } from "../seed/showcase/people";
import { PULSE_RULES, PULSE_STAFF } from "../seed/showcase/pulse-staff";
import { NOOR } from "../seed/showcase/salon-data";
import type { TransactionClient } from "../transaction";

const CURRENCY = "INR";
/** The catalogue plan both demos are on. */
export const DEMO_PLAN_KEY = "pro";
/** When the demos read as made: fixed, so a re-run changes nothing. */
const CREATED_AT = new Date("2026-10-24T04:30:00.000Z");
/**
 * Bump when what a demo site shows changes: a Publication is never
 * rewritten, so a changed site is published again under a new id.
 */
const SITE_REVISION = "demo-1";

interface Window {
    days: readonly number[];
    from: string;
    to: string;
}

interface DemoService {
    name: string;
    description: string;
    minutes: number;
    capacity: number;
    /** Paise; null shows no price. */
    pricePaise: number | null;
    buffer: number;
    visits: number;
    locationType: string;
    meetingUrl: string | null;
    shown: boolean;
    /** The service's own weekly times; none means its people's hours. */
    rules: readonly Window[];
}

interface DemoPack {
    name: string;
    description: string;
    credits: number;
    validityDays: number;
    pricePaise: number;
    kind: "CLASSES" | "ONE_TO_ONE";
    /** Indexes into the services. */
    services: readonly number[];
}

interface DemoPlan {
    name: string;
    description: string;
    pricePaise: number;
    interval: string;
    classesPerMonth: number;
}

export interface DemoBusinessSpec {
    /** The id of the business, and the prefix of every row it owns. */
    id: string;
    /** Its address: `Organization.slug` and the site's subdomain. */
    address: string;
    name: string;
    owner: { email: string; name: string };
    modules: readonly string[];
    profile: {
        legalName: string;
        contactEmail: string;
        addressLine1: string;
        addressLine2?: string;
        city: string;
        postalCode: string;
        phone: string | null;
    };
    storeAddress: string;
    storeDescription: string;
    openingHours: readonly {
        day: string;
        open: string;
        close: string;
        closed: boolean;
    }[];
    rules: {
        bookAheadDays: number;
        latestBookingMinutes: number;
        freeCancelHours: number;
    };
    services: readonly DemoService[];
    staff: readonly {
        key: string;
        name: string;
        title: string;
        services: readonly number[];
        hours: readonly Window[];
    }[];
    packs: readonly DemoPack[];
    plans: readonly DemoPlan[];
    site: SeedSite;
    footer: string;
}

const week = (open: string, close: string, sunday?: [string, string]) =>
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => ({
        day,
        open: day === "SUN" && sunday ? sunday[0] : open,
        close: day === "SUN" && sunday ? sunday[1] : close,
        closed: false,
    }));

// --- the salon: Gulmohar Salon & Bridal --------------------------------------

const salonServiceIndex = new Map(NOOR.services.map((s, i) => [s.key, i]));
const salonIndexOf = (key: string): number => {
    const i = salonServiceIndex.get(key);
    if (i === undefined) throw new Error(`Demo salon: no service "${key}"`);
    return i;
};

/** The showcase's sections, without its journal (a demo has no posts). */
const salonSection = (s: DsSiteSection): SeedSection => {
    const section: Record<string, unknown> = {
        type: s.type,
        content: s.content,
    };
    if (s.type === "servicesList") {
        section.services = (s.services ?? []).map(salonIndexOf);
    }
    if (s.form) section.form = s.form;
    // The contract parses every section on write (`writeSite`).
    return section as unknown as SeedSection;
};

export const DEMO_SALON: DemoBusinessSpec = {
    id: "demo_salon",
    address: "demo-salon",
    name: NOOR.name,
    owner: {
        email: "demo-salon-owner@example.com",
        name: "Gulmohar demo owner",
    },
    // What the salon's site and booking page need; no shop, no payments.
    modules: ["APPOINTMENTS", "CRM", "WEBSITE", "CLASS_PACKS"],
    profile: {
        legalName: NOOR.legalName,
        contactEmail: NOOR.contactEmail,
        ...NOOR.address,
        phone: NOOR.phoneE164,
    },
    storeAddress: NOOR.storeAddress,
    storeDescription: NOOR.storeDescription,
    openingHours: NOOR.openingHours,
    rules: NOOR.rules,
    services: NOOR.services.map((s) => ({
        name: s.name,
        description: s.description,
        minutes: s.minutes,
        capacity: 1,
        pricePaise: s.pricePaise,
        buffer: s.buffer ?? 0,
        visits: s.visits,
        locationType: s.locationType,
        meetingUrl: s.meetingUrl,
        shown: s.shown,
        rules: [],
    })),
    staff: NOOR.staff.map((p) => ({
        key: p.key,
        name: p.name,
        title: p.title,
        services: p.services.map(salonIndexOf),
        hours: p.hours,
    })),
    packs: NOOR.packs.map((p) => ({
        name: p.name,
        description: p.description,
        credits: p.credits,
        validityDays: p.validityDays,
        pricePaise: p.pricePaise,
        kind: "ONE_TO_ONE",
        services: p.services.map(salonIndexOf),
    })),
    plans: NOOR.plans.map((p) => ({
        name: p.name,
        description: p.description,
        pricePaise: p.pricePaise,
        interval: "MONTH",
        classesPerMonth: p.classesPerMonth,
    })),
    site: {
        slug: "demo-salon",
        name: NOOR.name,
        subdomain: "demo-salon",
        published: true,
        createdDaysAgo: 30,
        revision: SITE_REVISION,
        pages: NOOR.site.pages
            .filter((p) => p.path !== "/journal")
            .map((p) => ({
                path: p.path,
                title: p.title,
                isHome: p.isHome,
                sections: p.sections
                    .filter((s) => s.type !== "journal")
                    .map(salonSection),
            })),
    },
    footer: NOOR.site.footer,
};

// --- the gym: Pulse Fitness ----------------------------------------------------

export const DEMO_GYM: DemoBusinessSpec = {
    id: "demo_gym",
    address: "demo-gym",
    name: PULSE.name,
    owner: {
        email: "demo-gym-owner@example.com",
        name: "Pulse demo owner",
    },
    modules: ["APPOINTMENTS", "CRM", "WEBSITE", "CLASS_PACKS"],
    profile: {
        legalName: PULSE.name,
        contactEmail: "pulsefitness@example.com",
        addressLine1: PULSE.registeredAddress.addressLine1,
        city: PULSE.registeredAddress.city,
        postalCode: PULSE.registeredAddress.postalCode,
        phone: null,
    },
    storeAddress: "12th Main, Indiranagar, Bengaluru",
    storeDescription: "A neighbourhood gym on 12th Main, Indiranagar.",
    // As its footer says: Mon–Sat 6am–10pm, Sun 7am–12pm.
    openingHours: week("06:00", "22:00", ["07:00", "12:00"]),
    rules: PULSE_RULES,
    services: PULSE.services.map((s) => ({
        name: s.name,
        description: s.description,
        minutes: s.minutes,
        capacity: s.capacity,
        pricePaise: s.priceCents,
        buffer: 0,
        visits: 1,
        locationType: s.meetingUrl ? "ONLINE" : "IN_PERSON",
        meetingUrl: s.meetingUrl ?? null,
        shown: true,
        rules: s.rules,
    })),
    staff: PULSE_STAFF.map((p) => ({
        key: p.key,
        name: p.name,
        title: p.title,
        services: p.services,
        hours: p.hours,
    })),
    packs: (PULSE.billing?.packs ?? [])
        .filter((p) => p.status === "ACTIVE")
        .map((p) => ({
            name: p.name,
            description: p.description,
            credits: p.credits,
            validityDays: p.validityDays,
            pricePaise: p.pricePaise,
            kind: "CLASSES",
            services: p.services,
        })),
    plans: (PULSE.billing?.plans ?? []).map((p) => ({
        name: p.name,
        description: p.description,
        pricePaise: p.pricePaise,
        interval: p.interval,
        classesPerMonth: p.classesPerMonth ?? 0,
    })),
    site: {
        ...PULSE.site,
        slug: "demo-gym",
        subdomain: "demo-gym",
        createdDaysAgo: 30,
        // Its journal isn't written; no menu link to it.
        navigationExtra: undefined,
        revision: SITE_REVISION,
    },
    footer: PULSE.footer,
};

export const DEMO_BUSINESSES: readonly DemoBusinessSpec[] = [
    DEMO_SALON,
    DEMO_GYM,
];

// --- writing -------------------------------------------------------------------

export interface DemoBusinessesReport {
    businesses: { id: string; address: string; name: string }[];
    /** Rows the run added (0 on a re-run). */
    created: number;
    /** Whether Pro is a plan on the live catalogue; null with none live. */
    planOnLiveCatalogue: boolean | null;
    dryRun: boolean;
}

class DryRunRollback extends Error {}

const rupees = (paise: number) => (paise / 100).toFixed(2);

export async function makeDemoBusinesses(
    db: PrismaClient,
    options: { dryRun?: boolean; now?: Date } = {},
): Promise<DemoBusinessesReport> {
    const dryRun = options.dryRun ?? false;
    const now = options.now ?? new Date();
    const ids = DEMO_BUSINESSES.map((b) => b.id);
    let created = 0;
    try {
        await db.$transaction(
            async (tx) => {
                const before = await countRows(tx, ids);
                for (const spec of DEMO_BUSINESSES) {
                    await writeDemo(tx, spec, now);
                }
                created = (await countRows(tx, ids)) - before;
                if (dryRun) throw new DryRunRollback();
            },
            { timeout: 120_000 },
        );
    } catch (e) {
        if (!(e instanceof DryRunRollback)) throw e;
    }
    return {
        businesses: DEMO_BUSINESSES.map((b) => ({
            id: b.id,
            address: b.address,
            name: b.name,
        })),
        created,
        planOnLiveCatalogue: await planOnLiveCatalogue(db, now),
        dryRun,
    };
}

async function planOnLiveCatalogue(
    db: PrismaClient,
    now: Date,
): Promise<boolean | null> {
    const live = await db.pricingCatalogVersion.findFirst({
        where: { goLiveAt: { lte: now } },
        orderBy: { version: "desc" },
        select: { catalog: true },
    });
    if (!live) return null;
    const plans = (live.catalog as { plans?: { id?: unknown }[] }).plans;
    return (plans ?? []).some((p) => p.id === DEMO_PLAN_KEY);
}

/** Every row the demos own, so a re-run can say it added none. */
async function countRows(tx: TransactionClient, orgIds: string[]) {
    const org = { organizationId: { in: orgIds } };
    const counts = await Promise.all([
        tx.organization.count({ where: { id: { in: orgIds } } }),
        tx.user.count({
            where: { id: { in: orgIds.map((id) => `${id}_owner`) } },
        }),
        tx.businessProfile.count({ where: org }),
        tx.membership.count({ where: org }),
        tx.organizationModule.count({ where: org }),
        tx.entitlementOverride.count({ where: org }),
        tx.subscription.count({ where: org }),
        tx.store.count({ where: org }),
        tx.storeSettings.count({ where: { store: org } }),
        tx.storeFeatures.count({ where: { store: org } }),
        tx.storeOwner.count({ where: { store: org } }),
        tx.site.count({ where: org }),
        tx.page.count({ where: org }),
        tx.pageVersion.count({ where: org }),
        tx.section.count({ where: org }),
        tx.publication.count({ where: org }),
        tx.form.count({ where: org }),
        tx.service.count({ where: org }),
        tx.availabilityRule.count({ where: org }),
        tx.staffMember.count({ where: org }),
        tx.staffService.count({ where: org }),
        tx.staffHours.count({ where: org }),
        tx.bookingRules.count({ where: org }),
        tx.classPack.count({ where: org }),
        tx.classPackService.count({ where: org }),
        tx.subscriptionPlan.count({ where: org }),
    ]);
    return counts.reduce((a, b) => a + b, 0);
}

async function writeDemo(
    tx: TransactionClient,
    spec: DemoBusinessSpec,
    now: Date,
): Promise<void> {
    const orgId = spec.id;
    const id = (...parts: (string | number)[]) => [orgId, ...parts].join("_");
    const ownerId = id("owner");
    const createdAt = CREATED_AT;

    // --- the business, flagged a demo -------------------------------------------
    const holder = await tx.organization.findUnique({
        where: { slug: spec.address },
        select: { id: true },
    });
    if (holder && holder.id !== orgId) {
        throw new Error(
            `The address "${spec.address}" is another business's (${holder.id}); nothing was written.`,
        );
    }
    await tx.organization.upsert({
        where: { id: orgId },
        update: { name: spec.name, slug: spec.address, isDemo: true },
        create: {
            id: orgId,
            name: spec.name,
            slug: spec.address,
            isDemo: true,
            createdAt,
        },
    });
    const profile = {
        ...spec.profile,
        country: "India",
        timezone: TIMEZONE,
        gstRegistered: false,
    };
    await tx.businessProfile.upsert({
        where: { organizationId: orgId },
        update: profile,
        create: { id: id("profile"), organizationId: orgId, ...profile },
    });

    // --- its owner: no password, no Account, only this membership ----------------
    await tx.user.upsert({
        where: { id: ownerId },
        update: { email: spec.owner.email, name: spec.owner.name },
        create: {
            id: ownerId,
            email: spec.owner.email,
            name: spec.owner.name,
            createdAt,
        },
    });
    await tx.membership.upsert({
        where: {
            organizationId_userId: { organizationId: orgId, userId: ownerId },
        },
        update: { role: "OWNER" },
        create: {
            id: id("membership", "owner"),
            organizationId: orgId,
            userId: ownerId,
            role: "OWNER",
            createdAt,
        },
    });
    for (const moduleKey of spec.modules) {
        await tx.organizationModule.upsert({
            where: {
                organizationId_moduleKey: { organizationId: orgId, moduleKey },
            },
            update: { status: "ENABLED" },
            create: {
                id: id("module", moduleKey.toLowerCase()),
                organizationId: orgId,
                moduleKey,
                status: "ENABLED",
                enabledAt: createdAt,
                enabledByUserId: ownerId,
            },
        });
    }

    // --- Pro by an admin plan override, and no subscription ---------------------
    const override = {
        kind: "plan",
        key: "plan",
        planKey: DEMO_PLAN_KEY,
        value: null,
        moduleKey: null,
        expiresAt: null,
        revokedAt: null,
        reason: "Demo business (DEC-188): on Pro with no subscription, so nothing reads as paused.",
        grantedByUserId: ownerId,
    };
    await tx.entitlementOverride.upsert({
        where: { id: id("plan") },
        update: override,
        create: {
            id: id("plan"),
            organizationId: orgId,
            ...override,
            createdAt,
        },
    });
    await tx.subscription.deleteMany({ where: { organizationId: orgId } });

    // --- its location: the address and opening hours ------------------------------
    const storeId = id("store");
    await tx.store.upsert({
        where: { id: storeId },
        update: { name: spec.name, deletedAt: null },
        create: {
            id: storeId,
            organizationId: orgId,
            name: spec.name,
            description: spec.storeDescription,
            createdAt,
        },
    });
    await tx.storeOwner.upsert({
        where: { storeId_userId: { storeId, userId: ownerId } },
        update: { role: "OWNER" },
        create: {
            id: id("storeowner"),
            storeId,
            userId: ownerId,
            role: "OWNER",
        },
    });
    const settings = {
        currency: CURRENCY,
        timezone: TIMEZONE,
        kind: "SHOP",
        address: spec.storeAddress,
        openingHours: spec.openingHours.map((d) => ({ ...d })),
        collectionEnabled: false,
        shippingEnabled: false,
        taxEnabled: false,
    };
    await tx.storeSettings.upsert({
        where: { storeId },
        update: settings,
        create: { id: id("storesettings"), storeId, ...settings },
    });
    await tx.storeFeatures.upsert({
        where: { storeId },
        update: { ecommerceEnabled: false },
        create: { id: id("storefeatures"), storeId, ecommerceEnabled: false },
    });

    // --- the published site ---------------------------------------------------------
    const serviceId = (i: number) => id("service", i);
    // shortcut: writeSite is typed for the seed's client, not a transaction;
    // it only uses model delegates, which a transaction has too.
    const siteId = await writeSite(tx as unknown as Db, {
        fixture: spec.site,
        orgId,
        userId: ownerId,
        now,
        ids: {
            site: id("site"),
            page: (p) => id("page", p),
            pageVersion: (p) => id("pageversion", p),
            section: (p, n) => id("section", p, n),
            sectionKey: (p, n) => id("sectionkey", p, n),
            form: (p, n) => id("form", p, n),
            publication: id("publication"),
        },
        pipelineId: null,
        serviceId,
        footer: { format: "text", value: spec.footer },
    });

    // --- services, and their weekly times -----------------------------------------
    for (let i = 0; i < spec.services.length; i++) {
        const s = spec.services[i];
        const data = {
            name: s.name,
            description: s.description,
            durationMinutes: s.minutes,
            bufferBeforeMinutes: s.buffer,
            bufferAfterMinutes: s.buffer,
            capacity: s.capacity,
            priceCents: s.pricePaise,
            currency: s.pricePaise === null ? null : CURRENCY,
            status: "ACTIVE",
            deletedAt: null,
            locationType: s.locationType,
            meetingUrl: s.meetingUrl,
            visits: s.visits,
            depositMode: "NONE",
            showOnBookingPage: s.shown,
            isSample: false,
            siteId: s.shown ? siteId : null,
        };
        await tx.service.upsert({
            where: { id: serviceId(i) },
            update: data,
            create: {
                id: serviceId(i),
                organizationId: orgId,
                timezone: TIMEZONE,
                // A minute apart: the booking page lists services by when
                // they were made.
                createdAt: new Date(createdAt.getTime() + i * 60_000),
                ...data,
            },
        });
    }
    const availabilityRuleRows = spec.services.flatMap((s, i) =>
        s.rules.flatMap((w) =>
            w.days.map((dayOfWeek) => ({
                id: id("rule", i, dayOfWeek, w.from, w.to),
                organizationId: orgId,
                serviceId: serviceId(i),
                dayOfWeek,
                startMinute: minuteOf(w.from),
                endMinute: minuteOf(w.to),
                createdAt,
            })),
        ),
    );
    await tx.availabilityRule.deleteMany({
        where: {
            organizationId: orgId,
            id: { notIn: availabilityRuleRows.map((r) => r.id) },
        },
    });
    await tx.availabilityRule.createMany({
        data: availabilityRuleRows,
        skipDuplicates: true,
    });

    // --- who is on the diary, what each takes, their weeks, the rules ------------
    for (const p of spec.staff) {
        const data = {
            name: p.name,
            title: p.title,
            status: "ACTIVE",
            archivedAt: null,
        };
        await tx.staffMember.upsert({
            where: { id: id("staff", p.key) },
            update: data,
            create: {
                id: id("staff", p.key),
                organizationId: orgId,
                ...data,
                createdAt,
            },
        });
    }
    const staffServiceRows = spec.staff.flatMap((p) =>
        p.services.map((i) => ({
            id: id("staffservice", p.key, i),
            organizationId: orgId,
            staffId: id("staff", p.key),
            serviceId: serviceId(i),
            createdAt,
        })),
    );
    await tx.staffService.deleteMany({
        where: {
            organizationId: orgId,
            id: { notIn: staffServiceRows.map((r) => r.id) },
        },
    });
    await tx.staffService.createMany({
        data: staffServiceRows,
        skipDuplicates: true,
    });
    const staffHoursRows = spec.staff.flatMap((p) =>
        p.hours.flatMap((w) =>
            w.days.map((dayOfWeek) => ({
                id: id("staffhours", p.key, dayOfWeek, w.from, w.to),
                organizationId: orgId,
                staffId: id("staff", p.key),
                dayOfWeek,
                startMinute: minuteOf(w.from),
                endMinute: minuteOf(w.to),
                createdAt,
            })),
        ),
    );
    await tx.staffHours.deleteMany({
        where: {
            organizationId: orgId,
            id: { notIn: staffHoursRows.map((r) => r.id) },
        },
    });
    await tx.staffHours.createMany({
        data: staffHoursRows,
        skipDuplicates: true,
    });
    await tx.bookingRules.upsert({
        where: { organizationId: orgId },
        update: { ...spec.rules },
        create: {
            id: id("bookingrules"),
            organizationId: orgId,
            ...spec.rules,
            createdAt,
        },
    });

    // --- packs and memberships ------------------------------------------------------
    for (let i = 0; i < spec.packs.length; i++) {
        const p = spec.packs[i];
        const data = {
            name: p.name,
            description: p.description,
            credits: p.credits,
            validityDays: p.validityDays,
            price: rupees(p.pricePaise),
            currency: CURRENCY,
            status: "ACTIVE",
            kind: p.kind,
        };
        await tx.classPack.upsert({
            where: { id: id("pack", i) },
            update: data,
            create: {
                id: id("pack", i),
                organizationId: orgId,
                ...data,
                createdAt,
            },
        });
    }
    const packServices = spec.packs.flatMap((p, i) =>
        p.services.map((s) => ({
            packId: id("pack", i),
            serviceId: serviceId(s),
            organizationId: orgId,
        })),
    );
    await tx.classPackService.deleteMany({
        where: {
            organizationId: orgId,
            NOT: {
                OR: packServices.map((r) => ({
                    packId: r.packId,
                    serviceId: r.serviceId,
                })),
            },
        },
    });
    await tx.classPackService.createMany({
        data: packServices,
        skipDuplicates: true,
    });
    for (let i = 0; i < spec.plans.length; i++) {
        const p = spec.plans[i];
        const data = {
            name: p.name,
            description: p.description,
            price: rupees(p.pricePaise),
            currency: CURRENCY,
            interval: p.interval,
            classesPerMonth: p.classesPerMonth,
            status: "ACTIVE",
        };
        await tx.subscriptionPlan.upsert({
            where: { id: id("plan", i) },
            update: data,
            create: {
                id: id("plan", i),
                organizationId: orgId,
                ...data,
                createdAt,
            },
        });
    }
}

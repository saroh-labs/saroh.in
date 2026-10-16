import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { ensureCalendarOnlyRole } from "../../calendar-only-role";
import type { SeedSection, SeedSite } from "../data";
import type { Db } from "../helpers";
import {
    buildAnalyticsRows,
    id,
    listProductAt,
    utcDay,
    writeSite,
} from "../helpers";
import { seedPlanId } from "../pricing";
import { seedStandInPaymentProvider } from "../stand-in-providers";
import { gstin } from "./bakery";
import { financialYear } from "./clinic-plan";
import type { ModuleKey } from "./data";
import { SHOWCASE_KEY, TIMEZONE } from "./data";
import { addMinutes, earliest, istAt, istWeekday, minuteOf } from "./people";
import type { Rng } from "./random";
import type { StudioImage, StudioPost } from "./studio-types";
import { STUDIO_POST_CATEGORIES } from "./studio-types";

/**
 * The engine behind the two service-studio showcases — Frame & Vow, a
 * wedding photography and planning studio, and Pixel & Chai, a small
 * social-media agency. Both sell their own time (services in a diary, taken
 * by named people), a little catalogue, GST tax invoices written by hand,
 * and both run a pipeline of enquiries and a site with writing on it.
 *
 * STRUCTURE — the business and its GST standing, team, modules, storefront,
 * catalogue, services, the people on the diary, booking rules, plans, the
 * site and its posts — is upserted on `seed_sc_<key>_` ids.
 *
 * VOLUME — contacts, customers and their orders and reviews, bookings,
 * invoices, subscriptions, leads and their timelines, form entries, notes
 * and the Insights rollups — is cleared and written again each run from a
 * seeded random stream and `now`, so a re-run in the same half hour writes
 * the same rows, and a run a week later moves with the calendar.
 *
 * Every invoice is a GST tax invoice the way the API writes one (ADR-008):
 * prices include GST, each line's taxable value is its amount at its rate
 * rounded to the paisa, CGST and SGST halve the rest (an odd paisa to CGST),
 * numbered `<PREFIX>/<yy-yy>/0001…` per financial year with no gaps.
 */

const CURRENCY = "INR";
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Paise as a Decimal(12,2) string: 120000 → "1200.00". */
export const rupees = (paise: number) => {
    const sign = paise < 0 ? "-" : "";
    const p = Math.abs(paise);
    return `${sign}${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;
};

/** A business's seeded id maker: `seed_sc_<key>_<parts>`. */
export const studioId =
    (key: string) =>
    (...parts: (string | number)[]) =>
        id(SHOWCASE_KEY, key, ...parts);

// --- What a studio is -----------------------------------------------------------

export interface StudioWindow {
    /** 0 = Sunday … 6 = Saturday. */
    days: readonly number[];
    from: string;
    to: string;
}

export interface StudioStaff {
    key: string;
    name: string;
    title: string;
    /** Keys of the services they take. */
    services: readonly string[];
    hours: readonly StudioWindow[];
    /** The one with a login: linked to that person's membership. */
    member?: boolean;
}

export type StudioDeposit = "NONE" | "PERCENT_25" | "PERCENT_50" | "FULL";

export interface StudioService {
    key: string;
    name: string;
    description: string;
    minutes: number;
    /** GST-inclusive, paise; null = no price shown (a free call shows ₹0). */
    pricePaise: number;
    sac: string;
    depositMode: StudioDeposit;
    locationType: "IN_PERSON" | "EITHER";
    meetingUrl: string | null;
    shown: boolean;
    /**
     * How it is paid: `free`; `online`, in full on the booking page (its
     * invoice is the booking's, paid there and then); `desk`, billed after
     * the visit; `job`, billed through a job's advance and balance invoices.
     */
    pay: "free" | "online" | "desk" | "job";
    /** Bookings the random diary places per 30 days; 0 = only jobs place it. */
    perMonth: number;
    /** How many days ahead people book it. */
    ahead: readonly [number, number];
}

export interface StudioVariant {
    title: string;
    sku: string;
    /** GST-inclusive, paise. */
    pricePaise: number;
    /** Index into the product's images. */
    image?: number;
}

export interface StudioProduct {
    slug: string;
    name: string;
    category: string;
    description: string;
    /** GST-inclusive, paise: the "from" price, or the only one. */
    pricePaise: number;
    /** HSN for goods, SAC for a service sold as a product. */
    hsn: string;
    keyPoints: readonly string[];
    materials: string | null;
    images: readonly StudioImage[];
    /** One option (a product carries one), its values the variants. */
    option?: { name: string; variants: readonly StudioVariant[] };
    /** How it reaches the buyer. */
    fulfilment: "SHIPPING" | "PICKUP" | "DIGITAL";
    /** Relative share of online orders; 0 = quoted and invoiced, never ordered. */
    demand: number;
}

export interface StudioPlan {
    key: string;
    name: string;
    description: string;
    /** GST-inclusive, paise a month. */
    pricePaise: number;
    sac: string;
}

export interface StudioSpec {
    key: string;
    name: string;
    slug: string;
    legalName: string;
    contactEmail: string;
    /** E.164, as the profile stores it. */
    phone: string;
    gst: { state: string; stateName: string; pan: string; prefix: string };
    address: {
        addressLine1: string;
        addressLine2: string;
        city: string;
        postalCode: string;
    };
    createdDaysAgo: number;
    modules: readonly ModuleKey[];
    store: {
        description: string;
        openingHours: readonly {
            day: string;
            open: string;
            close: string;
            closed: boolean;
        }[];
    };
    staff: readonly StudioStaff[];
    rules: {
        bookAheadDays: number;
        latestBookingMinutes: number;
        freeCancelHours: number;
    };
    services: readonly StudioService[];
    categories: readonly { key: string; name: string }[];
    products: readonly StudioProduct[];
    plans: readonly StudioPlan[];
    pipeline: { name: string; stages: readonly string[] } | null;
    site: SeedSite;
    footer: string;
    posts: readonly StudioPost[];
}

export const printedAddress = (s: StudioSpec) =>
    `${s.address.addressLine1}, ${s.address.addressLine2}, ${s.address.city} ${s.address.postalCode}, ${s.gst.stateName}`;

export const studioGstin = (s: StudioSpec) => gstin(s.gst.state, s.gst.pan);

/**
 * A section the shared `SeedSection` union does not list (projects,
 * gallery, journal, plans, person, a hero with a photo). `writeSite` passes
 * such content straight to the section contract, which validates it as the
 * editor's save would, so the cast loses no checking.
 */
export const section = (
    type: string,
    content: Record<string, unknown>,
): SeedSection => ({ type, content }) as unknown as SeedSection;

/** A photo as a block's image field holds it. */
export const blockImage = (img: StudioImage) => ({
    src: img.url,
    alt: img.alt,
    width: img.width,
    height: img.height,
});

/** A value the fixtures promise exists; a missing one is a fixture bug. */
export function must<T>(
    value: T | null | undefined,
    what = "a fixture value",
): T {
    if (value === null || value === undefined)
        throw new Error(`Missing ${what}`);
    return value;
}

// --- Structure --------------------------------------------------------------------

export interface StudioContext {
    prisma: Db;
    now: Date;
    demoUserId: string;
    /** The team member with a login (a Member). */
    memberUserId: string;
}

export interface StudioWorld {
    orgId: string;
    storeId: string;
    siteId: string;
    formId: string | null;
    formFields: readonly string[];
    createdAt: Date;
    serviceId: (key: string) => string;
    staffId: (key: string) => string;
    stageIds: readonly string[];
    pipelineId: string | null;
    planId: (key: string) => string;
    product: Record<string, { id: string; variants: string[] }>;
}

export async function writeStructure(
    ctx: StudioContext,
    spec: StudioSpec,
): Promise<StudioWorld> {
    const { prisma, now, demoUserId } = ctx;
    const sid = studioId(spec.key);
    const orgId = sid("org");
    const storeId = sid("store");
    const createdAt = istAt(now, -spec.createdDaysAgo, 10 * 60);

    // --- the business, its GST standing, team, modules and plan
    await prisma.organization.upsert({
        where: { slug: spec.slug },
        update: { name: spec.name },
        create: { id: orgId, name: spec.name, slug: spec.slug, createdAt },
    });
    const profile = {
        legalName: spec.legalName,
        country: "India",
        taxId: studioGstin(spec),
        contactEmail: spec.contactEmail,
        timezone: TIMEZONE,
        gstRegistered: true,
        gstState: spec.gst.state,
        ...spec.address,
        invoicePrefix: spec.gst.prefix,
        phone: spec.phone,
        gstPriceMode: "INCLUDED",
    };
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: profile,
        create: { id: sid("profile"), organizationId: orgId, ...profile },
    });
    const memberships: [string, "OWNER" | "MEMBER", string][] = [
        [demoUserId, "OWNER", "demo"],
        [ctx.memberUserId, "MEMBER", "member"],
    ];
    for (const [userId, role, key] of memberships) {
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
    for (const moduleKey of spec.modules) {
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
    const plan = { id: await seedPlanId(prisma, now) };
    await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId: plan.id, status: "ACTIVE" },
        create: {
            id: sid("subscription"),
            organizationId: orgId,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodEnd: istAt(now, 30, 9 * 60),
        },
    });
    // Online payment for deposits, booking page and plans. On this
    // machine's database only (`stand-in-providers.ts`).
    await seedStandInPaymentProvider(prisma, {
        id: sid("payments", "razorpay"),
        organizationId: orgId,
        provider: "RAZORPAY",
    });

    // --- the storefront: the studio itself
    await prisma.store.upsert({
        where: { id: storeId },
        update: { name: spec.name, organizationId: orgId, deletedAt: null },
        create: {
            id: storeId,
            organizationId: orgId,
            name: spec.name,
            description: spec.store.description,
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
        address: `${spec.address.addressLine1}, ${spec.address.addressLine2}, ${spec.address.city} ${spec.address.postalCode}`,
        openingHours: spec.store.openingHours.map((d) => ({ ...d })),
        collectionEnabled: true,
        taxEnabled: false,
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

    // --- catalogue
    const categoryId: Record<string, string> = {};
    for (const c of spec.categories) {
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
    const product: StudioWorld["product"] = {};
    for (let i = 0; i < spec.products.length; i++) {
        product[spec.products[i].slug] = await upsertProduct(prisma, {
            spec,
            p: spec.products[i],
            i,
            orgId,
            storeId,
            categoryId,
            createdAt: istAt(now, -(spec.createdDaysAgo - 20 - i), 11 * 60),
        });
    }

    // --- pipeline
    let stageIds: string[] = [];
    const pipelineId = spec.pipeline ? sid("pipeline") : null;
    if (spec.pipeline && pipelineId) {
        await prisma.pipeline.upsert({
            where: { id: pipelineId },
            update: { name: spec.pipeline.name, isDefault: true },
            create: {
                id: pipelineId,
                organizationId: orgId,
                name: spec.pipeline.name,
                isDefault: true,
            },
        });
        stageIds = [];
        for (let i = 0; i < spec.pipeline.stages.length; i++) {
            const stage = await prisma.stage.upsert({
                where: { id: sid("stage", i) },
                update: { name: spec.pipeline.stages[i], order: i },
                create: {
                    id: sid("stage", i),
                    organizationId: orgId,
                    pipelineId,
                    name: spec.pipeline.stages[i],
                    order: i,
                },
            });
            stageIds.push(stage.id);
        }
    }

    // --- volume goes before the site and services, so nothing below
    // trips over last run's rows
    await clearVolume(prisma, sid(""), orgId);

    // --- the site, then the services it offers
    const serviceIndex = new Map(spec.services.map((s, i) => [s.key, i]));
    const serviceId = (key: string) => {
        const i = serviceIndex.get(key);
        if (i === undefined)
            throw new Error(`${spec.name} has no service "${key}"`);
        return sid("service", i);
    };
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
        fixture: spec.site,
        orgId,
        userId: demoUserId,
        now,
        ids: siteIds,
        pipelineId,
        serviceId: (i) => sid("service", i),
        footer: { format: "text", value: spec.footer },
    });
    let formId: string | null = null;
    let formFields: string[] = [];
    spec.site.pages.forEach((page, p) =>
        page.sections.forEach((s, n) => {
            if (s.type === "enquiry" && !formId) {
                formId = siteIds.form(p, n);
                formFields = s.form.fields.map((f) => f.name);
            }
        }),
    );
    for (let i = 0; i < spec.services.length; i++) {
        const s = spec.services[i];
        const data = {
            name: s.name,
            description: s.description,
            durationMinutes: s.minutes,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            capacity: 1,
            priceCents: s.pricePaise,
            currency: CURRENCY,
            gstRate: "18",
            sacCode: s.sac,
            status: "ACTIVE",
            deletedAt: null,
            locationType: s.locationType,
            meetingUrl: s.meetingUrl,
            visits: 1,
            depositMode: s.depositMode,
            showOnBookingPage: s.shown,
            siteId: s.shown ? siteId : null,
        };
        await prisma.service.upsert({
            where: { id: sid("service", i) },
            update: data,
            create: {
                id: sid("service", i),
                organizationId: orgId,
                timezone: TIMEZONE,
                createdAt: new Date(createdAt.getTime() + i * 60_000),
                ...data,
            },
        });
    }

    // --- the people on the diary, what each takes, their weeks
    const staffId = (key: string) => sid("staff", key);
    await ensureCalendarOnlyRole(prisma, orgId);
    const memberMembership = await prisma.membership.findUniqueOrThrow({
        where: {
            organizationId_userId: {
                organizationId: orgId,
                userId: ctx.memberUserId,
            },
        },
        select: { id: true },
    });
    for (const st of spec.staff) {
        const data = {
            name: st.name,
            title: st.title,
            status: "ACTIVE",
            archivedAt: null,
            membershipId: st.member ? memberMembership.id : null,
        };
        await prisma.staffMember.upsert({
            where: { id: staffId(st.key) },
            update: data,
            create: {
                id: staffId(st.key),
                organizationId: orgId,
                ...data,
                createdAt,
            },
        });
    }
    const staffIds = spec.staff.map((s) => staffId(s.key));
    await prisma.staffService.deleteMany({
        where: { staffId: { in: staffIds } },
    });
    await prisma.staffHours.deleteMany({
        where: { staffId: { in: staffIds } },
    });
    await prisma.staffService.createMany({
        data: spec.staff.flatMap((st) =>
            st.services.map((key) => ({
                id: sid("staffservice", st.key, key),
                organizationId: orgId,
                staffId: staffId(st.key),
                serviceId: serviceId(key),
                createdAt,
            })),
        ),
    });
    await prisma.staffHours.createMany({
        data: spec.staff.flatMap((st) =>
            st.hours.flatMap((w, k) =>
                w.days.map((dayOfWeek) => ({
                    id: sid("staffhours", st.key, k, dayOfWeek),
                    organizationId: orgId,
                    staffId: staffId(st.key),
                    dayOfWeek,
                    startMinute: minuteOf(w.from),
                    endMinute: minuteOf(w.to),
                    createdAt,
                })),
            ),
        ),
    });
    await prisma.bookingRules.upsert({
        where: { organizationId: orgId },
        update: { ...spec.rules },
        create: {
            id: sid("bookingrules"),
            organizationId: orgId,
            ...spec.rules,
            createdAt,
        },
    });

    // --- plans: the catalogue its subscriptions sit on
    const planId = (key: string) => sid("plan", key);
    for (const p of spec.plans) {
        const data = {
            name: p.name,
            description: p.description,
            price: rupees(p.pricePaise),
            currency: CURRENCY,
            interval: "MONTH",
            status: "ACTIVE",
            gstRate: "18",
            sacCode: p.sac,
        };
        await prisma.subscriptionPlan.upsert({
            where: { id: planId(p.key) },
            update: data,
            create: {
                id: planId(p.key),
                organizationId: orgId,
                ...data,
                createdAt,
                updatedAt: createdAt,
            },
        });
    }

    // --- writing
    await writePosts(prisma, {
        spec,
        orgId,
        siteId,
        authorId: demoUserId,
        now,
    });

    return {
        orgId,
        storeId,
        siteId,
        formId,
        formFields,
        createdAt,
        serviceId,
        staffId,
        stageIds,
        pipelineId,
        planId,
        product,
    };
}

async function upsertProduct(
    prisma: Db,
    a: {
        spec: StudioSpec;
        p: StudioProduct;
        i: number;
        orgId: string;
        storeId: string;
        categoryId: Record<string, string>;
        createdAt: Date;
    },
): Promise<{ id: string; variants: string[] }> {
    const { p, i, orgId, storeId } = a;
    const sid = studioId(a.spec.key);
    const productId = sid("product", i);

    // The product's one option, its values the variants' titles.
    let optionId: string | null = null;
    const valueId: string[] = [];
    if (p.option) {
        const option = await prisma.productOption.upsert({
            where: {
                organizationId_name: {
                    organizationId: orgId,
                    name: p.option.name,
                },
            },
            update: {},
            create: {
                id: sid("option", i),
                organizationId: orgId,
                name: p.option.name,
                position: i,
            },
        });
        optionId = option.id;
        for (let j = 0; j < p.option.variants.length; j++) {
            const value = p.option.variants[j].title;
            const v = await prisma.productOptionValue.upsert({
                where: { optionId_value: { optionId: option.id, value } },
                update: { position: j },
                create: {
                    id: sid("optionvalue", i, j),
                    optionId: option.id,
                    organizationId: orgId,
                    value,
                    position: j,
                },
            });
            valueId.push(v.id);
        }
    }

    const data = {
        name: p.name,
        description: p.description
            .split(/\n\s*\n/)
            .map((para) => `<p>${escapeHtml(para.trim())}</p>`)
            .join(""),
        price: rupees(p.pricePaise),
        currency: CURRENCY,
        status: "PUBLISHED",
        categoryId: a.categoryId[p.category] ?? null,
        optionId,
        materials: p.materials,
        keyPoints: [...p.keyPoints],
        madeHere: true,
        gstRate: "18",
        hsnCode: p.hsn,
        image: p.images[0]?.url ?? null,
        stockTracked: false,
        fulfilmentTypes: [
            p.fulfilment === "SHIPPING" ? "SHIPPING" : p.fulfilment,
        ],
        shopFields: { materials: true, keyPoints: true },
    } satisfies Prisma.ProductUncheckedUpdateInput;
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
        })),
    });

    const variants: string[] = [];
    const listingVariants: { id: string; variantId: string }[] = [];
    for (let j = 0; j < (p.option?.variants.length ?? 0); j++) {
        const v = must(p.option).variants[j];
        const variantId = sid("variant", i, j);
        const vdata = {
            sku: v.sku,
            title: v.title,
            price: rupees(v.pricePaise),
            position: j,
            optionValueId: valueId[j] ?? null,
            imageId: v.image !== undefined ? (imageIds[v.image] ?? null) : null,
        };
        await prisma.productVariant.upsert({
            where: { id: variantId },
            update: vdata,
            create: { id: variantId, productId, ...vdata },
        });
        variants.push(variantId);
        listingVariants.push({ id: sid("listingvariant", i, j), variantId });
    }
    // Sold at the studio, every variant with it (#510). Made to order: no
    // stock is counted.
    await listProductAt(prisma, {
        id: sid("listing", i),
        orgId,
        storeId,
        productId,
        variants: listingVariants,
    });
    return { id: productId, variants };
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** This business's seeded volume, children first. Rows made by hand stay. */
async function clearVolume(prisma: Db, prefix: string, orgId: string) {
    const where = { id: { startsWith: prefix } };
    await prisma.productReview.deleteMany({ where });
    await prisma.reviewInvitation.deleteMany({ where });
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.submission.deleteMany({ where });
    await prisma.activity.deleteMany({ where });
    await prisma.lead.deleteMany({ where });
    await prisma.contactNote.deleteMany({ where });
    await prisma.bookingEvent.deleteMany({ where });
    await prisma.booking.deleteMany({ where });
    await prisma.customerSubscription.deleteMany({ where });
    await prisma.orderItem.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.customerIdentityLink.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
    await prisma.analyticsDailyAggregate.deleteMany({
        where: { organizationId: orgId, ...where },
    });
}

// --- Writing ------------------------------------------------------------------------

/**
 * The site's posts under their three categories, each published: its
 * Publication (category and author as publish snapshots them) and the
 * post pointed at it. A post already live keeps its publication.
 */
async function writePosts(
    prisma: Db,
    a: {
        spec: StudioSpec;
        orgId: string;
        siteId: string;
        authorId: string;
        now: Date;
    },
) {
    const sid = studioId(a.spec.key);
    const categoryId: Record<string, string> = {};
    for (const [slug, name] of Object.entries(STUDIO_POST_CATEGORIES)) {
        const row = await prisma.postCategory.upsert({
            where: { siteId_slug: { siteId: a.siteId, slug } },
            update: { name },
            create: {
                id: sid("postcategory", slug),
                siteId: a.siteId,
                name,
                slug,
            },
        });
        categoryId[slug] = row.id;
    }
    const author = await prisma.user.findUniqueOrThrow({
        where: { id: a.authorId },
        select: { name: true },
    });
    for (let i = 0; i < a.spec.posts.length; i++) {
        const p = a.spec.posts[i];
        const publishedAt = istAt(
            a.now,
            -p.daysAgo,
            10 * 60 + ((i * 37) % 300),
        );
        const data = {
            title: p.title,
            excerpt: p.excerpt,
            content: p.body,
            image: p.cover.url,
            categoryId: categoryId[p.category],
            status: "PUBLISHED",
            featured: false,
        };
        const post = await prisma.post.upsert({
            where: { siteId_slug: { siteId: a.siteId, slug: p.slug } },
            update: data,
            create: {
                id: sid("post", i),
                siteId: a.siteId,
                authorId: a.authorId,
                slug: p.slug,
                publishedAt,
                createdAt: new Date(publishedAt.getTime() - 2 * DAY),
                ...data,
            },
        });
        if (post.currentPublicationId) continue;
        const path = `/blog/${p.slug}`;
        const snapshot = {
            post: {
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                content: p.body,
                image: p.cover.url,
                featured: false,
                category: {
                    name: STUDIO_POST_CATEGORIES[p.category],
                    slug: p.category,
                },
                author: author.name,
                publishedAt: publishedAt.toISOString(),
            },
            path,
            publishedAt: publishedAt.toISOString(),
        };
        const publication = await prisma.publication.create({
            data: {
                id: sid("postpub", i),
                siteId: a.siteId,
                organizationId: a.orgId,
                postId: post.id,
                path,
                snapshot,
                templateId: "post",
                templateVersion: 1,
                publishedAt,
            },
        });
        await prisma.post.update({
            where: { id: post.id },
            data: { currentPublicationId: publication.id, publishedAt },
        });
    }
}

// --- People ---------------------------------------------------------------------------

export interface StudioPerson {
    first: string;
    last: string;
    email: string;
    phone: string;
    company: string | null;
    city: string;
    state: string;
    postalCode: string;
    source: string;
    createdAt: Date;
}

export async function writeContacts(
    prisma: Db,
    orgId: string,
    contactId: (n: number) => string,
    people: readonly StudioPerson[],
) {
    await prisma.contact.createMany({
        data: people.map((p, n) => ({
            id: contactId(n),
            organizationId: orgId,
            email: p.email,
            firstName: p.first,
            lastName: p.last,
            phone: p.phone,
            company: p.company,
            source: p.source,
            city: p.city,
            state: p.state,
            postalCode: p.postalCode,
            country: "India",
            createdAt: p.createdAt,
            updatedAt: p.createdAt,
        })),
    });
}

// --- The diary ------------------------------------------------------------------------

export interface DiaryBooking {
    service: string;
    staff: string;
    contact: number;
    startAt: Date;
    createdAt: Date;
    status: "CONFIRMED" | "PENDING" | "CANCELLED";
    outcome: "ATTENDED" | "NO_SHOW" | null;
    cancelledAt: Date | null;
    online: boolean;
    locationType: "IN_PERSON" | "ONLINE" | null;
    /** How it was paid, as `Booking.paidWith` holds it. */
    paidWith: "PAID" | "DESK" | null;
    note?: string;
}

/** Who is busy when, so no one is in two places at once. */
export class Busy {
    private spans = new Map<string, { start: number; end: number }[]>();
    free(staff: string, start: Date, end: Date): boolean {
        return !(this.spans.get(staff) ?? []).some(
            (s) => s.start < end.getTime() && start.getTime() < s.end,
        );
    }
    take(staff: string, start: Date, end: Date) {
        const list = this.spans.get(staff) ?? [];
        list.push({ start: start.getTime(), end: end.getTime() });
        this.spans.set(staff, list);
    }
}

/**
 * Starts a person's week offers for a service on a day: inside one of their
 * windows, on the service's own step from the window's start.
 */
export function slotsOn(
    spec: StudioSpec,
    staffKey: string,
    service: StudioService,
    now: Date,
    day: number,
): Date[] {
    const staff = spec.staff.find((s) => s.key === staffKey);
    if (!staff) throw new Error(`No staff "${staffKey}"`);
    const weekday = istWeekday(now, day);
    const out: Date[] = [];
    for (const w of staff.hours) {
        if (!w.days.includes(weekday)) continue;
        const from = minuteOf(w.from);
        const to = minuteOf(w.to);
        for (let m = from; m + service.minutes <= to; m += service.minutes) {
            out.push(istAt(now, day, m));
        }
    }
    return out;
}

/**
 * The everyday diary: each service with a monthly rate placed on slots its
 * people offer, from `fromDay` to `toDay`, never double-booking anyone.
 */
export function planDiary(
    rng: Rng,
    spec: StudioSpec,
    o: {
        now: Date;
        fromDay: number;
        toDay: number;
        busy: Busy;
        /** Who books a service: an index into the contacts. */
        contactFor: (service: StudioService, rng: Rng) => number;
        /** A weight per weekday, Sunday first. */
        weekday: readonly number[];
        /** Extra weight for a day offset (a season), 1 = none. */
        season?: (day: number) => number;
        createdFloor: Date;
    },
): DiaryBooking[] {
    const out: DiaryBooking[] = [];
    const days = o.toDay - o.fromDay;
    for (const service of spec.services) {
        if (service.perMonth <= 0) continue;
        const takers = spec.staff.filter((s) =>
            s.services.includes(service.key),
        );
        if (takers.length === 0)
            throw new Error(`Nobody takes ${service.name}`);
        const target = Math.round((service.perMonth * days) / 30);
        let placed = 0;
        for (
            let attempt = 0;
            placed < target && attempt < target * 12;
            attempt++
        ) {
            const day = o.fromDay + rng.int(0, days - 1);
            const weight =
                o.weekday[istWeekday(o.now, day)] *
                (o.season ? o.season(day) : 1);
            if (rng.next() > weight / 1.6) continue;
            const staff = rng.pick(takers);
            const slots = slotsOn(spec, staff.key, service, o.now, day);
            if (slots.length === 0) continue;
            const startAt = rng.pick(slots);
            const endAt = addMinutes(startAt, service.minutes);
            // Capacity is the service's, not the person's: one booking of a
            // service at a time, whoever takes it.
            const lane = `service:${service.key}`;
            if (
                !o.busy.free(staff.key, startAt, endAt) ||
                !o.busy.free(lane, startAt, endAt)
            )
                continue;
            o.busy.take(staff.key, startAt, endAt);
            o.busy.take(lane, startAt, endAt);
            placed += 1;

            const contact = o.contactFor(service, rng);
            const [aheadMin, aheadMax] = service.ahead;
            const createdAt = new Date(
                Math.max(
                    o.createdFloor.getTime(),
                    Math.min(
                        startAt.getTime() -
                            rng.int(aheadMin * 24, aheadMax * 24) * HOUR -
                            rng.int(1, 300) * 60_000,
                        o.now.getTime() - rng.int(1, 40) * HOUR,
                    ),
                ),
            );
            const past = endAt.getTime() < o.now.getTime();
            const r = rng.next();
            let status: DiaryBooking["status"] = "CONFIRMED";
            let outcome: DiaryBooking["outcome"] = null;
            let cancelledAt: Date | null = null;
            if (r < 0.06) {
                status = "CANCELLED";
                cancelledAt = earliest(
                    o.now,
                    new Date(
                        createdAt.getTime() +
                            (startAt.getTime() - createdAt.getTime()) *
                                (0.3 + rng.next() * 0.5),
                    ),
                );
            } else if (past) {
                const hoursAgo = (o.now.getTime() - endAt.getTime()) / HOUR;
                outcome =
                    hoursAgo < 48 && rng.chance(0.5)
                        ? null
                        : rng.chance(service.pay === "free" ? 0.9 : 0.97)
                          ? "ATTENDED"
                          : "NO_SHOW";
            } else if (service.pay === "free" && rng.chance(0.12)) {
                status = "PENDING";
            }
            const online =
                service.pay === "online" || service.pay === "free"
                    ? rng.chance(0.8)
                    : false;
            out.push({
                service: service.key,
                staff: staff.key,
                contact,
                startAt,
                createdAt,
                status,
                outcome,
                cancelledAt,
                online,
                locationType:
                    service.locationType === "EITHER"
                        ? rng.chance(0.65)
                            ? "ONLINE"
                            : "IN_PERSON"
                        : "IN_PERSON",
                paidWith:
                    status === "CANCELLED" ||
                    service.pay === "free" ||
                    service.pay === "job"
                        ? null
                        : service.pay === "online"
                          ? "PAID"
                          : "DESK",
            });
        }
    }
    return out;
}

export interface DiaryRows {
    bookings: Prisma.BookingCreateManyInput[];
    events: Prisma.BookingEventCreateManyInput[];
}

/** Bookings and their history, as the API leaves them (`BookingsService`). */
export function diaryRows(
    spec: StudioSpec,
    world: StudioWorld,
    list: readonly DiaryBooking[],
    o: {
        now: Date;
        contacts: readonly {
            id: string;
            name: string;
            email: string;
            phone: string;
        }[];
        actor: (b: DiaryBooking) => string;
        bookingId: (n: number) => string;
    },
): DiaryRows {
    const sid = studioId(spec.key);
    const bookings: Prisma.BookingCreateManyInput[] = [];
    const events: Prisma.BookingEventCreateManyInput[] = [];
    list.forEach((b, n) => {
        const service = must(spec.services.find((s) => s.key === b.service));
        const contact = o.contacts[b.contact];
        const endAt = addMinutes(b.startAt, service.minutes);
        const bookingId = o.bookingId(n);
        const touched =
            b.cancelledAt ?? (b.outcome ? addMinutes(endAt, 60) : b.createdAt);
        bookings.push({
            id: bookingId,
            organizationId: world.orgId,
            serviceId: world.serviceId(service.key),
            contactId: contact.id,
            staffId: world.staffId(b.staff),
            startAt: b.startAt,
            endAt,
            timezone: TIMEZONE,
            status: b.status,
            outcome: b.outcome,
            cancelledAt: b.cancelledAt,
            bookerName: contact.name,
            bookerEmail: contact.email,
            bookerPhone: contact.phone,
            bookedOnline: b.online,
            paidWith: b.paidWith,
            locationType: b.locationType,
            intakeNote: b.note ?? null,
            freeCancelUntil: new Date(
                b.startAt.getTime() - spec.rules.freeCancelHours * HOUR,
            ),
            snapshot: {
                service: {
                    id: world.serviceId(service.key),
                    name: service.name,
                    durationMinutes: service.minutes,
                    bufferBeforeMinutes: 0,
                    bufferAfterMinutes: 0,
                    capacity: 1,
                    timezone: TIMEZONE,
                    priceCents: service.pricePaise,
                    currency: CURRENCY,
                    locationType: service.locationType,
                    meetingUrl: service.meetingUrl,
                    depositMode: service.depositMode,
                },
                slot: {
                    startAt: b.startAt.toISOString(),
                    endAt: endAt.toISOString(),
                },
                booker: {
                    name: contact.name,
                    email: contact.email,
                    phone: contact.phone,
                },
            },
            createdAt: b.createdAt,
            updatedAt: earliest(o.now, touched),
        });
        events.push({
            id: sid("bookingevent", n, "booked"),
            bookingId,
            organizationId: world.orgId,
            type: "BOOKED",
            actorUserId: b.online ? null : o.actor(b),
            toStartAt: b.startAt,
            createdAt: b.createdAt,
        });
        if (b.cancelledAt) {
            events.push({
                id: sid("bookingevent", n, "cancelled"),
                bookingId,
                organizationId: world.orgId,
                type: "CANCELLED",
                actorUserId: o.actor(b),
                fromStartAt: b.startAt,
                createdAt: b.cancelledAt,
            });
        }
        if (b.outcome) {
            events.push({
                id: sid("bookingevent", n, "outcome"),
                bookingId,
                organizationId: world.orgId,
                type: b.outcome,
                actorUserId: o.actor(b),
                fromStartAt: b.startAt,
                createdAt: earliest(o.now, addMinutes(endAt, 60)),
            });
        }
    });
    return { bookings, events };
}

// --- Money ------------------------------------------------------------------------------

export type PayMethod = "UPI" | "BANK_TRANSFER" | "CARD" | "CASH";

export interface StudioPayment {
    at: Date;
    method: PayMethod;
    reference: string | null;
}

export function payment(rng: Rng, at: Date, method?: PayMethod): StudioPayment {
    const m: PayMethod =
        method ??
        rng.weighted<PayMethod>(
            ["UPI", "BANK_TRANSFER", "CARD", "CASH"],
            (x) =>
                x === "UPI"
                    ? 55
                    : x === "BANK_TRANSFER"
                      ? 30
                      : x === "CARD"
                        ? 10
                        : 5,
        );
    const digits = (n: number) =>
        Array.from({ length: n }, () => rng.int(0, 9)).join("");
    return {
        at,
        method: m,
        reference:
            m === "UPI"
                ? `UPI ref ${rng.int(3, 6)}${digits(11)}`
                : m === "BANK_TRANSFER"
                  ? `NEFT ${digits(10)}`
                  : m === "CARD"
                    ? `Card ending ${digits(4)}`
                    : null,
    };
}

export interface DocLine {
    description: string;
    quantity: number;
    /** GST-inclusive, paise. */
    unitPaise: number;
    sac: string;
}

/** An invoice before it is numbered: the API's shape, GST worked out below. */
export interface StudioDoc {
    id: string;
    contact: number;
    createdAt: Date;
    /** Null while it is a draft (a quote not yet sent as an invoice). */
    issuedAt: Date | null;
    dueAt: Date | null;
    lines: readonly DocLine[];
    source: "MANUAL" | "BOOKING" | "SUBSCRIPTION";
    bookingId?: string;
    subscriptionId?: string;
    period?: { start: Date; end: Date };
    createdByUserId: string | null;
    paid: StudioPayment | null;
    paymentNote?: string;
}

const RATE = 18;

/** One line's GST inside its amount, as `invoices/gst-price.ts` works it. */
export function taxLine(amountPaise: number) {
    const taxable = Math.round((amountPaise * 100) / (100 + RATE));
    const tax = amountPaise - taxable;
    const cgst = Math.ceil(tax / 2);
    return { taxable, cgst, sgst: tax - cgst };
}

export const docTotal = (d: { lines: readonly DocLine[] }) =>
    d.lines.reduce((s, l) => s + l.quantity * l.unitPaise, 0);

/**
 * The invoices, numbered per financial year in the order they were issued,
 * and each series' counter at its last number so the API's next follows on.
 * A number someone issued by hand here stops the run rather than repeat.
 */
export async function writeDocs(
    prisma: Db,
    spec: StudioSpec,
    world: StudioWorld,
    docs: readonly StudioDoc[],
    contacts: readonly { id: string; name: string; email: string }[],
) {
    const sid = studioId(spec.key);
    const issued = docs
        .filter((d) => d.issuedAt)
        .sort(
            (a, b) =>
                must(a.issuedAt).getTime() - must(b.issuedAt).getTime() ||
                a.id.localeCompare(b.id),
        );
    const last = new Map<string, number>();
    const numbers = new Map<string, string>();
    for (const d of issued) {
        const series = `${spec.gst.prefix}/${financialYear(must(d.issuedAt).getTime())}`;
        const k = (last.get(series) ?? 0) + 1;
        last.set(series, k);
        numbers.set(d.id, `${series}/${String(k).padStart(4, "0")}`);
    }
    const byHand = await prisma.invoice.findMany({
        where: {
            organizationId: world.orgId,
            number: { not: null },
            NOT: { id: { startsWith: sid("") } },
        },
        select: { number: true },
    });
    const handLast = new Map<string, number>();
    for (const { number } of byHand) {
        const m = /^(.*)[/-](\d+)$/.exec(number ?? "");
        if (!m) continue;
        if (Number(m[2]) <= (last.get(m[1]) ?? 0)) {
            throw new Error(
                `${spec.name} has an invoice issued by hand (${number}) that holds a number ` +
                    `the showcase needs. Run db:seed:reset, then seed again.`,
            );
        }
        handLast.set(m[1], Math.max(Number(m[2]), handLast.get(m[1]) ?? 0));
    }

    const gstinOf = studioGstin(spec);
    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    for (const d of docs) {
        const contact = contacts[d.contact];
        const taxed = d.lines.map((l) => {
            const amount = l.quantity * l.unitPaise;
            return { ...l, amount, ...taxLine(amount) };
        });
        const total = taxed.reduce((s, l) => s + l.amount, 0);
        const cgst = taxed.reduce((s, l) => s + l.cgst, 0);
        const sgst = taxed.reduce((s, l) => s + l.sgst, 0);
        const isIssued = d.issuedAt !== null;
        invoices.push({
            id: d.id,
            organizationId: world.orgId,
            number: numbers.get(d.id) ?? null,
            status: !isIssued ? "DRAFT" : d.paid ? "PAID" : "ISSUED",
            kind: "INVOICE",
            bookingId: d.bookingId ?? null,
            contactId: contact.id,
            billToName: isIssued ? contact.name : null,
            billToEmail: isIssued ? contact.email : null,
            sellerGstin: gstinOf,
            sellerState: spec.gst.state,
            sellerAddress: printedAddress(spec),
            sellerName: isIssued ? spec.name : null,
            sellerLegalName: isIssued ? spec.legalName : null,
            sellerEmail: isIssued ? spec.contactEmail : null,
            placeOfSupply: spec.gst.state,
            taxType: "INTRA",
            cgst: rupees(cgst),
            sgst: rupees(sgst),
            igst: "0.00",
            currency: CURRENCY,
            subtotal: rupees(total - cgst - sgst),
            tax: rupees(cgst + sgst),
            total: rupees(total),
            issuedAt: d.issuedAt,
            dueAt: d.dueAt,
            paidAt: d.paid?.at ?? null,
            paymentMethod: d.paid?.method ?? null,
            paymentReference: d.paid?.reference ?? null,
            paymentNote: d.paymentNote ?? null,
            source: d.source,
            subscriptionId: d.subscriptionId ?? null,
            periodStart: d.period?.start ?? null,
            periodEnd: d.period?.end ?? null,
            createdByUserId: d.createdByUserId,
            createdAt: d.createdAt,
            updatedAt: d.paid?.at ?? d.issuedAt ?? d.createdAt,
        });
        taxed.forEach((l, position) => {
            lines.push({
                id: `${d.id}_line_${position}`,
                organizationId: world.orgId,
                invoiceId: d.id,
                position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: rupees(l.unitPaise),
                amount: rupees(l.amount),
                discount: "0.00",
                hsnSac: l.sac,
                gstRate: String(RATE),
                taxableValue: rupees(l.taxable),
                cgst: rupees(l.cgst),
                sgst: rupees(l.sgst),
                igst: "0.00",
            });
        });
    }
    for (let k = 0; k < invoices.length; k += 1000) {
        await prisma.invoice.createMany({ data: invoices.slice(k, k + 1000) });
    }
    for (let k = 0; k < lines.length; k += 1000) {
        await prisma.invoiceLine.createMany({ data: lines.slice(k, k + 1000) });
    }

    const series = Array.from(
        new Set([...Array.from(last.keys()), ...Array.from(handLast.keys())]),
    ).sort();
    await prisma.invoiceSequence.deleteMany({
        where: { organizationId: world.orgId, series: { notIn: series } },
    });
    const current = new Map(
        (
            await prisma.invoiceSequence.findMany({
                where: { organizationId: world.orgId },
                select: { series: true, lastNumber: true },
            })
        ).map((s) => [s.series, s.lastNumber]),
    );
    for (const s of series) {
        const lastNumber = Math.max(last.get(s) ?? 0, handLast.get(s) ?? 0);
        if (current.get(s) === lastNumber) continue;
        await prisma.invoiceSequence.upsert({
            where: {
                organizationId_series: {
                    organizationId: world.orgId,
                    series: s,
                },
            },
            update: { lastNumber },
            create: { organizationId: world.orgId, series: s, lastNumber },
        });
    }
    return { issued: issued.length, drafts: docs.length - issued.length };
}

// --- Orders and reviews ------------------------------------------------------------

export interface StudioOrderLine {
    product: string;
    /** Index into the product's variants. */
    variant: number | null;
    quantity: number;
}

export interface StudioOrder {
    customer: number;
    placedAt: Date;
    lines: readonly StudioOrderLine[];
    status: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
    paymentStatus: "PAID" | "UNPAID" | "REFUNDED";
    stage:
        | "NEW"
        | "PREPARING"
        | "READY"
        | "COLLECTED"
        | "HANDED_TO_COURIER"
        | "DELIVERED"
        | "SENT";
    fulfilment: "SHIPPING" | "PICKUP" | "DIGITAL";
    online: boolean;
    paidAt: Date | null;
    updatedAt: Date;
    notes?: string;
    trackingNumber?: string;
    review?: { rating: number; body: string; reply?: string; at: Date };
}

export function priceOf(spec: StudioSpec, line: StudioOrderLine): number {
    const p = must(spec.products.find((x) => x.slug === line.product));
    return line.variant === null
        ? p.pricePaise
        : must(p.option).variants[line.variant].pricePaise;
}

/**
 * Store customers (one per contact who buys, linked to that contact as a
 * payment links them), their orders and lines, and the reviews behind
 * delivered ones — each a verified purchase with its completed invitation.
 */
export async function writeOrders(
    prisma: Db,
    spec: StudioSpec,
    world: StudioWorld,
    orders: readonly StudioOrder[],
    contacts: readonly {
        id: string;
        first: string;
        last: string;
        email: string;
        phone: string;
        city: string;
        state: string;
        postalCode: string;
        address: string;
    }[],
) {
    const sid = studioId(spec.key);
    const customerOf = new Map<number, { id: string; at: Date }>();
    for (const o of orders) {
        const seen = customerOf.get(o.customer);
        if (!seen || o.placedAt < seen.at) {
            customerOf.set(o.customer, {
                id: sid("customer", o.customer),
                at: o.placedAt,
            });
        }
    }
    const customers: Prisma.CustomerCreateManyInput[] = [];
    const links: Prisma.CustomerIdentityLinkCreateManyInput[] = [];
    for (const [n, c] of Array.from(customerOf.entries()).sort(
        (a, b) => a[0] - b[0],
    )) {
        const k = contacts[n];
        customers.push({
            id: c.id,
            storeId: world.storeId,
            organizationId: world.orgId,
            email: k.email,
            firstName: k.first,
            lastName: k.last,
            phone: k.phone,
            country: "India",
            state: k.state,
            city: k.city,
            zipCode: k.postalCode,
            createdAt: c.at,
            updatedAt: c.at,
        });
        links.push({
            id: sid("customerlink", n),
            organizationId: world.orgId,
            contactId: k.id,
            customerId: c.id,
            reason: "PAYMENT",
            createdAt: c.at,
        });
    }
    await prisma.customer.createMany({ data: customers });
    await prisma.customerIdentityLink.createMany({ data: links });

    const sorted = [...orders].sort(
        (a, b) => a.placedAt.getTime() - b.placedAt.getTime(),
    );
    const taken = new Set(
        (
            await prisma.order.findMany({
                where: {
                    storeId: world.storeId,
                    NOT: { id: { startsWith: sid("") } },
                },
                select: { orderId: true },
            })
        ).map((o) => o.orderId),
    );
    let seq = 0;
    const nextNumber = () => {
        for (;;) {
            seq += 1;
            const number = `ORD-${String(seq).padStart(3, "0")}`;
            if (!taken.has(number)) return number;
        }
    };
    const orderRows: Prisma.OrderCreateManyInput[] = [];
    const itemRows: Prisma.OrderItemCreateManyInput[] = [];
    const invitations: Prisma.ReviewInvitationCreateManyInput[] = [];
    const reviews: Prisma.ProductReviewCreateManyInput[] = [];
    sorted.forEach((o, n) => {
        const orderId = sid("order", n);
        const k = contacts[o.customer];
        const total = o.lines.reduce(
            (s, l) => s + priceOf(spec, l) * l.quantity,
            0,
        );
        const tax = o.lines.reduce(
            (s, l) =>
                s +
                (() => {
                    const t = taxLine(priceOf(spec, l) * l.quantity);
                    return t.cgst + t.sgst;
                })(),
            0,
        );
        orderRows.push({
            id: orderId,
            storeId: world.storeId,
            organizationId: world.orgId,
            orderId: nextNumber(),
            customerId: sid("customer", o.customer),
            currency: CURRENCY,
            subtotal: rupees(total),
            tax: rupees(tax),
            total: rupees(total),
            status: o.status,
            paymentStatus: o.paymentStatus,
            stage: o.stage,
            fulfilment: o.fulfilment,
            placedOnline: o.online,
            paidAt: o.paidAt,
            notes: o.notes ?? null,
            trackingNumber: o.trackingNumber ?? null,
            courierName: o.trackingNumber ? "Blue Dart" : null,
            ...(o.fulfilment === "SHIPPING"
                ? {
                      deliveryName: `${k.first} ${k.last}`,
                      deliveryPhone: k.phone,
                      deliveryLine1: k.address,
                      deliveryCity: k.city,
                      deliveryState: k.state,
                      deliveryPostalCode: k.postalCode,
                  }
                : {}),
            createdAt: o.placedAt,
            updatedAt: o.updatedAt,
        });
        o.lines.forEach((l, j) => {
            const placed = world.product[l.product];
            const itemId = sid("orderitem", n, j);
            itemRows.push({
                id: itemId,
                orderId,
                productId: placed.id,
                variantId:
                    l.variant === null ? null : placed.variants[l.variant],
                quantity: l.quantity,
                price: rupees(priceOf(spec, l)),
                stockRow: "NONE",
            });
            if (j === 0 && o.review) {
                const invitationId = sid("invitation", n);
                invitations.push({
                    id: invitationId,
                    organizationId: world.orgId,
                    orderId,
                    tokenHash: createHash("sha256")
                        .update(invitationId)
                        .digest("hex"),
                    toAddress: k.email,
                    expiresAt: new Date(o.review.at.getTime() + 25 * DAY),
                    completedAt: o.review.at,
                    lastSentAt: new Date(o.review.at.getTime() - 2 * DAY),
                    createdAt: new Date(o.review.at.getTime() - 2 * DAY),
                    updatedAt: o.review.at,
                });
                reviews.push({
                    id: sid("review", n),
                    organizationId: world.orgId,
                    storeId: world.storeId,
                    invitationId,
                    orderItemId: itemId,
                    productId: placed.id,
                    customerId: sid("customer", o.customer),
                    productName: must(
                        spec.products.find((p) => p.slug === l.product),
                    ).name,
                    invitedTo: k.email,
                    rating: o.review.rating,
                    body: o.review.body,
                    displayName: `${k.first} ${k.last.charAt(0)}.`,
                    status: "PUBLISHED",
                    reply: o.review.reply ?? null,
                    repliedAt: o.review.reply
                        ? new Date(o.review.at.getTime() + 20 * HOUR)
                        : null,
                    createdAt: o.review.at,
                    updatedAt: o.review.at,
                });
            }
        });
    });
    for (let k = 0; k < orderRows.length; k += 1000) {
        await prisma.order.createMany({ data: orderRows.slice(k, k + 1000) });
    }
    await prisma.orderItem.createMany({ data: itemRows });
    await prisma.reviewInvitation.createMany({ data: invitations });
    await prisma.productReview.createMany({ data: reviews });
    return {
        orders: orderRows.length,
        customers: customers.length,
        reviews: reviews.length,
    };
}

// --- Leads -----------------------------------------------------------------------------

export interface StudioLead {
    contact: number;
    title: string;
    /** Paise; null for a lead the form opened and nobody priced yet. */
    valuePaise: number | null;
    /** Opened by the site's form (its entry carries `message`). */
    fromForm: { message: string; extra: Record<string, string> } | null;
    createdAt: Date;
    stage: number;
    status: "OPEN" | "WON" | "LOST";
    notes: readonly string[];
    task: { body: string; dueDays: number; done: boolean } | null;
    actor: string;
}

/**
 * Leads with the timeline the API would have left: a CREATED line for one
 * made by hand (none for the form's), a STAGE_CHANGED for each step, notes,
 * and a follow-up task — overdue, coming up or done. The form's entries
 * carry the contact's details and what they wrote.
 */
export async function writeLeads(
    prisma: Db,
    spec: StudioSpec,
    world: StudioWorld,
    now: Date,
    leads: readonly StudioLead[],
    contacts: readonly {
        id: string;
        name: string;
        email: string;
        phone: string;
        company: string | null;
    }[],
) {
    if (!spec.pipeline || !world.pipelineId) return { leads: 0, entries: 0 };
    const sid = studioId(spec.key);
    const stages = spec.pipeline.stages;
    const ceiling = addMinutes(now, -60);
    const leadRows: Prisma.LeadCreateManyInput[] = [];
    const activities: Prisma.ActivityCreateManyInput[] = [];
    const entries: Prisma.SubmissionCreateManyInput[] = [];
    leads.forEach((l, n) => {
        const leadId = sid("lead", n);
        let k = 0;
        const add = (
            row: Omit<
                Prisma.ActivityCreateManyInput,
                "id" | "organizationId" | "leadId"
            >,
        ) =>
            activities.push({
                id: sid("activity", n, k++),
                organizationId: world.orgId,
                leadId,
                ...row,
            });
        if (!l.fromForm) {
            add({
                type: "CREATED",
                body: "Lead created manually",
                actorUserId: l.actor,
                createdAt: l.createdAt,
                updatedAt: l.createdAt,
            });
        }
        // Steps spread between the lead's start and an hour ago.
        const span = Math.max(HOUR, ceiling.getTime() - l.createdAt.getTime());
        const steps = l.stage + l.notes.length;
        let t = l.createdAt;
        const next = (i: number) => {
            t = earliest(
                ceiling,
                new Date(
                    l.createdAt.getTime() + (span * (i + 1)) / (steps + 1.5),
                ),
            );
            return t;
        };
        let i = 0;
        for (let s = 1; s <= l.stage; s++) {
            const when = next(i++);
            add({
                type: "STAGE_CHANGED",
                body: `Stage changed from "${stages[s - 1]}" to "${stages[s]}"`,
                actorUserId: l.actor,
                createdAt: when,
                updatedAt: when,
            });
            const note = l.notes[s - 1];
            if (note) {
                const at = next(i++);
                add({
                    type: "NOTE",
                    body: note,
                    actorUserId: l.actor,
                    createdAt: at,
                    updatedAt: at,
                });
            }
        }
        for (let j = l.stage; j < l.notes.length; j++) {
            const at = next(i++);
            add({
                type: "NOTE",
                body: l.notes[j],
                actorUserId: l.actor,
                createdAt: at,
                updatedAt: at,
            });
        }
        if (l.task) {
            const due = istAt(now, l.task.dueDays, 11 * 60);
            const created = earliest(t, addMinutes(due, -2 * 24 * 60), ceiling);
            const done = l.task.done
                ? earliest(ceiling, addMinutes(due, -90))
                : null;
            add({
                type: "TASK",
                body: l.task.body,
                actorUserId: l.actor,
                dueAt: due,
                completedAt: done,
                createdAt: created,
                updatedAt: done ?? created,
            });
        }
        const updatedAt = activities
            .filter((a) => a.leadId === leadId)
            .reduce<Date>(
                (m, a) =>
                    a.updatedAt instanceof Date && a.updatedAt > m
                        ? a.updatedAt
                        : m,
                l.createdAt,
            );
        leadRows.push({
            id: leadId,
            organizationId: world.orgId,
            contactId: contacts[l.contact].id,
            pipelineId: must(world.pipelineId),
            stageId: world.stageIds[l.stage],
            formId: l.fromForm ? world.formId : null,
            title: l.title,
            status: l.status,
            value: l.valuePaise,
            createdAt: l.createdAt,
            updatedAt,
        });
        if (l.fromForm && world.formId) {
            const c = contacts[l.contact];
            const values: Record<string, string> = {
                name: c.name,
                email: c.email,
                phone: c.phone,
                ...(c.company ? { company: c.company } : {}),
                ...l.fromForm.extra,
                message: l.fromForm.message,
            };
            entries.push({
                id: sid("submission", n),
                organizationId: world.orgId,
                formId: world.formId,
                contactId: c.id,
                leadId,
                data: Object.fromEntries(
                    Object.entries(values).filter(([f]) =>
                        world.formFields.includes(f),
                    ),
                ),
                createdAt: l.createdAt,
            });
        }
    });
    await prisma.lead.createMany({ data: leadRows });
    await prisma.activity.createMany({ data: activities });
    await prisma.submission.createMany({ data: entries });
    return { leads: leadRows.length, entries: entries.length };
}

// --- Insights ----------------------------------------------------------------------

/**
 * Ninety days of the rollups Insights reads (`AnalyticsDailyAggregate`, org
 * wide): views over the site's own pages and posts, and enquiries and paid
 * orders counted from the rows above, so the chart agrees with the lists.
 */
export async function writeInsights(
    prisma: Db,
    spec: StudioSpec,
    world: StudioWorld,
    now: Date,
    shape: {
        paths: readonly { path: string; weight: number }[];
        trendBase: number;
        trendSlope: number;
        weekendFactor: number;
    },
) {
    const sid = studioId(spec.key);
    const since = new Date(utcDay(now).getTime() - 90 * DAY);
    const [paid, entries] = await Promise.all([
        prisma.order.findMany({
            where: {
                organizationId: world.orgId,
                paymentStatus: "PAID",
                createdAt: { gte: since },
            },
            select: { createdAt: true },
        }),
        prisma.submission.findMany({
            where: { organizationId: world.orgId, createdAt: { gte: since } },
            select: { createdAt: true },
        }),
    ]);
    const byDay = (rows: { createdAt: Date }[]) => {
        const m = new Map<string, number>();
        for (const r of rows) {
            const iso = r.createdAt.toISOString().slice(0, 10);
            m.set(iso, (m.get(iso) ?? 0) + 1);
        }
        return m;
    };
    const rows = buildAnalyticsRows({
        now,
        days: 90,
        paths: shape.paths,
        idFor: (iso, k) => sid("agg", iso, k),
        trendBase: shape.trendBase,
        trendSlope: shape.trendSlope,
        weekendFactor: shape.weekendFactor,
        enquiryRate: 0,
        orderRate: 0,
        paidOrders: byDay(paid),
        enquiries: byDay(entries),
        noiseOffset: spec.key.length * 97,
    });
    await prisma.analyticsDailyAggregate.createMany({
        data: rows.map((r) => ({
            ...r,
            organizationId: world.orgId,
            siteId: "",
            createdAt: r.date,
            updatedAt: r.date,
        })),
    });
    return rows.length;
}

export const DAY_MS = DAY;
export const HOUR_MS = HOUR;

import type { Prisma } from "@prisma/client";

import type { SeedSection, SeedSite } from "../data";
import type { Db } from "../helpers";
import {
    buildAnalyticsRows,
    id,
    listProductAt,
    setStockLevel,
    utcDay,
    writeSite,
} from "../helpers";
import { seedPlanId } from "../pricing";
import { seedStandInPaymentProvider } from "../stand-in-providers";
import type { SeededService } from "./appointments";
import { gstin } from "./bakery";
import type { InvoiceSpec, Payment } from "./billing";
import { rupees } from "./billing";
import type { ModuleKey, OrgRole, TeamMember } from "./data";
import { SHOWCASE_KEY, SHOWCASE_SEED, TIMEZONE } from "./data";
import type { DemoImage, DemoPost } from "./demo-content";
import { DEMO_POST_CATEGORIES } from "./demo-content";
import type { Person } from "./people";
import {
    addMinutes,
    earliest,
    hashKey,
    istAt,
    istWeekday,
    minuteOf,
    phoneNumber,
} from "./people";
import type { Interval, Period } from "./periods";
import { boundary, periodLabel } from "./periods";
import type { Rng } from "./random";
import { createRng } from "./random";

/**
 * The toolkit Shiksha Academy (`shiksha.ts`) and Desk 42 (`desk42.ts`) are
 * built with: two vertical demos — a coaching centre and a coworking space —
 * that show how a real Indian small business would use what Saroh has today.
 *
 * Each business keeps its own fixtures and calls these in order: the
 * business and its GST standing, team and modules; its storefront and
 * catalogue; its people on the diary with their weekly hours; its site and
 * posts; then the dated world (people, orders, bookings, courses,
 * memberships, invoices, leads, notes, QR scans and site traffic), cleared
 * and written again each run with `createMany`. Every id is
 * `seed_sc_<key>_…`; every date is relative to the seed's `now`, in Kolkata.
 *
 * Both businesses are GST-registered and price inclusive of GST, as most
 * Indian service businesses do: an invoice's lines sum to its total, the
 * subtotal is the taxable value, and the tax is split CGST/SGST within the
 * state (`bakery.ts` works it the same way). Their tax invoices are numbered
 * per financial year: SA/26-27/0001…
 */

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const CURRENCY = "INR";

export type Sid = (...parts: (string | number)[]) => string;

export const sidFor =
    (key: string): Sid =>
    (...parts) =>
        id(SHOWCASE_KEY, key, ...parts);

/** One random stream per business and concern. */
export const rngFor = (...parts: string[]): Rng =>
    createRng((SHOWCASE_SEED ^ hashKey(...parts)) >>> 0);

export interface VerticalContext {
    prisma: Db;
    now: Date;
    demoUserId: string;
    /** A team member's login (`run.ts` ensureTeamMember). */
    teamUser: (person: TeamMember) => Promise<string>;
}

export async function createInChunks<T>(
    rows: readonly T[],
    write: (data: T[]) => Promise<unknown>,
): Promise<void> {
    for (let k = 0; k < rows.length; k += 1000) {
        await write(rows.slice(k, k + 1000));
    }
}

/** The financial year of an instant, in Kolkata: 15 Oct 2026 → "26-27". */
export function financialYear(at: Date): string {
    const local = new Date(at.getTime() + 330 * 60_000);
    const start =
        local.getUTCMonth() >= 3
            ? local.getUTCFullYear()
            : local.getUTCFullYear() - 1;
    const yy = (y: number) => String(y % 100).padStart(2, "0");
    return `${yy(start)}-${yy(start + 1)}`;
}

/** The UTC midnight of a Kolkata calendar date, as a `@db.Date` takes it. */
export function localDate(now: Date, dayOffset: number): Date {
    const local = new Date(
        istAt(now, dayOffset, 12 * 60).getTime() + 330 * 60_000,
    );
    return new Date(
        Date.UTC(
            local.getUTCFullYear(),
            local.getUTCMonth(),
            local.getUTCDate(),
        ),
    );
}

/** The `days`-ago offset of the latest local date that is `dayOfMonth`. */
export function lastDayOfMonth(now: Date, dayOfMonth: number, back = 0) {
    const local = new Date(now.getTime() + 330 * 60_000);
    let year = local.getUTCFullYear();
    let month = local.getUTCMonth();
    if (local.getUTCDate() < dayOfMonth) month -= 1;
    month -= back;
    while (month < 0) {
        month += 12;
        year -= 1;
    }
    const target = Date.UTC(year, month, dayOfMonth);
    const today = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
    );
    return -Math.round((today - target) / DAY);
}

// --- The business ---------------------------------------------------------

export interface BusinessSpec {
    key: string;
    slug: string;
    name: string;
    legalName: string;
    type: string;
    gst: { state: string; pan: string; prefix: string };
    address: { line1: string; city: string; postalCode: string };
    /** The registered address as an invoice prints it. */
    printedAddress: string;
    phone: string;
    contactEmail: string;
    website?: string;
    modules: readonly ModuleKey[];
    /** People who sign in, beside the demo account (the owner). */
    team: readonly TeamMember[];
    paymentProvider: "RAZORPAY" | "CASHFREE";
    createdDaysAgo: number;
    storefront: {
        name: string;
        description: string;
        address: string;
        hours: readonly {
            day: string;
            open: string;
            close: string;
            closed: boolean;
        }[];
    };
    bookingRules: {
        bookAheadDays: number;
        latestBookingMinutes: number;
        freeCancelHours: number;
    };
}

export interface Business {
    orgId: string;
    storeId: string;
    sid: Sid;
    createdAt: Date;
    /** Login user ids by first name, the demo owner under "owner". */
    users: Record<string, string>;
    /** Membership ids by first name. */
    memberships: Record<string, string>;
    gstin: string;
    seller: {
        sellerName: string;
        sellerLegalName: string;
        sellerEmail: string;
        sellerAddress: string;
        sellerGstin: string;
        sellerState: string;
    };
}

export async function setupBusiness(
    ctx: VerticalContext,
    spec: BusinessSpec,
): Promise<Business> {
    const { prisma, now, demoUserId } = ctx;
    const sid = sidFor(spec.key);
    const orgId = sid("org");
    const storeId = sid("store");
    const createdAt = istAt(now, -spec.createdDaysAgo, 10 * 60);
    const taxId = gstin(spec.gst.state, spec.gst.pan);

    await prisma.organization.upsert({
        where: { slug: spec.slug },
        update: { name: spec.name },
        create: { id: orgId, name: spec.name, slug: spec.slug, createdAt },
    });
    const profile = {
        legalName: spec.legalName,
        type: spec.type,
        country: "India",
        taxId,
        contactEmail: spec.contactEmail,
        website: spec.website ?? null,
        timezone: TIMEZONE,
        gstRegistered: true,
        gstState: spec.gst.state,
        addressLine1: spec.address.line1,
        city: spec.address.city,
        postalCode: spec.address.postalCode,
        invoicePrefix: spec.gst.prefix,
        phone: spec.phone,
        stockTracking: true,
    };
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: profile,
        create: { id: sid("profile"), organizationId: orgId, ...profile },
    });

    const users: Record<string, string> = { owner: demoUserId };
    const memberships: Record<string, string> = {};
    const join = async (userId: string, role: OrgRole, key: string) => {
        const m = await prisma.membership.upsert({
            where: { organizationId_userId: { organizationId: orgId, userId } },
            update: { role },
            create: {
                id: sid("membership", key),
                organizationId: orgId,
                userId,
                role,
            },
        });
        memberships[key] = m.id;
    };
    await join(demoUserId, "OWNER", "owner");
    for (const person of spec.team) {
        const userId = await ctx.teamUser(person);
        users[person.first.toLowerCase()] = userId;
        await join(userId, person.role, person.first.toLowerCase());
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
    // A stand-in, on this machine's database only (`stand-in-providers.ts`).
    await seedStandInPaymentProvider(prisma, {
        id: sid("payments", spec.paymentProvider.toLowerCase()),
        organizationId: orgId,
        provider: spec.paymentProvider,
    });

    // --- the one storefront: a SHOP with the address and hours
    await prisma.store.upsert({
        where: { id: storeId },
        update: {
            name: spec.storefront.name,
            organizationId: orgId,
            deletedAt: null,
        },
        create: {
            id: storeId,
            organizationId: orgId,
            name: spec.storefront.name,
            description: spec.storefront.description,
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
        address: spec.storefront.address,
        openingHours: spec.storefront.hours.map((d) => ({ ...d })),
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
    await prisma.bookingRules.upsert({
        where: { organizationId: orgId },
        update: { ...spec.bookingRules },
        create: {
            id: sid("bookingrules"),
            organizationId: orgId,
            ...spec.bookingRules,
            createdAt,
        },
    });

    return {
        orgId,
        storeId,
        sid,
        createdAt,
        users,
        memberships,
        gstin: taxId,
        seller: {
            sellerName: spec.name,
            sellerLegalName: spec.legalName,
            sellerEmail: spec.contactEmail,
            sellerAddress: spec.printedAddress,
            sellerGstin: taxId,
            sellerState: spec.gst.state,
        },
    };
}

/**
 * The business's generated volume, children first. Scoped to its own
 * `seed_sc_<key>_` prefix; structure (services, staff, products, plans,
 * site, posts) is upserted and stays.
 */
export async function clearVolume(prisma: Db, b: Business): Promise<void> {
    const where = { id: { startsWith: b.sid("") } };
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.packRedemption.deleteMany({ where });
    await prisma.submission.deleteMany({ where });
    await prisma.activity.deleteMany({ where });
    await prisma.lead.deleteMany({ where });
    await prisma.contactNote.deleteMany({ where });
    await prisma.bookingEvent.deleteMany({ where });
    await prisma.booking.deleteMany({ where });
    await prisma.courseEnrollment.deleteMany({ where });
    await prisma.courseSession.deleteMany({ where });
    await prisma.course.deleteMany({ where });
    await prisma.packPurchase.deleteMany({ where });
    await prisma.customerSubscription.deleteMany({ where });
    await prisma.customerIdentityLink.deleteMany({ where });
    await prisma.orderItem.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
    await prisma.staffTimeOff.deleteMany({ where });
    await prisma.qrScanDay.deleteMany({
        where: { qrCode: { id: { startsWith: b.sid("") } } },
    });
}

// --- People on the diary --------------------------------------------------

export interface StaffSpec {
    key: string;
    name: string;
    title: string;
    /** The login's first name in `Business.users`, when they sign in. */
    login?: string;
    /** Indexes into the business's services. */
    services: readonly number[];
    hours: readonly { days: readonly number[]; from: string; to: string }[];
}

export async function upsertStaff(
    prisma: Db,
    b: Business,
    staff: readonly StaffSpec[],
    services: readonly SeededService[],
): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const s of staff) {
        const staffId = b.sid("staff", s.key);
        ids[s.key] = staffId;
        const membershipId = s.login ? b.memberships[s.login] : null;
        // One staff member per membership: a row someone made by hand keeps it.
        const holder = membershipId
            ? await prisma.staffMember.findUnique({
                  where: { membershipId },
                  select: { id: true },
              })
            : null;
        const data = {
            name: s.name,
            title: s.title,
            status: "ACTIVE",
            archivedAt: null,
            membershipId:
                holder && holder.id !== staffId ? null : (membershipId ?? null),
        };
        await prisma.staffMember.upsert({
            where: { id: staffId },
            update: data,
            create: {
                id: staffId,
                organizationId: b.orgId,
                ...data,
                createdAt: b.createdAt,
            },
        });
    }
    const all = Object.values(ids);
    await prisma.staffService.deleteMany({ where: { staffId: { in: all } } });
    await prisma.staffHours.deleteMany({ where: { staffId: { in: all } } });
    await prisma.staffService.createMany({
        data: staff.flatMap((s) =>
            s.services.map((service) => ({
                id: b.sid("staffservice", s.key, service),
                organizationId: b.orgId,
                staffId: ids[s.key],
                serviceId: services[service].id,
                createdAt: b.createdAt,
            })),
        ),
    });
    await prisma.staffHours.createMany({
        data: staff.flatMap((s) =>
            s.hours.flatMap((w, k) =>
                w.days.map((dayOfWeek) => ({
                    id: b.sid("staffhours", s.key, k, dayOfWeek),
                    organizationId: b.orgId,
                    staffId: ids[s.key],
                    dayOfWeek,
                    startMinute: minuteOf(w.from),
                    endMinute: minuteOf(w.to),
                    createdAt: b.createdAt,
                })),
            ),
        ),
    });
    return ids;
}

/**
 * Services carry their GST (ADR-008, U5) and whether the booking page shows
 * them; `upsertServices` writes the rest.
 */
export async function setServiceGst(
    prisma: Db,
    services: readonly SeededService[],
    extra: readonly { sac: string; rate: number; shown: boolean }[],
    siteId: string,
): Promise<void> {
    for (let i = 0; i < services.length; i++) {
        await prisma.service.update({
            where: { id: services[i].id },
            data: {
                gstRate: String(extra[i].rate),
                sacCode: extra[i].sac,
                showOnBookingPage: extra[i].shown,
                siteId: extra[i].shown ? siteId : null,
            },
        });
    }
}

// --- People ---------------------------------------------------------------

/** `count` people from the business's own name lists, distinct emails. */
export function makeCast(
    rng: Rng,
    count: number,
    names: {
        first: readonly string[];
        last: readonly string[];
        companies?: readonly string[];
        companyShare?: number;
    },
): Person[] {
    const used = new Set<string>();
    const out: Person[] = [];
    const local = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    while (out.length < count) {
        const first = rng.pick(names.first);
        const last = rng.pick(names.last);
        const base = `${local(first)}.${local(last)}`;
        let email = `${base}@example.com`;
        for (let n = 2; used.has(email); n++) email = `${base}${n}@example.com`;
        used.add(email);
        const company =
            names.companies && rng.chance(names.companyShare ?? 0.5)
                ? rng.pick(names.companies)
                : null;
        out.push({
            first,
            last,
            email,
            phone: phoneNumber(rng),
            company,
            city: null,
        });
    }
    return out;
}

// --- Catalogue ------------------------------------------------------------

export interface ProductSpec {
    slug: string;
    name: string;
    category: string;
    description: string;
    keyPoints: readonly string[];
    price: string;
    mrp?: string;
    hsn: string;
    gstRate: number;
    images: readonly DemoImage[];
    /** One option and its values, as the variants' titles. */
    option?: string;
    variants?: readonly {
        title: string;
        sku: string;
        price?: string;
        onHand: number;
        warnAt: number;
    }[];
    stock?: { onHand: number; warnAt: number };
    /** How often it is bought, relative to the rest. */
    weight: number;
    /** Units on a line: [min, max]. */
    qty: readonly [number, number];
    howToUse?: string;
    materials?: string;
}

export interface PlacedProduct {
    spec: ProductSpec;
    productId: string;
    /** One per variant, or one entry for a product without variants. */
    lines: {
        variantId: string | null;
        title: string | null;
        pricePaise: number;
        stockLevelId: string;
        weight: number;
    }[];
}

const toPaise = (rupeeString: string) => Math.round(Number(rupeeString) * 100);

export async function upsertProducts(
    prisma: Db,
    b: Business,
    categories: readonly { key: string; name: string }[],
    products: readonly ProductSpec[],
): Promise<PlacedProduct[]> {
    const { orgId, storeId, sid } = b;
    const categoryId: Record<string, string> = {};
    for (const c of categories) {
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
    // Options: one per distinct name, its values in first-seen order.
    const optionValues = new Map<string, string[]>();
    for (const p of products) {
        if (!p.option || !p.variants) continue;
        const values = optionValues.get(p.option) ?? [];
        for (const v of p.variants) {
            if (!values.includes(v.title)) values.push(v.title);
        }
        optionValues.set(p.option, values);
    }
    const optionId: Record<string, string> = {};
    const valueId: Record<string, string> = {};
    let position = 0;
    for (const [name, values] of Array.from(optionValues.entries())) {
        const key = name.toLowerCase().replace(/[^a-z]+/g, "-");
        const row = await prisma.productOption.upsert({
            where: { organizationId_name: { organizationId: orgId, name } },
            update: { position },
            create: {
                id: sid("option", key),
                organizationId: orgId,
                storeId,
                name,
                position,
            },
        });
        position += 1;
        optionId[name] = row.id;
        for (let j = 0; j < values.length; j++) {
            const v = await prisma.productOptionValue.upsert({
                where: {
                    optionId_value: { optionId: row.id, value: values[j] },
                },
                update: { position: j },
                create: {
                    id: sid("optionvalue", key, j),
                    optionId: row.id,
                    organizationId: orgId,
                    value: values[j],
                    position: j,
                },
            });
            valueId[`${name}:${values[j]}`] = v.id;
        }
    }

    const placed: PlacedProduct[] = [];
    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const productId = sid("product", i);
        const data = {
            name: p.name,
            description: p.description
                .split(/\n\n+/)
                .map((para) => `<p>${para}</p>`)
                .join(""),
            price: p.price,
            mrp: p.mrp ?? null,
            currency: CURRENCY,
            status: "PUBLISHED",
            categoryId: categoryId[p.category] ?? null,
            optionId: p.option ? (optionId[p.option] ?? null) : null,
            keyPoints: [...p.keyPoints],
            howToUse: p.howToUse ?? null,
            materials: p.materials ?? null,
            gstRate: String(p.gstRate),
            hsnCode: p.hsn,
            image: p.images[0]?.url ?? null,
            shopFields: { keyPoints: true, howToUse: true, materials: true },
        };
        await prisma.product.upsert({
            where: { id: productId },
            update: data,
            create: {
                id: productId,
                storeId,
                organizationId: orgId,
                slug: p.slug,
                createdAt: addMinutes(b.createdAt, 60 * 24 * 3 + i * 47),
                ...data,
            },
        });
        // Photos: rewritten whole, in order; the first is the cover.
        await prisma.productVariant.updateMany({
            where: { productId },
            data: { imageId: null },
        });
        await prisma.productImage.deleteMany({ where: { productId } });
        await prisma.productImage.createMany({
            data: p.images.map((img, k) => ({
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

        if (!p.variants || p.variants.length === 0) {
            await prisma.stockLevel.deleteMany({
                where: { storeId, productId, variantId: { not: null } },
            });
            await listProductAt(prisma, {
                id: sid("listing", i),
                orgId,
                storeId,
                productId,
            });
            const stock = p.stock ?? { onHand: 50, warnAt: 5 };
            const stockLevelId = await setStockLevel(prisma, {
                id: sid("stocklevel", i),
                orgId,
                storeId,
                productId,
                onHand: stock.onHand,
                promised: 0,
                lowStockAlert: stock.warnAt,
            });
            placed.push({
                spec: p,
                productId,
                lines: [
                    {
                        variantId: null,
                        title: null,
                        pricePaise: toPaise(p.price),
                        stockLevelId,
                        weight: 1,
                    },
                ],
            });
            continue;
        }

        await prisma.stockLevel.deleteMany({
            where: { storeId, productId, variantId: null },
        });
        const lines: PlacedProduct["lines"] = [];
        for (let j = 0; j < p.variants.length; j++) {
            const v = p.variants[j];
            const variantId = sid("variant", i, j);
            const vdata = {
                sku: v.sku,
                title: v.title,
                price: v.price ?? null,
                position: j,
                optionValueId: p.option
                    ? (valueId[`${p.option}:${v.title}`] ?? null)
                    : null,
                imageId:
                    p.images.length > j && p.images.length === p.variants.length
                        ? sid("image", i, j)
                        : null,
            };
            await prisma.productVariant.upsert({
                where: { id: variantId },
                update: vdata,
                create: { id: variantId, productId, ...vdata },
            });
        }
        await listProductAt(prisma, {
            id: sid("listing", i),
            orgId,
            storeId,
            productId,
            variants: p.variants.map((_, j) => ({
                id: sid("listingvariant", i, j),
                variantId: sid("variant", i, j),
            })),
        });
        for (let j = 0; j < p.variants.length; j++) {
            const v = p.variants[j];
            const stockLevelId = await setStockLevel(prisma, {
                id: sid("stocklevel", i, j),
                orgId,
                storeId,
                productId,
                variantId: sid("variant", i, j),
                onHand: v.onHand,
                promised: 0,
                lowStockAlert: v.warnAt,
            });
            lines.push({
                variantId: sid("variant", i, j),
                title: v.title,
                pricePaise: toPaise(v.price ?? p.price),
                stockLevelId,
                // Middle sizes sell most; the rest by stock on hand.
                weight: Math.max(1, v.onHand),
            });
        }
        placed.push({ spec: p, productId, lines });
    }
    return placed;
}

// --- Orders ---------------------------------------------------------------

export interface PlannedShop {
    customers: Prisma.CustomerCreateManyInput[];
    links: Prisma.CustomerIdentityLinkCreateManyInput[];
    orders: Prisma.OrderCreateManyInput[];
    items: Prisma.OrderItemCreateManyInput[];
    /** What each open order holds, by shelf row. */
    holds: Map<string, number>;
    /** When each buyer first bought, by contact index. */
    seen: { contact: number; at: Date }[];
}

/** GST inside an inclusive amount at `rate` percent, as `bakery.ts` works it. */
export function gstInside(amountPaise: number, rate: number) {
    const bps = Math.round(rate * 100);
    const taxable =
        bps <= 0
            ? amountPaise
            : Math.round((amountPaise * 10_000) / (10_000 + bps));
    const tax = amountPaise - taxable;
    const sgst = Math.floor(tax / 2);
    return { taxable, tax, cgst: tax - sgst, sgst };
}

/**
 * Orders at the front desk and on the site's shop, over `days`: collected at
 * the counter (or, for a café item, made there and then). Busier on the
 * weekdays the business names, a few regulars buying most often. The last
 * day's are new or being got ready and hold their units on the shelf.
 */
export function planShop(
    rng: Rng,
    b: Business,
    o: {
        now: Date;
        count: number;
        days: number;
        products: readonly PlacedProduct[];
        contacts: readonly { id: string; person: Person }[];
        /** Contact indexes who buy, most frequent first. */
        buyers: readonly number[];
        weekdayWeights: readonly number[];
        /** Per day back, a multiplier (a busy fortnight, a results day). */
        dayWeight?: (dayOffset: number) => number;
        openMinute: number;
        closeMinute: number;
        lineWeights: readonly number[];
        orderPrefix: string;
        staff: readonly string[];
        /** QR codes some orders came from, and the share that did. */
        qr?: { ids: readonly string[]; share: number };
    },
): PlannedShop {
    const out: PlannedShop = {
        customers: [],
        links: [],
        orders: [],
        items: [],
        holds: new Map(),
        seen: [],
    };
    const offsets = Array.from({ length: o.days }, (_, i) => -(o.days - 1) + i);
    const times: Date[] = [];
    while (times.length < o.count) {
        const offset = rng.weighted(
            offsets,
            (d) =>
                o.weekdayWeights[istWeekday(o.now, d)] *
                (o.dayWeight ? o.dayWeight(d) : 1),
        );
        const minute = rng.int(o.openMinute, o.closeMinute - 1);
        const when = istAt(o.now, offset, minute);
        times.push(
            when.getTime() > o.now.getTime()
                ? istAt(o.now, offset - 1, minute)
                : when,
        );
    }
    times.sort((a, c) => a.getTime() - c.getTime());

    const customerOf = new Map<number, string>();
    const lineChoices = o.products.flatMap((p) =>
        p.lines.map((line) => ({ p, line })),
    );
    times.forEach((createdAt, n) => {
        const contact = o.buyers[rng.skewed(o.buyers.length, 1.5)];
        const person = o.contacts[contact].person;
        let customerId = customerOf.get(contact);
        if (!customerId) {
            customerId = b.sid("customer", contact);
            customerOf.set(contact, customerId);
            out.customers.push({
                id: customerId,
                storeId: b.storeId,
                organizationId: b.orgId,
                email: person.email,
                firstName: person.first,
                lastName: person.last,
                phone: person.phone,
                country: "India",
                createdAt,
                updatedAt: createdAt,
            });
            out.links.push({
                id: b.sid("customerlink", contact),
                organizationId: b.orgId,
                contactId: o.contacts[contact].id,
                customerId,
                reason: "PAYMENT",
                createdAt,
            });
            out.seen.push({ contact, at: createdAt });
        }

        const hoursAgo = (o.now.getTime() - createdAt.getTime()) / HOUR;
        const r = rng.next();
        const r2 = rng.next();
        let status: "PENDING" | "PROCESSING" | "DELIVERED" | "CANCELLED";
        let stage: "NEW" | "READY" | "COLLECTED";
        let paymentStatus: "PAID" | "UNPAID" | "REFUNDED";
        if (hoursAgo < 20) {
            status = r < 0.5 ? "PENDING" : "PROCESSING";
            stage = status === "PENDING" ? "NEW" : "READY";
            paymentStatus = r2 < 0.75 ? "PAID" : "UNPAID";
        } else if (hoursAgo < 60 && r < 0.3) {
            status = "PROCESSING";
            stage = "READY";
            paymentStatus = "PAID";
        } else if (r < 0.03) {
            status = "CANCELLED";
            stage = "NEW";
            paymentStatus = r2 < 0.5 ? "REFUNDED" : "UNPAID";
        } else {
            status = "DELIVERED";
            stage = "COLLECTED";
            paymentStatus = "PAID";
        }
        const open = status === "PENDING" || status === "PROCESSING";

        const lineCount =
            1 +
            rng.weighted(
                o.lineWeights.map((_, i) => i),
                (i) => o.lineWeights[i],
            );
        const chosen = new Map<string, (typeof lineChoices)[number]>();
        for (let g = 0; chosen.size < lineCount && g < 20; g++) {
            const pick = rng.weighted(
                lineChoices,
                (c) =>
                    c.p.spec.weight *
                    (c.line.weight /
                        c.p.lines.reduce((s, l) => s + l.weight, 0)),
            );
            chosen.set(pick.p.productId, pick);
        }
        let subtotal = 0;
        let tax = 0;
        const orderId = b.sid("order", n);
        Array.from(chosen.values()).forEach(({ p, line }, k) => {
            const quantity = rng.int(p.spec.qty[0], p.spec.qty[1]);
            const amount = line.pricePaise * quantity;
            subtotal += amount;
            tax += gstInside(amount, p.spec.gstRate).tax;
            out.items.push({
                id: b.sid("orderitem", n, k),
                orderId,
                productId: p.productId,
                variantId: line.variantId,
                quantity,
                price: rupees(line.pricePaise),
                stockRow: line.variantId ? "VARIANT" : "PRODUCT",
                stockLevelId: line.stockLevelId,
                heldQuantity: open ? quantity : 0,
            });
            if (open) {
                out.holds.set(
                    line.stockLevelId,
                    (out.holds.get(line.stockLevelId) ?? 0) + quantity,
                );
            }
        });
        const paidAt =
            paymentStatus === "PAID" || paymentStatus === "REFUNDED"
                ? earliest(addMinutes(createdAt, rng.int(1, 20)), o.now)
                : null;
        const touched = earliest(
            o.now,
            addMinutes(createdAt, open ? 25 : rng.int(30, 60 * 30)),
        );
        out.orders.push({
            id: orderId,
            storeId: b.storeId,
            organizationId: b.orgId,
            orderId: `${o.orderPrefix}${String(n + 1).padStart(3, "0")}`,
            customerId,
            subtotal: rupees(subtotal),
            tax: rupees(tax),
            shipping: "0.00",
            discount: "0.00",
            total: rupees(subtotal),
            currency: CURRENCY,
            status,
            stage,
            fulfilment: "PICKUP",
            paymentStatus,
            paidAt,
            placedOnline: rng.chance(0.45),
            sourceCode:
                o.qr && rng.chance(o.qr.share) ? rng.pick(o.qr.ids) : null,
            createdAt,
            updatedAt: touched,
        });
    });
    return out;
}

export async function writeShop(prisma: Db, shop: PlannedShop): Promise<void> {
    await createInChunks(shop.customers, (data) =>
        prisma.customer.createMany({ data }),
    );
    await createInChunks(shop.links, (data) =>
        prisma.customerIdentityLink.createMany({ data }),
    );
    await createInChunks(shop.orders, (data) =>
        prisma.order.createMany({ data }),
    );
    await createInChunks(shop.items, (data) =>
        prisma.orderItem.createMany({ data }),
    );
    for (const [stockLevelId, promised] of Array.from(shop.holds.entries())) {
        await prisma.stockLevel.update({
            where: { id: stockLevelId },
            data: { promised },
        });
    }
}

// --- Memberships and fee plans -----------------------------------------------

export interface PlanSpec {
    name: string;
    description: string;
    interval: Interval;
    pricePaise: number;
    sac: string;
}

export type Fate =
    /** On it and paying. */
    | "ACTIVE"
    /** On it; the last renewal the job issued is overdue (Home's failed renewal). */
    | "FAILED"
    /** On it; asked to stop when this period ends. */
    | "ENDING"
    | "PAUSED"
    /** Stopped: cancelled, or ended at a period's end. */
    | "CANCELLED";

export interface MemberSpec {
    plan: number;
    contact: number;
    fate: Fate;
    /** The day it began, days before today. */
    startDaysAgo: number;
    /** For a CANCELLED one: when it stopped, days before today. */
    endDaysAgo?: number;
    /** Pays a week or two late. */
    slow?: boolean;
}

export interface PlannedMemberships {
    plans: Prisma.SubscriptionPlanCreateManyInput[];
    subscriptions: Prisma.CustomerSubscriptionCreateManyInput[];
    invoices: GstInvoiceSpec[];
    seen: { contact: number; at: Date }[];
}

/**
 * People on plans: each subscription's periods chained from its anchor (the
 * start of the day it began), one invoice per period issued as it began —
 * the first by whoever signed them up, renewals by the job — as the renewal
 * rules `check.ts` holds every subscription to.
 */
export function planMemberships(
    rng: Rng,
    b: Business,
    o: {
        now: Date;
        plans: readonly PlanSpec[];
        members: readonly MemberSpec[];
        contacts: readonly { id: string }[];
        staff: readonly string[];
        planCreatedAt: Date;
    },
): PlannedMemberships {
    const { now } = o;
    const out: PlannedMemberships = {
        plans: o.plans.map((p, i) => ({
            id: b.sid("plan", i),
            organizationId: b.orgId,
            name: p.name,
            description: p.description,
            price: rupees(p.pricePaise),
            currency: CURRENCY,
            interval: p.interval,
            classesPerMonth: null,
            status: "ACTIVE",
            createdAt: o.planCreatedAt,
            updatedAt: o.planCreatedAt,
        })),
        subscriptions: [],
        invoices: [],
        seen: [],
    };
    o.members.forEach((m, i) => {
        const plan = o.plans[m.plan];
        const staff = rng.pick(o.staff);
        const anchor = istAt(now, -m.startDaysAgo, 0);
        const subscribedAt = earliest(
            istAt(now, -m.startDaysAgo, rng.int(10 * 60, 18 * 60)),
            addMinutes(now, -30),
        );
        const at = (k: number) => boundary(anchor, plan.interval, TIMEZONE, k);
        const event =
            m.fate === "CANCELLED"
                ? istAt(now, -(m.endDaysAgo ?? 1), rng.int(10 * 60, 19 * 60))
                : now;
        if (event <= subscribedAt) {
            throw new Error(`${plan.name}: member ${i} stops before starting`);
        }
        let n = 0;
        while (at(n + 1) <= event) n += 1;
        const current: Period = { start: at(n), end: at(n + 1) };

        let status: "ACTIVE" | "PAUSED" | "CANCELLED" = "ACTIVE";
        let pausedAt: Date | null = null;
        let cancelledAt: Date | null = null;
        if (m.fate === "PAUSED") {
            status = "PAUSED";
            pausedAt = earliest(
                now,
                new Date(
                    Math.max(
                        current.start.getTime() + HOUR,
                        now.getTime() - rng.int(1, 6) * DAY,
                    ),
                ),
            );
        } else if (m.fate === "CANCELLED") {
            status = "CANCELLED";
            cancelledAt = event;
        }

        const subscriptionId = b.sid("sub", i);
        let lastTouched = subscribedAt;
        for (let k = 0; k <= n; k++) {
            const period: Period = { start: at(k), end: at(k + 1) };
            const issuedAt =
                k === 0
                    ? subscribedAt
                    : earliest(
                          addMinutes(period.start, rng.int(2, 50)),
                          event,
                          addMinutes(now, -5),
                      );
            lastTouched = issuedAt;
            const due = issuedAt.getTime() + 7 * DAY;
            const last = k === n;
            let paid: Payment | null;
            if (m.fate === "FAILED" && last && k > 0) {
                if (due >= now.getTime()) {
                    throw new Error(
                        `${plan.name}: member ${i}'s failed renewal is not yet due`,
                    );
                }
                paid = null;
            } else {
                const delay = m.slow
                    ? rng.int(8 * 24 * 60, 16 * 24 * 60)
                    : rng.int(5, 3 * 24 * 60);
                const when = addMinutes(issuedAt, delay);
                paid =
                    when <= now
                        ? {
                              at: when,
                              method: rng.weighted(
                                  [
                                      ["UPI", 60],
                                      ["CARD", 15],
                                      ["BANK_TRANSFER", 15],
                                      ["CASH", 10],
                                  ] as const,
                                  (x) => x[1],
                              )[0],
                              reference: null,
                          }
                        : null;
            }
            if (paid) {
                paid.reference =
                    paid.method === "UPI"
                        ? `UPI ref ${rng.int(300000, 699999)}${rng.int(100000, 999999)}`
                        : paid.method === "BANK_TRANSFER"
                          ? `NEFT ${rng.int(1000000000, 9999999999)}`
                          : paid.method === "CARD"
                            ? `Card ending ${rng.int(1000, 9999)}`
                            : null;
            }
            out.invoices.push({
                id: b.sid("invoice", "sub", i, k),
                contact: m.contact,
                createdAt: issuedAt,
                issuedAt,
                dueAt: new Date(due),
                lines: [
                    {
                        description: `${plan.name} · ${periodLabel(period, TIMEZONE)}`,
                        quantity: 1,
                        unitPaise: plan.pricePaise,
                        sac: plan.sac,
                        rate: 18,
                    },
                ],
                source: "SUBSCRIPTION",
                subscriptionId,
                period,
                createdByUserId: k === 0 ? staff : null,
                paid,
                voided: null,
            });
        }
        out.subscriptions.push({
            id: subscriptionId,
            organizationId: b.orgId,
            planId: b.sid("plan", m.plan),
            contactId: o.contacts[m.contact].id,
            status,
            price: rupees(plan.pricePaise),
            currency: CURRENCY,
            interval: plan.interval,
            timezone: TIMEZONE,
            anchorAt: anchor,
            currentPeriodStart: current.start,
            currentPeriodEnd: current.end,
            pausedAt,
            cancelAtPeriodEnd: m.fate === "ENDING",
            cancelledAt,
            createdByUserId: staff,
            classesPerPeriod: null,
            classesPerPeriodSetAt: current.start,
            createdAt: subscribedAt,
            updatedAt: earliest(
                now,
                new Date(
                    Math.max(
                        lastTouched.getTime(),
                        cancelledAt?.getTime() ?? 0,
                        pausedAt?.getTime() ?? 0,
                    ),
                ),
            ),
        });
        out.seen.push({ contact: m.contact, at: subscribedAt });
    });
    return out;
}

export async function writePlans(
    prisma: Db,
    plans: readonly Prisma.SubscriptionPlanCreateManyInput[],
): Promise<void> {
    for (const plan of plans) {
        await prisma.subscriptionPlan.upsert({
            where: { id: plan.id },
            update: {
                name: plan.name,
                description: plan.description,
                price: plan.price,
                interval: plan.interval,
                status: plan.status,
            },
            create: plan,
        });
    }
}

// --- Tax invoices -------------------------------------------------------------

export interface GstLine {
    description: string;
    quantity: number;
    unitPaise: number;
    sac: string;
    rate: number;
}

export interface GstInvoiceSpec {
    id: string;
    contact: number;
    createdAt: Date;
    /** Null while it is a draft. */
    issuedAt: Date | null;
    dueAt: Date | null;
    lines: readonly GstLine[];
    source: "MANUAL" | "SUBSCRIPTION" | "COURSE" | "PACK" | "BOOKING";
    subscriptionId?: string;
    period?: Period;
    courseEnrollmentId?: string;
    packPurchaseId?: string;
    bookingId?: string;
    createdByUserId: string | null;
    paid: Payment | null;
    voided: { at: Date; reason: string } | null;
    note?: string;
}

/** A course's or a pack's invoice from `billing.ts`, made a tax invoice. */
export function asGst(
    spec: InvoiceSpec,
    sac: string,
    describe?: (line: string) => string,
): GstInvoiceSpec {
    return {
        id: spec.id,
        contact: spec.contact,
        createdAt: spec.createdAt,
        issuedAt: spec.issuedAt,
        dueAt: spec.issuedAt
            ? new Date(spec.issuedAt.getTime() + 7 * DAY)
            : null,
        lines: spec.lines.map((l) => ({
            ...l,
            description: describe ? describe(l.description) : l.description,
            sac,
            rate: 18,
        })),
        source: spec.source,
        subscriptionId: spec.subscriptionId,
        period: spec.period,
        courseEnrollmentId: spec.courseEnrollmentId,
        packPurchaseId: spec.packPurchaseId,
        createdByUserId: spec.createdByUserId,
        paid: spec.paid,
        voided: spec.voided,
    };
}

/**
 * Number the issued invoices in the order they were issued, per financial
 * year (`SA/26-27/0001`), and write them with their lines and each series'
 * counter. An invoice someone issued by hand here keeps its number; the seed
 * refuses rather than hand the same number out twice.
 */
export async function writeGstInvoices(
    prisma: Db,
    b: Business,
    prefix: string,
    contacts: readonly { id: string; name: string; email: string }[],
    specs: readonly GstInvoiceSpec[],
): Promise<{ issued: number; series: Record<string, number> }> {
    const issued = specs
        .filter((s) => s.issuedAt)
        .sort(
            (a, c) =>
                (a.issuedAt?.getTime() ?? 0) - (c.issuedAt?.getTime() ?? 0) ||
                a.id.localeCompare(c.id),
        );
    const last = new Map<string, number>();
    const numbers = new Map<string, string>();
    for (const s of issued) {
        const series = `${prefix}/${financialYear(s.issuedAt ?? new Date(0))}`;
        const n = (last.get(series) ?? 0) + 1;
        last.set(series, n);
        numbers.set(s.id, `${series}/${String(n).padStart(4, "0")}`);
    }
    const byHand = await prisma.invoice.findMany({
        where: {
            organizationId: b.orgId,
            number: { not: null },
            NOT: { id: { startsWith: b.sid("") } },
        },
        select: { number: true },
    });
    const handLast = new Map<string, number>();
    for (const { number } of byHand) {
        const m = /^(.*)[/-](\d+)$/.exec(number ?? "");
        if (!m) continue;
        if (Number(m[2]) <= (last.get(m[1]) ?? 0)) {
            throw new Error(
                `${b.seller.sellerName} has an invoice issued by hand (${number}) that holds a ` +
                    `number the showcase needs. Run db:seed:reset, then seed again.`,
            );
        }
        handLast.set(m[1], Math.max(Number(m[2]), handLast.get(m[1]) ?? 0));
    }

    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    for (const s of specs) {
        const contact = contacts[s.contact];
        const taxed = s.lines.map((l) => {
            const amount = l.quantity * l.unitPaise;
            return { ...l, amount, ...gstInside(amount, l.rate) };
        });
        const sum = (pick: (l: (typeof taxed)[number]) => number) =>
            taxed.reduce((acc, l) => acc + pick(l), 0);
        const total = sum((l) => l.amount);
        const cgst = sum((l) => l.cgst);
        const sgst = sum((l) => l.sgst);
        const isIssued = s.issuedAt !== null;
        const status = !isIssued
            ? "DRAFT"
            : s.voided
              ? "VOID"
              : s.paid
                ? "PAID"
                : "ISSUED";
        invoices.push({
            id: s.id,
            organizationId: b.orgId,
            number: numbers.get(s.id) ?? null,
            status,
            kind: "INVOICE",
            contactId: contact.id,
            billToName: isIssued ? contact.name : null,
            billToEmail: isIssued ? contact.email : null,
            sellerGstin: b.seller.sellerGstin,
            sellerState: b.seller.sellerState,
            sellerAddress: b.seller.sellerAddress,
            sellerName: isIssued ? b.seller.sellerName : null,
            sellerLegalName: isIssued ? b.seller.sellerLegalName : null,
            sellerEmail: isIssued ? b.seller.sellerEmail : null,
            placeOfSupply: b.seller.sellerState,
            taxType: "INTRA",
            cgst: rupees(cgst),
            sgst: rupees(sgst),
            igst: "0.00",
            currency: CURRENCY,
            subtotal: rupees(total - cgst - sgst),
            tax: rupees(cgst + sgst),
            total: rupees(total),
            issuedAt: s.issuedAt,
            dueAt: isIssued ? s.dueAt : null,
            paidAt: s.paid?.at ?? null,
            paymentMethod: s.paid?.method ?? null,
            paymentReference: s.paid?.reference ?? null,
            paymentNote: s.note ?? null,
            voidedAt: s.voided?.at ?? null,
            voidReason: s.voided?.reason ?? null,
            source: s.source,
            subscriptionId: s.subscriptionId ?? null,
            periodStart: s.period?.start ?? null,
            periodEnd: s.period?.end ?? null,
            courseEnrollmentId: s.courseEnrollmentId ?? null,
            packPurchaseId: s.packPurchaseId ?? null,
            bookingId: s.bookingId ?? null,
            createdByUserId: s.createdByUserId,
            createdAt: s.createdAt,
            updatedAt: s.voided?.at ?? s.paid?.at ?? s.issuedAt ?? s.createdAt,
        });
        taxed.forEach((l, position) => {
            lines.push({
                id: `${s.id}_line_${position}`,
                organizationId: b.orgId,
                invoiceId: s.id,
                position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: rupees(l.unitPaise),
                amount: rupees(l.amount),
                discount: "0.00",
                hsnSac: l.sac,
                gstRate: String(l.rate),
                taxableValue: rupees(l.taxable),
                cgst: rupees(l.cgst),
                sgst: rupees(l.sgst),
                igst: "0.00",
            });
        });
    }
    await createInChunks(invoices, (data) =>
        prisma.invoice.createMany({ data }),
    );
    await createInChunks(lines, (data) =>
        prisma.invoiceLine.createMany({ data }),
    );

    const keys = Array.from(
        new Set([...Array.from(last.keys()), ...Array.from(handLast.keys())]),
    );
    await prisma.invoiceSequence.deleteMany({
        where: { organizationId: b.orgId, series: { notIn: keys } },
    });
    for (const series of keys) {
        const lastNumber = Math.max(
            last.get(series) ?? 0,
            handLast.get(series) ?? 0,
        );
        await prisma.invoiceSequence.upsert({
            where: {
                organizationId_series: { organizationId: b.orgId, series },
            },
            update: { lastNumber },
            create: { organizationId: b.orgId, series, lastNumber },
        });
    }
    return { issued: issued.length, series: Object.fromEntries(last) };
}

/** A payment for a manual invoice: UPI mostly. */
export function payment(rng: Rng, at: Date): Payment {
    const method = rng.weighted(
        [
            ["UPI", 55],
            ["BANK_TRANSFER", 20],
            ["CARD", 15],
            ["CASH", 10],
        ] as const,
        (x) => x[1],
    )[0];
    return {
        at,
        method,
        reference:
            method === "UPI"
                ? `UPI ref ${rng.int(300000, 699999)}${rng.int(100000, 999999)}`
                : method === "BANK_TRANSFER"
                  ? `NEFT ${rng.int(1000000000, 9999999999)}`
                  : method === "CARD"
                    ? `Card ending ${rng.int(1000, 9999)}`
                    : null,
    };
}

// --- Site, posts and QR codes ----------------------------------------------

/** A section the seed's narrow `SeedSection` type does not list (journal, timetable, …). */
export const block = (
    type: string,
    content: Record<string, unknown>,
): SeedSection => ({ type, content }) as unknown as SeedSection;

export async function writeVerticalSite(
    prisma: Db,
    b: Business,
    o: {
        now: Date;
        site: SeedSite;
        footer: string;
        pipelineId: string;
        services: readonly SeededService[];
    },
): Promise<{ siteId: string; formId: (p: number, n: number) => string }> {
    const sid = b.sid;
    const formId = (p: number, n: number) => sid("form", p, n);
    const siteId = await writeSite(prisma, {
        fixture: o.site,
        orgId: b.orgId,
        userId: b.users.owner,
        now: o.now,
        ids: {
            site: sid("site"),
            page: (p) => sid("page", p),
            pageVersion: (p) => sid("pageversion", p),
            section: (p, n) => sid("section", p, n),
            sectionKey: (p, n) => sid("sectionkey", p, n),
            form: formId,
            publication: sid("publication"),
        },
        pipelineId: o.pipelineId,
        serviceId: (i) => o.services[i].id,
        footer: { format: "text", value: o.footer },
    });
    // The site sells from the one storefront (G11).
    await prisma.site.update({
        where: { id: siteId },
        data: { storefrontId: b.storeId },
    });
    return { siteId, formId };
}

/**
 * The site's posts in three categories, each made live as publishing does
 * (`posts.service.ts`): its own Publication carrying the category and the
 * author's name. A post edited by hand keeps its live publication; the seed
 * only fills in what is not there.
 */
export async function writePosts(
    prisma: Db,
    b: Business,
    o: {
        now: Date;
        siteId: string;
        posts: readonly DemoPost[];
        /** Login user ids by author name, for those who sign in. */
        authors: Record<string, string>;
    },
): Promise<number> {
    const categoryId: Record<
        string,
        { id: string; name: string; slug: string }
    > = {};
    for (const c of DEMO_POST_CATEGORIES) {
        const row = await prisma.postCategory.upsert({
            where: { siteId_slug: { siteId: o.siteId, slug: c.key } },
            update: { name: c.name },
            create: {
                id: b.sid("postcategory", c.key),
                siteId: o.siteId,
                name: c.name,
                slug: c.key,
            },
        });
        categoryId[c.key] = { id: row.id, name: c.name, slug: c.key };
    }
    const slugs = new Set<string>();
    for (let i = 0; i < o.posts.length; i++) {
        const p = o.posts[i];
        if (slugs.has(p.slug)) throw new Error(`Two posts are /${p.slug}`);
        slugs.add(p.slug);
        const publishedAt = istAt(o.now, -p.daysAgo, 9 * 60 + ((i * 37) % 600));
        const category = categoryId[p.category];
        const post = await prisma.post.upsert({
            where: { siteId_slug: { siteId: o.siteId, slug: p.slug } },
            update: {},
            create: {
                id: b.sid("post", p.slug),
                siteId: o.siteId,
                authorId: o.authors[p.author] ?? null,
                categoryId: category.id,
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                content: p.body,
                image: p.cover.url,
                featured: p.featured ?? false,
                status: "PUBLISHED",
                publishedAt,
                createdAt: addMinutes(publishedAt, -26 * 60),
                updatedAt: publishedAt,
            },
        });
        if (post.currentPublicationId) continue;
        const at = post.publishedAt ?? publishedAt;
        const publication = await prisma.publication.create({
            data: {
                id: b.sid("postpub", p.slug),
                siteId: o.siteId,
                organizationId: b.orgId,
                postId: post.id,
                path: `/blog/${post.slug}`,
                snapshot: {
                    post: {
                        title: post.title,
                        slug: post.slug,
                        excerpt: post.excerpt,
                        content: post.content,
                        image: post.image,
                        featured: post.featured,
                        category: { name: category.name, slug: category.slug },
                        author: p.author,
                        publishedAt: at.toISOString(),
                    },
                    path: `/blog/${post.slug}`,
                    publishedAt: at.toISOString(),
                },
                templateId: "post",
                templateVersion: 1,
                publishedByUserId: b.users.owner,
                publishedAt: at,
            },
        });
        await prisma.post.update({
            where: { id: post.id },
            data: { currentPublicationId: publication.id, publishedAt: at },
        });
    }
    return o.posts.length;
}

export interface QrSpec {
    key: string;
    code: string;
    targetKind: "SITE" | "SHOP" | "BOOK" | "PAGE";
    /** For PAGE: the page's fixture index. */
    page?: number;
    place: "COUNTER" | "MIRROR" | "CARD" | "FLYER" | "OTHER";
    placeNote: string;
    label: string;
    color: string;
    createdDaysAgo: number;
    /** Scans on an ordinary weekday. */
    perDay: number;
}

/** The codes and their daily scans, from the day each was put up. */
export async function writeQrCodes(
    prisma: Db,
    b: Business,
    o: {
        now: Date;
        siteId: string;
        codes: readonly QrSpec[];
        weekendFactor: number;
        dayWeight?: (dayOffset: number) => number;
    },
): Promise<string[]> {
    const ids: string[] = [];
    const rng = rngFor(b.sid(""), "qr");
    const scans: Prisma.QrScanDayCreateManyInput[] = [];
    for (const q of o.codes) {
        const qrId = b.sid("qr", q.key);
        ids.push(qrId);
        const data = {
            targetKind: q.targetKind,
            targetRef:
                q.targetKind === "PAGE" && q.page !== undefined
                    ? b.sid("page", q.page)
                    : null,
            place: q.place,
            placeNote: q.placeNote,
            label: q.label,
            color: q.color,
        };
        await prisma.qrCode.upsert({
            where: { id: qrId },
            update: data,
            create: {
                id: qrId,
                siteId: o.siteId,
                organizationId: b.orgId,
                code: q.code,
                style: "BRANDED",
                ...data,
                createdAt: istAt(o.now, -q.createdDaysAgo, 11 * 60),
            },
        });
        for (let d = -q.createdDaysAgo; d <= 0; d++) {
            const weekend = [0, 6].includes(istWeekday(o.now, d));
            const mean =
                q.perDay *
                (weekend ? o.weekendFactor : 1) *
                (o.dayWeight ? o.dayWeight(d) : 1);
            const count = Math.max(
                0,
                Math.round(mean * (0.4 + rng.next() * 1.2)),
            );
            if (count > 0) {
                scans.push({
                    qrCodeId: qrId,
                    organizationId: b.orgId,
                    day: localDate(o.now, d),
                    count,
                });
            }
        }
    }
    await prisma.qrScanDay.createMany({ data: scans });
    return ids;
}

/**
 * The site's daily rollups, agreeing with what the rows say happened: paid
 * orders from the Order table and enquiries from the Submission table. The
 * shape — a slow trend, quieter weekends, the bumps a business would see —
 * is the business's own.
 */
export async function writeTraffic(
    prisma: Db,
    b: Business,
    o: {
        now: Date;
        days: number;
        paths: readonly { path: string; weight: number }[];
        trendBase: number;
        trendSlope: number;
        weekendFactor: number;
        /** Per day back (0 = today), a multiplier. */
        dayWeight: (dayOffset: number) => number;
    },
): Promise<number> {
    await prisma.analyticsDailyAggregate.deleteMany({
        where: {
            organizationId: b.orgId,
            id: { startsWith: b.sid("agg", "") },
        },
    });
    const since = new Date(utcDay(o.now).getTime() - o.days * DAY);
    const [paid, entries] = await Promise.all([
        prisma.order.findMany({
            where: {
                organizationId: b.orgId,
                paymentStatus: "PAID",
                createdAt: { gte: since },
            },
            select: { createdAt: true },
        }),
        prisma.submission.findMany({
            where: { organizationId: b.orgId, createdAt: { gte: since } },
            select: { createdAt: true },
        }),
    ]);
    const byDay = (rows: { createdAt: Date }[]) => {
        const map = new Map<string, number>();
        for (const r of rows) {
            const iso = r.createdAt.toISOString().slice(0, 10);
            map.set(iso, (map.get(iso) ?? 0) + 1);
        }
        return map;
    };
    const rows = buildAnalyticsRows({
        now: o.now,
        days: o.days,
        paths: o.paths,
        idFor: (iso, k) => b.sid("agg", iso, k),
        trendBase: o.trendBase,
        trendSlope: o.trendSlope,
        weekendFactor: o.weekendFactor,
        enquiryRate: 0,
        orderRate: 0,
        paidOrders: byDay(paid),
        enquiries: byDay(entries),
        noiseOffset: hashKey(b.sid("")) % 1000,
        dayBoost: (i) => o.dayWeight(i - (o.days - 1)),
    });
    await createInChunks(rows, (data) =>
        prisma.analyticsDailyAggregate.createMany({
            data: data.map((r) => ({
                ...r,
                organizationId: b.orgId,
                siteId: "",
                createdAt: r.date,
                updatedAt: r.date,
            })),
        }),
    );
    return rows.length;
}

/** A bump that rises on `day` (days back, negative) and fades over `fade` days. */
export const bump =
    (day: number, height: number, fade: number) => (dayOffset: number) =>
        dayOffset < day ? 0 : height * Math.exp(-(dayOffset - day) / fade);

// --- Checks ---------------------------------------------------------------

/** Fail the run, naming every designed state the business is missing. */
export function requireStates(
    business: string,
    states: Record<string, boolean>,
): void {
    const missing = Object.entries(states)
        .filter(([, ok]) => !ok)
        .map(([what]) => what);
    if (missing.length > 0) {
        throw new Error(
            `${business} is missing what its demo shows: ${missing.join("; ")}`,
        );
    }
}

/**
 * A season's older enquiries have mostly been decided: an open lead more
 * than `days` old is taken on to the last stage and won, or lost, with the
 * stage changes the product would have logged on the way.
 */
export function settleOldLeads(
    rng: Rng,
    rows: {
        leads: Prisma.LeadCreateManyInput[];
        activities: Prisma.ActivityCreateManyInput[];
    },
    o: {
        now: Date;
        days: number;
        stageIds: readonly string[];
        stageNames: readonly string[];
        actor: string;
        wonShare: number;
        lostShare: number;
        activityId: (n: number, k: number) => string;
    },
): void {
    const last = o.stageIds.length - 1;
    rows.leads.forEach((lead, n) => {
        const created = new Date(lead.createdAt ?? o.now);
        const roll = rng.next();
        if (
            lead.status !== "OPEN" ||
            created.getTime() > o.now.getTime() - o.days * DAY
        ) {
            return;
        }
        let k = rows.activities.filter((a) => a.leadId === lead.id).length;
        let t = new Date(lead.updatedAt ?? created);
        const ceiling = addMinutes(o.now, -60);
        if (roll < o.wonShare) {
            let stage = o.stageIds.indexOf(lead.stageId);
            while (stage < last) {
                t = earliest(ceiling, addMinutes(t, rng.int(18, 72) * 60));
                rows.activities.push({
                    id: o.activityId(n, k++),
                    organizationId: lead.organizationId,
                    leadId: lead.id ?? "",
                    type: "STAGE_CHANGED",
                    body: `Stage changed from "${o.stageNames[stage]}" to "${o.stageNames[stage + 1]}"`,
                    actorUserId: o.actor,
                    createdAt: t,
                    updatedAt: t,
                });
                stage += 1;
            }
            lead.stageId = o.stageIds[last];
            lead.status = "WON";
            lead.updatedAt = t;
        } else if (roll < o.wonShare + o.lostShare) {
            lead.status = "LOST";
        }
    });
}

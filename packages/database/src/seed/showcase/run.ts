import type { Prisma } from "@prisma/client";

import { assertDatabaseTarget } from "../../database-target";
import {
    ANALYTICS_DAYS,
    ANALYTICS_PATHS,
    CONTACTS as BASE_CONTACTS,
    OWNER_EMAIL,
    PLAN,
} from "../data";
import type { Db } from "../helpers";
import {
    at,
    buildAnalyticsRows,
    emailFor,
    hashPassword,
    id,
    publishSeedPost,
    utcDay,
    writeSite,
} from "../helpers";
import { bookingRows, planBookings, upsertServices } from "./appointments";
import type { OrderStatus, PaymentStatus, SellableProduct } from "./commerce";
import { planOrders, toPaise, upsertCatalog } from "./commerce";
import type { LeadSpec } from "./crm";
import { planLeads, upsertPipeline } from "./crm";
import type { ModuleKey, OrgRole, ShowcaseBusiness, TeamMember } from "./data";
import {
    LEAD_TIMELINE,
    LUMEN_POSTS,
    NORTHWIND,
    NORTHWIND_BASE_PRODUCT_DEMAND,
    NORTHWIND_CATEGORY_INDEX,
    NORTHWIND_LEADS,
    NORTHWIND_NEW_CATEGORIES,
    NORTHWIND_NEW_PRODUCTS,
    ROLE_ACCOUNTS,
    RYE,
    RYE_PRODUCTS,
    SHOWCASE_BUSINESSES,
    SHOWCASE_KEY,
    SHOWCASE_PASSWORD,
    SHOWCASE_SEED,
    staffEmail,
} from "./data";
import type { Person } from "./people";
import { earliest, hashKey, istAt, makePeople } from "./people";
import { createRng } from "./random";

/**
 * Lay the showcase over the base seed.
 *
 * STRUCTURE is upserted on fixed ids — people, businesses, memberships,
 * modules, catalogue, services, sites — exactly as the base seed does.
 *
 * VOLUME — contacts, customers, orders, bookings, leads and their timelines,
 * form entries — is regenerated each run: this business's `seed_sc_<key>_`
 * rows are deleted and written again with `createMany`, in one pass per table.
 * The generator is a seeded PRNG and every date is relative to today, so a
 * re-run on the same day writes the same rows with the same ids; a re-run a
 * week later moves the diary with the calendar instead of leaving "upcoming"
 * bookings in the past. Rows a developer added by hand have no seed id and are
 * never touched.
 */

const sid = (key: string, ...parts: (string | number)[]) =>
    id(SHOWCASE_KEY, key, ...parts);

/** One random stream per business and concern, so editing one leaves the rest. */
const rngFor = (...parts: string[]) =>
    createRng((SHOWCASE_SEED ^ hashKey(...parts)) >>> 0);

const CHUNK = 1000;
async function createInChunks<T>(
    rows: T[],
    write: (data: T[]) => Promise<unknown>,
): Promise<void> {
    for (let k = 0; k < rows.length; k += CHUNK) {
        await write(rows.slice(k, k + CHUNK));
    }
}

const fullName = (p: { first: string; last: string }) => `${p.first} ${p.last}`;

interface Context {
    prisma: Db;
    now: Date;
    password: string;
    demoUserId: string;
}

export async function seedShowcase(): Promise<void> {
    const target = assertDatabaseTarget();
    console.log(`[showcase] target: ${target.database} on ${target.host}`);

    const { prisma } = await import("../../client");
    const now = new Date();
    const started = Date.now();

    // One hash for every showcase login. better-auth salts each hash, so a
    // shared one verifies for all of them; hashing ~20 times would only cost
    // seconds of scrypt.
    const password = await hashPassword(SHOWCASE_PASSWORD);
    const demo = await prisma.user.findUniqueOrThrow({
        where: { email: OWNER_EMAIL },
        select: { id: true },
    });
    const ctx: Context = { prisma, now, password, demoUserId: demo.id };

    const roleUsers = {
        admin: await ensureUser(ctx, {
            email: ROLE_ACCOUNTS.admin.email,
            name: ROLE_ACCOUNTS.admin.name,
            userId: id("user", "admin"),
            accountId: id("account", "admin"),
        }),
        member: await ensureUser(ctx, {
            email: ROLE_ACCOUNTS.member.email,
            name: ROLE_ACCOUNTS.member.name,
            userId: id("user", "member"),
            accountId: id("account", "member"),
        }),
    };

    await seedNorthwind(ctx, roleUsers);
    for (const business of SHOWCASE_BUSINESSES) {
        await seedBusiness(ctx, business, roleUsers);
    }

    console.log(
        `[showcase] done in ${((Date.now() - started) / 1000).toFixed(1)}s. ` +
            `Every account's password: ${SHOWCASE_PASSWORD}`,
    );
}

// --- People and access ----------------------------------------------------

async function ensureUser(
    ctx: Context,
    u: { email: string; name: string; userId: string; accountId: string },
): Promise<string> {
    const user = await ctx.prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name, emailVerified: true },
        create: {
            id: u.userId,
            email: u.email,
            name: u.name,
            emailVerified: true,
        },
    });
    // A credential, not just a User row, so every account can sign in. Left
    // alone on a re-run: re-hashing would rewrite the row for nothing.
    await ctx.prisma.account.upsert({
        where: { id: u.accountId },
        update: {},
        create: {
            id: u.accountId,
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: ctx.password,
        },
    });
    return user.id;
}

async function ensureTeamMember(
    ctx: Context,
    person: TeamMember,
): Promise<string> {
    const handle = staffEmail(person).split("@")[0].replace(/\./g, "_");
    return ensureUser(ctx, {
        email: staffEmail(person),
        name: fullName(person),
        userId: sid("user", handle),
        accountId: sid("account", handle),
    });
}

async function upsertMembership(
    ctx: Context,
    organizationId: string,
    userId: string,
    role: OrgRole,
    membershipId: string,
) {
    await ctx.prisma.membership.upsert({
        where: { organizationId_userId: { organizationId, userId } },
        update: { role },
        create: { id: membershipId, organizationId, userId, role },
    });
}

/**
 * Turn modules on: the `OrganizationModule` row AND the `MODULE_<KEY>` rollout
 * override for this organization. Without the override the flag resolver
 * fails closed and the module reads as switched off (#266, run.ts). The flag
 * rows themselves are registered by the base seed.
 */
async function enableModules(
    ctx: Context,
    key: string,
    orgId: string,
    modules: readonly ModuleKey[],
    byUserId: string,
    enabledAt: Date,
) {
    for (const moduleKey of modules) {
        await ctx.prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: { organizationId: orgId, moduleKey },
            },
            update: { status: "ENABLED" },
            create: {
                id: sid(key, "module", moduleKey.toLowerCase()),
                organizationId: orgId,
                moduleKey,
                status: "ENABLED",
                enabledAt,
                enabledByUserId: byUserId,
            },
        });
        const flagKey = `MODULE_${moduleKey}`;
        await ctx.prisma.featureFlagOverride.upsert({
            where: {
                flagKey_organizationId: { flagKey, organizationId: orgId },
            },
            update: { enabled: true },
            create: {
                id: sid(key, "flagoverride", moduleKey.toLowerCase()),
                flagKey,
                organizationId: orgId,
                enabled: true,
            },
        });
    }
}

/**
 * The base seed's Business plan, so the entitlements (sites, team members)
 * allow what the showcase creates.
 */
async function subscribe(ctx: Context, key: string, orgId: string) {
    const plan = await ctx.prisma.plan.findUniqueOrThrow({
        where: { key_version: { key: PLAN.key, version: PLAN.version } },
        select: { id: true },
    });
    await ctx.prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId: plan.id, status: "ACTIVE" },
        create: {
            id: sid(key, "subscription"),
            organizationId: orgId,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodEnd: at(ctx.now, 12, 9),
        },
    });
}

/**
 * Remove this business's generated volume, children first, before it is
 * written again. Scoped to the business's own `seed_sc_<key>_` prefix.
 */
async function clearVolume(ctx: Context, key: string) {
    const where = { id: { startsWith: sid(key, "") } };
    const p = ctx.prisma;
    await p.submission.deleteMany({ where });
    await p.activity.deleteMany({ where });
    await p.lead.deleteMany({ where });
    await p.bookingEvent.deleteMany({ where });
    await p.booking.deleteMany({ where });
    await p.orderItem.deleteMany({ where });
    await p.order.deleteMany({ where });
    await p.customer.deleteMany({ where });
    await p.contact.deleteMany({ where });
}

// --- Northwind ------------------------------------------------------------

async function seedNorthwind(
    ctx: Context,
    roleUsers: { admin: string; member: string },
) {
    const { prisma, now } = ctx;
    const key = "nw";
    const orgId = NORTHWIND.orgId;
    const storeId = NORTHWIND.storeId;

    // The team: two role-test accounts and two people who work there.
    await upsertMembership(
        ctx,
        orgId,
        roleUsers.admin,
        "ADMIN",
        id("membership", "admin"),
    );
    await upsertMembership(
        ctx,
        orgId,
        roleUsers.member,
        "MEMBER",
        id("membership", "member"),
    );
    const staffIds: string[] = [];
    for (const person of NORTHWIND.staff) {
        const userId = await ensureTeamMember(ctx, person);
        staffIds.push(userId);
        await upsertMembership(
            ctx,
            orgId,
            userId,
            person.role,
            sid(key, "membership", person.first.toLowerCase()),
        );
    }

    // Categories: the base three plus labels, tools and shipping.
    for (const c of NORTHWIND_NEW_CATEGORIES) {
        await prisma.category.upsert({
            where: { storeId_slug: { storeId, slug: c.slug } },
            update: { name: c.name, organizationId: orgId },
            create: {
                id: sid(key, "category", c.slug),
                storeId,
                organizationId: orgId,
                name: c.name,
                slug: c.slug,
            },
        });
    }
    const categories = await prisma.category.findMany({
        where: { storeId, slug: { in: Object.keys(NORTHWIND_CATEGORY_INDEX) } },
        select: { id: true, slug: true },
    });
    const categoryId = (slug: string) => {
        const found = categories.find((c) => c.slug === slug);
        if (!found) throw new Error(`Northwind has no "${slug}" category`);
        return found.id;
    };

    const newProducts = await upsertCatalog(prisma, {
        storeId,
        orgId,
        currency: "INR",
        categoryId,
        products: NORTHWIND_NEW_PRODUCTS,
        productId: (i) => sid(key, "product", i),
        variantId: (i, v) => sid(key, "variant", i, v),
        inventoryId: (i) => sid(key, "inventory", i),
        createdAt: (i) => at(now, -(200 - i * 3), 11),
    });
    const baseProducts = await prisma.product.findMany({
        where: {
            storeId,
            slug: { in: Object.keys(NORTHWIND_BASE_PRODUCT_DEMAND) },
        },
        select: { id: true, slug: true },
        orderBy: { slug: "asc" },
    });
    const products: SellableProduct[] = [
        ...baseProducts.map((p) => {
            const demand = NORTHWIND_BASE_PRODUCT_DEMAND[p.slug];
            return {
                id: p.id,
                priceCents: toPaise(demand.price),
                bulk: demand.bulk,
                weight: demand.weight,
            };
        }),
        ...newProducts,
    ];

    await clearVolume(ctx, key);

    // Trade customers. Addresses already used by the base seed are reserved
    // so no generated one collides with a base row.
    const used = new Set(BASE_CONTACTS.map((c) => emailFor(c.first, c.last)));
    const peopleRng = rngFor(key, "people");
    const customers = makePeople(peopleRng, NORTHWIND.customers, used, {
        companies: "generated",
        companyShare: 0.9,
        cities: true,
    });

    const planned = planOrders(rngFor(key, "orders"), {
        now,
        count: NORTHWIND.orders,
        days: NORTHWIND.orderDays,
        products,
        customers: customers.length,
        lineWeights: [45, 30, 17, 8],
        weekdayWeights: [0.2, 1, 1.1, 1.05, 1.1, 1, 0.65],
        growth: 0.6,
        openMinute: 9 * 60 + 30,
        closeMinute: 19 * 60,
        taxRate: NORTHWIND.taxRate,
        // Free delivery on a big order, a flat charge otherwise, and nothing
        // for the one in five who collect from the Peenya counter.
        shipping: (subtotal, rng) =>
            subtotal >= NORTHWIND.freeShippingFromPaise || rng.chance(0.2)
                ? 0
                : NORTHWIND.shippingPaise,
        // A 5% trade discount on some larger orders, to the rupee.
        discount: (subtotal, rng) =>
            subtotal > 500_000 && rng.chance(0.15)
                ? Math.round((subtotal * 0.05) / 100) * 100
                : 0,
        status: northwindStatus,
        orderNumber: (n) =>
            `ORD-${String(NORTHWIND.firstOrderNumber + n).padStart(3, "0")}`,
        orderId: (n) => sid(key, "order", n),
        itemId: (n, line) => sid(key, "orderitem", n, line),
        storeId,
        orgId,
        currency: "INR",
    });

    const customerRng = rngFor(key, "customers");
    const customerCreatedAt = customers.map((_, i) => {
        const r = customerRng.next();
        const first = planned.firstOrderAt.get(i);
        return first
            ? new Date(
                  first.getTime() - Math.round(r * 30) * 86_400_000 - 3_600_000,
              )
            : istAt(now, -Math.round(5 + r * 150), 11 * 60);
    });
    await writeCustomers(
        ctx,
        key,
        storeId,
        orgId,
        customers,
        customerCreatedAt,
    );
    await writeOrders(ctx, key, planned);

    // CRM: the best customers are contacts too, plus prospects not yet buying.
    const prospects = makePeople(
        peopleRng,
        NORTHWIND.contacts - NORTHWIND.contactsFromCustomers,
        used,
        {
            companies: "generated",
        },
    );
    const contactPeople = [
        ...customers.slice(0, NORTHWIND.contactsFromCustomers),
        ...prospects,
    ];
    const sources = [
        "WEBSITE",
        "REFERRAL",
        "WALK_IN",
        "INSTAGRAM",
        "TRADE_FAIR",
    ];
    const contactRng = rngFor(key, "contacts");
    const contactCreatedAt = contactPeople.map((_, i) => {
        const r = contactRng.next();
        return i < NORTHWIND.contactsFromCustomers
            ? customerCreatedAt[i]
            : istAt(
                  now,
                  -Math.round(3 + r * 110),
                  10 * 60 + Math.round(r * 400),
              );
    });
    const contactSource = contactPeople.map(() => contactRng.pick(sources));

    // Leads: mostly prospects, some existing buyers wanting more.
    const leadRng = rngFor(key, "leads");
    const leadContacts = [
        ...Array.from(
            { length: 14 },
            (_, i) => NORTHWIND.contactsFromCustomers + i,
        ),
        ...Array.from({ length: 10 }, (_, i) => i * 3),
    ];
    const specs: LeadSpec[] = leadContacts.map((c) => {
        const template = leadRng.pick(NORTHWIND_LEADS);
        const person = contactPeople[c];
        const createdAt = new Date(
            Math.max(
                contactCreatedAt[c].getTime() + 3_600_000,
                istAt(
                    now,
                    -leadRng.int(2, 70),
                    leadRng.int(10 * 60, 18 * 60),
                ).getTime(),
            ),
        );
        return {
            contactId: sid(key, "contact", c),
            title: `${template.title} — ${person.company ?? fullName(person)}`,
            value: roundValue(template.value * (0.8 + leadRng.next() * 0.5)),
            formId: null,
            createdAt: earliest(createdAt, new Date(now.getTime() - 7_200_000)),
        };
    });

    await writeContacts(
        ctx,
        orgId,
        contactPeople.map((p, i) => ({
            id: sid(key, "contact", i),
            person: p,
            source: contactSource[i],
            createdAt: contactCreatedAt[i],
        })),
    );

    const stages = await prisma.stage.findMany({
        where: { pipelineId: NORTHWIND.pipelineId },
        orderBy: { order: "asc" },
        select: { id: true, name: true },
    });
    const { leads, activities } = planLeads(leadRng, specs, {
        now,
        orgId,
        pipelineId: NORTHWIND.pipelineId,
        stageIds: stages.map((s) => s.id),
        stageNames: stages.map((s) => s.name),
        actorUserIds: [ctx.demoUserId, ...staffIds],
        notes: LEAD_TIMELINE.nw.notes,
        tasks: LEAD_TIMELINE.nw.tasks,
        wonShare: 0.4,
        lostShare: 0.1,
        leadId: (n) => sid(key, "lead", n),
        activityId: (n, k) => sid(key, "activity", n, k),
    });
    await prisma.lead.createMany({ data: leads });
    await prisma.activity.createMany({ data: activities });

    // Analytics that agree with the orders: busier traffic than the base
    // seed's, and paid orders counted from the Order table itself.
    await prisma.analyticsDailyAggregate.deleteMany({
        where: { organizationId: orgId, id: { startsWith: id("agg", "") } },
    });
    await writeAnalytics(ctx, orgId, {
        paths: ANALYTICS_PATHS,
        trendBase: 190,
        trendSlope: 0.8,
        weekendFactor: 0.45,
        idFor: (iso, k) => id("agg", iso, k),
        noiseOffset: 0,
    });

    console.log(
        `[showcase] Northwind Supply: +${newProducts.length} products, ` +
            `+${customers.length} customers, +${planned.orders.length} orders, ` +
            `+${contactPeople.length} contacts, +${leads.length} leads`,
    );
}

function northwindStatus(
    daysAgo: number,
    r1: number,
    r2: number,
): [OrderStatus, PaymentStatus] {
    if (daysAgo < 1) return ["PENDING", r2 < 0.55 ? "PAID" : "UNPAID"];
    if (daysAgo < 3) return ["PROCESSING", r2 < 0.9 ? "PAID" : "UNPAID"];
    if (daysAgo < 8) return ["SHIPPED", "PAID"];
    if (r1 < 0.025) return ["CANCELLED", "REFUNDED"];
    if (r1 < 0.04) return ["CANCELLED", "UNPAID"];
    if (r1 < 0.05) return ["CANCELLED", "FAILED"];
    // A few older orders still waiting on stock: the unfulfilled work Home
    // should be pointing at.
    if (r1 < 0.065 && daysAgo < 25) return ["PROCESSING", "PAID"];
    return ["DELIVERED", "PAID"];
}

/** A lead value to the nearest ₹500, in paise. */
const roundValue = (paise: number) => Math.round(paise / 50_000) * 50_000;

async function writeCustomers(
    ctx: Context,
    key: string,
    storeId: string,
    orgId: string,
    people: readonly Person[],
    createdAt: readonly Date[],
) {
    const rows: Prisma.CustomerCreateManyInput[] = people.map((p, i) => ({
        id: sid(key, "customer", i),
        storeId,
        organizationId: orgId,
        email: p.email,
        firstName: p.first,
        lastName: p.last,
        phone: p.phone,
        country: "India",
        state: p.city?.state ?? "Karnataka",
        city: p.city?.city ?? "Bengaluru",
        zipCode: p.city?.zip ?? "560011",
        createdAt: createdAt[i],
        updatedAt: createdAt[i],
    }));
    await createInChunks(rows, (data) =>
        ctx.prisma.customer.createMany({ data }),
    );
}

async function writeOrders(
    ctx: Context,
    key: string,
    planned: ReturnType<typeof planOrders>,
) {
    const orders = planned.orders.map((o, n) => ({
        ...o,
        customerId: sid(key, "customer", planned.customerOf[n]),
    }));
    await createInChunks(orders, (data) =>
        ctx.prisma.order.createMany({ data }),
    );
    await createInChunks(planned.items, (data) =>
        ctx.prisma.orderItem.createMany({ data }),
    );
}

async function writeContacts(
    ctx: Context,
    orgId: string,
    rows: readonly {
        id: string;
        person: Person;
        source: string;
        createdAt: Date;
    }[],
) {
    const data: Prisma.ContactCreateManyInput[] = rows.map((r) => ({
        id: r.id,
        organizationId: orgId,
        email: r.person.email,
        firstName: r.person.first,
        lastName: r.person.last,
        phone: r.person.phone,
        company: r.person.company,
        source: r.source,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
    }));
    await createInChunks(data, (chunk) =>
        ctx.prisma.contact.createMany({ data: chunk }),
    );
}

/**
 * Rewrite a business's daily rollups from what its rows say happened: paid
 * orders from the Order table and enquiries from the Submission table, so
 * the Insights totals agree with the lists a viewer clicks through to.
 */
async function writeAnalytics(
    ctx: Context,
    orgId: string,
    shape: {
        paths: readonly { path: string; weight: number }[];
        trendBase: number;
        trendSlope: number;
        weekendFactor: number;
        idFor: (iso: string, key: string) => string;
        noiseOffset: number;
    },
) {
    const since = new Date(
        utcDay(ctx.now).getTime() - ANALYTICS_DAYS * 86_400_000,
    );
    const [paid, entries] = await Promise.all([
        ctx.prisma.order.findMany({
            where: {
                organizationId: orgId,
                paymentStatus: "PAID",
                createdAt: { gte: since },
            },
            select: { createdAt: true },
        }),
        ctx.prisma.submission.findMany({
            where: { organizationId: orgId, createdAt: { gte: since } },
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
        now: ctx.now,
        days: ANALYTICS_DAYS,
        paths: shape.paths,
        idFor: shape.idFor,
        trendBase: shape.trendBase,
        trendSlope: shape.trendSlope,
        weekendFactor: shape.weekendFactor,
        enquiryRate: 0,
        orderRate: 0,
        paidOrders: byDay(paid),
        enquiries: byDay(entries),
        noiseOffset: shape.noiseOffset,
    });
    await createInChunks(rows, (data) =>
        ctx.prisma.analyticsDailyAggregate.createMany({
            data: data.map((r) => ({
                ...r,
                organizationId: orgId,
                siteId: "",
            })),
        }),
    );
}

// --- The four new businesses ------------------------------------------------

async function seedBusiness(
    ctx: Context,
    biz: ShowcaseBusiness,
    roleUsers: { admin: string; member: string },
) {
    const { prisma, now } = ctx;
    const key = biz.key;
    const createdAt = at(now, -biz.site.createdDaysAgo - 14, 10);

    const org = await prisma.organization.upsert({
        where: { slug: biz.slug },
        update: { name: biz.name },
        create: {
            id: sid(key, "org"),
            name: biz.name,
            slug: biz.slug,
            createdAt,
        },
    });
    const orgId = org.id;

    // --- team
    const ownerId = biz.owner
        ? await ensureTeamMember(ctx, biz.owner)
        : ctx.demoUserId;
    if (biz.owner) {
        await upsertMembership(
            ctx,
            orgId,
            ownerId,
            "OWNER",
            sid(key, "membership", "owner"),
        );
    }
    await upsertMembership(
        ctx,
        orgId,
        ctx.demoUserId,
        biz.demoRole,
        sid(key, "membership", "demo"),
    );
    const teamIds = [ownerId];
    for (const person of biz.staff) {
        const userId = await ensureTeamMember(ctx, person);
        teamIds.push(userId);
        await upsertMembership(
            ctx,
            orgId,
            userId,
            person.role,
            sid(key, "membership", person.first.toLowerCase()),
        );
    }
    for (const r of biz.roleAccounts) {
        await upsertMembership(
            ctx,
            orgId,
            roleUsers[r.account],
            r.role,
            sid(key, "membership", r.account),
        );
    }

    await enableModules(ctx, key, orgId, biz.modules, ownerId, createdAt);
    await subscribe(ctx, key, orgId);

    if (biz.paymentProvider) {
        await prisma.merchantPaymentProvider.upsert({
            where: {
                organizationId_provider: {
                    organizationId: orgId,
                    provider: biz.paymentProvider,
                },
            },
            update: { status: "CONNECTED" },
            create: {
                id: sid(key, "payments", biz.paymentProvider.toLowerCase()),
                organizationId: orgId,
                provider: biz.paymentProvider,
                status: "CONNECTED",
                // Placeholders: the seed never fabricates a usable credential.
                encryptedCredentials: "seed-not-a-real-credential",
                credentialsIv: "seed-iv",
                credentialsAuthTag: "seed-tag",
            },
        });
    }

    const pipelineId = biz.pipeline ? sid(key, "pipeline") : null;
    const stageIds = biz.pipeline
        ? await upsertPipeline(prisma, {
              orgId,
              pipelineId: sid(key, "pipeline"),
              stageId: (i) => sid(key, "stage", i),
              name: biz.pipeline.name,
              stages: biz.pipeline.stages,
          })
        : [];

    const services = await upsertServices(prisma, {
        orgId,
        services: biz.services,
        serviceId: (i) => sid(key, "service", i),
        ruleId: (i, k) => sid(key, "rule", i, k),
        createdAt,
    });

    // Generated volume is rewritten whole, so clear it before anything below
    // writes some (the shop's orders come first).
    await clearVolume(ctx, key);

    // --- commerce (Rye)
    if (biz.modules.includes("COMMERCE")) {
        await seedBakeryShop(ctx, key, orgId, ownerId);
    }

    // --- website: before the entries, which belong to its form
    const siteIds = {
        site: sid(key, "site"),
        page: (p: number) => sid(key, "page", p),
        pageVersion: (p: number) => sid(key, "pageversion", p),
        section: (p: number, n: number) => sid(key, "section", p, n),
        sectionKey: (p: number, n: number) => sid(key, "sectionkey", p, n),
        form: (p: number, n: number) => sid(key, "form", p, n),
        publication: sid(key, "publication"),
    };
    const siteId = await writeSite(prisma, {
        fixture: biz.site,
        orgId,
        userId: ownerId,
        now,
        ids: siteIds,
        pipelineId,
        serviceId: (i) => sid(key, "service", i),
        footer: { format: "text", value: biz.footer },
    });
    const form = findEnquiryForm(biz, siteIds.form);

    if (biz.demoRole === "REVIEWER") {
        // Invited to this business's site and nothing else — what REVIEWER means.
        await prisma.siteReviewer.upsert({
            where: { siteId_userId: { siteId, userId: ctx.demoUserId } },
            update: {},
            create: {
                id: sid(key, "sitereviewer"),
                organizationId: orgId,
                siteId,
                userId: ctx.demoUserId,
                grantedByUserId: ownerId,
            },
        });
    }
    if (key === "lumen") await seedPosts(ctx, key, orgId, siteId, ownerId);

    // --- people in the CRM: entries first, then other leads, then everyone else
    const entryCount = form ? biz.submissions.length : 0;
    const manualLeadCount = Math.max(0, leadTarget(biz) - entryCount);
    const peopleRng = rngFor(key, "people");
    const contactCount = Math.max(biz.contacts, entryCount + manualLeadCount);
    const people = makePeople(peopleRng, contactCount, new Set(), {
        companies: biz.companies,
        companyShare: 1,
    });
    const contactIds = people.map((_, i) => sid(key, "contact", i));

    // --- entries and the leads they opened
    const leadRng = rngFor(key, "leads");
    const entryAt = biz.submissions.map((_, i) =>
        istAt(
            now,
            -(
                1 +
                Math.round((i * 44) / Math.max(1, entryCount)) +
                leadRng.int(0, 2)
            ),
            leadRng.int(8 * 60, 22 * 60),
        ),
    );
    const specs: LeadSpec[] = [];
    for (let i = 0; i < entryCount && form; i++) {
        specs.push({
            contactId: contactIds[i],
            title: `${fullName(people[i])} — ${form.name}`,
            value: null,
            formId: form.id,
            createdAt: entryAt[i],
        });
    }
    for (let i = 0; i < manualLeadCount; i++) {
        const c = entryCount + i;
        const template = biz.leads[i % biz.leads.length];
        const person = people[c];
        specs.push({
            contactId: contactIds[c],
            title: `${template.title} — ${person.company ?? person.first}`,
            value: roundValue(template.value * (0.85 + leadRng.next() * 0.4)),
            formId: null,
            createdAt: istAt(
                now,
                -leadRng.int(2, key === "lumen" ? 120 : 70),
                leadRng.int(10 * 60, 19 * 60),
            ),
        });
    }

    // --- the diary
    const leadContactIndexes = Array.from(
        { length: entryCount + manualLeadCount },
        (_, i) => i,
    );
    const planned = services.length
        ? planBookings(rngFor(key, "bookings"), {
              now,
              services: biz.services,
              target: biz.bookings,
              fromDay: -60,
              toDay: 21,
              contacts: people.length,
              prospects: leadContactIndexes,
              prospectServices: biz.services
                  .map((s, i) => (s.priceCents === null ? i : -1))
                  .filter((i) => i >= 0),
              weekdayWeights:
                  key === "mirror"
                      ? [1.4, 0, 1, 1, 1.1, 1.3, 1.7]
                      : [0.6, 1.1, 1, 1.1, 1, 1, 0.9],
          })
        : [];

    // A contact exists from the first thing they did.
    const contactRng = rngFor(key, "contacts");
    const firstSeen = people.map(() =>
        istAt(now, -Math.round(20 + contactRng.next() * 170), 11 * 60),
    );
    specs.forEach((s, i) => {
        firstSeen[i] = earliest(
            firstSeen[i],
            new Date(s.createdAt.getTime() - (s.formId ? 0 : 86_400_000)),
        );
    });
    for (const b of planned) {
        firstSeen[b.contact] = earliest(
            firstSeen[b.contact],
            new Date(b.startAt.getTime() - 3 * 86_400_000),
        );
    }
    const sources = ["WALK_IN", "INSTAGRAM", "REFERRAL", "WEBSITE", "GOOGLE"];
    await writeContacts(
        ctx,
        orgId,
        people.map((p, i) => ({
            id: contactIds[i],
            person: p,
            // Entries came in through the site. The product records such a
            // contact's source as `enquiry:form:<id>`; the showcase writes
            // WEBSITE instead, because the contacts list prints the raw value.
            source: i < entryCount ? "WEBSITE" : contactRng.pick(sources),
            createdAt: earliest(firstSeen[i], now),
        })),
    );

    if (biz.pipeline && pipelineId && specs.length) {
        const timeline = LEAD_TIMELINE[key];
        const { leads, activities } = planLeads(leadRng, specs, {
            now,
            orgId,
            pipelineId,
            stageIds,
            stageNames: biz.pipeline.stages,
            actorUserIds: teamIds.slice(0, 3),
            notes: timeline.notes,
            tasks: timeline.tasks,
            wonShare: key === "lumen" ? 0.5 : 0.35,
            lostShare: key === "lumen" ? 0.18 : 0.1,
            leadId: (n) => sid(key, "lead", n),
            activityId: (n, k) => sid(key, "activity", n, k),
        });
        await prisma.lead.createMany({ data: leads });
        await prisma.activity.createMany({ data: activities });
    }

    // Form entries, each tied to its contact and the lead it opened — the
    // shape a live submission leaves (enquiry.service).
    if (form) {
        const entries: Prisma.SubmissionCreateManyInput[] = biz.submissions.map(
            (entry, i) => {
                const person = people[i];
                const values: Record<string, string> = {
                    name: fullName(person),
                    email: person.email,
                    phone: entry.phone ?? person.phone,
                    ...(person.company ? { company: person.company } : {}),
                    ...(entry.extra ?? {}),
                    message: entry.message,
                };
                const data = Object.fromEntries(
                    Object.entries(values).filter(([field]) =>
                        form.fields.includes(field),
                    ),
                );
                return {
                    id: sid(key, "submission", i),
                    organizationId: orgId,
                    formId: form.id,
                    contactId: contactIds[i],
                    leadId: biz.pipeline ? sid(key, "lead", i) : null,
                    data,
                    createdAt: entryAt[i],
                };
            },
        );
        await prisma.submission.createMany({ data: entries });
    }

    if (planned.length) {
        const rows = bookingRows(planned, {
            now,
            orgId,
            services,
            contacts: people.map((p, i) => ({
                id: contactIds[i],
                name: fullName(p),
                email: p.email,
                phone: p.phone,
            })),
            staffUserIds: teamIds,
            bookingId: (n) => sid(key, "booking", n),
            eventId: (n, kind) => sid(key, "bookingevent", n, kind),
        });
        await createInChunks(rows.bookings, (data) =>
            prisma.booking.createMany({ data }),
        );
        await createInChunks(rows.events, (data) =>
            prisma.bookingEvent.createMany({ data }),
        );
    }

    await prisma.analyticsDailyAggregate.deleteMany({
        where: {
            organizationId: orgId,
            id: { startsWith: sid(key, "agg", "") },
        },
    });
    await writeAnalytics(ctx, orgId, {
        paths: biz.analytics.paths,
        trendBase: biz.analytics.trendBase,
        trendSlope: 0.25,
        weekendFactor: biz.analytics.weekendFactor,
        idFor: (iso, k) => sid(key, "agg", iso, k),
        noiseOffset: hashKey(key) % 1000,
    });

    console.log(
        `[showcase] ${biz.name}: ${people.length} contacts, ${specs.length} leads, ` +
            `${planned.length} bookings, ${entryCount} form entries`,
    );
}

/** How many leads a business carries, entries included. */
function leadTarget(biz: ShowcaseBusiness): number {
    switch (biz.key) {
        case "pulse":
            return 25;
        case "mirror":
            return 14;
        case "lumen":
            return 30;
        default:
            return biz.submissions.length;
    }
}

/** The site's enquiry form: its id and the field names it accepts. */
function findEnquiryForm(
    biz: ShowcaseBusiness,
    formId: (p: number, n: number) => string,
): { id: string; name: string; fields: string[] } | null {
    for (let p = 0; p < biz.site.pages.length; p++) {
        const sections = biz.site.pages[p].sections;
        for (let n = 0; n < sections.length; n++) {
            const section = sections[n];
            if (section.type === "enquiry") {
                return {
                    id: formId(p, n),
                    name: section.form.name,
                    fields: section.form.fields.map((f) => f.name),
                };
            }
        }
    }
    return null;
}

// --- Rye & Co.'s shop -----------------------------------------------------

async function seedBakeryShop(
    ctx: Context,
    key: string,
    orgId: string,
    ownerId: string,
) {
    const { prisma, now } = ctx;
    const store = await prisma.store.upsert({
        where: { slug: "rye-and-co" },
        update: { name: "Rye & Co. Bakery", organizationId: orgId },
        create: {
            id: sid(key, "store"),
            organizationId: orgId,
            name: "Rye & Co. Bakery",
            slug: "rye-and-co",
            description: "Sourdough, pastries and cakes from Jayanagar.",
        },
    });
    await prisma.storeOwner.upsert({
        where: { storeId_userId: { storeId: store.id, userId: ownerId } },
        update: { role: "OWNER" },
        create: {
            id: sid(key, "storeowner"),
            storeId: store.id,
            userId: ownerId,
            role: "OWNER",
        },
    });
    await prisma.storeSettings.upsert({
        where: { storeId: store.id },
        update: { currency: "INR" },
        create: {
            id: sid(key, "storesettings"),
            storeId: store.id,
            currency: "INR",
        },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId: store.id },
        update: { ecommerceEnabled: true },
        create: {
            id: sid(key, "storefeatures"),
            storeId: store.id,
            ecommerceEnabled: true,
        },
    });

    const categoryIds: Record<string, string> = {};
    for (const c of RYE.categories) {
        const category = await prisma.category.upsert({
            where: { storeId_slug: { storeId: store.id, slug: c.slug } },
            update: { name: c.name, organizationId: orgId },
            create: {
                id: sid(key, "category", c.slug),
                storeId: store.id,
                organizationId: orgId,
                name: c.name,
                slug: c.slug,
            },
        });
        categoryIds[c.slug] = category.id;
    }

    const products = await upsertCatalog(prisma, {
        storeId: store.id,
        orgId,
        currency: "INR",
        categoryId: (slug) => categoryIds[slug],
        products: RYE_PRODUCTS,
        productId: (i) => sid(key, "product", i),
        variantId: (i, v) => sid(key, "variant", i, v),
        inventoryId: (i) => sid(key, "inventory", i),
        createdAt: (i) => at(now, -(95 - i), 9),
    });

    const customers = makePeople(
        rngFor(key, "customers"),
        RYE.customers,
        new Set(),
    );
    const planned = planOrders(rngFor(key, "orders"), {
        now,
        count: RYE.orders,
        days: RYE.orderDays,
        products,
        customers: customers.length,
        lineWeights: [50, 32, 18],
        weekdayWeights: [1.5, 0.8, 0.8, 0.9, 0.9, 1.1, 1.6],
        growth: 0.35,
        openMinute: 7 * 60,
        closeMinute: 20 * 60,
        taxRate: RYE.taxRate,
        // Walk-ins and pickups pay nothing; delivery is free above ₹800.
        shipping: (subtotal, rng) =>
            rng.chance(0.55) || subtotal >= RYE.freeDeliveryFromPaise
                ? 0
                : RYE.deliveryPaise,
        discount: (subtotal, rng) =>
            subtotal > 50_000 && rng.chance(0.05) ? 5_000 : 0,
        status: (daysAgo, r1, r2): [OrderStatus, PaymentStatus] => {
            if (daysAgo < 0.25)
                return [r2 < 0.5 ? "PENDING" : "PROCESSING", "PAID"];
            if (r1 < 0.03) return ["CANCELLED", "REFUNDED"];
            if (r1 < 0.05) return ["CANCELLED", "UNPAID"];
            return ["DELIVERED", "PAID"];
        },
        orderNumber: (n) => `ORD-${String(n + 1).padStart(3, "0")}`,
        orderId: (n) => sid(key, "order", n),
        itemId: (n, line) => sid(key, "orderitem", n, line),
        storeId: store.id,
        orgId,
        currency: "INR",
    });
    const customerRng = rngFor(key, "customer-dates");
    const createdAt = customers.map((_, i) => {
        const r = customerRng.next();
        const first = planned.firstOrderAt.get(i);
        return first
            ? new Date(first.getTime() - 600_000)
            : istAt(now, -Math.round(2 + r * 58), 9 * 60);
    });
    await writeCustomers(ctx, key, store.id, orgId, customers, createdAt);
    await writeOrders(ctx, key, planned);
    console.log(
        `[showcase] Rye & Co. Bakery: ${products.length} products, ${customers.length} customers, ${planned.orders.length} orders`,
    );
}

// --- Lumen's posts ----------------------------------------------------------

async function seedPosts(
    ctx: Context,
    key: string,
    orgId: string,
    siteId: string,
    authorId: string,
) {
    const { prisma, now } = ctx;
    const category = await prisma.postCategory.upsert({
        where: { siteId_slug: { siteId, slug: "notes" } },
        update: { name: "Studio notes" },
        create: {
            id: sid(key, "postcategory"),
            siteId,
            name: "Studio notes",
            slug: "notes",
        },
    });
    for (let i = 0; i < LUMEN_POSTS.length; i++) {
        const p = LUMEN_POSTS[i];
        const publishedAt = at(now, -p.daysAgo, 10);
        const post = await prisma.post.upsert({
            where: { siteId_slug: { siteId, slug: p.slug } },
            update: { title: p.title, excerpt: p.excerpt, status: "PUBLISHED" },
            create: {
                id: sid(key, "post", i),
                siteId,
                authorId,
                categoryId: category.id,
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                content: p.content,
                status: "PUBLISHED",
                publishedAt,
                createdAt: at(now, -p.daysAgo - 3, 15),
            },
        });
        await publishSeedPost(prisma, {
            post,
            orgId,
            siteId,
            publicationId: sid(key, "postpub", i),
        });
    }
}

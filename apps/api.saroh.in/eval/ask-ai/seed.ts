/**
 * Seeds the quality test's five made-up businesses (`plan.ts`) into a fresh
 * eval database, laid out around today. Prisma directly: seeding is not the
 * API's job. Refuses unless the database is on this machine and named
 * `…-eval`, and refuses a database that already has them (drop it and make
 * it again: README). Writes no jobs and sends nothing.
 *
 * Every person signs in nowhere: the runner acts as them in-process, so no
 * password or credential is written.
 */
import type { Prisma } from "@saroh/database";
import {
    alignOrderNumberSequence,
    ensureStorefrontTeamRole,
    prisma,
    STOREFRONT_TEAM_ROLE_KEY,
} from "@saroh/database";

import { assertEvalDatabase } from "./local";
import type { BizKey, BusinessPlan, Person, TeamRole } from "./plan";
import { anchorFor, buildPlan, dayAt, idOf, ZONE } from "./plan";

/** The salon's organization was made exactly this long before the run date: the runner reads the date back from it. */
export const MARKER_DAYS = 365;

const MODULES = [
    "CRM",
    "APPOINTMENTS",
    "PAYMENTS",
    "INSIGHTS",
    "COMMERCE",
] as const;
// ORG_AUTHORIZATION as in production: without it a store takes the older per-store checks, and a draft order fails "Location not found".
const FLAGS = [
    ...MODULES.map((m) => `MODULE_${m}`),
    "ASK_AI",
    "ORG_AUTHORIZATION",
];

const ROLE_KEY: Record<TeamRole, string> = {
    owner: "OWNER",
    member: "MEMBER",
    storefront: STOREFRONT_TEAM_ROLE_KEY,
};

const CHUNK = 1000;
async function inChunks<T>(rows: T[], write: (rows: T[]) => Promise<unknown>) {
    for (let i = 0; i < rows.length; i += CHUNK)
        await write(rows.slice(i, i + CHUNK));
}

export const orgIdOf = (biz: BizKey) => idOf(biz, "org", "main");
export const userIdOf = (biz: BizKey, role: TeamRole) =>
    idOf(biz, "user", role);

/** TEST-ONLY questions a month for the eval businesses: not a real plan limit. */
export const EVAL_QUESTIONS = 100000;

/**
 * The base seed's catalogue has no `ask-ai` row, so Ask AI reads locked
 * (it fails closed). Give every plan on the businesses' version the row,
 * with {@link EVAL_QUESTIONS}: only ever in an `-eval` database.
 */
async function addAskAiRow(version: number): Promise<void> {
    const row = await prisma.pricingCatalogVersion.findUnique({
        where: { version },
        select: { catalog: true },
    });
    if (!row) throw new Error(`[eval seed] no catalogue version ${version}`);
    const catalog = row.catalog as {
        plans: { id: string }[];
        modules: Record<string, unknown>[];
    };
    if (catalog.modules.some((m) => m.id === "ask-ai")) return;
    catalog.modules.push({
        id: "ask-ai",
        name: "Ask AI",
        group: catalog.modules[0]?.group ?? "site",
        pricing: "hidden",
        what: "Questions about the business, answered (eval only).",
        cells: Object.fromEntries(
            catalog.plans.map((p) => [
                p.id,
                {
                    inc: true,
                    text: "Eval",
                    card: "",
                    limit: EVAL_QUESTIONS,
                    per: "month",
                    soft: false,
                },
            ]),
        ),
    });
    await prisma.pricingCatalogVersion.update({
        where: { version },
        data: { catalog: catalog as Prisma.InputJsonObject },
    });
}

export async function main(): Promise<number> {
    const target = assertEvalDatabase();
    console.info(`[eval seed] database: ${target.database} on ${target.host}`);
    const existing = await prisma.organization.count({
        where: { slug: { startsWith: "eval-" } },
    });
    if (existing > 0) {
        console.error(
            "[eval seed] this database already has the test businesses: drop it and make it again (README).",
        );
        return 2;
    }
    const anchor = anchorFor(new Date());
    const plan = buildPlan(anchor);
    // The plan the base seed's business is on, so entitlements match a real one.
    const base = await prisma.subscription.findFirst({
        where: { organization: { slug: "demo-org" } },
        select: { planId: true, plan: { select: { version: true } } },
    });
    if (!base)
        console.info(
            "[eval seed] no base seed (demo-org): the businesses get no plan",
        );
    else await addAskAiRow(base.plan.version);
    for (const key of FLAGS) {
        await prisma.featureFlag.upsert({
            where: { key },
            update: {},
            create: { id: `flag_${key}`, key, enabledByDefault: false },
        });
    }
    for (const biz of plan) {
        await seedBusiness(biz, anchor, base?.planId ?? null);
        console.info(
            `[eval seed] ${biz.name}: ${biz.customers.length} customers, ${biz.bookings.length} bookings, ${biz.orders.length} orders, ${biz.invoices.length} bills, ${biz.enquiries.length} enquiries`,
        );
    }
    console.info(
        `[eval seed] run date ${anchor.toISOString()} (midnight ${ZONE}): run the test today, after 11:00 ${ZONE}.`,
    );
    return 0;
}

async function seedBusiness(
    biz: BusinessPlan,
    anchor: Date,
    planId: string | null,
) {
    const k = biz.key;
    const orgId = orgIdOf(k);
    const id = (kind: string, key: string | number) => idOf(k, kind, key);
    const since = dayAt(anchor, -130, 10 * 60);
    await prisma.organization.create({
        data: {
            id: orgId,
            name: biz.name,
            slug: biz.slug,
            trade: biz.trade,
            tradeOther: biz.tradeOther,
            createdAt: dayAt(anchor, -MARKER_DAYS),
        },
    });
    await prisma.businessProfile.create({
        data: {
            id: id("profile", "main"),
            organizationId: orgId,
            timezone: ZONE,
            country: "India",
            city: biz.city,
        },
    });
    const storeId = id("store", "main");
    await prisma.store.create({
        data: {
            id: storeId,
            name: `${biz.name} counter`,
            organizationId: orgId,
        },
    });
    await prisma.storeSettings.create({
        data: {
            id: id("storesettings", "main"),
            storeId,
            currency: "INR",
            timezone: ZONE,
            kind: "SHOP",
        },
    });

    // --- people
    const memberships = new Map<TeamRole, string>();
    for (const p of biz.team) {
        const userId = userIdOf(k, p.role);
        await prisma.user.create({
            data: {
                id: userId,
                email: p.email,
                name: `${p.first} ${p.last}`,
                emailVerified: true,
            },
        });
        if (p.role === "storefront") {
            await prisma.$transaction((tx) =>
                ensureStorefrontTeamRole(tx, orgId),
            );
            await prisma.storeMembers.create({
                data: {
                    id: id("storemember", p.role),
                    storeId,
                    userId,
                    role: "VIEWER",
                },
            });
        }
        const membershipId = id("membership", p.role);
        await prisma.membership.create({
            data: {
                id: membershipId,
                organizationId: orgId,
                userId,
                role: ROLE_KEY[p.role],
                // Ask AI is Owner and Admin by default; the test asks as the others too.
                extraActions: p.role === "owner" ? [] : ["ai:use"],
            },
        });
        memberships.set(p.role, membershipId);
    }
    for (const moduleKey of MODULES) {
        await prisma.organizationModule.create({
            data: {
                id: id("module", moduleKey.toLowerCase()),
                organizationId: orgId,
                moduleKey,
                status: "ENABLED",
                enabledAt: since,
                enabledByUserId: userIdOf(k, "owner"),
            },
        });
    }
    await prisma.featureFlagOverride.createMany({
        data: FLAGS.map((flagKey) => ({
            id: id("flag", flagKey.toLowerCase()),
            flagKey,
            organizationId: orgId,
            enabled: true,
        })),
    });
    if (planId) {
        await prisma.subscription.create({
            data: {
                id: id("subscription", "main"),
                organizationId: orgId,
                planId,
                status: "ACTIVE",
                currentPeriodEnd: dayAt(anchor, 20),
            },
        });
    }

    // --- the diary's structure
    for (const s of biz.staff) {
        await prisma.staffMember.create({
            data: {
                id: id("staff", s.key),
                organizationId: orgId,
                name: s.name,
                title: s.title,
                membershipId: s.isOwner
                    ? (memberships.get("owner") ?? null)
                    : null,
            },
        });
    }
    for (const s of biz.services) {
        await prisma.service.create({
            data: {
                id: id("service", s.key),
                organizationId: orgId,
                name: s.name,
                durationMinutes: s.minutes,
                capacity: s.capacity,
                priceCents: s.price === null ? null : s.price * 100,
                currency: s.price === null ? null : "INR",
                timezone: ZONE,
                createdAt: since,
            },
        });
        await prisma.availabilityRule.createMany({
            data: s.days.map((dayOfWeek) => ({
                id: id("rule", `${s.key}_${dayOfWeek}`),
                organizationId: orgId,
                serviceId: id("service", s.key),
                dayOfWeek,
                startMinute: s.opens,
                endMinute: s.closes,
            })),
        });
        await prisma.staffService.createMany({
            data: s.staff.map((staff) => ({
                id: id("staffservice", `${staff}_${s.key}`),
                organizationId: orgId,
                staffId: id("staff", staff),
                serviceId: id("service", s.key),
            })),
        });
    }

    // --- customers: a contact each, and a shop customer where it sells
    const people: Person[] = [
        ...biz.customers,
        ...biz.enquiries.map((e) => e.person),
    ];
    await prisma.contact.createMany({
        data: people.map((p) => ({
            id: id("customer", p.key),
            organizationId: orgId,
            email: p.email,
            firstName: p.first,
            lastName: p.last,
            phone: p.phone,
            source: "WALK_IN",
            createdAt: since,
            updatedAt: since,
        })),
    });
    if (biz.orders.length) {
        await prisma.customer.createMany({
            data: biz.customers.map((p) => ({
                id: id("shopcustomer", p.key),
                storeId,
                organizationId: orgId,
                email: p.email,
                firstName: p.first,
                lastName: p.last,
                phone: p.phone,
                country: "India",
                city: biz.city,
                createdAt: since,
                updatedAt: since,
            })),
        });
        await prisma.customerIdentityLink.createMany({
            data: biz.customers.map((p) => ({
                id: id("link", p.key),
                organizationId: orgId,
                contactId: id("customer", p.key),
                customerId: id("shopcustomer", p.key),
            })),
        });
    }

    // --- products and stock
    for (const p of biz.products) {
        await prisma.product.create({
            data: {
                id: id("product", p.key),
                organizationId: orgId,
                storeId,
                name: p.name,
                slug: p.key.replace(/_/g, "-"),
                price: p.price,
                currency: "INR",
                status: "PUBLISHED",
                stockTracked: true,
                stockTrackedAt: since,
                createdAt: since,
            },
        });
        // Listed where it is stocked, as the app's create does (ADR-010):
        // an unlisted shelf sells nothing, so Home never calls it low.
        await prisma.productListing.create({
            data: {
                id: id("listing", p.key),
                organizationId: orgId,
                storeId,
                productId: id("product", p.key),
            },
        });
        await prisma.stockLevel.create({
            data: {
                id: id("stock", p.key),
                organizationId: orgId,
                storeId,
                productId: id("product", p.key),
                onHand: p.onHand,
                promised: 0,
                lowStockAlert: p.lowAlert,
            },
        });
    }

    // --- bookings
    const byKey = new Map(biz.customers.map((p) => [p.key, p]));
    const services = new Map(biz.services.map((s) => [s.key, s]));
    const bookings: Prisma.BookingCreateManyInput[] = biz.bookings.map((b) => {
        const who = byKey.get(b.customer);
        const s = services.get(b.service);
        if (!who || !s) throw new Error(`${k}: booking ${b.key} names nobody`);
        const booker = {
            name: `${who.first} ${who.last}`,
            email: who.email,
            phone: who.phone,
        };
        const made = new Date(
            Math.min(b.start.getTime() - 3 * 86_400_000, Date.now()),
        );
        return {
            id: id("booking", b.key),
            organizationId: orgId,
            serviceId: id("service", b.service),
            contactId: id("customer", b.customer),
            staffId: b.staff ? id("staff", b.staff) : null,
            startAt: b.start,
            endAt: b.end,
            timezone: ZONE,
            status: b.status,
            outcome: b.outcome,
            cancelledAt: b.status === "CANCELLED" ? made : null,
            locationType: "IN_PERSON",
            bookerName: booker.name,
            bookerEmail: booker.email,
            bookerPhone: booker.phone,
            snapshot: {
                service: {
                    id: id("service", b.service),
                    name: s.name,
                    durationMinutes: s.minutes,
                    bufferBeforeMinutes: 0,
                    bufferAfterMinutes: 0,
                    capacity: s.capacity,
                    timezone: ZONE,
                    priceCents: s.price === null ? null : s.price * 100,
                    currency: s.price === null ? null : "INR",
                    locationType: "IN_PERSON",
                },
                slot: {
                    startAt: b.start.toISOString(),
                    endAt: b.end.toISOString(),
                },
                booker,
            },
            createdAt: made,
            updatedAt: made,
        };
    });
    await inChunks(bookings, (data) => prisma.booking.createMany({ data }));

    // --- orders
    const price = new Map(biz.products.map((p) => [p.key, p.price]));
    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    for (const o of biz.orders) {
        const total = o.items.reduce(
            (n, i) => n + (price.get(i.product) ?? 0) * i.qty,
            0,
        );
        orders.push({
            id: id("order", o.key),
            storeId,
            organizationId: orgId,
            orderId: o.number,
            customerId: o.customer ? id("shopcustomer", o.customer) : null,
            walkInName: o.walkIn,
            subtotal: total,
            total,
            currency: "INR",
            status: o.stage === "COLLECTED" ? "DELIVERED" : "PROCESSING",
            paymentStatus: o.paid ? "PAID" : "UNPAID",
            paidAt: o.paid ? o.at : null,
            payOnHandover: !o.paid,
            stage: o.stage,
            fulfilment: "PICKUP",
            placedOnline: false,
            createdAt: o.at,
            updatedAt: o.at,
        });
        o.items.forEach((i, n) =>
            items.push({
                id: id("orderitem", `${o.key}_${n}`),
                orderId: id("order", o.key),
                productId: id("product", i.product),
                quantity: i.qty,
                price: price.get(i.product) ?? 0,
            }),
        );
    }
    await inChunks(orders, (data) => prisma.order.createMany({ data }));
    await inChunks(items, (data) => prisma.orderItem.createMany({ data }));
    if (orders.length) await alignOrderNumberSequence(prisma, orgId);

    // --- bills, their lines and payments
    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    const payments: Prisma.InvoicePaymentCreateManyInput[] = [];
    for (const inv of biz.invoices) {
        const who = byKey.get(inv.customer);
        if (!who) throw new Error(`${k}: bill ${inv.key} names nobody`);
        const invoiceId = id("invoice", inv.key);
        invoices.push({
            id: invoiceId,
            organizationId: orgId,
            number: inv.number,
            status: inv.paidAt ? "PAID" : "ISSUED",
            kind: "INVOICE",
            contactId: id("customer", inv.customer),
            billToName: `${who.first} ${who.last}`,
            billToEmail: who.email,
            sellerName: biz.name,
            currency: "INR",
            subtotal: inv.amount,
            total: inv.amount,
            issuedAt: inv.issuedAt,
            dueAt: inv.dueAt,
            paidAt: inv.paidAt,
            paidCents: inv.paidAt ? inv.amount * 100 : 0,
            paymentMethod: inv.paidAt ? "UPI" : null,
            source: "MANUAL",
            createdAt: inv.issuedAt,
            updatedAt: inv.paidAt ?? inv.issuedAt,
        });
        lines.push({
            id: id("invoiceline", inv.key),
            organizationId: orgId,
            invoiceId,
            position: 0,
            description: inv.description,
            quantity: 1,
            unitPrice: inv.amount,
            amount: inv.amount,
        });
        if (inv.paidAt) {
            payments.push({
                id: id("payment", inv.key),
                organizationId: orgId,
                invoiceId,
                amountCents: inv.amount * 100,
                currency: "INR",
                method: "UPI",
                receivedAt: inv.paidAt,
                createdAt: inv.paidAt,
            });
        }
    }
    await inChunks(invoices, (data) => prisma.invoice.createMany({ data }));
    await inChunks(lines, (data) => prisma.invoiceLine.createMany({ data }));
    await inChunks(payments, (data) =>
        prisma.invoicePayment.createMany({ data }),
    );
    if (invoices.length) {
        await prisma.invoiceSequence.create({
            data: {
                organizationId: orgId,
                series: "INV",
                lastNumber: invoices.length,
            },
        });
    }

    // --- enquiries: a website form's entries, each with the enquiry it opened
    if (biz.enquiries.length) {
        const pipelineId = id("pipeline", "main");
        const stageId = id("stage", "new");
        const formId = id("form", "enquiry");
        await prisma.pipeline.create({
            data: {
                id: pipelineId,
                organizationId: orgId,
                name: "Enquiries",
                isDefault: true,
            },
        });
        await prisma.stage.create({
            data: {
                id: stageId,
                organizationId: orgId,
                pipelineId,
                name: "New",
                order: 0,
            },
        });
        await prisma.form.create({
            data: {
                id: formId,
                organizationId: orgId,
                name: "Enquiry",
                pipelineId,
                fields: [
                    { name: "name", label: "Name" },
                    { name: "email", label: "Email" },
                    { name: "message", label: "Message" },
                ],
            },
        });
        for (const e of biz.enquiries) {
            const leadId = id("enquiry", e.key);
            const contactId = id("customer", e.person.key);
            await prisma.lead.create({
                data: {
                    id: leadId,
                    organizationId: orgId,
                    contactId,
                    pipelineId,
                    stageId,
                    formId,
                    title: e.title,
                    createdAt: e.at,
                    updatedAt: e.at,
                },
            });
            await prisma.submission.create({
                data: {
                    id: id("submission", e.key),
                    organizationId: orgId,
                    formId,
                    contactId,
                    leadId,
                    data: {
                        name: `${e.person.first} ${e.person.last}`,
                        email: e.person.email,
                        message: e.message,
                    },
                    createdAt: e.at,
                },
            });
        }
    }
}

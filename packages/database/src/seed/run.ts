import { hashPassword as hashPasswordUntyped } from "better-auth/crypto";

import { assertDatabaseTarget } from "../database-target";
import {
    BOOKINGS,
    CATEGORIES,
    CONTACTS,
    CURRENCY,
    LEADS,
    MODULE_STATES,
    ORDERS,
    ORG_NAME,
    ORG_SLUG,
    OWNER_EMAIL,
    OWNER_PASSWORD,
    PIPELINE_STAGES,
    POSTS,
    PRODUCTS,
    SEED_PREFIX,
    SERVICES,
    STORE_SLUG,
} from "./data";

/**
 * Build a believable Northwind Supply, or remove it.
 *
 * Every row this writes carries an id beginning with `SEED_PREFIX`, which buys
 * two things at once: `upsert` on that id makes re-running idempotent without
 * needing a natural unique key on every table, and teardown can delete exactly
 * what the seed created and nothing a developer added by hand.
 *
 * Dates are relative to the moment it runs, so bookings stay genuinely past and
 * upcoming however long the fixture sits in the database.
 */

/**
 * better-auth's declarations do not give this a resolvable signature from this
 * package, so the contract we depend on is stated once here rather than letting
 * an unknown type spread through every call site.
 */
const hashPassword = hashPasswordUntyped as (
    password: string,
) => Promise<string>;

const id = (...parts: (string | number)[]) =>
    `${SEED_PREFIX}${parts.join("_")}`;

const DAY_MS = 86_400_000;
const at = (now: Date, dayOffset: number, hour = 9) => {
    const d = new Date(now.getTime() + dayOffset * DAY_MS);
    d.setHours(hour, 0, 0, 0);
    return d;
};

const emailFor = (first: string, last: string) =>
    `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com";

type Db = typeof import("../client").prisma;

export async function seed(): Promise<void> {
    const target = assertDatabaseTarget();
    console.log(`[seed] target: ${target.database} on ${target.host}`);

    // Imported after the guard so nothing connects to a database we refuse.
    const { prisma } = await import("../client");
    const now = new Date();

    // --- identity -------------------------------------------------------
    // A credential, not just a User row. The previous seed created a user with
    // no Account, so the "demo" login did not exist and every reviewer had to
    // sign up by hand before they could look at anything.
    const user = await prisma.user.upsert({
        where: { email: OWNER_EMAIL },
        update: { name: "Demo Owner", emailVerified: true },
        create: {
            id: id("user", "owner"),
            email: OWNER_EMAIL,
            name: "Demo Owner",
            emailVerified: true,
        },
    });

    // better-auth's own hasher, so the credential is byte-identical to one
    // created through sign-up. Reimplementing the KDF here would be a second
    // source of truth that silently rots when better-auth changes it.
    await prisma.account.upsert({
        where: { id: id("account", "owner") },
        update: { password: await hashPassword(OWNER_PASSWORD) },
        create: {
            id: id("account", "owner"),
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: await hashPassword(OWNER_PASSWORD),
        },
    });

    // --- tenant ---------------------------------------------------------
    const org = await prisma.organization.upsert({
        where: { slug: ORG_SLUG },
        update: { name: ORG_NAME },
        create: { id: id("org"), name: ORG_NAME, slug: ORG_SLUG },
    });

    await prisma.membership.upsert({
        where: {
            organizationId_userId: { organizationId: org.id, userId: user.id },
        },
        update: { role: "OWNER" },
        create: {
            id: id("membership", "owner"),
            organizationId: org.id,
            userId: user.id,
            role: "OWNER",
        },
    });

    for (const m of MODULE_STATES) {
        await prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: {
                    organizationId: org.id,
                    moduleKey: m.key,
                },
            },
            update: { status: m.status },
            create: {
                id: id("module", m.key.toLowerCase()),
                organizationId: org.id,
                moduleKey: m.key,
                status: m.status,
                enabledAt: m.status === "ENABLED" ? now : null,
                enabledByUserId: m.status === "ENABLED" ? user.id : null,
            },
        });
    }

    // A connected-but-disabled provider: a merchant who set Razorpay up and
    // then turned it off. This state makes two subsystems disagree today —
    // `/provider-health` correctly reports DEGRADED ("re-enable it to take
    // payments") while `/modules` reports PAYMENTS as ACTIVE, because the
    // readiness adapter counts provider rows without reading their status.
    // Seeding it is deliberate: the contradiction is only visible with data.
    await prisma.merchantPaymentProvider.upsert({
        where: {
            organizationId_provider: {
                organizationId: org.id,
                provider: "RAZORPAY",
            },
        },
        update: { status: "DISABLED" },
        create: {
            id: id("payments", "razorpay"),
            organizationId: org.id,
            provider: "RAZORPAY",
            status: "DISABLED",
            // Placeholders: nothing here is a real credential, and the seed
            // must never fabricate one that looks usable.
            encryptedCredentials: "seed-not-a-real-credential",
            credentialsIv: "seed-iv",
            credentialsAuthTag: "seed-tag",
        },
    });

    await seedCrm(prisma, org.id, user.id, now);
    await seedAppointments(prisma, org.id, now);
    const storeId = await seedCommerce(prisma, org.id, user.id, now);
    await seedContent(prisma, org.id, storeId);

    await report(prisma, org.id);
}

// --- CRM ----------------------------------------------------------------

async function seedCrm(prisma: Db, orgId: string, userId: string, now: Date) {
    const contacts: string[] = [];
    for (let i = 0; i < CONTACTS.length; i++) {
        const c = CONTACTS[i];
        const contact = await prisma.contact.upsert({
            where: {
                organizationId_email: {
                    organizationId: orgId,
                    email: emailFor(c.first, c.last),
                },
            },
            update: { firstName: c.first, lastName: c.last },
            create: {
                id: id("contact", i),
                organizationId: orgId,
                email: emailFor(c.first, c.last),
                firstName: c.first,
                lastName: c.last,
                company: c.company ?? null,
                source: c.source,
            },
        });
        contacts.push(contact.id);
    }

    const pipeline = await prisma.pipeline.upsert({
        where: { id: id("pipeline") },
        update: { name: "Sales" },
        create: {
            id: id("pipeline"),
            organizationId: orgId,
            name: "Sales",
            isDefault: true,
        },
    });

    const stages: string[] = [];
    for (let i = 0; i < PIPELINE_STAGES.length; i++) {
        const name = PIPELINE_STAGES[i];
        const stage = await prisma.stage.upsert({
            where: { id: id("stage", i) },
            update: { name, order: i },
            create: {
                id: id("stage", i),
                organizationId: orgId,
                pipelineId: pipeline.id,
                name,
                order: i,
            },
        });
        stages.push(stage.id);
    }

    for (let i = 0; i < LEADS.length; i++) {
        const l = LEADS[i];
        const contactId = contacts.at(l.contact);
        const stageId = stages.at(l.stage);
        if (!contactId || !stageId) continue;

        await prisma.lead.upsert({
            where: { id: id("lead", i) },
            update: { title: l.title, stageId, status: l.status ?? "OPEN" },
            create: {
                id: id("lead", i),
                organizationId: orgId,
                contactId,
                pipelineId: pipeline.id,
                stageId,
                title: l.title,
                value: l.value,
                status: l.status ?? "OPEN",
            },
        });

        // An overdue task is a row with dueAt in the past and completedAt null.
        // Home counts these; without them its OVERDUE ranking is unreachable.
        const dueAt =
            l.overdueDays !== undefined
                ? at(now, -l.overdueDays, 10)
                : l.dueInDays !== undefined
                  ? at(now, l.dueInDays, 10)
                  : null;

        if (dueAt) {
            await prisma.activity.upsert({
                where: { id: id("activity", i) },
                update: { dueAt, completedAt: null },
                create: {
                    id: id("activity", i),
                    organizationId: orgId,
                    leadId: id("lead", i),
                    type: "TASK",
                    body: `Follow up: ${l.title}`,
                    actorUserId: userId,
                    dueAt,
                },
            });
        }
    }
}

// --- Appointments -------------------------------------------------------

async function seedAppointments(prisma: Db, orgId: string, now: Date) {
    const services: string[] = [];
    for (let i = 0; i < SERVICES.length; i++) {
        const s = SERVICES[i];
        const service = await prisma.service.upsert({
            where: { id: id("service", i) },
            update: { name: s.name, status: "ACTIVE" },
            create: {
                id: id("service", i),
                organizationId: orgId,
                name: s.name,
                description: s.description,
                durationMinutes: s.minutes,
                priceCents: s.priceCents,
                currency: s.priceCents === null ? null : CURRENCY,
                timezone: "Asia/Kolkata",
                status: "ACTIVE",
            },
        });
        services.push(service.id);
    }

    for (let i = 0; i < BOOKINGS.length; i++) {
        const b = BOOKINGS[i];
        const serviceId = services.at(b.service);
        if (!serviceId) continue;
        const startAt = at(now, b.dayOffset, b.hour);
        const service = SERVICES.at(b.service);
        const endAt = new Date(
            startAt.getTime() + (service?.minutes ?? 30) * 60_000,
        );

        await prisma.booking.upsert({
            where: { id: id("booking", i) },
            update: { startAt, endAt, status: b.status },
            create: {
                id: id("booking", i),
                organizationId: orgId,
                serviceId,
                contactId: id("contact", b.contact),
                startAt,
                endAt,
                timezone: "Asia/Kolkata",
                status: b.status,
                // The schema keeps an immutable record of the terms as booked,
                // so later edits to the Service never rewrite history.
                snapshot: {
                    serviceName: service?.name ?? "Service",
                    durationMinutes: service?.minutes ?? 30,
                    priceCents: service?.priceCents ?? null,
                    currency: service?.priceCents == null ? null : CURRENCY,
                },
            },
        });
    }
}

// --- Commerce -----------------------------------------------------------

async function seedCommerce(
    prisma: Db,
    orgId: string,
    userId: string,
    now: Date,
): Promise<string> {
    const store = await prisma.store.upsert({
        where: { slug: STORE_SLUG },
        update: { name: `${ORG_NAME} Store`, organizationId: orgId },
        create: {
            id: id("store"),
            organizationId: orgId,
            name: `${ORG_NAME} Store`,
            slug: STORE_SLUG,
            description: "Packaging, storage and safety supplies.",
        },
    });

    await prisma.storeOwner.upsert({
        where: { storeId_userId: { storeId: store.id, userId } },
        update: { role: "OWNER" },
        create: {
            id: id("storeowner"),
            storeId: store.id,
            userId,
            role: "OWNER",
        },
    });
    await prisma.storeSettings.upsert({
        where: { storeId: store.id },
        update: { currency: CURRENCY },
        create: {
            id: id("storesettings"),
            storeId: store.id,
            currency: CURRENCY,
        },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId: store.id },
        update: { ecommerceEnabled: true, blogsEnabled: true },
        create: {
            id: id("storefeatures"),
            storeId: store.id,
            ecommerceEnabled: true,
            blogsEnabled: true,
        },
    });

    const categories: string[] = [];
    for (let i = 0; i < CATEGORIES.length; i++) {
        const c = CATEGORIES[i];
        const category = await prisma.category.upsert({
            where: { storeId_slug: { storeId: store.id, slug: c.slug } },
            update: { name: c.name, organizationId: orgId },
            create: {
                id: id("category", i),
                storeId: store.id,
                organizationId: orgId,
                name: c.name,
                slug: c.slug,
            },
        });
        categories.push(category.id);
    }

    const productIds: string[] = [];
    for (let i = 0; i < PRODUCTS.length; i++) {
        const p = PRODUCTS[i];
        const product = await prisma.product.upsert({
            where: { storeId_slug: { storeId: store.id, slug: p.slug } },
            update: { name: p.name, price: p.price, status: "PUBLISHED" },
            create: {
                id: id("product", i),
                storeId: store.id,
                organizationId: orgId,
                categoryId: categories.at(p.category) ?? null,
                name: p.name,
                slug: p.slug,
                description: p.description,
                price: p.price,
                currency: CURRENCY,
                status: "PUBLISHED",
            },
        });
        productIds.push(product.id);

        for (let v = 0; v < p.variants.length; v++) {
            const variant = p.variants[v];
            await prisma.productVariant.upsert({
                where: {
                    productId_sku: { productId: product.id, sku: variant.sku },
                },
                update: { title: variant.title, price: variant.price },
                create: {
                    id: id("variant", i, v),
                    productId: product.id,
                    sku: variant.sku,
                    title: variant.title,
                    price: variant.price,
                },
            });
        }

        // Deliberately includes a zero and two near-zero quantities, so the
        // out-of-stock and low-stock presentations have something to render.
        await prisma.inventory.upsert({
            where: { productId: product.id },
            update: { quantity: p.stock },
            create: {
                id: id("inventory", i),
                productId: product.id,
                storeId: store.id,
                organizationId: orgId,
                quantity: p.stock,
            },
        });
    }

    // Customers mirror the first contacts, so the same person exists on both
    // sides of the commerce/CRM divide. They are NOT auto-linked — that is
    // SEC-005, still open — and this fixture is what will make the fix visible.
    const customers: string[] = [];
    for (let i = 0; i < 8; i++) {
        // `.at()` rather than `[i]`: this loop is capped at 8 independently of
        // CONTACTS.length, so a shorter contact list really would miss.
        const c = CONTACTS.at(i);
        if (!c) continue;
        const customer = await prisma.customer.upsert({
            where: {
                storeId_email: {
                    storeId: store.id,
                    email: emailFor(c.first, c.last),
                },
            },
            update: { firstName: c.first, lastName: c.last },
            create: {
                id: id("customer", i),
                storeId: store.id,
                organizationId: orgId,
                email: emailFor(c.first, c.last),
                firstName: c.first,
                lastName: c.last,
            },
        });
        customers.push(customer.id);
    }

    for (let i = 0; i < ORDERS.length; i++) {
        const o = ORDERS[i];
        const customerId = customers.at(o.customer);
        if (!customerId) continue;

        const lines = o.lines.flatMap((line) => {
            const product = PRODUCTS.at(line.product);
            const productId = productIds.at(line.product);
            if (!product || !productId) return [];
            return [
                {
                    productId,
                    quantity: line.quantity,
                    price: product.price,
                    lineTotal: Number(product.price) * line.quantity,
                },
            ];
        });
        const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
        const tax = Math.round(subtotal * 0.18 * 100) / 100;

        await prisma.order.upsert({
            where: { id: id("order", i) },
            update: { status: o.status, paymentStatus: o.paymentStatus },
            create: {
                id: id("order", i),
                storeId: store.id,
                organizationId: orgId,
                orderId: `ORD-${String(i + 1).padStart(3, "0")}`,
                customerId,
                subtotal: subtotal.toFixed(2),
                tax: tax.toFixed(2),
                total: (subtotal + tax).toFixed(2),
                currency: CURRENCY,
                status: o.status,
                paymentStatus: o.paymentStatus,
                createdAt: at(now, o.dayOffset, 12),
                items: {
                    create: lines.map((l, n) => ({
                        id: id("orderitem", i, n),
                        productId: l.productId,
                        quantity: l.quantity,
                        price: l.price,
                    })),
                },
            },
        });
    }

    return store.id;
}

// --- Content ------------------------------------------------------------

async function seedContent(prisma: Db, orgId: string, storeId: string) {
    const category = await prisma.postCategory.upsert({
        where: { storeId_slug: { storeId, slug: "guides" } },
        update: { name: "Guides" },
        create: {
            id: id("postcategory"),
            storeId,
            name: "Guides",
            slug: "guides",
        },
    });

    for (let i = 0; i < POSTS.length; i++) {
        const p = POSTS[i];
        await prisma.post.upsert({
            where: { storeId_slug: { storeId, slug: p.slug } },
            update: { title: p.title, status: p.status },
            create: {
                id: id("post", i),
                storeId,
                categoryId: category.id,
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                content: `${p.excerpt}\n\nSeeded content for local development.`,
                status: p.status,
            },
        });
    }
}

// --- teardown -----------------------------------------------------------

/**
 * Remove exactly what the seed wrote.
 *
 * Matching on the id prefix means a developer's own rows are never touched,
 * which a truncate-the-table teardown could not promise. Deletion runs
 * children-first because several relations are `Restrict` rather than
 * `Cascade`.
 */
export async function reset(): Promise<void> {
    const target = assertDatabaseTarget();
    console.log(`[seed] resetting ${target.database} on ${target.host}`);

    const { prisma } = await import("../client");
    const where = { id: { startsWith: SEED_PREFIX } };
    let removed = 0;

    const inOrder = [
        () => prisma.orderItem.deleteMany({ where }),
        () => prisma.order.deleteMany({ where }),
        () => prisma.inventory.deleteMany({ where }),
        () => prisma.productVariant.deleteMany({ where }),
        () => prisma.product.deleteMany({ where }),
        () => prisma.category.deleteMany({ where }),
        () => prisma.customer.deleteMany({ where }),
        () => prisma.post.deleteMany({ where }),
        () => prisma.postCategory.deleteMany({ where }),
        () => prisma.storeFeatures.deleteMany({ where }),
        () => prisma.storeSettings.deleteMany({ where }),
        () => prisma.storeOwner.deleteMany({ where }),
        () => prisma.store.deleteMany({ where }),
        () => prisma.booking.deleteMany({ where }),
        () => prisma.service.deleteMany({ where }),
        () => prisma.activity.deleteMany({ where }),
        () => prisma.lead.deleteMany({ where }),
        () => prisma.stage.deleteMany({ where }),
        () => prisma.pipeline.deleteMany({ where }),
        () => prisma.contact.deleteMany({ where }),
        () => prisma.merchantPaymentProvider.deleteMany({ where }),
        () => prisma.organizationModule.deleteMany({ where }),
        () => prisma.membership.deleteMany({ where }),
        () => prisma.organization.deleteMany({ where }),
        () => prisma.account.deleteMany({ where }),
        () => prisma.user.deleteMany({ where }),
    ];

    for (const step of inOrder) {
        const { count } = await step();
        removed += count;
    }

    console.log(`[seed] removed ${removed} seeded rows.`);
}

async function report(prisma: Db, organizationId: string) {
    const [
        contacts,
        leads,
        overdue,
        services,
        bookings,
        products,
        orders,
        open,
        posts,
    ] = await Promise.all([
        prisma.contact.count({ where: { organizationId } }),
        prisma.lead.count({ where: { organizationId } }),
        prisma.activity.count({
            where: {
                organizationId,
                dueAt: { lt: new Date() },
                completedAt: null,
            },
        }),
        prisma.service.count({ where: { organizationId } }),
        prisma.booking.count({ where: { organizationId } }),
        prisma.product.count({ where: { organizationId } }),
        prisma.order.count({ where: { organizationId } }),
        prisma.order.count({
            where: {
                organizationId,
                status: { in: ["PENDING", "PROCESSING"] },
            },
        }),
        prisma.post.count({ where: { store: { organizationId } } }),
    ]);

    console.log(
        `[seed] done. ${ORG_NAME} — contacts:${contacts} leads:${leads} ` +
            `overdue-tasks:${overdue} services:${services} bookings:${bookings} ` +
            `products:${products} orders:${orders} (open:${open}) posts:${posts}`,
    );
    console.log(`[seed] sign in: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
}

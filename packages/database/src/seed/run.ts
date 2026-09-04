import type { Prisma } from "@prisma/client";
import { hashPassword as hashPasswordUntyped } from "better-auth/crypto";

import { parseSectionContentOrThrow } from "../cms/section-contract";
import { assertDatabaseTarget } from "../database-target";
import type { SeedSection } from "./data";
import {
    ANALYTICS_DAYS,
    ANALYTICS_PATHS,
    BOOKINGS,
    CATEGORIES,
    COMMUNICATION_PROVIDER,
    CONTACTS,
    CURRENCY,
    DOMAIN,
    LEADS,
    LIVE_PAYMENT_PROVIDER,
    MODULE_STATES,
    ORDERS,
    ORG_NAME,
    ORG_SLUG,
    OWNER_EMAIL,
    OWNER_PASSWORD,
    PIPELINE_STAGES,
    PLAN,
    POSTS,
    PRODUCTS,
    SEED_PREFIX,
    SERVICES,
    SITES,
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

/** The UTC midnight of `when` — the day bucket the aggregate job keys on. */
const utcDay = (when: Date) =>
    new Date(
        Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()),
    );

/**
 * A deterministic 0..1 from an integer.
 *
 * The analytics series needs day-to-day variation — a flat line is not what a
 * real site's traffic looks like — but `Math.random` would make every re-run
 * rewrite every count, so a fixture that is supposed to be idempotent would
 * churn the database on each invocation. Hashing the day index gives the same
 * jagged series every time.
 */
const noise = (n: number): number => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
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
    // then turned it off. Kept alongside the live Cashfree connection below so
    // `/settings/providers` has a provider set that is genuinely mixed rather
    // than uniformly healthy.
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
    await seedCommerce(prisma, org.id, user.id, now);

    // Billing first: the sites and the domain claim below are both entitlement-
    // gated, and an org on the FREE default may hold neither.
    await seedBilling(prisma, org.id, now);
    const siteIds = await seedWebsite(prisma, org.id, user.id, now);
    // Content after the website: a post belongs to the site it is published on
    // (ADR-004), so there has to be a site first.
    await seedContent(prisma, org.id, siteIds[0] ?? "", user.id);
    await seedProviders(prisma, org.id, siteIds, now);
    await seedAnalytics(prisma, org.id, now);

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

async function seedContent(
    prisma: Db,
    orgId: string,
    siteId: string,
    userId: string,
) {
    if (!siteId) return;
    const category = await prisma.postCategory.upsert({
        where: { siteId_slug: { siteId, slug: "guides" } },
        update: { name: "Guides" },
        create: {
            id: id("postcategory"),
            siteId,
            name: "Guides",
            slug: "guides",
        },
    });

    for (let i = 0; i < POSTS.length; i++) {
        const p = POSTS[i];
        const seeded = await prisma.post.upsert({
            where: { siteId_slug: { siteId, slug: p.slug } },
            update: { title: p.title, status: p.status },
            create: {
                id: id("post", i),
                siteId,
                authorId: userId,
                categoryId: category.id,
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                content: `${p.excerpt}\n\nSeeded content for local development.`,
                status: p.status,
            },
        });

        // A post whose status says PUBLISHED must actually be live (#232),
        // or the dev data shows a state the product itself cannot produce.
        if (p.status === "PUBLISHED" && !seeded.currentPublicationId) {
            const publishedAt = seeded.publishedAt ?? new Date();
            const publication = await prisma.publication.create({
                data: {
                    id: id("postpub", i),
                    siteId,
                    organizationId: orgId,
                    postId: seeded.id,
                    path: `/blog/${seeded.slug}`,
                    snapshot: {
                        post: {
                            title: seeded.title,
                            slug: seeded.slug,
                            excerpt: seeded.excerpt,
                            content: seeded.content,
                            image: seeded.image,
                            featured: seeded.featured,
                            category: null,
                            author: null,
                            publishedAt: publishedAt.toISOString(),
                        },
                        path: `/blog/${seeded.slug}`,
                        publishedAt: publishedAt.toISOString(),
                    },
                    templateId: "post",
                    templateVersion: 1,
                    publishedAt,
                },
            });
            await prisma.post.update({
                where: { id: seeded.id },
                data: {
                    currentPublicationId: publication.id,
                    publishedAt,
                },
            });
        }
    }
}

// --- Billing ------------------------------------------------------------

/**
 * Put the org on a paid plan.
 *
 * This is not scenery. `EntitlementService` caps an unsubscribed org at one
 * site and refuses a custom-domain claim outright, so without a subscription
 * the website fixture below describes an organization the product would never
 * have allowed to exist.
 */
async function seedBilling(prisma: Db, orgId: string, now: Date) {
    const plan = await prisma.plan.upsert({
        where: { id: id("plan") },
        update: { name: PLAN.name, entitlements: PLAN.entitlements },
        create: {
            id: id("plan"),
            key: PLAN.key,
            version: PLAN.version,
            name: PLAN.name,
            priceCents: PLAN.priceCents,
            currency: CURRENCY,
            interval: PLAN.interval,
            entitlements: PLAN.entitlements,
        },
    });

    await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId: plan.id, status: "ACTIVE" },
        create: {
            id: id("subscription"),
            organizationId: orgId,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodEnd: at(now, 19, 9),
        },
    });
}

// --- Website ------------------------------------------------------------

/**
 * Build the org's sites, pages, drafts and publications.
 *
 * Two things here mirror the product rather than inventing a shape. Publishing
 * snapshots FROM a page's DRAFT version and never flips that version's status,
 * so every seeded PageVersion stays DRAFT; and the Publication snapshot is
 * assembled exactly as `SitesService.publishSite` assembles it — pages sorted
 * by path, sections in order, content already contract-normalized — because the
 * public renderer reads only that JSON and would render whatever shape we put
 * there, correct or not.
 *
 * Section content goes through `parseSectionContentOrThrow`, the same contract
 * the editor and publish enforce, so a fixture can never persist a section the
 * product itself would reject.
 *
 * @returns the site ids, in fixture order.
 */
async function seedWebsite(
    prisma: Db,
    orgId: string,
    userId: string,
    now: Date,
): Promise<string[]> {
    const siteIds: string[] = [];

    for (let s = 0; s < SITES.length; s++) {
        const fixture = SITES[s];
        const createdAt = at(now, -fixture.createdDaysAgo, 11);

        const site = await prisma.site.upsert({
            where: {
                organizationId_slug: {
                    organizationId: orgId,
                    slug: fixture.slug,
                },
            },
            update: { name: fixture.name, subdomain: fixture.subdomain },
            create: {
                id: id("site", s),
                organizationId: orgId,
                name: fixture.name,
                slug: fixture.slug,
                subdomain: fixture.subdomain,
                createdAt,
            },
        });
        siteIds.push(site.id);

        const snapshotPages: {
            path: string;
            title: string;
            isHome: boolean;
            sections: {
                type: string;
                contractVersion: number;
                content: unknown;
            }[];
        }[] = [];

        for (let p = 0; p < fixture.pages.length; p++) {
            const pageFixture = fixture.pages[p];

            const page = await prisma.page.upsert({
                where: {
                    siteId_path: { siteId: site.id, path: pageFixture.path },
                },
                update: { title: pageFixture.title },
                create: {
                    id: id("page", s, p),
                    siteId: site.id,
                    organizationId: orgId,
                    path: pageFixture.path,
                    title: pageFixture.title,
                    isHome: pageFixture.isHome ?? false,
                    createdAt,
                },
            });

            const version = await prisma.pageVersion.upsert({
                where: { id: id("pageversion", s, p) },
                update: { status: "DRAFT" },
                create: {
                    id: id("pageversion", s, p),
                    pageId: page.id,
                    organizationId: orgId,
                    status: "DRAFT",
                    createdByUserId: userId,
                    createdAt,
                },
            });

            const snapshotSections: {
                type: string;
                contractVersion: number;
                content: unknown;
            }[] = [];

            for (let n = 0; n < pageFixture.sections.length; n++) {
                const seedSection = pageFixture.sections[n];
                const content = await resolveSectionContent(
                    prisma,
                    orgId,
                    site.id,
                    [s, p, n],
                    seedSection,
                    createdAt,
                );
                const normalized = parseSectionContentOrThrow(
                    seedSection.type,
                    1,
                    content,
                ) as Prisma.InputJsonValue;

                await prisma.section.upsert({
                    where: { id: id("section", s, p, n) },
                    update: { order: n, content: normalized },
                    create: {
                        id: id("section", s, p, n),
                        pageVersionId: version.id,
                        organizationId: orgId,
                        type: seedSection.type,
                        contractVersion: 1,
                        order: n,
                        content: normalized,
                        // Deterministic, like every other seeded id: re-running
                        // the seed must not re-key the sections, or the notes
                        // pinned to them would all come back orphaned.
                        key: id("sectionkey", s, p, n),
                        createdAt,
                    },
                });

                snapshotSections.push({
                    type: seedSection.type,
                    contractVersion: 1,
                    content: normalized,
                });
            }

            snapshotPages.push({
                path: pageFixture.path,
                title: pageFixture.title,
                isHome: pageFixture.isHome ?? false,
                sections: snapshotSections,
            });
        }

        if (!fixture.published) continue;

        // Published a while after the site was created — a merchant writes the
        // pages first. The draft site skips this block entirely, which is the
        // whole of what "draft" means here: no Publication, no live pointer.
        const publishedAt = at(
            now,
            -Math.max(1, Math.round(fixture.createdDaysAgo / 6)),
            16,
        );
        const publication = await prisma.publication.upsert({
            where: { id: id("publication", s) },
            // A Publication is immutable and append-only — republishing inserts
            // a new row. So a re-run must not rewrite this one.
            update: {},
            create: {
                id: id("publication", s),
                siteId: site.id,
                organizationId: orgId,
                snapshot: {
                    site: { name: fixture.name, slug: fixture.slug },
                    pages: [...snapshotPages].sort((a, b) =>
                        a.path.localeCompare(b.path),
                    ),
                    publishedAt: publishedAt.toISOString(),
                } as Prisma.InputJsonValue,
                // The Site does not record which template produced it; publish
                // stamps the starter template's identity, so the fixture does too.
                templateId: "starter",
                templateVersion: 1,
                publishedByUserId: userId,
                publishedAt,
            },
        });

        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
    }

    return siteIds;
}

/**
 * Turn a fixture section into the content the contract expects.
 *
 * `enquiry` and `booking` are the only two that need work: both point at
 * another row by id, and the editor is what normally creates that link. The
 * enquiry's backing Form is written here (the public submit endpoint validates
 * against it, so a section without one is a form nobody can send), and the
 * booking resolves to a Service the appointments fixture already seeded.
 */
async function resolveSectionContent(
    prisma: Db,
    orgId: string,
    siteId: string,
    [s, p, n]: [number, number, number],
    section: SeedSection,
    createdAt: Date,
): Promise<unknown> {
    if (section.type === "enquiry") {
        const form = await prisma.form.upsert({
            where: { id: id("form", s, p, n) },
            update: { name: section.form.name },
            create: {
                id: id("form", s, p, n),
                organizationId: orgId,
                siteId,
                name: section.form.name,
                fields: section.form.fields as unknown as Prisma.InputJsonValue,
                pipelineId: id("pipeline"),
                createdAt,
            },
        });
        return {
            ...section.content,
            formId: form.id,
            fields: section.form.fields,
        };
    }

    if (section.type === "booking") {
        return {
            ...section.content,
            serviceId: id("service", section.service),
        };
    }

    return section.content;
}

// --- Providers ----------------------------------------------------------

/**
 * The external services the org depends on, in three different states, so
 * `/settings/providers` shows the surface doing its job rather than three
 * identical cards.
 */
async function seedProviders(
    prisma: Db,
    orgId: string,
    siteIds: string[],
    now: Date,
) {
    await prisma.merchantPaymentProvider.upsert({
        where: {
            organizationId_provider: {
                organizationId: orgId,
                provider: LIVE_PAYMENT_PROVIDER.provider,
            },
        },
        update: { status: LIVE_PAYMENT_PROVIDER.status },
        create: {
            id: id("payments", "cashfree"),
            organizationId: orgId,
            provider: LIVE_PAYMENT_PROVIDER.provider,
            status: LIVE_PAYMENT_PROVIDER.status,
            // Placeholders, as above: the seed must never fabricate a
            // credential that looks usable.
            encryptedCredentials: "seed-not-a-real-credential",
            credentialsIv: "seed-iv",
            credentialsAuthTag: "seed-tag",
        },
    });

    await prisma.communicationProvider.upsert({
        where: {
            organizationId_channel: {
                organizationId: orgId,
                channel: COMMUNICATION_PROVIDER.channel,
            },
        },
        update: {
            status: COMMUNICATION_PROVIDER.status,
            fromAddress: COMMUNICATION_PROVIDER.fromAddress,
        },
        create: {
            id: id("comms", "email"),
            organizationId: orgId,
            channel: COMMUNICATION_PROVIDER.channel,
            provider: COMMUNICATION_PROVIDER.provider,
            status: COMMUNICATION_PROVIDER.status,
            fromAddress: COMMUNICATION_PROVIDER.fromAddress,
            encryptedCredentials: "seed-not-a-real-credential",
            credentialsIv: "seed-iv",
            credentialsAuthTag: "seed-tag",
        },
    });

    const siteId = siteIds.at(DOMAIN.site);
    await prisma.domain.upsert({
        where: { hostname: DOMAIN.hostname },
        update: { status: DOMAIN.status, siteId: siteId ?? null },
        create: {
            id: id("domain"),
            organizationId: orgId,
            hostname: DOMAIN.hostname,
            siteId: siteId ?? null,
            status: DOMAIN.status,
            verificationToken: DOMAIN.verificationToken,
            createdAt: at(now, -4, 15),
        },
    });
}

// --- Analytics ----------------------------------------------------------

/**
 * Ninety days of daily rollups, in the shape the aggregate job writes them.
 *
 * The dashboard reads ONLY pre-computed `AnalyticsDailyAggregate` rows, and it
 * only ever reads the org-wide ones (`siteId = ""`): the undimensioned rows are
 * the headline totals and the time series, and the `path`-dimensioned rows are
 * the top-pages table. Per-site rows exist in production but the dashboard
 * discards them, so seeding them would be writing rows nothing reads.
 *
 * The numbers are a small supplier's, not a flattering demo's: traffic that
 * halves at the weekend and drifts up slowly, roughly one enquiry per eighty
 * views, and about half a paid order a day — a rate that matches the ten orders
 * the commerce fixture already seeded over the same month. Every day's path
 * counts sum to exactly that day's views, so the top-pages table can never
 * total more than the headline it sits under.
 */
async function seedAnalytics(prisma: Db, orgId: string, now: Date) {
    const today = utcDay(now);

    interface Row {
        id: string;
        date: Date;
        type: string;
        dimension: string;
        dimensionValue: string;
        count: number;
        uniqueCount: number;
    }
    const rows: Row[] = [];

    for (let i = 0; i < ANALYTICS_DAYS; i++) {
        // i = 0 is the oldest day, so the slow upward trend below runs forwards.
        const date = new Date(
            today.getTime() - (ANALYTICS_DAYS - 1 - i) * DAY_MS,
        );
        const iso = date.toISOString().slice(0, 10);
        const weekday = date.getUTCDay();
        const weekend = weekday === 0 || weekday === 6;

        const trend = 74 + Math.round(i * 0.3);
        const views = Math.max(
            11,
            Math.round(trend * (weekend ? 0.45 : 1) * (0.82 + noise(i) * 0.36)),
        );
        const uniques = Math.round(views * (0.62 + noise(i + 500) * 0.1));
        const enquiries = Math.floor(
            views * 0.014 * (0.4 + noise(i + 901) * 1.6),
        );
        const orders = Math.floor(
            views * 0.007 * (0.3 + noise(i + 1301) * 1.8),
        );

        const row = (
            key: string,
            type: string,
            dimension: string,
            dimensionValue: string,
            count: number,
            uniqueCount: number,
        ) => {
            // The job writes a bucket only for events that happened; a quiet day
            // leaves no row at all rather than a row of zeroes.
            if (count > 0) {
                rows.push({
                    id: id("agg", iso, key),
                    date,
                    type,
                    dimension,
                    dimensionValue,
                    count,
                    uniqueCount,
                });
            }
        };

        row("views", "site.view", "", "", views, uniques);
        // Enquiries and paid orders are produced server-side, with no visitor
        // hash to count distinct — so their `uniqueCount` is 0, as it is in
        // production. The dashboard reads only `count` for these two.
        row("enquiries", "enquiry.submitted", "", "", enquiries, 0);
        row("orders", "order.paid", "", "", orders, 0);

        let assigned = 0;
        const perPath = ANALYTICS_PATHS.map((p) => {
            const count = Math.floor(views * p.weight);
            assigned += count;
            return { path: p.path, count };
        });
        // "/" absorbs the rounding remainder, so the paths add up to `views`.
        perPath[0].count += views - assigned;

        for (const p of perPath) {
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

    // ~1,100 rows, and against a hosted Postgres one-at-a-time is a minute of
    // latency. Run them in small concurrent batches instead of a
    // `$transaction([...])`, whose five-second interactive limit a batch of
    // upserts this size blows straight through.
    const CHUNK = 20;
    for (let k = 0; k < rows.length; k += CHUNK) {
        await Promise.all(
            rows.slice(k, k + CHUNK).map((r) =>
                prisma.analyticsDailyAggregate.upsert({
                    where: {
                        organizationId_siteId_date_type_dimension_dimensionValue:
                            {
                                organizationId: orgId,
                                siteId: "",
                                date: r.date,
                                type: r.type,
                                dimension: r.dimension,
                                dimensionValue: r.dimensionValue,
                            },
                    },
                    update: { count: r.count, uniqueCount: r.uniqueCount },
                    create: {
                        id: r.id,
                        organizationId: orgId,
                        siteId: "",
                        date: r.date,
                        type: r.type,
                        dimension: r.dimension,
                        dimensionValue: r.dimensionValue,
                        count: r.count,
                        uniqueCount: r.uniqueCount,
                    },
                }),
            ),
        );
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
        // Posts hang off a Site (ADR-004), so they clear before the sites do —
        // and a post's publications before the post, since the live pointer
        // and the publication reference each other (#232).
        () =>
            prisma.post.updateMany({
                where,
                data: { currentPublicationId: null },
            }),
        () => prisma.publication.deleteMany({ where }),
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
        () => prisma.analyticsDailyAggregate.deleteMany({ where }),
        () => prisma.section.deleteMany({ where }),
        () => prisma.pageVersion.deleteMany({ where }),
        () => prisma.page.deleteMany({ where }),
        // Forms outlive their Site by design (SetNull), so they are removed
        // explicitly rather than left behind by the Site delete below.
        () => prisma.form.deleteMany({ where }),
        () => prisma.domain.deleteMany({ where }),
        // Before the Site: Site.currentPublicationId is SetNull, so dropping
        // the Publication first clears the pointer instead of blocking on it.
        () => prisma.publication.deleteMany({ where }),
        () => prisma.site.deleteMany({ where }),
        () => prisma.subscription.deleteMany({ where }),
        () => prisma.plan.deleteMany({ where }),
        () => prisma.communicationProvider.deleteMany({ where }),
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
        sites,
        published,
        pages,
        aggregates,
        providers,
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
        prisma.post.count({ where: { site: { organizationId } } }),
        prisma.site.count({ where: { organizationId, deletedAt: null } }),
        prisma.site.count({
            where: {
                organizationId,
                deletedAt: null,
                currentPublicationId: { not: null },
            },
        }),
        prisma.page.count({ where: { organizationId } }),
        prisma.analyticsDailyAggregate.count({ where: { organizationId } }),
        Promise.all([
            prisma.merchantPaymentProvider.count({ where: { organizationId } }),
            prisma.communicationProvider.count({ where: { organizationId } }),
            prisma.domain.count({ where: { organizationId } }),
        ]),
    ]);

    console.log(
        `[seed] done. ${ORG_NAME} — contacts:${contacts} leads:${leads} ` +
            `overdue-tasks:${overdue} services:${services} bookings:${bookings} ` +
            `products:${products} orders:${orders} (open:${open}) posts:${posts}`,
    );
    console.log(
        `[seed] sites:${sites} (published:${published}) pages:${pages} ` +
            `analytics-aggregates:${aggregates} providers: payment:${providers[0]} ` +
            `comms:${providers[1]} domains:${providers[2]}`,
    );
    console.log(`[seed] sign in: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
}

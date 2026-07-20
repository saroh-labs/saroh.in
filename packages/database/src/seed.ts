/**
 * Local / dev database seed (issue #105).
 *
 * Populates a small, COHERENT slice of the current schema so a fresh developer
 * has something to look at: one demo User → Organization (+ OWNER Membership) →
 * Store (org-owned, `organizationId` is NOT NULL per B5) → catalog (Category,
 * Product + ProductVariant + Inventory), a Customer with one Order, and a blog
 * (PostCategory + Post).
 *
 * IDEMPOTENT: every write is an upsert keyed on a natural unique constraint
 * (email / slug / compound keys), so re-running never duplicates rows and never
 * deletes anything. Safe to run repeatedly. It is purely ADDITIVE — it does not
 * reset, drop, or truncate. It does NOT touch auth credential tables (Account /
 * Session): the seeded User has no password, so it exists for data-shape/demo
 * purposes, not for logging in.
 *
 * Run (with DATABASE_URL pointing at the target DB):
 *   pnpm --filter @saroh/database db:seed
 * or:
 *   pnpm db:seed            (from the repo root — turbo)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- env bootstrap -------------------------------------------------------
// turbo/tsx do not auto-load `.env` into process.env, and `dotenv` is not a
// dependency of this package. Load packages/database/.env by hand (only the
// keys we need) when DATABASE_URL is not already provided by the environment.
// This module is CommonJS (no "type": "module"), so `__dirname` is available.
function loadEnvFallback(): void {
    if (process.env.DATABASE_URL) return;
    const envPath = resolve(__dirname, "..", ".env");
    if (!existsSync(envPath)) return;
    for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (process.env[key]) continue;
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}

loadEnvFallback();

if (!process.env.DATABASE_URL) {
    console.error(
        "[seed] DATABASE_URL is not set (and no packages/database/.env found). " +
            "Point DATABASE_URL at a local/dev database and re-run.",
    );
    process.exit(1);
}

async function main() {
    // Import the client AFTER env is loaded — the pg adapter reads DATABASE_URL
    // at module-eval time, so a static top-of-file import would be too early.
    const { prisma } = await import("./client");

    // 1. Demo owner (User). No password/Account — not a login credential.
    const user = await prisma.user.upsert({
        where: { email: "demo@saroh.dev" },
        update: { name: "Demo Owner" },
        create: {
            email: "demo@saroh.dev",
            name: "Demo Owner",
            emailVerified: true,
        },
    });

    // 2. Organization — the tenant root — and the owner's Membership.
    const org = await prisma.organization.upsert({
        where: { slug: "demo-org" },
        update: { name: "Demo Organization" },
        create: { name: "Demo Organization", slug: "demo-org" },
    });

    await prisma.membership.upsert({
        where: {
            organizationId_userId: {
                organizationId: org.id,
                userId: user.id,
            },
        },
        update: { role: "OWNER" },
        create: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });

    // 3. Store — an org-owned commerce channel (organizationId is NOT NULL).
    const store = await prisma.store.upsert({
        where: { slug: "demo-store" },
        update: { name: "Demo Store", organizationId: org.id },
        create: {
            name: "Demo Store",
            slug: "demo-store",
            description: "A seeded demo store for local development.",
            organizationId: org.id,
        },
    });

    await prisma.storeOwner.upsert({
        where: {
            storeId_userId: { storeId: store.id, userId: user.id },
        },
        update: { role: "OWNER" },
        create: { storeId: store.id, userId: user.id, role: "OWNER" },
    });

    // Store settings + features (blogs on so the seeded Post is meaningful).
    await prisma.storeSettings.upsert({
        where: { storeId: store.id },
        update: {},
        create: { storeId: store.id, currency: "USD" },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId: store.id },
        update: { blogsEnabled: true },
        create: {
            storeId: store.id,
            ecommerceEnabled: true,
            blogsEnabled: true,
        },
    });

    // 4. Catalog — a Category, two Products (each with a variant + inventory).
    const category = await prisma.category.upsert({
        where: { storeId_slug: { storeId: store.id, slug: "apparel" } },
        update: { name: "Apparel", organizationId: org.id },
        create: {
            storeId: store.id,
            organizationId: org.id,
            name: "Apparel",
            slug: "apparel",
        },
    });

    const productSeed = [
        {
            slug: "classic-tee",
            name: "Classic Tee",
            description: "A comfortable everyday cotton t-shirt.",
            price: "19.99",
            sku: "TEE-CLASSIC-M",
            variantTitle: "Medium",
            quantity: 100,
        },
        {
            slug: "premium-hoodie",
            name: "Premium Hoodie",
            description: "A cozy fleece-lined hoodie.",
            price: "49.99",
            sku: "HOODIE-PREM-L",
            variantTitle: "Large",
            quantity: 40,
        },
    ] as const;

    const products: { id: string; slug: string; price: string }[] = [];
    for (const p of productSeed) {
        const product = await prisma.product.upsert({
            where: { storeId_slug: { storeId: store.id, slug: p.slug } },
            update: {
                name: p.name,
                price: p.price,
                categoryId: category.id,
                organizationId: org.id,
                status: "PUBLISHED",
            },
            create: {
                storeId: store.id,
                organizationId: org.id,
                categoryId: category.id,
                name: p.name,
                slug: p.slug,
                description: p.description,
                price: p.price,
                currency: "USD",
                status: "PUBLISHED",
            },
        });
        products.push({ id: product.id, slug: p.slug, price: p.price });

        await prisma.productVariant.upsert({
            where: {
                productId_sku: { productId: product.id, sku: p.sku },
            },
            update: { title: p.variantTitle, price: p.price },
            create: {
                productId: product.id,
                sku: p.sku,
                title: p.variantTitle,
                price: p.price,
            },
        });

        await prisma.inventory.upsert({
            where: { productId: product.id },
            update: { quantity: p.quantity },
            create: {
                productId: product.id,
                storeId: store.id,
                organizationId: org.id,
                quantity: p.quantity,
            },
        });
    }

    // 5. A Customer and one Order (with items). Orders/items have no natural
    // upsert key for the line items, so create the Order only if it is absent.
    const customer = await prisma.customer.upsert({
        where: {
            storeId_email: { storeId: store.id, email: "jane@example.com" },
        },
        update: { firstName: "Jane", lastName: "Doe" },
        create: {
            storeId: store.id,
            organizationId: org.id,
            email: "jane@example.com",
            firstName: "Jane",
            lastName: "Doe",
            country: "US",
        },
    });

    const existingOrder = await prisma.order.findUnique({
        where: {
            storeId_orderId: { storeId: store.id, orderId: "ORD-0001" },
        },
    });
    if (!existingOrder) {
        const [tee, hoodie] = products;
        const subtotal = Number(tee.price) + Number(hoodie.price);
        await prisma.order.create({
            data: {
                storeId: store.id,
                organizationId: org.id,
                orderId: "ORD-0001",
                customerId: customer.id,
                subtotal,
                total: subtotal,
                currency: "USD",
                status: "PROCESSING",
                paymentStatus: "PAID",
                items: {
                    create: [
                        { productId: tee.id, quantity: 1, price: tee.price },
                        {
                            productId: hoodie.id,
                            quantity: 1,
                            price: hoodie.price,
                        },
                    ],
                },
            },
        });
    }

    // 6. Blog — a PostCategory and a published Post. authorId is intentionally
    // left null: the store owner is a StoreOwner, not a StoreMembers row, and
    // Post.author points at StoreMembers (owner-authored posts have no author).
    const postCategory = await prisma.postCategory.upsert({
        where: {
            storeId_slug: { storeId: store.id, slug: "announcements" },
        },
        update: { name: "Announcements" },
        create: {
            storeId: store.id,
            name: "Announcements",
            slug: "announcements",
        },
    });

    await prisma.post.upsert({
        where: {
            storeId_slug: { storeId: store.id, slug: "welcome" },
        },
        update: { title: "Welcome to the Demo Store", status: "PUBLISHED" },
        create: {
            storeId: store.id,
            categoryId: postCategory.id,
            title: "Welcome to the Demo Store",
            slug: "welcome",
            excerpt: "Our seeded demo store is open.",
            content:
                "# Welcome\n\nThis is a seeded post for local development.",
            status: "PUBLISHED",
            publishedAt: new Date(),
            featured: true,
        },
    });

    // Summary
    const [orgs, stores, prods, orders, posts] = await Promise.all([
        prisma.organization.count(),
        prisma.store.count(),
        prisma.product.count(),
        prisma.order.count(),
        prisma.post.count(),
    ]);
    console.log(
        `[seed] done. demo user=${user.email} org=${org.slug} store=${store.slug} | ` +
            `totals — orgs:${orgs} stores:${stores} products:${prods} orders:${orders} posts:${posts}`,
    );
}

main()
    .catch((e: unknown) => {
        console.error(
            "[seed] failed:",
            e instanceof Error ? (e.stack ?? e.message) : e,
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        const { prisma } = await import("./client");
        await prisma.$disconnect();
    });

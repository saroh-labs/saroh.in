import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { PLAN } from "../data";
import type { Db } from "../helpers";
import { at, id } from "../helpers";
import type { BoutiqueProduct } from "./boutique-catalog";
import {
    BOUTIQUE_CATEGORIES,
    BOUTIQUE_NAME,
    BOUTIQUE_OPTIONS,
    BOUTIQUE_PRODUCTS,
} from "./boutique-catalog";
import type { ModuleKey } from "./data";
import { SHOWCASE_KEY, TIMEZONE } from "./data";

/**
 * Leela & Loom (#471): the boutique the products screens are filmed in.
 *
 * Owned by `demo@saroh.dev`. Its catalogue is fixed — categories, the store's
 * options and their values, catalogue defaults, thirty products with their
 * photos, variants and stock — and upserted on seeded ids, so a re-run changes
 * nothing a film depends on. Its volume — customers, orders, review
 * invitations and reviews — is cleared and written again each run.
 *
 * Every review is a verified purchase by construction: each sits behind a
 * DELIVERED order for that product and variant, with a completed invitation,
 * exactly as the API only lets a real customer leave one. A few open orders
 * hold stock, so "promised" is never zero across the store; they are placed
 * only where holding stock leaves the designed sold-out and low states alone.
 */

const KEY = "ll";
const sid = (...parts: (string | number)[]) => id(SHOWCASE_KEY, KEY, ...parts);

export const BOUTIQUE = {
    orgId: sid("org"),
    storeId: sid("store"),
    slug: "leela-and-loom",
};

const MODULES: readonly ModuleKey[] = ["COMMERCE", "INSIGHTS"];

/** Surnames by initial, for the customers behind "Meera K." reviews. */
const SURNAMES: Record<string, string> = {
    A: "Agarwal",
    B: "Bhat",
    C: "Chawla",
    D: "Desai",
    E: "Eapen",
    F: "Fernandes",
    G: "Gupta",
    H: "Hegde",
    I: "Iyer",
    J: "Joshi",
    K: "Kulkarni",
    L: "Lobo",
    M: "Menon",
    N: "Nair",
    O: "Oberoi",
    P: "Pillai",
    Q: "Qureshi",
    R: "Rao",
    S: "Shetty",
    T: "Thomas",
    U: "Upadhyay",
    V: "Varma",
    W: "Wadia",
    Y: "Yadav",
    Z: "Zaveri",
};

interface Context {
    prisma: Db;
    now: Date;
    demoUserId: string;
}

export async function seedBoutique(
    ctx: Context,
): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now, demoUserId } = ctx;
    const orgId = BOUTIQUE.orgId;
    const storeId = BOUTIQUE.storeId;
    const createdAt = at(now, -120, 10);

    // --- the business, its owner, modules and plan
    await prisma.organization.upsert({
        where: { slug: BOUTIQUE.slug },
        update: { name: BOUTIQUE_NAME },
        create: {
            id: orgId,
            name: BOUTIQUE_NAME,
            slug: BOUTIQUE.slug,
            createdAt,
        },
    });
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: { timezone: TIMEZONE },
        create: {
            id: sid("profile"),
            organizationId: orgId,
            timezone: TIMEZONE,
        },
    });
    await prisma.membership.upsert({
        where: {
            organizationId_userId: {
                organizationId: orgId,
                userId: demoUserId,
            },
        },
        update: { role: "OWNER" },
        create: {
            id: sid("membership", "demo"),
            organizationId: orgId,
            userId: demoUserId,
            role: "OWNER",
        },
    });
    for (const moduleKey of MODULES) {
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
    const plan = await prisma.plan.findUniqueOrThrow({
        where: { key_version: { key: PLAN.key, version: PLAN.version } },
        select: { id: true },
    });
    await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId: plan.id, status: "ACTIVE" },
        create: {
            id: sid("subscription"),
            organizationId: orgId,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodEnd: at(now, 30, 9),
        },
    });

    // --- the storefront
    await prisma.store.upsert({
        where: { slug: BOUTIQUE.slug },
        update: { name: BOUTIQUE_NAME, organizationId: orgId },
        create: {
            id: storeId,
            organizationId: orgId,
            name: BOUTIQUE_NAME,
            slug: BOUTIQUE.slug,
            description:
                "Skincare for everyone, and dresses made to be lived in.",
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
    await prisma.storeSettings.upsert({
        where: { storeId },
        update: { currency: "INR" },
        create: { id: sid("storesettings"), storeId, currency: "INR" },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId },
        update: { ecommerceEnabled: true },
        create: { id: sid("storefeatures"), storeId, ecommerceEnabled: true },
    });

    // Volume first, so nothing below trips over last run's orders.
    await clearVolume(prisma);

    // --- categories, options and defaults
    const categoryId: Record<string, string> = {};
    for (const c of BOUTIQUE_CATEGORIES) {
        const row = await prisma.category.upsert({
            where: { storeId_slug: { storeId, slug: c.key } },
            update: { name: c.name, organizationId: orgId },
            create: {
                id: sid("category", c.key),
                storeId,
                organizationId: orgId,
                name: c.name,
                slug: c.key,
            },
        });
        categoryId[c.key] = row.id;
    }
    const optionId: Record<string, string> = {};
    const valueId: Record<string, string> = {};
    for (let i = 0; i < BOUTIQUE_OPTIONS.length; i++) {
        const o = BOUTIQUE_OPTIONS[i];
        const row = await prisma.productOption.upsert({
            where: { storeId_name: { storeId, name: o.name } },
            update: { position: i },
            create: {
                id: sid("option", o.key),
                storeId,
                organizationId: orgId,
                name: o.name,
                position: i,
            },
        });
        optionId[o.key] = row.id;
        for (let j = 0; j < o.values.length; j++) {
            const value = o.values[j];
            const v = await prisma.productOptionValue.upsert({
                where: { optionId_value: { optionId: row.id, value } },
                update: { position: j },
                create: {
                    id: sid("optionvalue", o.key, j),
                    optionId: row.id,
                    organizationId: orgId,
                    value,
                    position: j,
                },
            });
            valueId[`${o.key}:${value}`] = v.id;
        }
    }
    const defaults: {
        key: string;
        categoryId: string | null;
        data: Prisma.CatalogueDefaultsUncheckedUpdateInput;
    }[] = [
        {
            key: "all",
            categoryId: null,
            data: {
                lowStockAlert: 5,
                returnsMode: "STOREFRONT",
                howToUse: null,
                returnsText: null,
            },
        },
        {
            key: categoryId.dresses,
            categoryId: categoryId.dresses,
            data: {
                lowStockAlert: 3,
                returnsMode: "OWN",
                returnsText: "Exchange within 7 days, tags on.",
                howToUse: "Hand wash cold, dry in shade.",
            },
        },
    ];
    for (const d of defaults) {
        await prisma.catalogueDefaults.upsert({
            where: { storeId_key: { storeId, key: d.key } },
            update: d.data,
            create: {
                id: sid("defaults", d.key === "all" ? "all" : "dresses"),
                storeId,
                organizationId: orgId,
                key: d.key,
                categoryId: d.categoryId,
                ...(d.data as object),
            },
        });
    }

    // --- products, photos, variants, stock
    const placed: Record<
        string,
        { productId: string; variants: Record<string, string> }
    > = {};
    for (let i = 0; i < BOUTIQUE_PRODUCTS.length; i++) {
        const p = BOUTIQUE_PRODUCTS[i];
        placed[p.slug] = await upsertProduct(prisma, {
            p,
            i,
            storeId,
            orgId,
            now,
            categoryId,
            optionId,
            valueId,
        });
    }

    // --- customers, orders, invitations and reviews
    await writeOrdersAndReviews(prisma, { storeId, orgId, now, placed });

    // --- discount codes: one on a category, one on everything, one ended
    await writeDiscounts(prisma, { storeId, orgId, now, categoryId });

    return { id: orgId, name: BOUTIQUE_NAME, prefix: sid("") };
}

async function upsertProduct(
    prisma: Db,
    a: {
        p: BoutiqueProduct;
        i: number;
        storeId: string;
        orgId: string;
        now: Date;
        categoryId: Record<string, string>;
        optionId: Record<string, string>;
        valueId: Record<string, string>;
    },
): Promise<{ productId: string; variants: Record<string, string> }> {
    const { p, i, storeId, orgId, now } = a;
    const productId = sid("product", i);
    const data = {
        name: p.name,
        description: paragraphs(p.description),
        price: p.price,
        mrp: p.mrp,
        currency: "INR",
        status: p.status,
        categoryId: a.categoryId[p.category] ?? null,
        optionId: p.option ? (a.optionId[p.option] ?? null) : null,
        howToUse: p.howToUse,
        materials: p.materials,
        keyPoints: p.keyPoints,
        madeHere: p.madeBy.madeHere,
        maker: p.madeBy.madeHere ? null : p.madeBy.maker,
        madeIn: p.madeBy.madeHere ? null : p.madeBy.madeIn,
        warranty: p.warranty,
        returnsMode: p.returns.mode,
        returnsText: p.returns.mode === "OWN" ? p.returns.text : null,
        seoTitle: p.seo?.title ?? null,
        seoDescription: p.seo?.description ?? null,
        image: p.images[0]?.url ?? null,
        // Materials read as ingredients on skincare, fabric on a dress; both
        // show on the shop. The supplier code never does.
        shopFields: {
            howToUse: true,
            materials: true,
            keyPoints: true,
            maker: true,
            warranty: true,
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
            createdAt: at(now, -(110 - i * 3), 11),
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
            id: imageIds[k] ?? sid("image", i, k),
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

    const variants: Record<string, string> = {};
    if (p.variants.length === 0) {
        await prisma.variantInventory.deleteMany({ where: { productId } });
        const stock = p.stock ?? { onHand: 0, warnAt: 5 };
        await prisma.inventory.upsert({
            where: { productId },
            update: {
                quantity: stock.onHand,
                lowStockAlert: stock.warnAt,
                reserved: 0,
            },
            create: {
                id: sid("inventory", i),
                storeId,
                organizationId: orgId,
                productId,
                quantity: stock.onHand,
                lowStockAlert: stock.warnAt,
            },
        });
        return { productId, variants };
    }

    // Counted per variant: no product-level row.
    await prisma.inventory.deleteMany({ where: { productId } });
    for (let j = 0; j < p.variants.length; j++) {
        const v = p.variants[j];
        const variantId = sid("variant", i, j);
        const valueKey = p.option ? `${p.option}:${v.title}` : "";
        const vdata = {
            sku: v.sku,
            title: v.title,
            price: v.price,
            mrp: v.mrp,
            position: j,
            optionValueId: a.valueId[valueKey] ?? null,
            imageId:
                v.imageIndex !== null ? (imageIds[v.imageIndex] ?? null) : null,
        };
        await prisma.productVariant.upsert({
            where: { id: variantId },
            update: vdata,
            create: { id: variantId, productId, ...vdata },
        });
        await prisma.variantInventory.upsert({
            where: { variantId },
            update: {
                quantity: v.stock.onHand,
                lowStockAlert: v.stock.warnAt,
                reserved: 0,
            },
            create: {
                id: sid("vinventory", i, j),
                variantId,
                productId,
                organizationId: orgId,
                quantity: v.stock.onHand,
                lowStockAlert: v.stock.warnAt,
            },
        });
        variants[v.title] = variantId;
    }
    return { productId, variants };
}

async function writeOrdersAndReviews(
    prisma: Db,
    a: {
        storeId: string;
        orgId: string;
        now: Date;
        placed: Record<
            string,
            { productId: string; variants: Record<string, string> }
        >;
    },
) {
    const { storeId, orgId, now, placed } = a;

    // One customer per reviewer name ("Meera K." → Meera Kulkarni).
    const customers = new Map<string, string>();
    const customerFor = (displayName: string) =>
        customers.get(displayName) ?? "";
    const customerRows: Prisma.CustomerCreateManyInput[] = [];
    const addCustomer = (displayName: string) => {
        if (customers.has(displayName)) return;
        const [first = "Guest", initial = "S"] = displayName
            .replace(".", "")
            .split(" ");
        const last = SURNAMES[initial.charAt(0).toUpperCase()] ?? "Sharma";
        const n = customers.size;
        const cid = sid("customer", n);
        customers.set(displayName, cid);
        customerRows.push({
            id: cid,
            storeId,
            organizationId: orgId,
            email: `${first}.${last}.${n}@example.in`.toLowerCase(),
            firstName: first,
            lastName: last,
            country: "India",
            city: ["Bengaluru", "Mumbai", "Pune", "Chennai", "Kochi", "Jaipur"][
                n % 6
            ],
            createdAt: at(now, -100 + (n % 60), 12),
            updatedAt: at(now, -100 + (n % 60), 12),
        });
    };

    for (const p of BOUTIQUE_PRODUCTS)
        for (const r of p.reviews) addCustomer(r.displayName);
    for (const name of ["Ananya R.", "Kabir S.", "Ishita M.", "Rohan P."])
        addCustomer(name);
    await prisma.customer.createMany({ data: customerRows });

    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const invitations: Prisma.ReviewInvitationCreateManyInput[] = [];
    const reviews: Prisma.ProductReviewCreateManyInput[] = [];
    let seq = 0;
    const nextNumber = () => `LL-${String(1001 + seq++)}`;

    // Delivered orders behind every review.
    for (let pi = 0; pi < BOUTIQUE_PRODUCTS.length; pi++) {
        const p = BOUTIQUE_PRODUCTS[pi];
        const place = placed[p.slug] as (typeof placed)[string] | undefined;
        if (!place) continue;
        for (let ri = 0; ri < p.reviews.length; ri++) {
            const r = p.reviews[ri];
            const variantId = r.variantTitle
                ? (place.variants[r.variantTitle] ?? null)
                : null;
            const variant = r.variantTitle
                ? p.variants.find((v) => v.title === r.variantTitle)
                : undefined;
            const price = variant?.price ?? p.price;
            const orderId = sid("order", pi, ri);
            const itemId = sid("orderitem", pi, ri);
            const placedAt = at(now, -(r.daysAgo + 6), 11);
            const customerId = customerFor(r.displayName);
            const email =
                customerRows.find((c) => c.id === customerId)?.email ??
                "guest@example.in";
            orders.push({
                id: orderId,
                storeId,
                organizationId: orgId,
                orderId: nextNumber(),
                customerId,
                subtotal: price,
                total: price,
                currency: "INR",
                status: "DELIVERED",
                paymentStatus: "PAID",
                createdAt: placedAt,
                updatedAt: at(now, -(r.daysAgo + 2), 16),
            });
            items.push({
                id: itemId,
                orderId,
                productId: place.productId,
                variantId,
                quantity: 1,
                price,
            });
            const invitationId = sid("invitation", pi, ri);
            const reviewedAt = at(now, -r.daysAgo, 19);
            invitations.push({
                id: invitationId,
                organizationId: orgId,
                orderId,
                tokenHash: createHash("sha256")
                    .update(invitationId)
                    .digest("hex"),
                toAddress: email,
                expiresAt: at(now, -r.daysAgo + 30, 9),
                completedAt: reviewedAt,
                lastSentAt: at(now, -(r.daysAgo + 1), 9),
                createdAt: at(now, -(r.daysAgo + 1), 9),
            });
            reviews.push({
                id: sid("review", pi, ri),
                organizationId: orgId,
                storeId,
                invitationId,
                orderItemId: itemId,
                productId: place.productId,
                customerId,
                productName: p.name,
                invitedTo: email,
                rating: r.rating,
                body: r.body,
                displayName: r.displayName,
                status: r.hidden ? "HIDDEN" : "PUBLISHED",
                hiddenAt: r.hidden ? at(now, -r.daysAgo + 1, 10) : null,
                reply: r.reply,
                repliedAt: r.reply ? at(now, -r.daysAgo + 1, 11) : null,
                createdAt: reviewedAt,
            });
        }
    }

    // Open orders that hold stock, only where holding it keeps the designed
    // sold-out and low states as they are.
    const holds = new Map<string, number>();
    let open = 0;
    const openWho = ["Ananya R.", "Kabir S.", "Ishita M.", "Rohan P."];
    for (let pi = 0; pi < BOUTIQUE_PRODUCTS.length; pi++) {
        const p = BOUTIQUE_PRODUCTS[pi];
        if (open >= 8 || p.status !== "PUBLISHED") continue;
        const place = placed[p.slug] as (typeof placed)[string] | undefined;
        if (!place) continue;
        const v = p.variants.find((x) => x.stock.onHand - 2 > x.stock.warnAt);
        const singleOk =
            p.variants.length === 0 &&
            p.stock &&
            p.stock.onHand - 2 > p.stock.warnAt;
        if (!v && !singleOk) continue;
        if (pi % 3 !== 0) continue;
        const qty = 1 + (open % 2);
        const variantId = v ? (place.variants[v.title] ?? null) : null;
        const price = v?.price ?? p.price;
        const orderId = sid("openorder", open);
        orders.push({
            id: orderId,
            storeId,
            organizationId: orgId,
            orderId: nextNumber(),
            customerId: customerFor(
                openWho[open % openWho.length] ?? "Ananya R.",
            ),
            subtotal: mul(price, qty),
            total: mul(price, qty),
            currency: "INR",
            status: open % 3 === 0 ? "PROCESSING" : "PENDING",
            paymentStatus: "PAID",
            createdAt: at(now, -(open % 3), 10 + open),
            updatedAt: at(now, -(open % 3), 10 + open),
        });
        items.push({
            id: sid("openitem", open),
            orderId,
            productId: place.productId,
            variantId,
            quantity: qty,
            price,
        });
        const holdKey = variantId ? `v:${variantId}` : `p:${place.productId}`;
        holds.set(holdKey, (holds.get(holdKey) ?? 0) + qty);
        open += 1;
    }

    await prisma.order.createMany({ data: orders });
    await prisma.orderItem.createMany({ data: items });
    await prisma.reviewInvitation.createMany({ data: invitations });
    await prisma.productReview.createMany({ data: reviews });

    for (const [k, qty] of Array.from(holds.entries())) {
        const [kind, target] = k.split(":") as ["v" | "p", string];
        if (kind === "v") {
            await prisma.variantInventory.update({
                where: { variantId: target },
                data: { reserved: qty },
            });
        } else {
            await prisma.inventory.update({
                where: { productId: target },
                data: { reserved: qty },
            });
        }
    }
}

/**
 * Three codes, so a product page's Discounts tab has something to say: one
 * that reaches the serums through their category, one for the whole shop,
 * and one that ended — listed quieter, because "why did that order get 15%
 * off" is asked after the fact.
 */
async function writeDiscounts(
    prisma: Db,
    ctx: {
        storeId: string;
        orgId: string;
        now: Date;
        categoryId: Record<string, string>;
    },
) {
    const { storeId, orgId, now, categoryId } = ctx;
    // Join rows go with their discount (cascade).
    await prisma.discount.deleteMany({
        where: { id: { startsWith: sid("discount") } },
    });
    await prisma.discount.create({
        data: {
            id: sid("discount", "glow15"),
            organizationId: orgId,
            code: "GLOW15",
            description: "the serums, for the festive season",
            kind: "PERCENTAGE",
            percentBps: 1500,
            appliesTo: "COLLECTION",
            startsAt: at(now, -6, 9),
            endsAt: at(now, 21, 23),
            createdAt: at(now, -8, 11),
            categories: {
                create: {
                    id: sid("discount", "glow15", "serums"),
                    categoryId: categoryId.serums,
                },
            },
        },
    });
    await prisma.discount.create({
        data: {
            id: sid("discount", "welcome100"),
            organizationId: orgId,
            code: "WELCOME100",
            description: "a first order, anything in the shop",
            kind: "FIXED_AMOUNT",
            amount: "100",
            currency: "INR",
            appliesTo: "BUSINESS",
            createdAt: at(now, -60, 11),
        },
    });
    await prisma.discount.create({
        data: {
            id: sid("discount", "monsoon20"),
            organizationId: orgId,
            code: "MONSOON20",
            description: "the monsoon sale",
            kind: "PERCENTAGE",
            percentBps: 2000,
            appliesTo: "STOREFRONT",
            startsAt: at(now, -45, 9),
            endsAt: at(now, -24, 23),
            createdAt: at(now, -46, 11),
            stores: {
                create: { id: sid("discount", "monsoon20", "store"), storeId },
            },
        },
    });
}

/** This business's volume, children first. Its catalogue stays. */
async function clearVolume(prisma: Db) {
    const where = { id: { startsWith: sid("") } };
    await prisma.productReview.deleteMany({ where });
    await prisma.reviewInvitation.deleteMany({ where });
    await prisma.orderItem.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
}

/**
 * What must hold for the boutique to be filmed as it is: photos in order with
 * one cover, stock that adds up, promises that match open orders, and every
 * review behind a delivered order line of the same product and variant.
 */
export async function checkBoutique(prisma: Db): Promise<void> {
    const orgId = BOUTIQUE.orgId;
    const failures: string[] = [];
    const json = (v: unknown) =>
        JSON.stringify(v, (_k, x: unknown) =>
            typeof x === "bigint" ? Number(x) : x,
        );
    const fail = (what: string, rows: unknown[]) => {
        if (rows.length > 0)
            failures.push(`${what}: ${json(rows.slice(0, 3))}`);
    };
    fail(
        "products with more than five photos, or not exactly one at position 0",
        await prisma.$queryRaw<unknown[]>`
            SELECT "productId", COUNT(*) AS n, COUNT(*) FILTER (WHERE position = 0) AS covers
            FROM "ProductImage" WHERE "organizationId" = ${orgId}
            GROUP BY "productId" HAVING COUNT(*) > 5 OR COUNT(*) FILTER (WHERE position = 0) <> 1`,
    );
    fail(
        "reviews not behind a delivered line of the same product and variant",
        await prisma.$queryRaw<unknown[]>`
            SELECT r.id FROM "ProductReview" r
            LEFT JOIN "OrderItem" i ON i.id = r."orderItemId"
            LEFT JOIN "Order" o ON o.id = i."orderId"
            WHERE r."organizationId" = ${orgId}
              AND (i.id IS NULL OR o.status <> 'DELIVERED' OR i."productId" <> r."productId")`,
    );
    fail(
        "variant stock promised that open orders do not hold",
        await prisma.$queryRaw<unknown[]>`
            SELECT vi."variantId", vi.reserved, COALESCE(h.held, 0) AS held
            FROM "VariantInventory" vi
            LEFT JOIN (
                SELECT i."variantId", SUM(i.quantity) AS held FROM "OrderItem" i
                JOIN "Order" o ON o.id = i."orderId"
                WHERE o.status IN ('PENDING', 'PROCESSING') GROUP BY i."variantId"
            ) h ON h."variantId" = vi."variantId"
            WHERE vi."organizationId" = ${orgId} AND vi.reserved <> COALESCE(h.held, 0)`,
    );
    fail(
        "variants holding more than is on hand",
        await prisma.$queryRaw<unknown[]>`
            SELECT "variantId" FROM "VariantInventory"
            WHERE "organizationId" = ${orgId} AND reserved > quantity`,
    );
    const counts = await prisma.$queryRaw<{ sold_out: bigint; low: bigint }[]>`
        SELECT COUNT(*) FILTER (WHERE quantity - reserved <= 0) AS sold_out,
               COUNT(*) FILTER (WHERE quantity - reserved > 0 AND quantity - reserved <= "lowStockAlert") AS low
        FROM "VariantInventory" WHERE "organizationId" = ${orgId}`;
    const c = counts.at(0);
    if (!c || Number(c.sold_out) < 1 || Number(c.low) < 1) {
        failures.push(
            `the store needs a sold-out and a low variant to film: ${JSON.stringify(c, (_, v: unknown) => (typeof v === "bigint" ? Number(v) : v))}`,
        );
    }
    if (failures.length > 0) {
        throw new Error(
            `Leela & Loom failed its checks:\n- ${failures.join("\n- ")}`,
        );
    }
}

/** A description as HTML paragraphs — what the editor writes. */
function paragraphs(text: string): string {
    return text
        .split(/\n\s*\n/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para) => `<p>${escapeHtml(para)}</p>`)
        .join("");
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Money × quantity on strings, in paise — never a float. */
function mul(price: string, qty: number): string {
    const [w = "0", f = ""] = price.split(".");
    const paise = (Number(w) * 100 + Number((f + "00").slice(0, 2))) * qty;
    return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

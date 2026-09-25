import {
    MERGE_REPORT_ACTION,
    MERGE_REPORT_NOTICE,
    mergeSameProducts,
    prisma,
} from "@saroh/database";

import { MergeReportService } from "./merge-report.service";

/**
 * The #530 same-product merge (packages/database/src/backfill/
 * merge-same-products.ts) against the shape the listings backfill leaves: a
 * business that made the same product at each storefront, each with its own
 * listing, its own shelf, its own past orders, reviews, photos, codes,
 * field values and allergens — next to near-twins the rule must keep apart,
 * and another business with the very same product.
 */
const tag = `${process.pid}-${Date.now()}`;
const at = (days: number) => new Date(Date.UTC(2026, 0, 1 + days));

describe("Same-product merge (#530, DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let hill = "";
    let online = "";
    let elsewhere = "";
    let customerId = "";
    let sizeOptionId = "";
    let allergen = "";
    let field = "";
    const p: Record<string, string> = {};
    const v: Record<string, string> = {};
    const line: Record<string, string> = {};
    const row: Record<string, string> = {};

    interface Spec {
        name: string;
        storeId: string;
        createdAt: Date;
        organizationId?: string;
        price?: string;
        skus?: [string, string | null][];
        tracked?: boolean;
        slug?: string;
        description?: string | null;
    }

    /** A product as the listings backfill leaves it: listed, on a shelf. */
    async function product(key: string, spec: Spec) {
        const organizationId = spec.organizationId ?? orgId;
        const skus = spec.skus ?? [
            ["S", null],
            ["M", "1300.00"],
        ];
        const made = await prisma.product.create({
            data: {
                organizationId,
                storeId: spec.storeId,
                name: spec.name,
                slug: spec.slug ?? `${key}-${tag}`,
                price: spec.price ?? "1200.00",
                mrp: "1500.00",
                currency: "INR",
                gstRate: "5.00",
                hsnCode: "6205",
                status: "PUBLISHED",
                optionId: skus.length > 0 ? sizeOptionId : null,
                description: spec.description ?? null,
                createdAt: spec.createdAt,
                // A product with a shelf tracks stock (#515's backfill).
                stockTracked: spec.tracked !== false,
            },
        });
        p[key] = made.id;
        const listing = await prisma.productListing.create({
            data: {
                organizationId,
                storeId: spec.storeId,
                productId: made.id,
                createdAt: spec.createdAt,
            },
        });
        for (const [i, [size, price]] of skus.entries()) {
            const variant = await prisma.productVariant.create({
                data: {
                    productId: made.id,
                    sku: `LS-${size}`,
                    title: size,
                    price,
                    position: i,
                },
            });
            v[`${key}.${size}`] = variant.id;
            await prisma.productListingVariant.create({
                data: {
                    organizationId,
                    listingId: listing.id,
                    productId: made.id,
                    variantId: variant.id,
                },
            });
            if (spec.tracked !== false) {
                row[`${key}.${size}`] = (
                    await prisma.stockLevel.create({
                        data: {
                            organizationId,
                            storeId: spec.storeId,
                            productId: made.id,
                            variantId: variant.id,
                            onHand: 10 + i,
                            promised: i,
                            lowStockAlert: 3,
                        },
                    })
                ).id;
            }
        }
        return made.id;
    }

    async function order(
        storeId: string,
        key: string,
        productKey: string,
        size: string,
    ) {
        const n = await prisma.order.count();
        const made = await prisma.order.create({
            data: {
                storeId,
                organizationId: orgId,
                customerId,
                orderId: `MG-${tag}-${n + 1}`,
                subtotal: "1200.00",
                total: "1200.00",
                status: "DELIVERED",
                items: {
                    create: {
                        productId: p[productKey],
                        variantId: v[`${productKey}.${size}`],
                        quantity: 1,
                        price: "1200.00",
                        stockRow: "VARIANT",
                        stockLevelId: row[`${productKey}.${size}`],
                    },
                },
            },
            include: { items: true },
        });
        line[key] = made.items[0].id;
        return made.id;
    }

    /** Everything the merge could touch in the business, for "no change". */
    async function snapshot() {
        const where = { organizationId: orgId };
        return {
            products: await prisma.product.findMany({
                where,
                orderBy: { id: "asc" },
                include: { variants: { orderBy: { id: "asc" } } },
            }),
            listings: await prisma.productListing.findMany({
                where,
                orderBy: { id: "asc" },
                include: { variants: { orderBy: { id: "asc" } } },
            }),
            stock: await prisma.stockLevel.findMany({
                where,
                orderBy: { id: "asc" },
            }),
            lines: await prisma.orderItem.findMany({
                where: { order: where },
                orderBy: { id: "asc" },
            }),
            images: await prisma.productImage.findMany({
                where,
                orderBy: { id: "asc" },
            }),
            reports: await prisma.auditEvent.count({ where }),
            notices: await prisma.notification.count({ where }),
        };
    }

    beforeAll(async () => {
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye", slug: `mg530-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Other", slug: `mg530-other-${tag}` },
            })
        ).id;
        const store = (name: string, organizationId = orgId) =>
            prisma.store.create({
                data: {
                    name,
                    slug: `mg530-${name.toLowerCase().replace(/ /g, "-")}-${tag}`,
                    organizationId,
                },
            });
        hill = (await store("Hill Road")).id;
        online = (await store("Online")).id;
        elsewhere = (await store("Elsewhere", otherOrgId)).id;
        customerId = (
            await prisma.customer.create({
                data: {
                    storeId: hill,
                    organizationId: orgId,
                    email: `mg530-${tag}@example.com`,
                },
            })
        ).id;
        sizeOptionId = (
            await prisma.productOption.create({
                data: { organizationId: orgId, name: "Size" },
            })
        ).id;
        allergen = (
            await prisma.storeAllergen.create({
                data: { organizationId: orgId, name: "Nuts" },
            })
        ).id;
        field = (
            await prisma.productField.create({
                data: { organizationId: orgId, name: "Fabric" },
            })
        ).id;

        // The same shirt at Hill Road (older) and Online.
        await product("shirt", {
            name: "Linen shirt",
            storeId: hill,
            createdAt: at(1),
        });
        await product("shirtOnline", {
            name: " linen Shirt ",
            storeId: online,
            createdAt: at(5),
            description: "Only Online wrote this",
        });
        await order(hill, "hillSale", "shirt", "S");
        await order(online, "onlineSale", "shirtOnline", "M");

        // Photos: the same cover on both, and one only Online has.
        await prisma.productImage.createMany({
            data: [
                {
                    organizationId: orgId,
                    productId: p.shirt,
                    url: "https://cdn.example/shirt.jpg",
                    position: 0,
                },
                {
                    organizationId: orgId,
                    productId: p.shirtOnline,
                    url: "https://cdn.example/shirt.jpg",
                    position: 0,
                },
                {
                    organizationId: orgId,
                    productId: p.shirtOnline,
                    url: "https://cdn.example/back.jpg",
                    position: 1,
                },
            ],
        });
        // A code naming both: still one row once they are one.
        await prisma.discount.create({
            data: {
                organizationId: orgId,
                code: `BOTH-${tag}`.toUpperCase(),
                kind: "PERCENTAGE",
                percentBps: 1000,
                appliesTo: "PRODUCT",
                products: {
                    create: [
                        { productId: p.shirt },
                        { productId: p.shirtOnline },
                    ],
                },
            },
        });
        // Field values: the same field, differing; allergens: one side
        // says "may contain", the other "contains".
        await prisma.productFieldValue.createMany({
            data: [
                {
                    organizationId: orgId,
                    productId: p.shirt,
                    fieldId: field,
                    value: "Linen",
                },
                {
                    organizationId: orgId,
                    productId: p.shirtOnline,
                    fieldId: field,
                    value: "Linen blend",
                },
            ],
        });
        await prisma.productAllergen.createMany({
            data: [
                {
                    organizationId: orgId,
                    productId: p.shirt,
                    allergenId: allergen,
                    kind: "MAY_CONTAIN",
                },
                {
                    organizationId: orgId,
                    productId: p.shirtOnline,
                    allergenId: allergen,
                    kind: "CONTAINS",
                },
            ],
        });
        // A review of the Online sale.
        const onlineOrder = await prisma.orderItem.findUniqueOrThrow({
            where: { id: line.onlineSale },
            select: { orderId: true },
        });
        const invitation = await prisma.reviewInvitation.create({
            data: {
                organizationId: orgId,
                orderId: onlineOrder.orderId,
                tokenHash: `mg530-${tag}`,
                toAddress: "buyer@example.com",
                expiresAt: at(400),
            },
        });
        await prisma.productReview.create({
            data: {
                organizationId: orgId,
                storeId: online,
                invitationId: invitation.id,
                orderItemId: line.onlineSale,
                productId: p.shirtOnline,
                productName: "Linen shirt",
                invitedTo: "buyer@example.com",
                rating: 5,
                displayName: "A.",
            },
        });

        // The same mug twice at Hill Road: one shelf holding both.
        await product("mug", {
            name: "Mug",
            storeId: hill,
            createdAt: at(1),
            skus: [["ONE", null]],
        });
        await product("mugAgain", {
            name: "Mug",
            storeId: hill,
            createdAt: at(2),
            skus: [["ONE", null]],
        });

        // A belt with a full set of photos, and its twin with one more
        // photo and a video.
        await product("belt", {
            name: "Belt",
            storeId: hill,
            createdAt: at(1),
        });
        await product("beltOnline", {
            name: "Belt",
            storeId: online,
            createdAt: at(2),
        });
        await prisma.productImage.createMany({
            data: [
                ...Array.from({ length: 15 }, (_, i) => ({
                    organizationId: orgId,
                    productId: p.belt,
                    url: `https://cdn.example/belt-${i}.jpg`,
                    position: i,
                })),
                {
                    organizationId: orgId,
                    productId: p.beltOnline,
                    url: "https://cdn.example/belt-extra.jpg",
                    position: 0,
                },
                {
                    organizationId: orgId,
                    productId: p.beltOnline,
                    url: "https://cdn.example/belt.mp4",
                    kind: "video",
                    position: 1,
                },
            ],
        });

        // Same name and SKUs, dearer Online: kept apart.
        await product("tote", {
            name: "Tote",
            storeId: hill,
            createdAt: at(1),
        });
        await product("toteOnline", {
            name: "Tote",
            storeId: online,
            createdAt: at(2),
            price: "1250.00",
        });
        // Different variant sets: kept apart.
        await product("cap", { name: "Cap", storeId: hill, createdAt: at(1) });
        await product("capOnline", {
            name: "Cap",
            storeId: online,
            createdAt: at(2),
            skus: [
                ["S", null],
                ["L", "1300.00"],
            ],
        });
        // No variants at all: never merged.
        await product("jam", {
            name: "Jam",
            storeId: hill,
            createdAt: at(1),
            skus: [],
            tracked: false,
        });
        await product("jamOnline", {
            name: "Jam",
            storeId: online,
            createdAt: at(2),
            skus: [],
            tracked: false,
        });
        // A live code naming only Hill Road's scarf: kept apart.
        await product("scarf", {
            name: "Scarf",
            storeId: hill,
            createdAt: at(1),
        });
        await product("scarfOnline", {
            name: "Scarf",
            storeId: online,
            createdAt: at(2),
        });
        await prisma.discount.create({
            data: {
                organizationId: orgId,
                code: `SCARF-${tag}`.toUpperCase(),
                kind: "PERCENTAGE",
                percentBps: 1000,
                appliesTo: "PRODUCT",
                products: { create: [{ productId: p.scarf }] },
            },
        });
        // Another business with the very same shirt: never merged with Rye's.
        await product("otherShirt", {
            name: "Linen shirt",
            storeId: elsewhere,
            organizationId: otherOrgId,
            createdAt: at(0),
        });
    });

    it("joins the shirt: one product, both listings, both shelves as they were", async () => {
        const report = await mergeSameProducts(prisma);
        expect(report.productsMerged).toBe(3);

        expect(
            await prisma.product.count({ where: { id: p.shirtOnline } }),
        ).toBe(0);
        const listings = await prisma.productListing.findMany({
            where: { productId: p.shirt },
            include: { variants: true },
        });
        expect(listings.map((l) => l.storeId).sort()).toEqual(
            [hill, online].sort(),
        );
        const onlineListing = listings.find((l) => l.storeId === online);
        expect(onlineListing?.createdAt).toEqual(at(5));
        expect(onlineListing?.variants.map((x) => x.variantId).sort()).toEqual(
            [v["shirt.S"], v["shirt.M"]].sort(),
        );

        const shelves = await prisma.stockLevel.findMany({
            where: { productId: p.shirt },
            select: {
                id: true,
                storeId: true,
                variantId: true,
                onHand: true,
                promised: true,
            },
        });
        expect(shelves).toHaveLength(4);
        expect(shelves).toEqual(
            expect.arrayContaining([
                {
                    id: row["shirtOnline.S"],
                    storeId: online,
                    variantId: v["shirt.S"],
                    onHand: 10,
                    promised: 0,
                },
                {
                    id: row["shirtOnline.M"],
                    storeId: online,
                    variantId: v["shirt.M"],
                    onHand: 11,
                    promised: 1,
                },
                {
                    id: row["shirt.S"],
                    storeId: hill,
                    variantId: v["shirt.S"],
                    onHand: 10,
                    promised: 0,
                },
            ]),
        );

        // Past orders name the survivor, its variant and the same shelf.
        expect(
            await prisma.orderItem.findUniqueOrThrow({
                where: { id: line.onlineSale },
                select: {
                    productId: true,
                    variantId: true,
                    stockLevelId: true,
                },
            }),
        ).toEqual({
            productId: p.shirt,
            variantId: v["shirt.M"],
            stockLevelId: row["shirtOnline.M"],
        });

        const shirt = await prisma.product.findUniqueOrThrow({
            where: { id: p.shirt },
            include: {
                images: { orderBy: { position: "asc" } },
                discountReach: true,
                fieldValues: true,
                allergens: true,
                reviews: true,
            },
        });
        expect(shirt.images.map((i) => [i.url, i.position])).toEqual([
            ["https://cdn.example/shirt.jpg", 0],
            ["https://cdn.example/back.jpg", 1],
        ]);
        expect(shirt.image).toBe("https://cdn.example/shirt.jpg");
        expect(shirt.discountReach).toHaveLength(1);
        expect(shirt.fieldValues.map((f) => f.value)).toEqual(["Linen"]);
        expect(shirt.allergens.map((a) => a.kind)).toEqual(["CONTAINS"]);
        expect(shirt.reviews).toHaveLength(1);
        // Only Online had a description: it fills the gap.
        expect(shirt.description).toBe("Only Online wrote this");

        // The other business's shirt is untouched.
        expect(
            await prisma.product.count({ where: { id: p.otherShirt } }),
        ).toBe(1);
        expect(
            report.reports.find((r) => r.organizationId === otherOrgId),
        ).toBeUndefined();
    });

    it("adds two shelves at one storefront into one", async () => {
        expect(await prisma.product.count({ where: { id: p.mugAgain } })).toBe(
            0,
        );
        const shelves = await prisma.stockLevel.findMany({
            where: { productId: p.mug },
        });
        expect(shelves).toHaveLength(1);
        expect(shelves[0]).toMatchObject({
            id: row["mug.ONE"],
            storeId: hill,
            onHand: 20,
            promised: 0,
        });
        expect(
            await prisma.productListing.count({ where: { productId: p.mug } }),
        ).toBe(1);
    });

    it("keeps photos within 15 and videos within 3, and reports the rest", async () => {
        const images = await prisma.productImage.findMany({
            where: { productId: p.belt },
            orderBy: { position: "asc" },
        });
        expect(images.filter((i) => i.kind === "photo")).toHaveLength(15);
        expect(images.at(-1)).toMatchObject({
            kind: "video",
            url: "https://cdn.example/belt.mp4",
            position: 15,
        });
        const [report] = await new MergeReportService().list({
            organizationId: orgId,
            userId: "owner",
            role: "ADMIN",
        });
        expect(report.discarded).toContainEqual({
            productId: p.belt,
            from: p.beltOnline,
            what: "photo",
            value: "https://cdn.example/belt-extra.jpg",
        });
    });

    it("keeps apart what is not clearly the same, and says why", async () => {
        for (const id of [
            p.tote,
            p.toteOnline,
            p.cap,
            p.capOnline,
            p.jam,
            p.jamOnline,
            p.scarf,
            p.scarfOnline,
        ]) {
            expect(await prisma.product.count({ where: { id } })).toBe(1);
        }

        const [report] = await new MergeReportService().list({
            organizationId: orgId,
            userId: "owner",
            role: "OWNER",
        });
        expect(
            Object.fromEntries(
                report.keptApart.map((k) => [
                    k.productId,
                    [k.apartFrom, k.reason],
                ]),
            ),
        ).toEqual({
            [p.toteOnline]: [p.tote, "different-prices"],
            [p.capOnline]: [p.cap, "different-variants"],
            [p.jamOnline]: [p.jam, "no-variants"],
            [p.scarfOnline]: [p.scarf, "live-discount"],
        });
        expect(report.merged).toEqual(
            expect.arrayContaining([
                {
                    name: "Linen shirt",
                    productId: p.shirt,
                    slug: `shirt-${tag}`,
                    from: [
                        {
                            productId: p.shirtOnline,
                            slug: `shirtOnline-${tag}`,
                        },
                    ],
                },
            ]),
        );
        expect(report.discarded).toEqual(
            expect.arrayContaining([
                {
                    productId: p.shirt,
                    from: p.shirtOnline,
                    what: "address",
                    value: `shirtOnline-${tag}`,
                },
                {
                    productId: p.shirt,
                    from: p.shirtOnline,
                    what: "Fabric",
                    value: "Linen blend",
                },
                {
                    productId: p.shirt,
                    from: p.shirtOnline,
                    what: "allergen Nuts",
                    value: "May contain",
                },
            ]),
        );

        // One notice, in the Owner/Admin inbox.
        const notices = await prisma.notification.findMany({
            where: { organizationId: orgId, type: MERGE_REPORT_NOTICE },
        });
        expect(notices).toHaveLength(1);
        expect(notices[0].title).toBe(
            "6 products made at more than one storefront are now 3 products",
        );
        expect(notices[0].userId).toBeNull();
    });

    it("run again, changes nothing and writes no second report", async () => {
        const before = await snapshot();
        const report = await mergeSameProducts(prisma);
        expect(report.productsMerged).toBe(0);
        expect(await snapshot()).toEqual(before);
        expect(
            await prisma.auditEvent.count({
                where: { organizationId: orgId, action: MERGE_REPORT_ACTION },
            }),
        ).toBe(1);
    });

    it("joins the scarves once the code that named one has ended", async () => {
        await prisma.discount.updateMany({
            where: {
                organizationId: orgId,
                code: `SCARF-${tag}`.toUpperCase(),
            },
            data: { endsAt: at(-1) },
        });
        const report = await mergeSameProducts(prisma, at(30));
        expect(report.productsMerged).toBe(1);
        expect(
            await prisma.product.count({ where: { id: p.scarfOnline } }),
        ).toBe(0);
        // The ended code keeps naming the scarf.
        expect(
            await prisma.discountProduct.count({
                where: { productId: p.scarf },
            }),
        ).toBe(1);
        expect(
            await prisma.auditEvent.count({
                where: { organizationId: orgId, action: MERGE_REPORT_ACTION },
            }),
        ).toBe(2);
    });

    describe("on a later run", () => {
        const category = async (name: string, parentId?: string) =>
            (
                await prisma.category.create({
                    data: {
                        organizationId: orgId,
                        name,
                        slug: `${name.toLowerCase()}-${tag}`,
                        parentId: parentId ?? null,
                    },
                })
            ).id;
        /** What a run kept apart in this business. */
        const keptApart = async () =>
            (await mergeSameProducts(prisma, at(30))).reports.find(
                (r) => r.organizationId === orgId,
            )?.keptApart ?? [];

        it("keeps apart twins a live code reaches through a category above one of them", async () => {
            const clothes = await category("Clothes");
            const tops = await category("Tops", clothes);
            const knits = await category("Knits", clothes);
            await product("kurta", {
                name: "Kurta",
                storeId: hill,
                createdAt: at(1),
            });
            await product("kurtaOnline", {
                name: "Kurta",
                storeId: online,
                createdAt: at(2),
            });
            await prisma.product.update({
                where: { id: p.kurta },
                data: { categoryId: tops },
            });
            await prisma.product.update({
                where: { id: p.kurtaOnline },
                data: { categoryId: knits },
            });
            await prisma.discount.create({
                data: {
                    organizationId: orgId,
                    code: `CLOTHES-${tag}`.toUpperCase(),
                    kind: "PERCENTAGE",
                    percentBps: 1000,
                    appliesTo: "COLLECTION",
                    categories: { create: [{ categoryId: clothes }] },
                },
            });
            expect(await keptApart()).toContainEqual(
                expect.objectContaining({
                    productId: p.kurtaOnline,
                    apartFrom: p.kurta,
                    reason: "live-discount",
                }),
            );
            expect(
                await prisma.product.count({
                    where: { id: { in: [p.kurta, p.kurtaOnline] } },
                }),
            ).toBe(2);
        });

        it("keeps apart twins whose Track stock differs, shelves or not", async () => {
            await product("tea", {
                name: "Tea",
                storeId: hill,
                createdAt: at(1),
            });
            await product("teaOnline", {
                name: "Tea",
                storeId: online,
                createdAt: at(2),
            });
            // Track stock turned off Online: its shelves stay, at 0.
            await prisma.product.update({
                where: { id: p.teaOnline },
                data: { stockTracked: false },
            });
            expect(await keptApart()).toContainEqual(
                expect.objectContaining({
                    productId: p.teaOnline,
                    reason: "different-tracking",
                }),
            );
            expect(
                await prisma.product.count({ where: { id: p.teaOnline } }),
            ).toBe(1);
        });

        it("moves hand-picked collections and a storefront's Sold out onto the product that stays", async () => {
            await product("stole", {
                name: "Stole",
                storeId: hill,
                createdAt: at(1),
                tracked: false,
            });
            await product("stoleOnline", {
                name: "Stole",
                storeId: online,
                createdAt: at(2),
                tracked: false,
            });
            // Online marked its stole Sold out by hand, and put it in a
            // hand-picked collection, second.
            const marked = at(3);
            await prisma.productListing.updateMany({
                where: { productId: p.stoleOnline, storeId: online },
                data: { soldOutAt: marked, soldOutByUserId: "someone" },
            });
            const winter = await prisma.collection.create({
                data: {
                    organizationId: orgId,
                    name: "Winter",
                    slug: `winter-${tag}`,
                },
            });
            await prisma.collectionProduct.createMany({
                data: [
                    {
                        collectionId: winter.id,
                        organizationId: orgId,
                        productId: p.kurta,
                        position: 0,
                    },
                    {
                        collectionId: winter.id,
                        organizationId: orgId,
                        productId: p.stoleOnline,
                        position: 1,
                    },
                ],
            });

            await mergeSameProducts(prisma, at(30));
            expect(
                await prisma.product.count({ where: { id: p.stoleOnline } }),
            ).toBe(0);
            expect(
                await prisma.collectionProduct.findMany({
                    where: { collectionId: winter.id },
                    orderBy: { position: "asc" },
                    select: { productId: true, position: true },
                }),
            ).toEqual([
                { productId: p.kurta, position: 0 },
                { productId: p.stole, position: 1 },
            ]);
            expect(
                await prisma.productListing.findUniqueOrThrow({
                    where: {
                        storeId_productId: {
                            storeId: online,
                            productId: p.stole,
                        },
                    },
                    select: { soldOutAt: true, soldOutByUserId: true },
                }),
            ).toEqual({ soldOutAt: marked, soldOutByUserId: "someone" });
        });
    });
});

import { backfillCatalogueSettings, prisma } from "@saroh/database";

/**
 * The #529 backfill (packages/database/src/backfill/catalogue-settings.ts)
 * against old-shape rows: storefronts of one business that each kept their
 * own "Breads", "Size" and "Peanuts". The per-business unique indexes the
 * migration adds would refuse those rows, so they are dropped for this file
 * and put back after — the backfill is what makes them hold.
 */
const tag = `${process.pid}-${Date.now()}`;
const PER_BUSINESS_UNIQUE = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "Category_organizationId_slug_key" ON "Category"("organizationId", "slug")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ProductOption_organizationId_name_key" ON "ProductOption"("organizationId", "name")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "CatalogueDefaults_organizationId_key_key" ON "CatalogueDefaults"("organizationId", "key")`,
];

const at = (days: number) => new Date(Date.UTC(2026, 0, 1 + days));

async function business(name: string, storeCount: number) {
    const org = await prisma.organization.create({
        data: { name, slug: `bf-${name.toLowerCase()}-${tag}` },
    });
    const stores: { id: string; slug: string; name: string }[] = [];
    for (let i = 0; i < storeCount; i++) {
        stores.push(
            await prisma.store.create({
                data: {
                    name: `${name} ${i === 0 ? "Hill Road" : "Online"}`,
                    slug: `bf-${name.toLowerCase()}-${i}-${tag}`,
                    organizationId: org.id,
                    createdAt: at(i),
                },
                select: { id: true, slug: true, name: true },
            }),
        );
    }
    return { orgId: org.id, stores };
}

async function category(
    orgId: string,
    storeId: string,
    name: string,
    parentId: string | null = null,
    slug = name.toLowerCase(),
) {
    return prisma.category.create({
        data: { organizationId: orgId, storeId, name, slug, parentId },
    });
}

async function product(
    orgId: string,
    storeId: string,
    name: string,
    extra: { categoryId?: string; optionId?: string } = {},
) {
    return prisma.product.create({
        data: {
            organizationId: orgId,
            storeId,
            name,
            slug: name.toLowerCase().replace(/\s+/g, "-"),
            price: "100",
            ...extra,
        },
    });
}

/** Everything the backfill could touch, for "changed nothing". */
async function snapshot(orgIds: string[]) {
    const where = { organizationId: { in: orgIds } };
    return {
        categories: await prisma.category.findMany({
            where,
            orderBy: { id: "asc" },
        }),
        options: await prisma.productOption.findMany({
            where,
            orderBy: { id: "asc" },
            include: { values: { orderBy: { id: "asc" } } },
        }),
        fields: await prisma.productField.findMany({
            where,
            orderBy: { id: "asc" },
            include: { categories: { orderBy: { id: "asc" } } },
        }),
        defaults: await prisma.catalogueDefaults.findMany({
            where,
            orderBy: { id: "asc" },
        }),
        allergens: await prisma.storeAllergen.findMany({
            where,
            orderBy: { id: "asc" },
        }),
        products: await prisma.product.findMany({
            where,
            orderBy: { id: "asc" },
            select: { id: true, categoryId: true, optionId: true },
        }),
        variants: await prisma.productVariant.findMany({
            where: { product: where },
            orderBy: { id: "asc" },
            select: { id: true, optionValueId: true },
        }),
    };
}

describe("Catalogue settings backfill (#529, DB)", () => {
    const orgIds: string[] = [];

    beforeAll(async () => {
        await prisma.$executeRawUnsafe(
            `DROP INDEX IF EXISTS "Category_organizationId_slug_key"`,
        );
        await prisma.$executeRawUnsafe(
            `DROP INDEX IF EXISTS "ProductOption_organizationId_name_key"`,
        );
        await prisma.$executeRawUnsafe(
            `DROP INDEX IF EXISTS "CatalogueDefaults_organizationId_key_key"`,
        );
    });

    afterAll(async () => {
        await prisma.productVariant.deleteMany({
            where: { product: { organizationId: { in: orgIds } } },
        });
        await prisma.productAllergen.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.contactNoteAllergen.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.product.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.storeAllergen.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.store.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
        for (const sql of PER_BUSINESS_UNIQUE) {
            await prisma.$executeRawUnsafe(sql);
        }
    });

    it("merges two storefronts' settings into the business's, keeps apart what would widen a code, and changes nothing the second time", async () => {
        // ---- One storefront: nothing to merge, nothing moves.
        const one = await business("One", 1);
        orgIds.push(one.orgId);
        const [solo] = one.stores;
        const soloBread = await category(one.orgId, solo.id, "Breads");
        await product(one.orgId, solo.id, "Solo loaf", {
            categoryId: soloBread.id,
        });
        await prisma.productOption.create({
            data: {
                organizationId: one.orgId,
                storeId: solo.id,
                name: "Size",
                values: {
                    create: [{ value: "Small", organizationId: one.orgId }],
                },
            },
        });
        await prisma.storeAllergen.create({
            data: {
                organizationId: one.orgId,
                storeId: solo.id,
                name: "Gluten",
            },
        });
        const oneBefore = await snapshot([one.orgId]);

        // ---- Two storefronts, each with its own "Breads", "Size", "Peanuts".
        const two = await business("Two", 2);
        orgIds.push(two.orgId);
        const [hill, online] = two.stores;
        const hillBreads = await category(two.orgId, hill.id, "Breads");
        const onlineBreads = await category(two.orgId, online.id, "Breads");
        // "Tops" under different parents stays two.
        const women = await category(two.orgId, hill.id, "Women");
        const men = await category(two.orgId, online.id, "Men");
        const womenTops = await category(two.orgId, hill.id, "Tops", women.id);
        const menTops = await category(two.orgId, online.id, "Tops", men.id);

        const hillLoaf = await product(two.orgId, hill.id, "Hill loaf", {
            categoryId: hillBreads.id,
        });
        // An ended code named the online Breads: it can't widen any more.
        const ended = await prisma.discount.create({
            data: {
                organizationId: two.orgId,
                code: `OLD-${tag}`,
                kind: "PERCENTAGE",
                percentBps: 1000,
                appliesTo: "COLLECTION",
                endsAt: at(-30),
                categories: { create: { categoryId: onlineBreads.id } },
            },
        });

        const hillSize = await prisma.productOption.create({
            data: {
                organizationId: two.orgId,
                storeId: hill.id,
                name: "Size",
                values: {
                    create: [
                        {
                            value: "Small",
                            position: 0,
                            organizationId: two.orgId,
                        },
                        {
                            value: "Large",
                            position: 1,
                            organizationId: two.orgId,
                        },
                    ],
                },
            },
            include: { values: true },
        });
        const onlineSize = await prisma.productOption.create({
            data: {
                organizationId: two.orgId,
                storeId: online.id,
                name: "size",
                values: {
                    create: [
                        {
                            value: "large",
                            position: 0,
                            organizationId: two.orgId,
                        },
                        {
                            value: "XL",
                            position: 1,
                            organizationId: two.orgId,
                        },
                    ],
                },
            },
            include: { values: true },
        });
        const onlineLoaf = await product(two.orgId, online.id, "Online loaf", {
            categoryId: onlineBreads.id,
            optionId: onlineSize.id,
        });
        const valueOf = (o: typeof onlineSize, v: string) =>
            o.values.find((x) => x.value === v)?.id ?? "";
        const large = await prisma.productVariant.create({
            data: {
                productId: onlineLoaf.id,
                sku: "OL-L",
                title: "large",
                optionValueId: valueOf(onlineSize, "large"),
            },
        });
        const xl = await prisma.productVariant.create({
            data: {
                productId: onlineLoaf.id,
                sku: "OL-XL",
                title: "XL",
                optionValueId: valueOf(onlineSize, "XL"),
            },
        });

        const hillKeeps = await prisma.productField.create({
            data: {
                organizationId: two.orgId,
                storeId: hill.id,
                name: "Keeps for",
                categories: { create: { categoryId: hillBreads.id } },
            },
        });
        const onlineKeeps = await prisma.productField.create({
            data: {
                organizationId: two.orgId,
                storeId: online.id,
                name: "Keeps for",
                onShop: true,
                categories: { create: { categoryId: onlineBreads.id } },
                values: {
                    create: {
                        productId: onlineLoaf.id,
                        organizationId: two.orgId,
                        value: "3 days",
                    },
                },
            },
        });

        await prisma.catalogueDefaults.createMany({
            data: [
                {
                    organizationId: two.orgId,
                    storeId: hill.id,
                    key: "all",
                    lowStockAlert: 5,
                },
                {
                    organizationId: two.orgId,
                    storeId: online.id,
                    key: "all",
                    lowStockAlert: 9,
                },
                {
                    organizationId: two.orgId,
                    storeId: online.id,
                    key: onlineBreads.id,
                    categoryId: onlineBreads.id,
                    howToUse: "Warm it.",
                },
            ],
        });

        const hillPeanuts = await prisma.storeAllergen.create({
            data: {
                organizationId: two.orgId,
                storeId: hill.id,
                name: "Peanuts",
            },
        });
        const onlinePeanuts = await prisma.storeAllergen.create({
            data: {
                organizationId: two.orgId,
                storeId: online.id,
                name: " peanuts",
            },
        });
        await prisma.productAllergen.create({
            data: {
                organizationId: two.orgId,
                productId: onlineLoaf.id,
                allergenId: onlinePeanuts.id,
                kind: "CONTAINS",
            },
        });
        const contact = await prisma.contact.create({
            data: { organizationId: two.orgId, email: `bf-${tag}@example.com` },
        });
        const note = await prisma.contactNote.create({
            data: {
                organizationId: two.orgId,
                contactId: contact.id,
                body: "Peanut allergy",
                allergens: {
                    create: [
                        {
                            allergenId: hillPeanuts.id,
                            organizationId: two.orgId,
                        },
                        {
                            allergenId: onlinePeanuts.id,
                            organizationId: two.orgId,
                        },
                    ],
                },
            },
        });

        // ---- A live code names Hill Road's Breads: merging would let it
        // reach the online shop's bread.
        const live = await business("Live", 2);
        orgIds.push(live.orgId);
        const liveHill = await category(
            live.orgId,
            live.stores[0].id,
            "Breads",
        );
        const liveOnline = await category(
            live.orgId,
            live.stores[1].id,
            "Breads",
        );
        await prisma.discount.create({
            data: {
                organizationId: live.orgId,
                code: `BREAD-${tag}`,
                kind: "PERCENTAGE",
                percentBps: 1000,
                appliesTo: "COLLECTION",
                categories: { create: { categoryId: liveHill.id } },
            },
        });

        // ================= run =================
        const report = await backfillCatalogueSettings(prisma, at(0));
        const mine = <T extends { organizationId: string }>(rows: T[]) =>
            rows.filter((r) => orgIds.includes(r.organizationId));

        // One storefront: identical ids, nothing changed, nothing reported.
        expect(await snapshot([one.orgId])).toEqual(oneBefore);
        expect(
            [...report.merged, ...report.keptApart, ...report.discarded].some(
                (r) => r.organizationId === one.orgId,
            ),
        ).toBe(false);

        // Two storefronts' Breads are one; everything that named the
        // online one names Hill Road's.
        expect(
            await prisma.category.count({ where: { id: onlineBreads.id } }),
        ).toBe(0);
        expect(
            await prisma.product.findUniqueOrThrow({
                where: { id: onlineLoaf.id },
                select: { categoryId: true, optionId: true },
            }),
        ).toEqual({ categoryId: hillBreads.id, optionId: hillSize.id });
        expect(
            (
                await prisma.product.findUniqueOrThrow({
                    where: { id: hillLoaf.id },
                })
            ).categoryId,
        ).toBe(hillBreads.id);
        expect(
            await prisma.discountCategory.findMany({
                where: { discountId: ended.id },
                select: { categoryId: true },
            }),
        ).toEqual([{ categoryId: hillBreads.id }]);

        // One "Keeps for", asked of Breads, holding the online loaf's value;
        // the online field's "show on shop" is reported, not kept.
        expect(
            await prisma.productField.findMany({
                where: { organizationId: two.orgId },
                select: {
                    id: true,
                    categories: { select: { categoryId: true } },
                    values: { select: { productId: true, value: true } },
                },
            }),
        ).toEqual([
            {
                id: hillKeeps.id,
                categories: [{ categoryId: hillBreads.id }],
                values: [{ productId: onlineLoaf.id, value: "3 days" }],
            },
        ]);
        expect(
            await prisma.productField.count({ where: { id: onlineKeeps.id } }),
        ).toBe(0);

        // Defaults: Hill Road's "all" wins and the online 9 is reported; the
        // online Breads defaults now key Hill Road's Breads.
        expect(
            await prisma.catalogueDefaults.findMany({
                where: { organizationId: two.orgId },
                orderBy: { key: "asc" },
                select: {
                    key: true,
                    categoryId: true,
                    lowStockAlert: true,
                    howToUse: true,
                },
            }),
        ).toEqual(
            [
                {
                    key: "all",
                    categoryId: null,
                    lowStockAlert: 5,
                    howToUse: null,
                },
                {
                    key: hillBreads.id,
                    categoryId: hillBreads.id,
                    lowStockAlert: null,
                    howToUse: "Warm it.",
                },
            ].sort((a, b) => a.key.localeCompare(b.key)),
        );
        expect(mine(report.discarded)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    organizationId: two.orgId,
                    what: "defaults for all products: lowStockAlert",
                    value: "9",
                    from: online.name,
                }),
                expect.objectContaining({
                    organizationId: two.orgId,
                    what: "Keeps for: show on the shop",
                    value: "true",
                }),
            ]),
        );

        // Size: one option with the union of values; the online "large"
        // variant now points at Hill Road's Large, XL moved across.
        const size = await prisma.productOption.findMany({
            where: { organizationId: two.orgId },
            include: { values: { orderBy: { position: "asc" } } },
        });
        expect(size.map((o) => o.id)).toEqual([hillSize.id]);
        expect(size[0].values.map((v) => v.value)).toEqual([
            "Small",
            "Large",
            "XL",
        ]);
        expect(
            await prisma.productVariant.findUniqueOrThrow({
                where: { id: large.id },
                select: { optionValueId: true },
            }),
        ).toEqual({ optionValueId: valueOf(hillSize, "Large") });
        expect(
            await prisma.productVariant.findUniqueOrThrow({
                where: { id: xl.id },
                select: { optionValueId: true },
            }),
        ).toEqual({ optionValueId: valueOf(onlineSize, "XL") });

        // Peanuts: one, on the product and once on the note.
        expect(
            (
                await prisma.storeAllergen.findMany({
                    where: { organizationId: two.orgId },
                    select: { id: true },
                })
            ).map((a) => a.id),
        ).toEqual([hillPeanuts.id]);
        expect(
            await prisma.productAllergen.findMany({
                where: { productId: onlineLoaf.id },
                select: { allergenId: true },
            }),
        ).toEqual([{ allergenId: hillPeanuts.id }]);
        expect(
            await prisma.contactNoteAllergen.findMany({
                where: { noteId: note.id },
                select: { allergenId: true },
            }),
        ).toEqual([{ allergenId: hillPeanuts.id }]);

        // Tops under Women and Tops under Men stay two, told apart by name.
        const tops = await prisma.category.findMany({
            where: { id: { in: [womenTops.id, menTops.id] } },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, slug: true },
        });
        expect(tops).toEqual([
            { id: womenTops.id, name: "Tops", slug: "tops" },
            {
                id: menTops.id,
                name: `Tops (${online.name})`,
                slug: `tops-${online.slug}`,
            },
        ]);
        expect(mine(report.keptApart)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    organizationId: two.orgId,
                    id: menTops.id,
                    reason: "different-parent",
                }),
            ]),
        );

        // The live code still reaches only Hill Road's Breads.
        const liveRows = await prisma.category.findMany({
            where: { organizationId: live.orgId },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, slug: true },
        });
        expect(liveRows).toEqual([
            { id: liveHill.id, name: "Breads", slug: "breads" },
            {
                id: liveOnline.id,
                name: `Breads (${live.stores[1].name})`,
                slug: `breads-${live.stores[1].slug}`,
            },
        ]);
        expect(mine(report.keptApart)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    organizationId: live.orgId,
                    id: liveOnline.id,
                    reason: "live-discount",
                }),
            ]),
        );

        // The per-business unique indexes hold on what is left.
        for (const sql of PER_BUSINESS_UNIQUE) {
            await prisma.$executeRawUnsafe(sql);
        }

        // ================= run again =================
        const before = await snapshot(orgIds);
        const again = await backfillCatalogueSettings(prisma, at(0));
        expect(await snapshot(orgIds)).toEqual(before);
        expect(mine(again.merged)).toEqual([]);
        expect(mine(again.keptApart)).toEqual([]);
        expect(mine(again.discarded)).toEqual([]);
    });
});

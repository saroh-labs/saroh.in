import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { OrgAction } from "../organizations/organization-actions";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ListingsService } from "./listings.service";
import { ProductAccess } from "./product-access";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

/**
 * Duplicate (#518) against a real Postgres: a draft copy with the original's
 * variants, photos and videos (the same media), listings and way of counting
 * stock — at 0 — and a slug and SKUs that never clash with an earlier copy.
 * Needs `store:write`, on the organization route and the storefront alias.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Products: duplicate (DB)", () => {
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const access = new ProductAccess(stores);
    const products = new ProductsService(stores, undefined, access);
    const inventory = new InventoryService(products);
    const variants = new VariantsService(products);
    const listings = new ListingsService();

    const users: Record<string, string> = {};
    let orgId = "";
    let otherOrgId = "";
    let hill = "";
    let online = "";
    let closed = "";

    const ctx = (
        role: OrganizationContext["role"],
        actions?: OrgAction[],
    ): OrganizationContext => ({
        organizationId: orgId,
        userId: users[role] ?? "",
        role,
        ...(actions ? { actions: new Set(actions) } : {}),
    });

    async function storefront(organizationId: string, name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `dup-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId,
                },
            })
        ).id;
    }

    async function media(organizationId: string, name: string, type: string) {
        return (
            await prisma.media.create({
                data: {
                    organizationId,
                    key: `dup/${tag}/${name}`,
                    contentType: type,
                    sizeBytes: 1000,
                    filename: name,
                    status: "READY",
                },
            })
        ).id;
    }

    beforeAll(async () => {
        for (const role of ["OWNER", "MEMBER"]) {
            users[role] = (
                await prisma.user.create({
                    data: {
                        email: `dup-${role.toLowerCase()}-${tag}@example.com`,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `dup-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `dup-else-${tag}` },
            })
        ).id;
        await prisma.membership.createMany({
            data: [
                { organizationId: orgId, userId: users.OWNER, role: "OWNER" },
                { organizationId: orgId, userId: users.MEMBER, role: "MEMBER" },
            ],
        });
        hill = await storefront(orgId, "Hill Road");
        online = await storefront(orgId, "Online");
        closed = await storefront(orgId, "Closed Stall");
    });

    /** "Market Tote" → "MARKETTOTE": each tote's SKUs are its own. */
    const code = (name: string) => name.replace(/\s+/g, "").toUpperCase();

    /** A tote in two sizes, sold at Hill Road and Online, counted per size. */
    async function tote(name: string) {
        const owner = ctx("OWNER");
        const scope = await access.write(owner, undefined, hill);
        const { id } = await products.createIn(scope, {
            name,
            price: "900.00",
            mrp: "1200.00",
            currency: "INR",
            keyPoints: ["Heavy canvas"],
        });
        const small = await variants.createIn(
            await access.write(owner, id),
            id,
            { sku: `${code(name)}-S`, title: "Small", price: "800.00" },
        );
        const large = await variants.createIn(
            await access.write(owner, id),
            id,
            { sku: `${code(name)}-L`, title: "Large" },
        );
        await inventory.setVariantsIn(await access.write(owner, id, hill), id, {
            variants: [
                { variantId: small.id, quantity: 7, lowStockAlert: 2 },
                { variantId: large.id, quantity: 3, lowStockAlert: 1 },
            ],
        });
        // Sold online too, but only in Large.
        await listings.list(orgId, id, online, [large.id]);
        return { id, small: small.id, large: large.id };
    }

    it("makes a draft copy with its variants, media and listings, at 0", async () => {
        const original = await tote("Market Tote");
        // A photo and a video with a poster, all the business's own media;
        // and one row pointing at another business's media, never copied.
        const photo = await media(orgId, "tote.jpg", "image/jpeg");
        const video = await media(orgId, "tote.mp4", "video/mp4");
        const poster = await media(orgId, "poster.jpg", "image/jpeg");
        const foreign = await media(otherOrgId, "theirs.jpg", "image/jpeg");
        const cover = await prisma.productImage.create({
            data: {
                organizationId: orgId,
                productId: original.id,
                url: "https://cdn.example/tote.jpg",
                mediaId: photo,
                alt: "The tote",
                position: 0,
            },
        });
        await prisma.productImage.create({
            data: {
                organizationId: orgId,
                productId: original.id,
                url: "https://cdn.example/tote.mp4",
                mediaId: video,
                position: 1,
                kind: "video",
                durationSec: 12,
                posterMediaId: poster,
                posterUrl: "https://cdn.example/poster.jpg",
            },
        });
        await prisma.productImage.create({
            data: {
                organizationId: orgId,
                productId: original.id,
                url: "https://cdn.example/theirs.jpg",
                mediaId: foreign,
                position: 2,
            },
        });
        await prisma.productVariant.update({
            where: { id: original.large },
            data: { imageId: cover.id },
        });
        await prisma.product.update({
            where: { id: original.id },
            data: { seoImageId: cover.id, status: "PUBLISHED" },
        });
        // Listed at a storefront that has since closed: not copied there.
        await listings.list(orgId, original.id, closed);
        await prisma.store.update({
            where: { id: closed },
            data: { deletedAt: new Date() },
        });

        const copy = await products.duplicateIn(
            await access.write(ctx("OWNER"), original.id),
            original.id,
        );

        expect(copy.id).not.toBe(original.id);
        expect(copy).toMatchObject({
            name: "Market Tote (copy)",
            slug: "market-tote-copy",
            status: "DRAFT",
            archivedAt: null,
            price: "900.00",
            mrp: "1200.00",
            currency: "INR",
            keyPoints: ["Heavy canvas"],
        });
        expect(copy.variants.map((v) => [v.sku, v.title, v.price])).toEqual([
            ["MARKETTOTE-S-copy", "Small", "800.00"],
            ["MARKETTOTE-L-copy", "Large", null],
        ]);

        // The same media, by reference; the foreign row stays behind.
        expect(
            copy.images.map((i) => [i.mediaId, i.kind, i.posterMediaId]),
        ).toEqual([
            [photo, "photo", null],
            [video, "video", poster],
        ]);
        expect(copy.images[1]?.durationSec).toBe(12);
        const [copiedCover] = copy.images;
        expect(copiedCover?.id).not.toBe(cover.id);
        expect(copy.seoImageId).toBe(copiedCover?.id);
        expect(copy.variants[1]?.imageId).toBe(copiedCover?.id);

        // Sold where the original is, the same variants at each.
        const where = await listings.storefronts(orgId, copy.id);
        const at = (storeId: string) =>
            where.find((l) => l.storeId === storeId);
        const [copySmall, copyLarge] = copy.variants;
        expect(at(hill)).toMatchObject({
            listed: true,
            variants: [
                {
                    variantId: copySmall?.id,
                    soldHere: true,
                    stock: { quantity: 0, reserved: 0, lowStockAlert: 2 },
                },
                {
                    variantId: copyLarge?.id,
                    soldHere: true,
                    stock: { quantity: 0, reserved: 0, lowStockAlert: 1 },
                },
            ],
        });
        expect(at(online)).toMatchObject({
            listed: true,
            variants: [
                { variantId: copySmall?.id, soldHere: false, stock: null },
                {
                    variantId: copyLarge?.id,
                    soldHere: true,
                    stock: { quantity: 0, reserved: 0 },
                },
            ],
        });
        expect(
            await prisma.productListing.count({
                where: { productId: copy.id, storeId: closed },
            }),
        ).toBe(0);
        expect(copy.stockMode).toBe("variant");

        // Stock 0, and a shelf at 0 with no entries adds up.
        const shelves = await prisma.stockLevel.findMany({
            where: { productId: copy.id },
            select: { onHand: true, promised: true, variantId: true },
        });
        expect(shelves).toHaveLength(3);
        expect(shelves.every((s) => s.onHand === 0 && s.promised === 0)).toBe(
            true,
        );
        expect(
            await prisma.stockEntry.count({ where: { productId: copy.id } }),
        ).toBe(0);

        // The original is untouched.
        const still = await prisma.product.findUniqueOrThrow({
            where: { id: original.id },
            select: { name: true, status: true, seoImageId: true },
        });
        expect(still).toEqual({
            name: "Market Tote",
            status: "PUBLISHED",
            seoImageId: cover.id,
        });
        expect(
            await prisma.productImage.count({
                where: { productId: original.id },
            }),
        ).toBe(3);
    });

    it("a second copy takes -copy-2, and never clashes", async () => {
        const original = await tote("Beach Tote");
        const owner = ctx("OWNER");
        const first = await products.duplicateIn(
            await access.write(owner, original.id),
            original.id,
        );
        const second = await products.duplicateIn(
            await access.write(owner, original.id),
            original.id,
        );
        expect(first.slug).toBe("beach-tote-copy");
        expect(second.slug).toBe("beach-tote-copy-2");
        expect(second.name).toBe("Beach Tote (copy)");
        expect(second.variants.map((v) => v.sku)).toEqual([
            "BEACHTOTE-S-copy-2",
            "BEACHTOTE-L-copy-2",
        ]);
        // The copy of a copy is named for the copy.
        const third = await products.duplicateIn(
            await access.write(owner, first.id),
            first.id,
        );
        expect(third.slug).toBe("beach-tote-copy-copy");
    });

    it("copies a product without variants, counted as a whole", async () => {
        const scope = await access.write(ctx("OWNER"), undefined, hill);
        const { id } = await products.createIn(scope, {
            name: "Sourdough",
            price: "120.00",
        });
        await inventory.upsertIn(scope, id, { quantity: 8, lowStockAlert: 3 });
        const copy = await products.duplicateIn(
            await access.write(ctx("OWNER"), id),
            id,
        );
        expect(copy.stockMode).toBe("product");
        expect(copy.variants).toEqual([]);
        expect(copy.inventory).toEqual({
            quantity: 0,
            reserved: 0,
            lowStockAlert: 3,
        });
    });

    it("the storefront alias copies too", async () => {
        const original = await tote("Alias Tote");
        const copy = await products.duplicate(hill, original.id, users.OWNER);
        expect(copy.slug).toBe("alias-tote-copy");
        expect(copy.storeId).toBe(hill);
    });

    it("needs store:write: a Member or a stock-only role is refused", async () => {
        const original = await tote("Locked Tote");
        await expect(
            access.write(ctx("MEMBER"), original.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            access.write(
                ctx("MEMBER", ["store:read", "inventory:write"]),
                original.id,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        // The alias refuses as every alias does: not found.
        await expect(
            products.duplicate(hill, original.id, users.MEMBER),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
            await prisma.product.count({
                where: { organizationId: orgId, name: "Locked Tote (copy)" },
            }),
        ).toBe(0);
    });

    it("another business's product is not found", async () => {
        const theirStore = await storefront(otherOrgId, "Their Shop");
        const theirs = await prisma.product.create({
            data: {
                organizationId: otherOrgId,
                storeId: theirStore,
                name: "Their tote",
                slug: `their-tote-${tag}`,
                price: "10.00",
            },
        });
        await expect(
            access.write(ctx("OWNER"), theirs.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            products.duplicateIn(
                {
                    organizationId: orgId,
                    userId: users.OWNER,
                    storeId: hill,
                    canWrite: true,
                    may: () => Promise.resolve(true),
                    canStock: () => Promise.resolve(true),
                },
                theirs.id,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

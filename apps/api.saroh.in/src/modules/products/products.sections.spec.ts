import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { MediaService } from "../media/media.service";
import { StoresService } from "../stores/stores.service";
import { ProductImagesService } from "./product-images.service";
import { ProductOverviewService } from "./product-overview.service";
import { ProductsService } from "./products.service";

/**
 * Products v2 (#461) against a real Postgres: section saves, the photo set,
 * and the product page's overview with its panels. Integration project.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Products v2: sections, photos, overview (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    // The library path is exercised through a stub: a READY object of this
    // org resolves, anything else is not found — MediaService's own spec
    // covers its tenant check.
    let orgId = "";
    const libraryUrl = "https://cdn.example.test/org/lib/rose.jpg";
    const media = {
        readyObject: jest.fn((organizationId: string, mediaId: string) => {
            if (organizationId === orgId && mediaId === mediaRowId) {
                return Promise.resolve({ id: mediaRowId, url: libraryUrl });
            }
            return Promise.reject(
                new NotFoundException("That photo is not in your library"),
            );
        }),
    } as unknown as MediaService;
    const images = new ProductImagesService(products, media);
    const overview = new ProductOverviewService(products, stores);

    let ownerId = "";
    let reviewerId = "";
    let strangerId = "";
    let storeId = "";
    let productId = "";
    let otherProductId = "";
    let mediaRowId = "";

    beforeAll(async () => {
        const mk = async (label: string) =>
            (
                await prisma.user.create({
                    data: { email: `pv2-${label}-${tag}@example.com` },
                })
            ).id;
        ownerId = await mk("owner");
        reviewerId = await mk("reviewer");
        strangerId = await mk("stranger");
        orgId = (
            await prisma.organization.create({
                data: { name: "PV2 Org", slug: `pv2-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "PV2 Store",
                slug: `pv2-${tag}`,
            })
        ).id;
        await prisma.membership.createMany({
            data: [
                { organizationId: orgId, userId: ownerId, role: "OWNER" },
                { organizationId: orgId, userId: reviewerId, role: "REVIEWER" },
            ],
        });
        // The reviewer can open the store (legacy read grant) but their
        // business role reads neither orders nor reviews.
        await prisma.storeMembers.create({
            data: { storeId, userId: reviewerId, role: "VIEWER" },
        });
        productId = (
            await products.create(storeId, ownerId, {
                name: "Rose Hydra Serum",
                price: "799",
                mrp: "999",
                currency: "INR",
            })
        ).id;
        otherProductId = (
            await products.create(storeId, ownerId, {
                name: "Night Cream",
                slug: "night-cream",
                price: "650",
                currency: "INR",
            })
        ).id;
        mediaRowId = (
            await prisma.media.create({
                data: {
                    organizationId: orgId,
                    key: `org/${orgId}/lib-${tag}.jpg`,
                    contentType: "image/jpeg",
                    sizeBytes: 1000,
                    filename: "lib.jpg",
                    status: "READY",
                },
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.media.deleteMany({ where: { organizationId: orgId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.membership.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({
            where: { id: { in: [ownerId, reviewerId, strangerId] } },
        });
    });

    describe("section saves", () => {
        it("saves SEO alone and leaves price and address untouched", async () => {
            const after = await products.patch(storeId, productId, ownerId, {
                seoTitle: "Rose serum for dry skin",
                seoDescription: "A light serum with rose water.",
            });
            expect(after.seoTitle).toBe("Rose serum for dry skin");
            expect(after.price).toBe("799.00");
            expect(after.mrp).toBe("999.00");
            expect(after.slug).toBe("rose-hydra-serum");
        });

        it("refuses an MRP below the stored price, and a price above the stored MRP", async () => {
            await expect(
                products.patch(storeId, productId, ownerId, { mrp: "700" }),
            ).rejects.toThrow(BadRequestException);
            await expect(
                products.patch(storeId, productId, ownerId, { price: "1200" }),
            ).rejects.toThrow(/MRP/);
            const still = await products.get(storeId, productId, ownerId);
            expect(still.price).toBe("799.00");
        });

        it("clears the MRP with null", async () => {
            const after = await products.patch(
                storeId,
                otherProductId,
                ownerId,
                {
                    mrp: "800",
                },
            );
            expect(after.mrp).toBe("800.00");
            const cleared = await products.patch(
                storeId,
                otherProductId,
                ownerId,
                {
                    mrp: null,
                },
            );
            expect(cleared.mrp).toBeNull();
        });

        it("refuses an address another product uses, with the field named", async () => {
            await expect(
                products.patch(storeId, productId, ownerId, {
                    slug: "night-cream",
                }),
            ).rejects.toMatchObject({
                response: { field: "slug" },
            });
            await expect(
                products.patch(storeId, productId, ownerId, {
                    slug: "night-cream",
                }),
            ).rejects.toThrow(ConflictException);
        });

        it("judges details against what is stored", async () => {
            await expect(
                products.patch(storeId, productId, ownerId, {
                    madeHere: false,
                }),
            ).rejects.toThrow(/who makes it/);
            const after = await products.patch(storeId, productId, ownerId, {
                madeHere: false,
                maker: "Kama Labs",
                madeIn: "Pune, India",
                keyPoints: [" Rose water ", "", "Hyaluronic acid"],
                shopFields: { howToUse: true, maker: false },
            });
            expect(after.maker).toBe("Kama Labs");
            expect(after.keyPoints).toEqual(["Rose water", "Hyaluronic acid"]);
            expect(after.shopFields).toEqual({ howToUse: true, maker: false });
            await expect(
                products.patch(storeId, productId, ownerId, {
                    returnsMode: "OWN",
                }),
            ).rejects.toThrow(/returns rule/);
        });

        it("merges the shop switches each section sends", async () => {
            // Two sections saved one after the other — Save all — each
            // sending only its own switches.
            await products.patch(storeId, productId, ownerId, {
                shopFields: { warranty: false },
            });
            const after = await products.patch(storeId, productId, ownerId, {
                shopFields: { materials: false },
            });
            expect(after.shopFields).toMatchObject({
                warranty: false,
                materials: false,
            });
        });

        it("sanitises the description", async () => {
            const after = await products.patch(storeId, productId, ownerId, {
                description:
                    "<p>Soft <strong>glow</strong></p><script>alert(1)</script>",
            });
            expect(after.description).toBe("<p>Soft <strong>glow</strong></p>");
        });

        it("hides another store's product", async () => {
            await expect(
                products.patch(storeId, productId, strangerId, { name: "x" }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe("archiving and the option (#485)", () => {
        it("stamps when it was archived, and clears it when it leaves", async () => {
            const archived = await products.patch(storeId, productId, ownerId, {
                status: "ARCHIVED",
            });
            expect(archived.archivedAt).toBeInstanceOf(Date);
            const back = await products.patch(storeId, productId, ownerId, {
                status: "DRAFT",
            });
            expect(back.archivedAt).toBeNull();
        });

        it("refuses a new option while variants exist, and allows it without", async () => {
            const volume = await prisma.productOption.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    name: "Volume",
                    position: 0,
                },
            });
            const shade = await prisma.productOption.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    name: "Shade",
                    position: 1,
                },
            });
            const lone = await products.create(storeId, ownerId, {
                name: "Option test",
                price: "100",
                currency: "INR",
            });
            // No variants: any option may be chosen.
            await products.patch(storeId, lone.id, ownerId, {
                optionId: volume.id,
            });
            await prisma.productVariant.create({
                data: {
                    productId: lone.id,
                    sku: `OPT-${Date.now()}`,
                    title: "15 ml",
                },
            });
            await expect(
                products.patch(storeId, lone.id, ownerId, {
                    optionId: shade.id,
                }),
            ).rejects.toThrow(
                "Remove the variants first to sell it by shade instead.",
            );
            // The same option again is not a change.
            await expect(
                products.patch(storeId, lone.id, ownerId, {
                    optionId: volume.id,
                }),
            ).resolves.toMatchObject({ optionId: volume.id });
            await prisma.product.delete({ where: { id: lone.id } });
            await prisma.productOption.deleteMany({
                where: { id: { in: [volume.id, shade.id] } },
            });
        });
    });

    describe("the photo set", () => {
        const url = (n: number) => `https://images.example.test/rose-${n}.jpg`;

        it("saves in order, mirrors the cover, and refuses a sixth", async () => {
            const set = await images.replace(storeId, productId, ownerId, {
                images: [1, 2, 3].map((n) => ({
                    url: url(n),
                    alt: `Rose ${n}`,
                })),
            });
            expect(set.map((i) => i.position)).toEqual([0, 1, 2]);
            const cover = await prisma.product.findUniqueOrThrow({
                where: { id: productId },
                select: { image: true },
            });
            expect(cover.image).toBe(url(1));

            await expect(
                images.replace(storeId, productId, ownerId, {
                    images: [1, 2, 3, 4, 5, 6].map((n) => ({ url: url(n) })),
                }),
            ).rejects.toThrow(/5 photos at most/);
        });

        it("moves a photo to the front, keeping its alt text", async () => {
            const current = await images.list(storeId, productId, ownerId);
            const [first, second, third] = current;
            const moved = await images.replace(storeId, productId, ownerId, {
                images: [{ id: third.id }, { id: first.id }, { id: second.id }],
            });
            expect(moved[0]).toMatchObject({
                id: third.id,
                alt: "Rose 3",
                position: 0,
            });
            const cover = await prisma.product.findUniqueOrThrow({
                where: { id: productId },
                select: { image: true },
            });
            expect(cover.image).toBe(url(3));
        });

        it("takes a library photo off without touching the library", async () => {
            const withLibrary = await images.replace(
                storeId,
                productId,
                ownerId,
                {
                    images: [{ mediaId: mediaRowId, alt: "From the library" }],
                },
            );
            expect(withLibrary[0].url).toBe(libraryUrl);

            await images.replace(storeId, productId, ownerId, { images: [] });
            expect(
                await prisma.media.count({ where: { id: mediaRowId } }),
            ).toBe(1);
            const cover = await prisma.product.findUniqueOrThrow({
                where: { id: productId },
                select: { image: true },
            });
            expect(cover.image).toBeNull();
        });

        it("refuses another organization's library object", async () => {
            await expect(
                images.replace(storeId, productId, ownerId, {
                    images: [{ mediaId: "someone-elses" }],
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it("clears the sharing image when its photo is taken off", async () => {
            const [photo] = await images.replace(storeId, productId, ownerId, {
                images: [{ url: url(7) }, { url: url(8) }],
            });
            await products.patch(storeId, productId, ownerId, {
                seoImageId: photo.id,
            });
            await expect(
                products.patch(storeId, otherProductId, ownerId, {
                    seoImageId: photo.id,
                }),
            ).rejects.toThrow(/this product's photos/);
            const rest = (await images.list(storeId, productId, ownerId)).slice(
                1,
            );
            await images.replace(storeId, productId, ownerId, {
                images: rest.map((i) => ({ id: i.id })),
            });
            const after = await products.get(storeId, productId, ownerId);
            expect(after.seoImageId).toBeNull();
        });
    });

    describe("the overview", () => {
        it("shows the price range, saving and every panel to the owner", async () => {
            const view = await overview.get(storeId, productId, ownerId);
            expect(view.price).toEqual({
                min: "799.00",
                max: "799.00",
                mrp: "999.00",
                savingPercent: 20,
            });
            expect(view.canWrite).toBe(true);
            expect(view.orders.status).toBe("ok");
            expect(view.reviews).toMatchObject({
                status: "ok",
                data: { summary: { count: 0, average: null } },
            });
            expect(view.discounts.status).toBe("ok");
        });

        it("leaves out orders and reviews for a role that cannot read them", async () => {
            const view = await overview.get(storeId, productId, reviewerId);
            expect(view.canWrite).toBe(false);
            expect(view.orders).toEqual({ status: "forbidden" });
            expect(view.reviews).toEqual({ status: "forbidden" });
        });

        it("marks only the orders panel failed when orders cannot be read", async () => {
            // The orders read is the one that fails; everything else is real.
            const spy = jest
                .spyOn(
                    overview as unknown as { orders: () => Promise<unknown> },
                    "orders",
                )
                .mockRejectedValueOnce(new Error("connection dropped"));
            try {
                const view = await overview.get(storeId, productId, ownerId);
                expect(view.orders).toEqual({ status: "failed" });
                expect(view.reviews.status).toBe("ok");
                expect(view.product.id).toBe(productId);
            } finally {
                spy.mockRestore();
            }
        });

        it("is not found for someone outside the store", async () => {
            await expect(
                overview.get(storeId, productId, strangerId),
            ).rejects.toThrow(NotFoundException);
        });
    });
});

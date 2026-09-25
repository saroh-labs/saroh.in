import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ListingsService } from "./listings.service";
import { ProductAccess } from "./product-access";
import { ProductOverviewService } from "./product-overview.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

/**
 * The organization routes and the old storefront routes (#531): one
 * organization-scoped service behind both. The organization route reads the
 * business's catalogue — one row per product, with where it is sold — and a
 * storefront names only which shelf to read. The storefront route is an
 * alias: it needs a listing at `:storeId`, so a product of another business
 * (never listed there) is not found.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Products: organization routes and storefront aliases (DB)", () => {
    // The organization path is on for these businesses.
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const access = new ProductAccess(stores);
    const products = new ProductsService(stores, undefined, access);
    const overview = new ProductOverviewService(products);
    const inventory = new InventoryService(products);
    const variants = new VariantsService(products);
    const listings = new ListingsService();

    const users: Record<string, string> = {};
    let orgId = "";
    let hill = "";
    let online = "";
    let otherOrgId = "";
    let otherStore = "";
    let otherProduct = "";

    const ctx = (role: OrganizationContext["role"]): OrganizationContext => ({
        organizationId: orgId,
        userId: users[role] ?? "",
        role,
    });

    async function storefront(organizationId: string, name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `al-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId,
                },
            })
        ).id;
    }

    beforeAll(async () => {
        for (const role of ["OWNER", "MEMBER", "REVIEWER", "STRANGER"]) {
            users[role] = (
                await prisma.user.create({
                    data: {
                        email: `al-${role.toLowerCase()}-${tag}@example.com`,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `al-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `al-else-${tag}` },
            })
        ).id;
        await prisma.membership.createMany({
            data: [
                { organizationId: orgId, userId: users.OWNER, role: "OWNER" },
                { organizationId: orgId, userId: users.MEMBER, role: "MEMBER" },
                {
                    organizationId: orgId,
                    userId: users.REVIEWER,
                    role: "REVIEWER",
                },
                {
                    organizationId: otherOrgId,
                    userId: users.STRANGER,
                    role: "OWNER",
                },
            ],
        });
        hill = await storefront(orgId, "Hill Road");
        online = await storefront(orgId, "Online");
        otherStore = await storefront(otherOrgId, "Elsewhere");
        otherProduct = (
            await products.create(otherStore, users.STRANGER, {
                name: "Their loaf",
                price: "90.00",
            })
        ).id;
    });

    it("the list is one row per catalogue product, with where it is sold", async () => {
        const scope = await access.write(ctx("OWNER"), undefined, hill);
        const { id } = await products.createIn(scope, {
            name: "Sourdough",
            price: "120.00",
        });
        await inventory.upsertIn(scope, id, { quantity: 8, lowStockAlert: 3 });
        await listings.list(orgId, id, online);
        await inventory.upsertIn(
            await access.write(ctx("OWNER"), id, online),
            id,
            { quantity: 4, lowStockAlert: 2 },
        );
        const onlyHill = (
            await products.createIn(scope, { name: "Rye", price: "80.00" })
        ).id;

        const all = await products.catalogue(orgId);
        const row = all.find((p) => p.id === id);
        expect(all.filter((p) => p.id === id)).toHaveLength(1);
        expect(row).toMatchObject({
            name: "Sourdough",
            inventory: { quantity: 12, lowStockAlert: 2 },
            listings: [
                {
                    storeId: hill,
                    storeName: "Hill Road",
                    inventory: { quantity: 8, lowStockAlert: 3 },
                },
                {
                    storeId: online,
                    storeName: "Online",
                    inventory: { quantity: 4, lowStockAlert: 2 },
                },
            ],
        });
        // Never another business's products.
        expect(all.some((p) => p.id === otherProduct)).toBe(false);

        // The storefront filter filters by listing, and reads that shelf.
        const atOnline = await products.catalogue(orgId, {
            storefront: online,
        });
        expect(atOnline.map((p) => p.id)).toEqual([id]);
        expect(atOnline[0]).toMatchObject({
            storeId: online,
            inventory: { quantity: 4, lowStockAlert: 2 },
        });
        expect(
            (await products.catalogue(orgId, { storefront: hill })).map(
                (p) => p.id,
            ),
        ).toEqual([onlyHill, id]);
        await expect(
            products.catalogue(orgId, { storefront: otherStore }),
        ).rejects.toThrow(NotFoundException);
    });

    it("a one-storefront view reads the same through the alias and the organization route", async () => {
        const { id } = await products.create(hill, users.OWNER, {
            name: "Seeded batch",
            price: "150.00",
        });
        await inventory.upsert(hill, id, users.OWNER, { quantity: 5 });

        const viaStore = await products.get(hill, id, users.OWNER);
        const viaOrg = await products.getIn(
            await access.read(ctx("OWNER"), id, hill),
            id,
        );
        expect(viaOrg).toEqual(viaStore);
        // Unnamed, the organization route reads the first storefront selling it.
        const unnamed = await products.getIn(
            await access.read(ctx("OWNER"), id),
            id,
        );
        expect(unnamed.storeId).toBe(hill);
        expect(unnamed.inventory).toMatchObject({ quantity: 5 });

        const page = await overview.getIn(
            await access.read(ctx("OWNER"), id),
            id,
        );
        expect(page.storefront).toEqual({ id: hill, name: "Hill Road" });
        expect(page.canWrite).toBe(true);
        expect((await overview.get(hill, id, users.OWNER)).product).toEqual(
            page.product,
        );
    });

    it("an alias needs a listing at its storefront", async () => {
        const { id } = await products.create(hill, users.OWNER, {
            name: "Hill only",
            price: "60.00",
        });
        await expect(products.get(online, id, users.OWNER)).rejects.toThrow(
            NotFoundException,
        );
        await expect(
            inventory.upsert(online, id, users.OWNER, { quantity: 1 }),
        ).rejects.toThrow(NotFoundException);
        // The organization route reads the catalogue product at any of the
        // business's storefronts; there it is not sold.
        const there = await products.getIn(
            await access.read(ctx("OWNER"), id, online),
            id,
        );
        expect(there).toMatchObject({ id, storeId: online, inventory: null });
    });

    it("another business's product through this business's storefront is not found", async () => {
        await expect(
            products.get(hill, otherProduct, users.OWNER),
        ).rejects.toThrow(NotFoundException);
        await expect(
            products.patch(hill, otherProduct, users.OWNER, { name: "Mine" }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            products.remove(hill, otherProduct, users.OWNER),
        ).rejects.toThrow(NotFoundException);
        await expect(
            inventory.upsert(hill, otherProduct, users.OWNER, { quantity: 1 }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            variants.list(hill, otherProduct, users.OWNER),
        ).rejects.toThrow(NotFoundException);
        await expect(
            overview.get(hill, otherProduct, users.OWNER),
        ).rejects.toThrow(NotFoundException);
        // Nor on the organization route, or with another business's storefront.
        await expect(access.read(ctx("OWNER"), otherProduct)).rejects.toThrow(
            NotFoundException,
        );
        await expect(access.write(ctx("OWNER"), otherProduct)).rejects.toThrow(
            NotFoundException,
        );
        await expect(
            access.read(ctx("OWNER"), undefined, otherStore),
        ).rejects.toThrow(NotFoundException);
        // Untouched.
        expect(
            await prisma.product.findUniqueOrThrow({
                where: { id: otherProduct },
                select: { name: true },
            }),
        ).toEqual({ name: "Their loaf" });
    });

    it("roles on the organization route: a Member reads, a Reviewer does not", async () => {
        const { id } = await products.create(hill, users.OWNER, {
            name: "Role check",
            price: "10.00",
        });
        const member = await access.read(ctx("MEMBER"), id);
        expect(member.canWrite).toBe(false);
        expect((await products.getIn(member, id)).name).toBe("Role check");
        await expect(access.write(ctx("MEMBER"), id)).rejects.toThrow(
            ForbiddenException,
        );
        expect(() => access.writeBusiness(ctx("MEMBER"))).toThrow(
            ForbiddenException,
        );
        await expect(access.read(ctx("REVIEWER"), id)).rejects.toThrow(
            ForbiddenException,
        );
        expect(() => access.business(ctx("REVIEWER"))).toThrow(
            ForbiddenException,
        );
    });

    it("a new product with several storefronts names where it is sold", async () => {
        await expect(access.write(ctx("OWNER"))).rejects.toThrow(
            BadRequestException,
        );
        const scope = await access.write(ctx("OWNER"), undefined, online);
        const { id } = await products.createIn(scope, {
            name: "Online special",
            price: "40.00",
        });
        const sold = await prisma.productListing.findMany({
            where: { productId: id },
            select: { storeId: true },
        });
        expect(sold).toEqual([{ storeId: online }]);
    });

    it("the legacy inventory PUT through the alias still sets the StockLevel", async () => {
        const { id } = await products.create(hill, users.OWNER, {
            name: "Counted",
            price: "20.00",
        });
        await inventory.upsert(hill, id, users.OWNER, { quantity: 7 });
        expect(
            await prisma.stockLevel.findFirstOrThrow({
                where: { storeId: hill, productId: id, variantId: null },
                select: { onHand: true },
            }),
        ).toEqual({ onHand: 7 });
    });

    // U4 (#513) adds the stock log; then the alias's inventory PUT routes
    // through the stock module and writes exactly one "Counted" entry.
    it.todo("a stock write through the alias writes one StockEntry (U4, #513)");
});

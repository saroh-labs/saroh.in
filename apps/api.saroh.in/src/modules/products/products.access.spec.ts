import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CatalogueAccess } from "../catalogue/catalogue-access";
import { CatalogueService } from "../catalogue/catalogue.service";
import { OptionsService } from "../catalogue/options.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ProductOverviewService } from "./product-overview.service";
import { ProductsService } from "./products.service";

/**
 * Who may do what in the products area (#464), on the organization path:
 * the business role decides. A Member reads products and settings and
 * changes nothing; a Reviewer does not open products at all; an Admin
 * changes them. A refusal is "not found", never a hint the store exists.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("products area access by role (DB)", () => {
    // The organization path is on for this business.
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const products = new ProductsService(stores);
    const overview = new ProductOverviewService(products);
    const inventory = new InventoryService(products);
    const options = new OptionsService();
    const catalogue = new CatalogueService(options);
    const access = new CatalogueAccess(stores);
    // The settings through the storefront's address, as the app reads them.
    const settingsVia = async (userId: string) => {
        const scope = await access.readViaStore(storeId, userId);
        return catalogue.get(scope.organizationId, scope.canWrite);
    };

    const users: Record<string, string> = {};
    let orgId = "";
    let storeId = "";
    let productId = "";

    beforeAll(async () => {
        for (const role of ["OWNER", "ADMIN", "MEMBER", "REVIEWER"]) {
            users[role] = (
                await prisma.user.create({
                    data: {
                        email: `acc-${role.toLowerCase()}-${tag}@example.com`,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Access Org", slug: `acc-org-${tag}` },
            })
        ).id;
        await prisma.membership.createMany({
            data: Object.entries(users).map(([role, userId]) => ({
                organizationId: orgId,
                userId,
                role,
            })),
        });
        storeId = (
            await stores.createForUser(users.OWNER, orgId, {
                name: "Access Store",
                slug: `acc-${tag}`,
            })
        ).id;
        productId = (
            await products.create(storeId, users.OWNER, {
                name: "Ceramide Moisturiser",
                price: "899",
                currency: "INR",
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.membership.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({
            where: { id: { in: Object.values(users) } },
        });
    });

    it("a Member reads the product page and the settings", async () => {
        const view = await overview.get(storeId, productId, users.MEMBER);
        expect(view.canWrite).toBe(false);
        const settings = await settingsVia(users.MEMBER);
        expect(settings.canWrite).toBe(false);
    });

    it("a Member changes nothing", async () => {
        await expect(
            products.patch(storeId, productId, users.MEMBER, { name: "x" }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            inventory.upsert(storeId, productId, users.MEMBER, { quantity: 3 }),
        ).rejects.toThrow(NotFoundException);
        // Settings say why (#529): the Member can see them, not change them.
        await expect(
            access
                .writeViaStore(storeId, users.MEMBER)
                .then((org) => options.create(org, { name: "Shade" })),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            access.writeViaStore(storeId, users.MEMBER).then((org) =>
                catalogue.saveDefaults(org, {
                    entries: [{ key: "all", lowStockAlert: 5 }],
                }),
            ),
        ).rejects.toThrow(ForbiddenException);
    });

    it("a Reviewer does not open products", async () => {
        await expect(
            overview.get(storeId, productId, users.REVIEWER),
        ).rejects.toThrow(NotFoundException);
        await expect(settingsVia(users.REVIEWER)).rejects.toThrow(
            NotFoundException,
        );
    });

    it("an Admin changes products and settings", async () => {
        const after = await products.patch(storeId, productId, users.ADMIN, {
            mrp: "999",
        });
        expect(after.mrp).toBe("999.00");
        const created = await options.create(
            await access.writeViaStore(storeId, users.ADMIN),
            {
                name: "Size",
                values: ["50 ml"],
            },
        );
        expect(created.id).toBeTruthy();
        const view = await overview.get(storeId, productId, users.ADMIN);
        expect(view.canWrite).toBe(true);
    });

    // #531: the organization route asks the same role, and says why.
    it("on the organization route: a Member reads and is told no; an Admin changes", async () => {
        const as = (role: "MEMBER" | "ADMIN" | "REVIEWER") => ({
            organizationId: orgId,
            userId: users[role] ?? "",
            role,
        });
        const member = await products.access.read(as("MEMBER"), productId);
        expect((await overview.getIn(member, productId)).canWrite).toBe(false);
        await expect(
            products.access.write(as("MEMBER"), productId),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            products.access.read(as("REVIEWER"), productId),
        ).rejects.toThrow(ForbiddenException);
        const admin = await products.access.write(as("ADMIN"), productId);
        const after = await products.patchIn(admin, productId, {
            howToUse: "Twice a day",
        });
        expect(after.howToUse).toBe("Twice a day");
        await inventory.upsertIn(admin, productId, { quantity: 4 });
        expect((await inventory.getIn(member, productId)).quantity).toBe(4);
    });
});

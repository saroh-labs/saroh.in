import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";

import { slugify } from "./slug";
import { StoresService } from "./stores.service";

describe("slugify", () => {
    it("normalizes a name into a url-safe slug", () => {
        expect(slugify("My Blog!")).toBe("my-blog");
        expect(slugify("  Hello   World  ")).toBe("hello-world");
        expect(slugify("Cafe_Deja Vu")).toBe("cafe-deja-vu");
    });

    it("returns empty for punctuation-only input", () => {
        expect(slugify("!!!")).toBe("");
    });
});

// Integration against the dev DB. Creates two throwaway users and cleans up.
const emailA = `api-test-a-${process.pid}@example.com`;
const emailB = `api-test-b-${process.pid}@example.com`;
const slugPrefix = `apitest-${process.pid}`;

describe("StoresService (dev DB)", () => {
    // Flag is unseeded in the test DB → isEnabled resolves false → legacy path.
    const service = new StoresService(new FeatureFlagService());
    let userA = "";
    let userB = "";
    let orgId = "";
    // A second business, for a slug clash that is not also a second storefront.
    let otherOrgId = "";
    const createdStoreIds: string[] = [];

    beforeAll(async () => {
        userA = (await prisma.user.create({ data: { email: emailA } })).id;
        userB = (await prisma.user.create({ data: { email: emailB } })).id;
        orgId = (
            await prisma.organization.create({
                data: {
                    name: "Stores Test Org",
                    slug: `${slugPrefix}-org`,
                },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: {
                    name: "Stores Test Org Two",
                    slug: `${slugPrefix}-org-two`,
                },
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.storeOwner.deleteMany({
            where: { storeId: { in: createdStoreIds } },
        });
        await prisma.store.deleteMany({
            where: { id: { in: createdStoreIds } },
        });
        await prisma.organization.deleteMany({
            where: { id: { in: [orgId, otherOrgId] } },
        });
        await prisma.user.deleteMany({
            where: { email: { in: [emailA, emailB] } },
        });
        await prisma.$disconnect();
    });

    it("creates a store + OWNER atomically", async () => {
        const res = await service.createForUser(userA, orgId, {
            name: "My Blog",
            slug: `${slugPrefix}-blog`,
        });
        createdStoreIds.push(res.id);
        expect(await service.isOwner(res.id, userA)).toBe(true);
        expect(await service.isOwner(res.id, userB)).toBe(false);
    });

    it("adds a second storefront to the same business (ADR-010)", async () => {
        const res = await service.createForUser(userA, orgId, {
            name: "Second shop",
            slug: `${slugPrefix}-second`,
        });
        createdStoreIds.push(res.id);
        expect(
            await prisma.store.count({ where: { organizationId: orgId } }),
        ).toBe(2);
    });

    it("stops at the plan's storefronts, with a 403", async () => {
        // Five on the free floor: three more fill it, the sixth is refused.
        for (const n of [3, 4, 5]) {
            const res = await service.createForUser(userA, orgId, {
                name: `Shop ${n}`,
                slug: `${slugPrefix}-shop-${n}`,
            });
            createdStoreIds.push(res.id);
        }
        await expect(
            service.createForUser(userA, orgId, {
                name: "Shop 6",
                slug: `${slugPrefix}-shop-6`,
            }),
        ).rejects.toMatchObject({
            status: 403,
            response: { message: expect.stringMatching(/5 storefronts/) },
        });
        expect(
            await prisma.store.count({ where: { organizationId: orgId } }),
        ).toBe(5);
    });

    it("rejects a taken slug and creates nothing", async () => {
        const slug = `${slugPrefix}-blog`;
        await expect(
            service.createForUser(userB, otherOrgId, { name: "Dup", slug }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await prisma.store.count({ where: { slug } })).toBe(1);
        expect(
            await prisma.store.count({ where: { organizationId: otherOrgId } }),
        ).toBe(0);
    });

    it("lists only the user's owned stores", async () => {
        const aStores = await service.listForUser(userA);
        const bStores = await service.listForUser(userB);
        const aIds = aStores.map((s) => s.id);
        for (const id of createdStoreIds) expect(aIds).toContain(id);
        expect(bStores.some((s) => createdStoreIds.includes(s.id))).toBe(false);
    });

    it("denies a non-owner read and write", async () => {
        const id = createdStoreIds[0];
        await expect(service.getForUser(id, userB)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.getForUser(id, userA)).resolves.not.toBeNull();
        await expect(
            service.updateForUser(userB, id, {
                name: "Hacked",
                slug: `${slugPrefix}-hacked`,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("an owner can update core fields", async () => {
        const id = createdStoreIds[0];
        await service.updateForUser(userA, id, {
            name: "My Blog",
            slug: `${slugPrefix}-blog`,
            description: "Updated desc",
        });
        const store = await service.getForUser(id, userA);
        expect(store.description).toBe("Updated desc");
    });
});

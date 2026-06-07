import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

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
    const service = new StoresService();
    let userA = "";
    let userB = "";
    const createdStoreIds: string[] = [];

    beforeAll(async () => {
        userA = (await prisma.user.create({ data: { email: emailA } })).id;
        userB = (await prisma.user.create({ data: { email: emailB } })).id;
    });

    afterAll(async () => {
        await prisma.storeOwner.deleteMany({
            where: { storeId: { in: createdStoreIds } },
        });
        await prisma.store.deleteMany({
            where: { id: { in: createdStoreIds } },
        });
        await prisma.user.deleteMany({
            where: { email: { in: [emailA, emailB] } },
        });
        await prisma.$disconnect();
    });

    it("creates a store + OWNER atomically", async () => {
        const res = await service.createForUser(userA, {
            name: "My Blog",
            slug: `${slugPrefix}-blog`,
        });
        createdStoreIds.push(res.id);
        expect(await service.isOwner(res.id, userA)).toBe(true);
        expect(await service.isOwner(res.id, userB)).toBe(false);
    });

    it("rejects a taken slug and creates nothing", async () => {
        const slug = `${slugPrefix}-dup`;
        const first = await service.createForUser(userA, {
            name: "Dup",
            slug,
        });
        createdStoreIds.push(first.id);
        await expect(
            service.createForUser(userB, { name: "Dup Two", slug }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await prisma.store.count({ where: { slug } })).toBe(1);
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

import { prisma } from "@saroh/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    createStoreForUser,
    getStoreForOwner,
    isStoreOwner,
    listStoresForUser,
    updateStoreForUser,
} from "./service";
import { slugify } from "./slug";

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
const emailA = `app-test-a-${process.pid}@example.com`;
const emailB = `app-test-b-${process.pid}@example.com`;
const slugPrefix = `apptest-${process.pid}`;
let userA = "";
let userB = "";
const createdStoreIds: string[] = [];

describe("store service (dev DB)", () => {
    beforeAll(async () => {
        userA = (await prisma.user.create({ data: { email: emailA } })).id;
        userB = (await prisma.user.create({ data: { email: emailB } })).id;
    });

    afterAll(async () => {
        await prisma.storeOwner.deleteMany({
            where: { storeId: { in: createdStoreIds } },
        });
        await prisma.store.deleteMany({ where: { id: { in: createdStoreIds } } });
        await prisma.user.deleteMany({
            where: { email: { in: [emailA, emailB] } },
        });
        await prisma.$disconnect();
    });

    it("creates a store + OWNER atomically", async () => {
        const res = await createStoreForUser(userA, {
            name: "My Blog",
            slug: `${slugPrefix}-blog`,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        createdStoreIds.push(res.data.id);
        expect(await isStoreOwner(res.data.id, userA)).toBe(true);
        expect(await isStoreOwner(res.data.id, userB)).toBe(false);
    });

    it("rejects a taken slug and creates nothing", async () => {
        const slug = `${slugPrefix}-dup`;
        const first = await createStoreForUser(userA, { name: "Dup", slug });
        if (first.ok) createdStoreIds.push(first.data.id);
        const second = await createStoreForUser(userB, { name: "Dup Two", slug });
        expect(second.ok).toBe(false);
        if (!second.ok) expect(second.field).toBe("slug");
        expect(await prisma.store.count({ where: { slug } })).toBe(1);
    });

    it("lists only the user's owned stores", async () => {
        const aStores = await listStoresForUser(userA);
        const bStores = await listStoresForUser(userB);
        const aIds = aStores.map((s) => s.id);
        for (const id of createdStoreIds) expect(aIds).toContain(id);
        expect(bStores.some((s) => createdStoreIds.includes(s.id))).toBe(false);
    });

    it("denies a non-owner read and write", async () => {
        const id = createdStoreIds[0];
        expect(await getStoreForOwner(id, userB)).toBeNull();
        expect(await getStoreForOwner(id, userA)).not.toBeNull();
        const res = await updateStoreForUser(userB, id, {
            name: "Hacked",
            slug: `${slugPrefix}-hacked`,
        });
        expect(res.ok).toBe(false);
    });

    it("an owner can update core fields", async () => {
        const id = createdStoreIds[0];
        const res = await updateStoreForUser(userA, id, {
            name: "My Blog",
            slug: `${slugPrefix}-blog`,
            description: "Updated desc",
        });
        expect(res.ok).toBe(true);
        const store = await getStoreForOwner(id, userA);
        expect(store?.description).toBe("Updated desc");
    });
});

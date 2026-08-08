import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { PostCategoriesService } from "./post-categories.service";
import { PostsService } from "./posts.service";

// Integration against the dev DB. Creates throwaway users + a store, cleans up.
const ownerEmail = `post-owner-${process.pid}@example.com`;
const memberEmail = `post-member-${process.pid}@example.com`;
const strangerEmail = `post-stranger-${process.pid}@example.com`;

describe("Content: posts & categories (dev DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const posts = new PostsService(stores);
    const categories = new PostCategoriesService(stores);

    let ownerId = "";
    let memberId = "";
    let strangerId = "";
    let storeId = "";
    let categoryId = "";
    let orgId = "";

    beforeAll(async () => {
        ownerId = (await prisma.user.create({ data: { email: ownerEmail } }))
            .id;
        memberId = (
            await prisma.user.create({
                data: { email: memberEmail, name: "Mem Ber" },
            })
        ).id;
        strangerId = (
            await prisma.user.create({ data: { email: strangerEmail } })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: {
                    name: "Content Test Org",
                    slug: `content-org-${process.pid}`,
                },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Content Test",
                slug: `content-${process.pid}`,
            })
        ).id;
        // A staff member with write access — used to verify author resolution.
        await prisma.storeMembers.create({
            data: { storeId, userId: memberId, role: "EDITOR" },
        });
        categoryId = (
            await categories.create(storeId, ownerId, { name: "News" })
        ).id;
    });

    afterAll(async () => {
        await prisma.post.deleteMany({ where: { storeId } });
        await prisma.postCategory.deleteMany({ where: { storeId } });
        await prisma.storeMembers.deleteMany({ where: { storeId } });
        await prisma.storeOwner.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({
            where: { email: { in: [ownerEmail, memberEmail, strangerEmail] } },
        });
        await prisma.$disconnect();
    });

    let draftId = "";

    it("creates a draft: slug from title, no author for an owner, no publishedAt", async () => {
        const res = await posts.create(storeId, ownerId, {
            title: "Hello World",
            content: "# Hi",
            categoryId,
        });
        draftId = res.id;
        const post = await posts.get(storeId, draftId, ownerId);
        expect(post.slug).toBe("hello-world");
        expect(post.status).toBe("DRAFT");
        expect(post.publishedAt).toBeNull();
        expect(post.author).toBeNull(); // owner is not a StoreMembers row
        expect(post.categoryId).toBe(categoryId);
    });

    it("stamps publishedAt when a post is created PUBLISHED", async () => {
        const res = await posts.create(storeId, ownerId, {
            title: "Launch Day",
            status: "PUBLISHED",
        });
        const post = await posts.get(storeId, res.id, ownerId);
        expect(post.status).toBe("PUBLISHED");
        expect(post.publishedAt).not.toBeNull();
    });

    it("resolves the author to the staff member who wrote it", async () => {
        const res = await posts.create(storeId, memberId, {
            title: "From A Member",
        });
        const post = await posts.get(storeId, res.id, memberId);
        expect(post.author).toBe("Mem Ber");
    });

    it("rejects a duplicate slug per store", async () => {
        await expect(
            posts.create(storeId, ownerId, {
                title: "Hello World", // → hello-world, already taken
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects an unknown category", async () => {
        await expect(
            posts.create(storeId, ownerId, {
                title: "Bad Category",
                categoryId: "nope",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("stamps publishedAt on DRAFT→PUBLISHED and keeps it on PUBLISHED→ARCHIVED", async () => {
        await posts.update(storeId, draftId, ownerId, {
            title: "Hello World",
            slug: "hello-world",
            status: "PUBLISHED",
        });
        const published = await posts.get(storeId, draftId, ownerId);
        expect(published.publishedAt).not.toBeNull();
        const firstPublishedAt = published.publishedAt;

        await posts.update(storeId, draftId, ownerId, {
            title: "Hello World",
            slug: "hello-world",
            status: "ARCHIVED",
        });
        const archived = await posts.get(storeId, draftId, ownerId);
        expect(archived.status).toBe("ARCHIVED");
        expect(archived.publishedAt).toEqual(firstPublishedAt); // preserved
    });

    it("denies a non-member (404, no leak)", async () => {
        await expect(posts.list(storeId, strangerId)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            posts.create(storeId, strangerId, { title: "Sneaky" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("counts posts per category and detaches them on category delete", async () => {
        const inCat = await posts.create(storeId, ownerId, {
            title: "In The Category",
            categoryId,
        });

        const list = await categories.list(storeId, ownerId);
        const news = list.find((c) => c.id === categoryId);
        expect(news?._count.posts).toBeGreaterThanOrEqual(1);

        await categories.remove(storeId, categoryId, ownerId);
        // The post that referenced it is detached, not deleted.
        const post = await posts.get(storeId, inCat.id, ownerId);
        expect(post.categoryId).toBeNull();
        await expect(
            categories
                .list(storeId, ownerId)
                .then((l) => l.some((c) => c.id === categoryId)),
        ).resolves.toBe(false);
    });

    it("deletes a post", async () => {
        await posts.remove(storeId, draftId, ownerId);
        await expect(
            posts.get(storeId, draftId, ownerId),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

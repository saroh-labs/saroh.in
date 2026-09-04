import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PostCategoriesService } from "./post-categories.service";
import { PostsService } from "./posts.service";

/**
 * Posts belong to a SITE (ADR-004, #209), and authorization is the site's:
 * `site:read` to read, `section:write` to write. This spec exercises that
 * against the dev DB, with throwaway users, an organization and a site.
 */
const ownerEmail = `post-owner-${process.pid}@example.com`;
const writerEmail = `post-writer-${process.pid}@example.com`;

describe("Content: posts & categories (dev DB)", () => {
    const posts = new PostsService();
    const categories = new PostCategoriesService();

    let ownerId = "";
    let writerId = "";
    let orgId = "";
    let otherOrgId = "";
    let siteId = "";
    let categoryId = "";

    /** An OWNER may read and write; a MEMBER is the read-only floor. */
    const owner = (): OrganizationContext => ({
        organizationId: orgId,
        userId: ownerId,
        role: "OWNER",
    });
    const writer = (): OrganizationContext => ({
        organizationId: orgId,
        userId: writerId,
        role: "ADMIN",
    });
    const reader = (): OrganizationContext => ({
        organizationId: orgId,
        userId: writerId,
        role: "MEMBER",
    });
    /** Same site id, another organization: must 404, never leak. */
    const stranger = (): OrganizationContext => ({
        organizationId: otherOrgId,
        userId: ownerId,
        role: "OWNER",
    });

    beforeAll(async () => {
        ownerId = (await prisma.user.create({ data: { email: ownerEmail } }))
            .id;
        writerId = (
            await prisma.user.create({
                data: { email: writerEmail, name: "Wri Ter" },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: {
                    name: "Content Test Org",
                    slug: `content-org-${process.pid}`,
                },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: {
                    name: "Other Org",
                    slug: `content-other-${process.pid}`,
                },
            })
        ).id;
        siteId = (
            await prisma.site.create({
                data: {
                    organizationId: orgId,
                    name: "Content Test Site",
                    slug: `content-site-${process.pid}`,
                },
            })
        ).id;
        categoryId = (
            await categories.create(owner(), siteId, { name: "News" })
        ).id;
    });

    afterAll(async () => {
        await prisma.post.deleteMany({ where: { siteId } });
        await prisma.postCategory.deleteMany({ where: { siteId } });
        await prisma.site.deleteMany({ where: { id: siteId } });
        await prisma.organization.deleteMany({
            where: { id: { in: [orgId, otherOrgId] } },
        });
        await prisma.user.deleteMany({
            where: { email: { in: [ownerEmail, writerEmail] } },
        });
        await prisma.$disconnect();
    });

    let draftId = "";

    it("creates a draft: slug from title, no publishedAt", async () => {
        const res = await posts.create(owner(), siteId, {
            title: "Hello World",
            content: "# Hi",
            categoryId,
        });
        draftId = res.id;
        const post = await posts.get(owner(), siteId, draftId);
        expect(post.slug).toBe("hello-world");
        expect(post.status).toBe("DRAFT");
        expect(post.publishedAt).toBeNull();
        expect(post.categoryId).toBe(categoryId);
    });

    it("stamps publishedAt when a post is created PUBLISHED", async () => {
        const res = await posts.create(owner(), siteId, {
            title: "Launch Day",
            status: "PUBLISHED",
        });
        const post = await posts.get(owner(), siteId, res.id);
        expect(post.status).toBe("PUBLISHED");
        expect(post.publishedAt).not.toBeNull();
    });

    it("attributes a post to the user who wrote it (ADR-004)", async () => {
        // Was a StoreMembers row, which meant an OWNER — never a member — had
        // no author at all. The author is now simply the person.
        const res = await posts.create(writer(), siteId, {
            title: "From A Writer",
        });
        const post = await posts.get(owner(), siteId, res.id);
        expect(post.author).toBe("Wri Ter");
    });

    it("rejects a duplicate slug per site", async () => {
        await expect(
            posts.create(owner(), siteId, {
                title: "Hello World", // → hello-world, already taken
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects an unknown category", async () => {
        await expect(
            posts.create(owner(), siteId, {
                title: "Bad Category",
                categoryId: "nope",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("stamps publishedAt on DRAFT→PUBLISHED and keeps it on PUBLISHED→ARCHIVED", async () => {
        await posts.update(owner(), siteId, draftId, {
            title: "Hello World",
            slug: "hello-world",
            status: "PUBLISHED",
        });
        const published = await posts.get(owner(), siteId, draftId);
        expect(published.publishedAt).not.toBeNull();
        const firstPublishedAt = published.publishedAt;

        await posts.update(owner(), siteId, draftId, {
            title: "Hello World",
            slug: "hello-world",
            status: "ARCHIVED",
        });
        const archived = await posts.get(owner(), siteId, draftId);
        expect(archived.status).toBe("ARCHIVED");
        expect(archived.publishedAt).toEqual(firstPublishedAt); // preserved
    });

    it("denies another organization the same site id (404, no leak)", async () => {
        await expect(posts.list(stranger(), siteId)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            posts.create(stranger(), siteId, { title: "Sneaky" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets a MEMBER read and refuses their write", async () => {
        // The read-only floor: posts obey the same policy as the pages they
        // sit beside — site:read for everyone, section:write for editors.
        await expect(posts.list(reader(), siteId)).resolves.toBeInstanceOf(
            Array,
        );
        await expect(
            posts.create(reader(), siteId, { title: "Not Allowed" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("counts posts per category and detaches them on category delete", async () => {
        const inCat = await posts.create(owner(), siteId, {
            title: "In The Category",
            categoryId,
        });

        const list = await categories.list(owner(), siteId);
        const news = list.find((c) => c.id === categoryId);
        expect(news?._count.posts).toBeGreaterThanOrEqual(1);

        await categories.remove(owner(), siteId, categoryId);
        // The post that referenced it is detached, not deleted.
        const post = await posts.get(owner(), siteId, inCat.id);
        expect(post.categoryId).toBeNull();
        await expect(
            categories
                .list(owner(), siteId)
                .then((l) => l.some((c) => c.id === categoryId)),
        ).resolves.toBe(false);
    });

    it("deletes a post", async () => {
        await posts.remove(owner(), siteId, draftId);
        await expect(
            posts.get(owner(), siteId, draftId),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

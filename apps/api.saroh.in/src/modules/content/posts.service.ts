import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { enqueuePageRevalidation } from "../sites/page-cache-revalidate";
import { assertSiteInOrg, reviewerScope } from "../sites/site-access";
import { SCHEDULE_MIN_AHEAD_MS } from "../sites/test-release-schedule";
import { slugify } from "../stores/slug";
import type {
    CreatePostDto,
    PostChecksDto,
    PostStatus,
    SchedulePostDto,
    UpdatePostDto,
} from "./dto";
import {
    assertPostApproved,
    isLeadRole,
    postFingerprint,
    readPostApproval,
} from "./post-approval";
import type { PostCheckFlag } from "./post-checks";
import { postCheckFlags } from "./post-checks";
import { assertPostEditable } from "./post-paused";
import { publishPostInTx } from "./post-publish";
import {
    REVISION_FIELDS,
    revisionAfterSave,
    revisionStateOf,
} from "./post-revisions";
import { clearPostScheduleInTx, schedulePostInTx } from "./post-schedule";

/**
 * A site's writing (ADR-004, #209).
 *
 * Posts used to hang off a Store, so a business with a website and no shop
 * could not write at all. They belong to the SITE they are published on, and
 * authorization is the site's: `site:read` to read, `section:write` to write —
 * the same rules as the pages a post sits beside, rather than a second set
 * reached through StoresService.
 *
 * Slugs are unique per site. The author is the User who wrote it. `publishedAt`
 * is stamped the first time a post goes PUBLISHED and preserved thereafter;
 * publishing to the public reads through a snapshot and is not built yet
 * (ADR-004 §3).
 */
@Injectable()
export class PostsService {
    async list(ctx: OrganizationContext, siteId: string) {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);
        const posts = await prisma.post.findMany({
            where: { siteId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                status: true,
                featured: true,
                image: true,
                publishedAt: true,
                createdAt: true,
                // The Posts tab dates a row by its last change (#908).
                updatedAt: true,
                currentPublicationId: true,
                category: { select: { id: true, name: true } },
                author: { select: { name: true } },
            },
        });
        return posts.map(({ author, currentPublicationId, ...p }) => ({
            ...p,
            author: author?.name ?? null,
            // What the PUBLIC is being served, which `status` alone cannot say:
            // a post edited since it went live is PUBLISHED and live, and the
            // live copy is the older one.
            live: currentPublicationId !== null,
        }));
    }

    async get(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                content: true,
                categoryId: true,
                featured: true,
                image: true,
                imageAlt: true,
                seoTitle: true,
                seoDescription: true,
                shareImageUrl: true,
                status: true,
                publishedAt: true,
                createdAt: true,
                scheduledAt: true,
                oldSlugs: true,
                currentPublicationId: true,
                currentPublication: {
                    select: { publishedAt: true, snapshot: true },
                },
                authorId: true,
                author: { select: { name: true } },
            },
        });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        const { author, currentPublicationId, currentPublication, ...rest } =
            post;
        // O7: the band, the request and Send for approval read this.
        const approval = await readPostApproval(prisma, ctx, {
            siteId,
            postId,
            state: revisionStateOf(post),
        });
        return {
            ...rest,
            approval,
            author: author?.name ?? null,
            live: currentPublicationId !== null,
            liveAt: currentPublication?.publishedAt ?? null,
            // What the public reads, beside the draft, for diffs (U17).
            liveCopy: liveCopyOf(currentPublication?.snapshot),
        };
    }

    async create(ctx: OrganizationContext, siteId: string, dto: CreatePostDto) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const slug = slugify(dto.slug ?? dto.title);
        if (!slug) {
            throw new BadRequestException({
                message:
                    "That title has no letters or numbers in it. Add some.",
                field: "slug",
            });
        }
        await this.assertSlugFree(siteId, slug);
        if (dto.categoryId) {
            await this.assertCategoryOnSite(siteId, dto.categoryId);
        }

        const status = dto.status ?? "DRAFT";

        try {
            const post = await prisma.post.create({
                data: {
                    siteId,
                    title: dto.title,
                    slug,
                    excerpt: dto.excerpt ?? null,
                    content: dto.content ?? "",
                    categoryId: dto.categoryId ?? null,
                    featured: dto.featured ?? false,
                    image: dto.image ?? null,
                    imageAlt: dto.imageAlt ?? null,
                    seoTitle: dto.seoTitle ?? null,
                    seoDescription: dto.seoDescription ?? null,
                    shareImageUrl: dto.shareImageUrl ?? null,
                    status,
                    publishedAt: status === "PUBLISHED" ? new Date() : null,
                    authorId: ctx.userId,
                    // Its first revision: History starts where it does.
                    revisions: {
                        create: {
                            organizationId: ctx.organizationId,
                            title: dto.title,
                            content: dto.content ?? "",
                            excerpt: dto.excerpt ?? null,
                            image: dto.image ?? null,
                            imageAlt: dto.imageAlt ?? null,
                            seoTitle: dto.seoTitle ?? null,
                            seoDescription: dto.seoDescription ?? null,
                            shareImageUrl: dto.shareImageUrl ?? null,
                            slug,
                            categoryId: dto.categoryId ?? null,
                            authorId: ctx.userId,
                            savedByUserId: ctx.userId,
                            reason: "autosave",
                        },
                    },
                },
            });
            return { id: post.id };
        } catch {
            throw new ConflictException({
                // In words (UX-066): the merchant set an address, not a slug.
                message:
                    "Another post already uses that address. Change the post's path in Details.",
                field: "slug",
            });
        }
    }

    async update(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        dto: UpdatePostDto,
    ) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const current = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { slug: true, status: true, publishedAt: true },
        });
        if (!current) {
            throw new NotFoundException("Post not found");
        }
        // A live post the plan paused is read-only (#800).
        await assertPostEditable(ctx.organizationId, postId);

        const slug = slugify(dto.slug);
        if (current.slug !== slug) await this.assertSlugFree(siteId, slug);
        if (dto.categoryId) {
            await this.assertCategoryOnSite(siteId, dto.categoryId);
        }

        const status: PostStatus = dto.status ?? (current.status as PostStatus);

        try {
            await prisma.$transaction(async (tx) => {
                const before = await tx.post.findUniqueOrThrow({
                    where: { id: postId },
                    select: REVISION_FIELDS,
                });
                const saved = await tx.post.update({
                    where: { id: postId },
                    data: {
                        title: dto.title,
                        slug,
                        excerpt: dto.excerpt ?? null,
                        content: dto.content ?? "",
                        categoryId: dto.categoryId ?? null,
                        featured: dto.featured ?? false,
                        image: dto.image ?? null,
                        // Absent leaves these alone: today's editor sends
                        // none of them, and must not clear what U15's set.
                        imageAlt: dto.imageAlt,
                        seoTitle: dto.seoTitle,
                        seoDescription: dto.seoDescription,
                        shareImageUrl: dto.shareImageUrl,
                        status,
                        // Stamp publishedAt on the first PUBLISHED; keep it after.
                        publishedAt:
                            status === "PUBLISHED"
                                ? (current.publishedAt ?? new Date())
                                : current.publishedAt,
                    },
                    select: REVISION_FIELDS,
                });
                // R3: a save that changes nothing doesn't make its saver the
                // post's last editor.
                const state = revisionStateOf(saved);
                if (postFingerprint(state) === postFingerprint(before)) return;
                await revisionAfterSave(tx, {
                    organizationId: ctx.organizationId,
                    postId,
                    state,
                    savedByUserId: ctx.userId,
                    event: dto.event,
                });
            });
            return { id: postId };
        } catch {
            throw new ConflictException({
                // In words (UX-066): the merchant set an address, not a slug.
                message:
                    "Another post already uses that address. Change the post's path in Details.",
                field: "slug",
            });
        }
    }

    async remove(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { id: true },
        });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        // Comments cascade-delete via Comment.post onDelete: Cascade.
        await prisma.post.delete({ where: { id: postId } });
        // A live post was on the site's kept pages (#863).
        await enqueuePageRevalidation(prisma, {
            cause: "publish",
            siteIds: [siteId],
        });
        return { id: postId };
    }

    /**
     * Publish a post: append an immutable, path-scoped {@link Publication} and
     * repoint the post at it (#232, ADR-004 §3).
     *
     * PER POST, and that is the whole point. A site-wide snapshot would mean
     * publishing one post republishes every page, and restoring last week's
     * site publication would silently unpublish this week's writing. A post's
     * history is its own.
     *
     * The body is SANITIZED here, on the same boundary as `richText.value` and
     * the footer — before the immutable write — so the renderer only ever reads
     * markup that is already safe and never sanitizes at read time.
     *
     * Requires `section:write`. Publishing an already-live post appends a new
     * row and repoints: republishing is how an edit reaches the public, and the
     * old row stays as history.
     */
    async publish(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "section:write");
        await this.requireSite(ctx, siteId);
        // Republishing a live post the plan paused is an edit (#800).
        await assertPostEditable(ctx.organizationId, postId);
        const live = await prisma.$transaction(async (tx) => {
            // O7: a teammate's post goes live once approved (409 until).
            await assertPostApproved(tx, {
                organizationId: ctx.organizationId,
                siteId,
                postId,
                userId: ctx.userId,
                lead: isLeadRole(ctx),
            });
            return publishPostInTx(tx, {
                organizationId: ctx.organizationId,
                siteId,
                postId,
                actorUserId: ctx.userId,
            });
        });
        // Only the job passes `onlyIfScheduledAt`, so this always publishes.
        if (!live) throw new NotFoundException("Post not found");
        return live;
    }

    /**
     * Publish post › Later (U17a): the draft goes live at `at` as it is
     * then, through the `post.go_live` job. Moving it replaces the old
     * time. Requires `section:write`, as publishing now does.
     */
    async schedule(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        dto: SchedulePostDto,
        now: Date = new Date(),
    ) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const at = new Date(dto.at);
        if (at.getTime() < now.getTime() + SCHEDULE_MIN_AHEAD_MS) {
            throw new BadRequestException({
                message:
                    "Pick a time at least 5 minutes from now, or publish it now.",
                field: "at",
            });
        }
        await this.requirePost(siteId, postId);
        await assertPostEditable(ctx.organizationId, postId);
        await prisma.$transaction(async (tx) => {
            // O7: a teammate picks a day in Send for approval instead.
            await assertPostApproved(tx, {
                organizationId: ctx.organizationId,
                siteId,
                postId,
                userId: ctx.userId,
                lead: isLeadRole(ctx),
            });
            await schedulePostInTx(tx, {
                organizationId: ctx.organizationId,
                postId,
                at,
                byUserId: ctx.userId,
            });
        });
        return { id: postId, scheduledAt: at };
    }

    /** Don't publish it later after all. Idempotent. */
    async unschedule(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        await this.requirePost(siteId, postId);
        await prisma.$transaction((tx) => clearPostScheduleInTx(tx, postId));
        return { id: postId, scheduledAt: null };
    }

    /**
     * Take a post off the site. Repoints the live pointer at null and leaves
     * every publication in place — the same shape as everything else here:
     * unpublishing is not deleting, and the history stays readable.
     *
     * Requires `section:write`.
     */
    async unpublish(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { id: true },
        });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        await prisma.$transaction(async (tx) => {
            await tx.post.update({
                where: { id: post.id },
                data: { currentPublicationId: null, status: "DRAFT" },
            });
            // Taken off before its time: it doesn't go live later either.
            await clearPostScheduleInTx(tx, post.id);
        });
        await enqueuePageRevalidation(prisma, {
            cause: "publish",
            siteIds: [siteId],
        });
        return { id: post.id, live: false };
    }

    private async requirePost(siteId: string, postId: string): Promise<void> {
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { id: true },
        });
        if (!post) throw new NotFoundException("Post not found");
    }

    /** The site, with the prefix its posts live under. 404 when not this org's. */
    private async requireSite(ctx: OrganizationContext, siteId: string) {
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
                ...reviewerScope(ctx),
            },
            select: { id: true, postsPrefix: true },
        });
        if (!site) {
            throw new NotFoundException(`Site "${siteId}" not found`);
        }
        return site;
    }

    /**
     * Prove the site is one this caller may reach, or 404 — a 404 rather than a
     * 403 so a caller cannot probe which sites exist in another organization.
     *
     * The shared helper, not a copy: it is where the reviewer scope lives
     * (#276), and a second implementation is a site a reviewer can still read.
     */
    /** Publish post's checks on the writing sent (U18). Reads only. */
    async checks(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        dto: PostChecksDto,
    ): Promise<{ flags: PostCheckFlag[] }> {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { id: true },
        });
        if (!post) throw new NotFoundException("Post not found");
        return {
            flags: await postCheckFlags(
                ctx.organizationId,
                siteId,
                dto.content,
            ),
        };
    }

    private async assertSiteInOrg(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<void> {
        await assertSiteInOrg(ctx, siteId);
    }

    private async assertSlugFree(siteId: string, slug: string): Promise<void> {
        const existing = await prisma.post.findUnique({
            where: { siteId_slug: { siteId, slug } },
            select: { id: true },
        });
        if (existing) {
            throw new ConflictException({
                // In words (UX-066): the merchant set an address, not a slug.
                message:
                    "Another post already uses that address. Change the post's path in Details.",
                field: "slug",
            });
        }
    }

    private async assertCategoryOnSite(
        siteId: string,
        categoryId: string,
    ): Promise<void> {
        const category = await prisma.postCategory.findFirst({
            where: { id: categoryId, siteId },
            select: { id: true },
        });
        if (!category) {
            throw new BadRequestException({
                message: "Unknown category",
                field: "categoryId",
            });
        }
    }
}

/** The live copy's fields a diff reads, from its publication snapshot. */
export function liveCopyOf(snapshot: unknown) {
    if (snapshot === null || typeof snapshot !== "object") return null;
    const { post, path, publishedAt } = snapshot as {
        post?: Record<string, unknown> | null;
        path?: unknown;
        publishedAt?: unknown;
    };
    if (!post || typeof post !== "object") return null;
    const text = (v: unknown) => (typeof v === "string" ? v : null);
    const category = post.category as { name?: unknown } | null | undefined;
    return {
        title: text(post.title) ?? "",
        slug: text(post.slug) ?? "",
        excerpt: text(post.excerpt),
        content: text(post.content) ?? "",
        image: text(post.image),
        imageAlt: text(post.imageAlt),
        seoTitle: text(post.seoTitle),
        seoDescription: text(post.seoDescription),
        shareImageUrl: text(post.shareImageUrl),
        category: text(category?.name),
        path: text(path),
        publishedAt: text(publishedAt),
    };
}

import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import { enqueuePageRevalidation } from "../sites/page-cache-revalidate";
import { sanitizeRichHtml } from "../sites/sanitize";
import { liveSlugOf, nextOldSlugs } from "./post-old-slugs";
import {
    REVISION_FIELDS,
    revisionStateOf,
    writeRevision,
} from "./post-revisions";
import { dropPostGoLiveJob } from "./post-schedule";
import { postPath } from "./posts-prefix";

type Tx = Prisma.TransactionClient;

export interface PostPublished {
    publicationId: string;
    publishedAt: Date;
    path: string;
}

/**
 * Publish a post on the caller's transaction: append an immutable,
 * path-scoped Publication and repoint the post at it (#232, ADR-004 §3).
 * Shared by Publish post and the `post.go_live` job.
 *
 * PER POST: publishing one does not republish the pages, and restoring an
 * old site publication does not unpublish this week's writing. The body is
 * sanitized here, before the immutable write, so the renderer never does.
 *
 * Also: a link that changed since the live copy is kept as an old link that
 * forwards; any schedule is cleared (it is live now); a `published`
 * revision is written. `onlyIfScheduledAt` is the job's: the post must still
 * be scheduled for that instant, or nothing happens and null comes back.
 *
 * The plan's blog posts cap counts live posts (U13): putting one live is
 * checked, republishing a live one isn't. Counted before the post's row
 * lock, as the meter asks (its advisory lock comes first).
 */
export async function publishPostInTx(
    tx: Tx,
    input: {
        organizationId: string;
        siteId: string;
        postId: string;
        actorUserId: string;
        onlyIfScheduledAt?: string;
        now?: Date;
    },
): Promise<PostPublished | null> {
    const { organizationId, siteId, postId } = input;
    const before = await tx.post.findFirst({
        where: { id: postId, siteId },
        select: { currentPublicationId: true },
    });
    if (!before) throw new NotFoundException("Post not found");
    if (before.currentPublicationId === null) {
        await planMeter.roomInTx(tx, organizationId, "blog");
    }
    await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${postId} FOR UPDATE`;

    const site = await tx.site.findFirst({
        where: { id: siteId, organizationId, deletedAt: null },
        select: { postsPrefix: true },
    });
    const post = await tx.post.findFirst({
        where: { id: postId, siteId },
        select: {
            ...REVISION_FIELDS,
            featured: true,
            publishedAt: true,
            scheduledAt: true,
            oldSlugs: true,
            category: { select: { name: true, slug: true } },
            author: { select: { name: true } },
            currentPublication: { select: { snapshot: true } },
        },
    });
    if (!site || !post) throw new NotFoundException("Post not found");
    if (
        input.onlyIfScheduledAt !== undefined &&
        post.scheduledAt?.toISOString() !== input.onlyIfScheduledAt
    ) {
        return null;
    }

    const publishedAt = input.now ?? new Date();
    const path = postPath(site.postsPrefix, post.slug);
    const snapshot = {
        post: {
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt,
            content: sanitizeRichHtml(post.content),
            image: post.image,
            imageAlt: post.imageAlt,
            seoTitle: post.seoTitle,
            seoDescription: post.seoDescription,
            shareImageUrl: post.shareImageUrl,
            featured: post.featured,
            category: post.category,
            author: post.author?.name ?? null,
            // The date the writing claims, not the date this row was
            // written: republishing a correction must not make a post look
            // new to a reader or a feed.
            publishedAt: (post.publishedAt ?? publishedAt).toISOString(),
        },
        path,
        publishedAt: publishedAt.toISOString(),
    };

    const publication = await tx.publication.create({
        data: {
            siteId,
            organizationId,
            postId,
            path,
            snapshot,
            templateId: "post",
            templateVersion: 1,
            publishedByUserId: input.actorUserId,
            publishedAt,
        },
        select: { id: true, publishedAt: true },
    });
    await tx.post.update({
        where: { id: postId },
        data: {
            currentPublicationId: publication.id,
            status: "PUBLISHED",
            publishedAt: post.publishedAt ?? publishedAt,
            oldSlugs: nextOldSlugs(
                post.oldSlugs,
                liveSlugOf(post.currentPublication?.snapshot),
                post.slug,
            ),
            scheduledAt: null,
            scheduledByUserId: null,
        },
    });
    if (post.scheduledAt) await dropPostGoLiveJob(tx, postId);
    await writeRevision(tx, {
        organizationId,
        postId,
        state: revisionStateOf(post),
        reason: "published",
        savedByUserId: input.actorUserId,
    });
    // The post's page and every list of posts on the site (#863).
    await enqueuePageRevalidation(tx, { cause: "publish", siteIds: [siteId] });
    return {
        publicationId: publication.id,
        publishedAt: publication.publishedAt,
        path,
    };
}

import { createHash } from "node:crypto";

import type { Db } from "../helpers";

/**
 * A showcase site's journal: posts in three categories — Help, News and
 * Articles — published the way the API publishes one
 * (`content/posts.service.ts` → `publish`): a Publication whose snapshot
 * carries the post, its category and author, at `/blog/<slug>` (the default
 * posts prefix), and the post pointing at it.
 *
 * Bodies are HTML inside the sanitizer's allowlist
 * (`apps/api.saroh.in/src/modules/sites/sanitize.ts`): p, h2, h3, ul/ol/li,
 * strong, em, a, blockquote, and figure/img/figcaption for the photos inside
 * a post. Photos are free-licence Unsplash images hot-linked by address,
 * credited in the caption, and checked to load
 * (`scripts/check-demo-images.mjs` reads every `photo("photo-…")`).
 *
 * A Publication is immutable, so a post whose words change gets a new one
 * (its id carries a hash of what it says) and the old stays as history — a
 * re-run with the same words writes nothing new.
 */

export type JournalCategory = "help" | "news" | "articles";

export const JOURNAL_CATEGORIES: Record<
    JournalCategory,
    { name: string; slug: string }
> = {
    help: { name: "Help", slug: "help" },
    news: { name: "News", slug: "news" },
    articles: { name: "Articles", slug: "articles" },
};

export interface JournalPhoto {
    /** The Unsplash photo id, `photo-…`. */
    id: string;
    alt: string;
    creditName: string;
    creditUrl: string;
}

export interface JournalPost {
    slug: string;
    title: string;
    category: JournalCategory;
    /** One or two sentences: the index and share card show it. */
    excerpt: string;
    /** The cover: the index and the top of the post. */
    cover: JournalPhoto;
    /** The body, as sanitizer-safe HTML, with at least one `figure(…)`. */
    body: string;
    /** When it went live, in days before the seed's now. */
    daysAgo: number;
    featured?: boolean;
}

/** An Unsplash photo by id, credited. */
export const photo = (
    id: string,
    alt: string,
    creditName: string,
    creditUrl: string,
): JournalPhoto => ({ id, alt, creditName, creditUrl });

export const unsplashUrl = (id: string, width = 1600) =>
    `https://images.unsplash.com/${id}?w=${width}&q=80&auto=format&fit=crop`;

const escapeHtml = (s: string) =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/** A photo inside a post, with its caption and credit. */
export function figure(p: JournalPhoto, caption?: string): string {
    const credit = `Photo: <a href="${p.creditUrl}">${escapeHtml(p.creditName)}</a> on Unsplash`;
    return (
        `<figure><img src="${unsplashUrl(p.id, 1400)}" alt="${escapeHtml(p.alt)}" />` +
        `<figcaption>${caption ? `${escapeHtml(caption)} · ` : ""}${credit}</figcaption></figure>`
    );
}

/**
 * Write a site's journal: its three categories, each post upserted on a
 * seeded id and made live. Posts this seed wrote earlier that are no longer
 * in the list are taken down (their publications stay, as history).
 */
export async function seedJournal(
    prisma: Db,
    a: {
        siteId: string;
        orgId: string;
        authorId: string;
        now: Date;
        posts: readonly JournalPost[];
        /** A seeded id for one of this journal's rows. */
        id: (...parts: (string | number)[]) => string;
    },
): Promise<number> {
    const { siteId, orgId, authorId, now, posts } = a;
    const slugs = new Set<string>();
    for (const p of posts) {
        if (slugs.has(p.slug)) throw new Error(`Two posts at ${p.slug}`);
        slugs.add(p.slug);
    }
    const author = await prisma.user.findUnique({
        where: { id: authorId },
        select: { name: true },
    });
    const categoryId: Partial<Record<JournalCategory, string>> = {};
    for (const [key, c] of Object.entries(JOURNAL_CATEGORIES) as [
        JournalCategory,
        { name: string; slug: string },
    ][]) {
        const row = await prisma.postCategory.upsert({
            where: { siteId_slug: { siteId, slug: c.slug } },
            update: { name: c.name },
            create: { id: a.id("postcategory", key), siteId, ...c },
        });
        categoryId[key] = row.id;
    }

    for (const p of posts) {
        // Ten in the morning, Kolkata time, on the day it went live.
        const day = new Date(now.getTime() - p.daysAgo * 86_400_000);
        const publishedAt = new Date(
            Date.UTC(
                day.getUTCFullYear(),
                day.getUTCMonth(),
                day.getUTCDate(),
                4,
                30,
            ),
        );
        const content = p.body;
        const image = unsplashUrl(p.cover.id);
        const category = JOURNAL_CATEGORIES[p.category];
        const data = {
            title: p.title,
            excerpt: p.excerpt,
            content,
            image,
            featured: p.featured ?? false,
            status: "PUBLISHED",
            categoryId: categoryId[p.category] ?? null,
            authorId,
            publishedAt,
        };
        const post = await prisma.post.upsert({
            where: { siteId_slug: { siteId, slug: p.slug } },
            update: data,
            create: {
                id: a.id("post", p.slug),
                siteId,
                slug: p.slug,
                createdAt: new Date(publishedAt.getTime() - 2 * 86_400_000),
                ...data,
            },
        });
        const snapshot = {
            post: {
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                content,
                image,
                featured: p.featured ?? false,
                category,
                author: author?.name ?? null,
                publishedAt: publishedAt.toISOString(),
            },
            path: `/blog/${p.slug}`,
            publishedAt: publishedAt.toISOString(),
        };
        const hash = createHash("sha256")
            .update(JSON.stringify(snapshot))
            .digest("hex")
            .slice(0, 12);
        const publication = await prisma.publication.upsert({
            where: { id: a.id("postpub", p.slug, hash) },
            update: {},
            create: {
                id: a.id("postpub", p.slug, hash),
                siteId,
                organizationId: orgId,
                postId: post.id,
                path: `/blog/${p.slug}`,
                snapshot,
                templateId: "post",
                templateVersion: 1,
                publishedByUserId: authorId,
                publishedAt,
            },
        });
        await prisma.post.update({
            where: { id: post.id },
            data: { currentPublicationId: publication.id },
        });
    }
    // A post an earlier run wrote and this list no longer has comes down.
    await prisma.post.updateMany({
        where: {
            siteId,
            id: { startsWith: a.id("post", "") },
            slug: { notIn: Array.from(slugs) },
        },
        data: { currentPublicationId: null, status: "DRAFT" },
    });
    return posts.length;
}

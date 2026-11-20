import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { SITE_ONLINE_ORGANIZATION } from "../organizations/organization-lifecycle.policy";
import { keptPostsOnSite } from "./post-paused";

/**
 * Old post links that forward (editor redesign U17a), the post side of the
 * page forwards (KTD-3, `sites/site-redirects.ts`): a link that was live
 * keeps working after the post's link changes, and the rules match. Only a
 * link that was live is kept (nobody holds a draft's), the current link is
 * never an old one, and a live post that holds the link wins over a forward.
 * Every old link names its own post, so no chain or loop can form.
 */

/** The post's old links once a publish moves it from `liveSlug` to `newSlug`. */
export function nextOldSlugs(
    oldSlugs: readonly string[],
    liveSlug: string | null,
    newSlug: string,
): string[] {
    const next = liveSlug ? [...oldSlugs, liveSlug] : [...oldSlugs];
    return [...new Set(next)].filter((slug) => slug !== newSlug);
}

/** The slug a post publication's snapshot is live at, or null. */
export function liveSlugOf(snapshot: unknown): string | null {
    const post =
        snapshot !== null && typeof snapshot === "object"
            ? (snapshot as { post?: unknown }).post
            : undefined;
    const slug =
        post !== null && typeof post === "object"
            ? (post as { slug?: unknown }).slug
            : undefined;
    return typeof slug === "string" && slug ? slug : null;
}

/**
 * Public: `{ to }`, the live link of the post that was live at `slug`, for
 * the renderer to 308 to. 404 when a live post holds `slug` itself, or no
 * live post on the site ever did. When two posts once held it, the one
 * published last wins.
 */
export async function postMovedTo(
    siteId: string,
    slug: string,
): Promise<{ to: string }> {
    const kept = await keptPostsOnSite(siteId);
    const live = {
        siteId,
        currentPublicationId: { not: null },
        // Offline with its business (#921), and a post a lower plan paused
        // is a 404, as its own link is (#800).
        site: { deletedAt: null, organization: SITE_ONLINE_ORGANIZATION },
        AND: [kept],
    };
    const [holder, moved] = await Promise.all([
        prisma.post.findFirst({
            where: {
                ...live,
                currentPublication: {
                    snapshot: { path: ["post", "slug"], equals: slug },
                },
            },
            select: { id: true },
        }),
        prisma.post.findFirst({
            where: { ...live, oldSlugs: { has: slug } },
            orderBy: { currentPublication: { publishedAt: "desc" } },
            select: { currentPublication: { select: { snapshot: true } } },
        }),
    ]);
    const to = liveSlugOf(moved?.currentPublication?.snapshot);
    if (holder || !to || to === slug) {
        throw new NotFoundException("This post link hasn't moved");
    }
    return { to };
}

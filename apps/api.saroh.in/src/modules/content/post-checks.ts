import { prisma } from "@saroh/database";

import { trimTrailingSlashes } from "../../common/paths";
import type { CheckService } from "../sites/publish-checks";
import { checkSectionPrices } from "../sites/publish-checks";
import { postPath, postsIndexPath } from "./posts-prefix";

/**
 * Publish post's checks the editor can't make for itself (RULES §6, U18):
 * a price typed in the writing that isn't the one in Services, a "free"
 * next to a service that has a price, a link that opens no page of this
 * site, and a service card whose service is gone. The site's Publish sheet
 * runs the same price rules (`publish-checks.ts`); the link rule is
 * `site-flags.ts`'s, read against pages and live posts. Advice only.
 */
export interface PostCheckFlag {
    type: "priceMismatch" | "freeClaim" | "brokenLink" | "serviceGone";
    message: string;
}

/** The most tags of one kind the checks read; a post has far fewer. */
const MAX_TAGS = 2_000;

/**
 * Each `<name …>` opening tag's attributes, lower-cased names. Linear: a tag
 * ends at the next `<` or `>`, and an unclosed quote runs to the tag's end
 * instead of being retried, so 100k `<` or `"` can't go quadratic (W-ReDoS).
 */
function tagsOf(html: string, name: string): Map<string, string>[] {
    const out: Map<string, string>[] = [];
    for (const tag of html.matchAll(new RegExp(`<${name}\\b([^<>]*)`, "gi"))) {
        if (out.length >= MAX_TAGS) break;
        const attrs = new Map<string, string>();
        for (const a of tag[1].matchAll(
            /([^\s"'=]+)(?:\s*=\s*(?:"([^"]*)"?|'([^']*)'?|([^\s"']*)))?/g,
        )) {
            // A group that didn't take part is undefined at run time.
            const [, name, dq, sq, bare] = a as unknown as (
                string | undefined
            )[];
            const key = (name ?? "").toLowerCase();
            if (!attrs.has(key)) attrs.set(key, dq ?? sq ?? bare ?? "");
        }
        out.push(attrs);
    }
    return out;
}

/** Every `href` in the writing, in order. */
export function hrefsOf(html: string): string[] {
    return tagsOf(html, "a").flatMap((a) => {
        const href = a.get("href");
        return href === undefined ? [] : [href.trim()];
    });
}

/** The ids of the service cards in the writing. */
function serviceCardsOf(html: string): string[] {
    return tagsOf(html, "div").flatMap((d) => {
        const id = d.get("data-id");
        return d.get("data-embed") === "service" && id ? [id] : [];
    });
}

/** Pure: the flags on one post's writing. */
export function checkPost(input: {
    content: string;
    services: readonly CheckService[];
    /** Every path a visitor can open: visible pages, live posts, the index. */
    paths: ReadonlySet<string>;
}): PostCheckFlag[] {
    const flags: PostCheckFlag[] = checkSectionPrices(
        { writing: input.content },
        input.services,
    ).map((f) => ({ type: f.type, message: f.message }));

    const said = new Set<string>();
    for (const href of hrefsOf(input.content)) {
        if (said.has(href)) continue;
        said.add(href);
        if (href.startsWith("/")) {
            const path = trimTrailingSlashes(href.split(/[?#]/)[0]);
            if (!input.paths.has(path === "" ? "/" : path)) {
                flags.push({
                    type: "brokenLink",
                    message: `The link to ${href} opens no page on this site.`,
                });
            }
        } else if (!/^(https?:\/\/|mailto:|tel:|#)/i.test(href)) {
            flags.push({
                type: "brokenLink",
                message: `The link "${href}" is not a web address, so it won't open.`,
            });
        }
    }

    const ids = new Set(input.services.map((s) => s.id));
    const gone = serviceCardsOf(input.content).filter((id) => !ids.has(id));
    if (gone.length > 0) {
        flags.push({
            type: "serviceGone",
            message:
                gone.length === 1
                    ? "A service card names a service that isn't offered any more, so it shows nothing."
                    : `${gone.length} service cards name services that aren't offered any more, so they show nothing.`,
        });
    }
    return flags;
}

/** Loads the site's pages, live posts and services, and checks `content`. */
export async function postCheckFlags(
    organizationId: string,
    siteId: string,
    content: string,
): Promise<PostCheckFlag[]> {
    const [site, pages, posts, services] = await Promise.all([
        prisma.site.findFirst({
            where: { id: siteId, organizationId },
            select: { postsPrefix: true },
        }),
        prisma.page.findMany({
            where: { siteId, hidden: false },
            select: { path: true },
        }),
        prisma.post.findMany({
            where: { siteId, currentPublicationId: { not: null } },
            select: { slug: true },
        }),
        prisma.service.findMany({
            where: { organizationId, deletedAt: null, status: "ACTIVE" },
            select: { id: true, name: true, priceCents: true, currency: true },
        }),
    ]);
    const prefix = site?.postsPrefix;
    const paths = new Set([
        ...pages.map((p) => trimTrailingSlashes(p.path) || "/"),
        ...posts.map((p) => postPath(prefix, p.slug)),
        postsIndexPath(prefix),
    ]);
    return checkPost({ content, services, paths });
}

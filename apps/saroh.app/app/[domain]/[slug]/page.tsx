import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { PostIndex } from "@/components/post-view";
import { PublishedPage } from "@/components/published-page";
import { lookOf, ModulePageUnavailable } from "@saroh/site-blocks";

import { moduleOff } from "@/lib/module-pages";
import {
    findPageByPath,
    findRedirect,
    getSiteForHost,
    getSiteForPage,
    pageHead,
    postsPrefix,
    readPublishedPosts,
    withQuery,
} from "@/lib/publication";
import { canonical, titled } from "@/lib/site-meta";
import { shareable } from "@/lib/test-metadata";

/**
 * Tenant sub-page (S2-006).
 *
 * The `domain` param is the full request hostname (middleware-rewritten) and
 * `slug` is the first path segment, so the page path we look up is `/${slug}`.
 * A missing publication OR a missing page renders a clean 404 — drafts are
 * never reachable here.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string; slug: string }>;
}): Promise<Metadata | null> {
    const { domain, slug } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved) {
        return null;
    }
    const { snapshot } = resolved;

    // The posts index owns this path when the merchant's prefix matches it
    // (#232), and it is not a page, so it needs its own title.
    if (slug === postsPrefix(snapshot)) {
        const name = snapshot.site.name;
        return shareable(resolved, {
            title: `Writing · ${name}`,
            openGraph: {
                title: `Writing · ${name}`,
                siteName: name,
                url: `/${slug}`,
            },
            ...canonical(resolved, domain, `/${slug}`),
        });
    }

    const page = findPageByPath(snapshot, `/${slug}`);
    if (!page) {
        return null;
    }

    // An inner page shared on WhatsApp or Slack used to arrive with a title and
    // nothing else (#220): the description and picture live on the site, and
    // this route did not read them. It inherits both, and names its own
    // address so a share of /about is cached as /about. A page's own Google
    // title, text and share image win over the site's (KTD-7).
    const { name } = snapshot.site;
    const head = pageHead(page, snapshot.site);
    // "About · Rye & Co.": the page, then whose site it is. The share
    // card keeps the page's own name, with the site's beside it.
    const title = head.title ?? page.title ?? name;
    const { description, images } = head;
    return shareable(resolved, {
        title: head.title ?? titled(page.title, name),
        description,
        ...(head.robots ? { robots: head.robots } : {}),
        openGraph: {
            title,
            description,
            images,
            url: `/${slug}`,
            siteName: name,
        },
        twitter: {
            card: images ? "summary_large_image" : "summary",
            title,
            description,
            images,
        },
        ...canonical(resolved, domain, `/${slug}`),
    });
}

export default async function SitePostPage({
    params,
    searchParams,
}: {
    params: Promise<{ domain: string; slug: string }>;
    /** Absent when another route draws this one (`/shop` as a page or the posts). */
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { domain, slug } = await params;
    const resolved = await getSiteForPage(domain);

    if (!resolved) {
        notFound();
    }
    const { snapshot, siteId } = resolved;

    // The posts index (#232). It answers at the merchant's chosen prefix, and
    // is checked BEFORE pages because a page could otherwise be created at the
    // same path and silently win depending on nothing the merchant can see.
    if (slug === postsPrefix(snapshot)) {
        const posts = siteId ? await readPublishedPosts(siteId) : [];
        // To the site's error boundary, with Try again: never "Nothing here
        // yet" for writing we couldn't read.
        if (!posts) throw new Error("Posts read failed");
        return (
            <PostIndex
                posts={posts}
                basePath={`/${slug}`}
                title={`Writing from ${snapshot.site.name}`}
            />
        );
    }

    const page = findPageByPath(snapshot, `/${slug}`);
    if (!page) {
        // An old page link forwards for good (KTD-3). A 308 is never kept
        // by the page cache, which stores only a 200.
        const to = findRedirect(snapshot, `/${slug}`);
        if (to) permanentRedirect(withQuery(to, (await searchParams) ?? {}));
        notFound();
    }

    // A Prices, Journal or Contact page whose module is off (G15): said in
    // words with a way home, so a shared link still lands somewhere. (Book
    // and Shop pages never reach here: `/book` and `/shop` are routes.)
    if (moduleOff(page, resolved.modules)) {
        return (
            <ModulePageUnavailable
                business={snapshot.site.name}
                look={lookOf(snapshot.site.look)}
            />
        );
    }

    return <PublishedPage page={page} snapshot={snapshot} siteId={siteId} />;
}

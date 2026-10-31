import type { CardItem } from "@saroh/search-pages";
import type { DocPage } from "@saroh/search-pages/docs";
import { gstCardName } from "@saroh/search-pages/docs";
import type { DocKind, DocKindId } from "@saroh/search-pages/kinds";
import { DOC_KINDS, DOC_PAGE_PATH } from "@saroh/search-pages/kinds";
import type { Metadata } from "next";

import { docPages } from "@/lib/docs-pages";
import { cta } from "@/lib/links";
import type { PublishList } from "@/lib/search-pages";
import { publishList, questionsLd } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import type { JsonLdObject } from "@/lib/structured-data";
import { breadcrumbLd, contentArticleLd } from "@/lib/structured-data";

/**
 * The route kit for the GST pages, guides and downloads (plan 2026-10-31-002,
 * U5): what a `/<kind>/[slug]` route needs, so each route is a thin wrapper
 * around its template. The route itself still says
 * `export const dynamicParams = false` (Next reads it as a literal).
 *
 * Built pages come from `docPages`: only the live ones that pass their
 * checks in production, every page on a preview, where one that isn't live
 * says Draft and `noindex`. Server only.
 */

export function docKind(id: DocKindId): DocKind {
    const kind = DOC_KINDS.find((k) => k.id === id);
    if (!kind) throw new Error(`no search-page kind "${id}"`);
    return kind;
}

/** The kind's pages that are live: the sitemap's, `/llms.txt`'s and the hub's. */
export function liveDocPages(
    id: DocKindId,
    list: PublishList = publishList(),
): DocPage[] {
    const live = new Set(list.live);
    return docPages.list(id).filter((p) => live.has(p.path));
}

/** Each hub's line in the Resources menu, in the footer's order (the boards'). */
const HUB_LINES: Record<DocKindId, string> = {
    guides: "Plain answers to the jobs that eat your week.",
    gst: "The rate, the code and a sample invoice for your trade.",
    downloads: "Excel, Word and PDF files you can use today.",
};

/**
 * The Resources menu's and footer's links to the hubs: Guides, GST guides
 * and Free downloads, each only once a page of it is live, marked new.
 */
export function docHubLinks(
    list: PublishList = publishList(),
): { name: string; line: string; href: string; isNew: true }[] {
    return (["guides", "gst", "downloads"] as const)
        .filter((id) => liveDocPages(id, list).length > 0)
        .map((id) => ({
            name: docKind(id).hubLabel,
            line: HUB_LINES[id],
            href: docKind(id).hub,
            isNew: true,
        }));
}

/** The newest `updated` among a kind's live pages: its hub's date. */
export function newestUpdated(
    id: DocKindId,
    list: PublishList = publishList(),
): string | undefined {
    return liveDocPages(id, list)
        .map((p) => p.updated)
        .sort()
        .at(-1);
}

/** The trail a page draws and its BreadcrumbList, from Home. */
export function docTrail(p: DocPage): { name: string; path: string }[] {
    const kind = docKind(p.kind);
    return [
        { name: "Home", path: "/" },
        { name: kind.hubLabel, path: kind.hub },
        { name: p.name, path: p.path },
    ];
}

/** The page's JSON-LD: BreadcrumbList, FAQPage when it has questions, Article for guides and GST. */
export function docJsonLd(p: DocPage): JsonLdObject[] {
    const out = [breadcrumbLd(docTrail(p))];
    if (p.questions.length) out.push(questionsLd(p.questions));
    if (p.kind === "gst" || p.kind === "guides")
        out.push(
            contentArticleLd({
                headline: p.h1,
                description: p.description,
                path: p.path,
                author: p.author,
                published: p.kind === "guides" ? p.published : undefined,
                updated: p.updated,
                image: p.kind === "guides" ? p.hero?.src : undefined,
            }),
        );
    return out;
}

/** The page's start-button source: the href's `src=` and CtaClickArea's fallback. */
export const docCtaSrc = (p: DocPage) => `${p.kind}-${p.slug}`;

const searchKey = (s: string) => s.trim().toLowerCase();

/**
 * Up to `max` pages for Related: the same kind's built pages (only live ones
 * in production; every page on a preview, as /for/'s links), never the page
 * itself or one targeting the same search, the page's own pins first.
 */
export function docRelated(
    p: DocPage,
    pool: readonly DocPage[] = docPages.list(p.kind),
    max = 3,
): DocPage[] {
    const own = searchKey(p.search);
    const others = pool.filter(
        (o) => o.slug !== p.slug && searchKey(o.search) !== own,
    );
    const pinned = p.related.flatMap(
        (s) => others.find((o) => o.slug === s) ?? [],
    );
    return [...pinned, ...others.filter((o) => !pinned.includes(o))].slice(
        0,
        max,
    );
}

/** A page as a card or a rail link: a GST page by its topic, a guide by its title, a download by its name. */
export function docCard(p: DocPage): CardItem {
    return {
        name:
            p.kind === "gst"
                ? gstCardName(p)
                : p.kind === "guides"
                  ? p.h1
                  : p.name,
        line: p.line,
        href: p.path,
        search: p.search,
    };
}

/**
 * A link in a page's words, as the site draws it: a GST page, guide or
 * download only when this build has it (a draft is never linked from
 * production), anything else as written.
 */
export function docHref(href: string): string | undefined {
    if (!DOC_PAGE_PATH.test(href)) return href;
    const kind = DOC_KINDS.find((k) => href.startsWith(k.prefix));
    return kind && docPages.load(kind.id, href.slice(kind.prefix.length))
        ? href
        : undefined;
}

/** The links every page of a kind passes its template: Home, its hub, the start button and its words' links. */
export function docLinks(p: DocPage) {
    const start = cta({ src: docCtaSrc(p) });
    return {
        mode: start.mode,
        links: {
            home: "/",
            hub: docKind(p.kind).hub,
            startFree: start.href,
            startFreeLabel: start.label,
            src: docCtaSrc(p),
            resolve: docHref,
        },
    };
}

/** A hub's links: Home, itself, each page this build has, and the start button. */
export function hubLinks(id: DocKindId) {
    const kind = docKind(id);
    const src = `${id}-hub`;
    const start = cta({ src });
    return {
        mode: start.mode,
        src,
        links: {
            home: "/",
            hub: kind.hub,
            page: (slug: string) => `${kind.prefix}${slug}`,
            startFree: start.href,
            startFreeLabel: start.label,
            src,
        },
    };
}

/**
 * What one kind's hub route needs besides its pages (`docPages.list`, every
 * page this build has): metadata (noindex while none is live, a preview's hub of drafts), its
 * BreadcrumbList and links. With no page it is a 404, and nothing links it.
 */
export function hubRoute(
    id: DocKindId,
    words: { title: string; description: string },
) {
    const kind = docKind(id);
    return {
        generateMetadata: (): Metadata => ({
            ...pageMetadata({
                title: pageTitle(words.title),
                description: words.description,
                path: kind.hub,
            }),
            ...(liveDocPages(id).length === 0 && {
                robots: { index: false, follow: false },
            }),
        }),
        jsonLd: () => [
            breadcrumbLd([
                { name: "Home", path: "/" },
                { name: kind.hubLabel, path: kind.hub },
            ]),
        ],
        ...hubLinks(id),
    };
}

interface Props {
    params: Promise<{ slug: string }>;
}

/** What one kind's `[slug]` route exports and draws with. */
export function searchPageRoute(id: DocKindId) {
    docKind(id);
    const page = (slug: string) => docPages.load(id, slug);
    return {
        page,
        generateStaticParams: () =>
            docPages.list(id).map((p) => ({ slug: p.slug })),
        /** Whether the page says Draft: built on a preview, not live. */
        draft: (p: DocPage) => !publishList().live.includes(p.path),
        generateMetadata: async ({ params }: Props): Promise<Metadata> => {
            const p = page((await params).slug);
            if (!p) return {};
            return {
                ...pageMetadata({
                    title: pageTitle(p.title),
                    description: p.description,
                    path: p.path,
                }),
                ...(!publishList().live.includes(p.path) && {
                    robots: { index: false, follow: false },
                }),
            };
        },
        trail: docTrail,
        jsonLd: docJsonLd,
        ctaSrc: docCtaSrc,
        /** Up to three pages of the same kind, as cards. */
        related: (p: DocPage) => docRelated(p).map(docCard),
        links: docLinks,
        /** The share card's words: read from the generated copy, never a file. */
        shareCard: (slug: string) => {
            const p = page(slug);
            return p
                ? {
                      eyebrow: docKind(id).hubLabel,
                      title: p.h1,
                      alt: `${docKind(id).hubLabel}: ${p.h1}`,
                  }
                : null;
        },
    };
}

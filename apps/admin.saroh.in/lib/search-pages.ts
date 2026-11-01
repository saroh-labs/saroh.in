import type { SearchPageData, ToolPageData } from "@saroh/search-pages";
import {
    listSearchPages,
    loadSearchPage,
    loadToolPage,
} from "@saroh/search-pages";
import type {
    DownloadPage,
    GstPage,
    GuidePage,
} from "@saroh/search-pages/docs";
import { docLinks, docPageChecks } from "@saroh/search-pages/docs";
import { embeddedDocs } from "@saroh/search-pages/docs-embedded";
import { notFound } from "next/navigation";
import { cache } from "react";

import { env } from "@/env";

import { can, requireStaff } from "./console";
import { getJson } from "./control-plane";
import type {
    DocEntry,
    PageRow,
    SearchPageEvent,
    SearchPagesRead,
} from "./search-page-words";
import { checkWhy, hostOf, mergePages } from "./search-page-words";
import { marketingSiteUrl } from "./team-member";

/**
 * Search pages' reads (DEC-193), once per request. Server-only: it reads
 * through `control-plane`. Anyone who can read the console sees them.
 */
export const searchPagesGate = cache(() => requireStaff("platform:read"));

export type SearchPagesData =
    | { status: "ok"; rows: PageRow[]; read: SearchPagesRead }
    | { status: "denied" }
    | { status: "failed" };

/** The package's manifest merged with the API's records. */
export const readSearchPages = cache(async (): Promise<SearchPagesData> => {
    try {
        const read = await getJson<SearchPagesRead>("/search-pages");
        if (!read) return { status: "denied" };
        return {
            status: "ok",
            read,
            rows: mergePages([...listSearchPages(), ...docEntries()], read),
        };
    } catch {
        return { status: "failed" };
    }
});

/**
 * The GST pages, guides and downloads in the code, drafts too, each with
 * the checks that fail: what holds Publish back here and leaves a live page
 * out of the site's build (the same checks, run on the same words).
 */
export function docEntries(): DocEntry[] {
    return embeddedDocs.all().map((p) => ({
        kind: p.kind,
        path: p.path,
        slug: p.slug,
        name: p.name,
        search: p.search,
        updated: p.updated,
        group:
            p.kind === "gst"
                ? p.type === "trade"
                    ? "By trade"
                    : "The basics"
                : p.group,
        ...failing(p),
        links: docLinks(p),
    }));
}

function failing(p: Parameters<typeof docPageChecks>[0]) {
    const fails = docPageChecks(p).filter(
        (c) => !c.ok && c.severity === "error",
    );
    return { blocked: fails.map((c) => c.title), why: fails.map(checkWhy) };
}

export function readSearchPageHistory(
    path: string,
): Promise<{ events: SearchPageEvent[] } | null> {
    return getJson(`/search-pages/history?path=${encodeURIComponent(path)}`);
}

/**
 * A page's words: a /for/ page, a free tool (#1253), or a GST page, guide
 * or download (every one, drafts too, from `./docs-embedded`). Slugs are
 * unique across every kind (the docs loader refuses a shared one), and
 * each page comes back under its own kind, so one can't open as another.
 */
export type AnyPage =
    | { kind: "for"; page: SearchPageData }
    | { kind: "tools"; page: ToolPageData }
    | { kind: "gst"; page: GstPage }
    | { kind: "guides"; page: GuidePage }
    | { kind: "downloads"; page: DownloadPage };

export const loadPage = cache((slug: string): AnyPage | null => {
    const forPage = loadSearchPage(slug);
    if (forPage) return { kind: "for", page: forPage };
    const tool = loadToolPage(slug);
    if (tool) return { kind: "tools", page: tool };
    const doc = embeddedDocs.all().find((p) => p.slug === slug);
    return doc ? ({ kind: doc.kind, page: doc } as AnyPage) : null;
});

/** The development site, where pages are read before they're published. */
const DEVELOPMENT_SITE = "https://saroh.io";

export interface SiteInfo {
    /** This console's own site: admin.saroh.in → saroh.in, admin.saroh.io → saroh.io. */
    url: string;
    host: string;
    production: boolean;
    /** Where a page is read before publishing: the development site. */
    reviewUrl: string;
    reviewHost: string;
}

/**
 * Which site this console publishes to: the instance's website (or
 * `MARKETING_SITE_URL`), and whether the build is production
 * (`NEXT_PUBLIC_VERCEL_ENV`, set per environment in wrangler.jsonc).
 */
export const siteInfo = cache(async (): Promise<SiteInfo> => {
    const url = await marketingSiteUrl();
    const production = env.NEXT_PUBLIC_VERCEL_ENV === "production";
    const reviewUrl = production ? DEVELOPMENT_SITE : url;
    return {
        url,
        host: hostOf(url),
        production,
        reviewUrl,
        reviewHost: hostOf(reviewUrl),
    };
});

/**
 * One page's tab: the gate, its row, its words and the site, from the same
 * once-per-request reads as its layout. Null when the layout is drawing a
 * refusal or a failure instead; not found when no such page is in the code.
 */
export async function searchPageForTab(slug: string): Promise<{
    canPublish: boolean;
    row: PageRow;
    /** Every page, for what this one links to and what links here. */
    rows: PageRow[];
    page: AnyPage;
    site: SiteInfo;
} | null> {
    const gate = await searchPagesGate();
    if (!gate.ok) return null;
    const data = await readSearchPages();
    if (data.status !== "ok") return null;
    const row = data.rows.find((r) => r.slug === slug);
    const page = loadPage(slug);
    if (!row || !page) notFound();
    return {
        canPublish: can(gate.staff, "search-pages:publish"),
        row,
        rows: data.rows,
        page,
        site: await siteInfo(),
    };
}

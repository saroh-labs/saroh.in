import type { SearchPageData, ToolPageData } from "@saroh/search-pages";
import {
    listSearchPages,
    loadSearchPage,
    loadToolPage,
} from "@saroh/search-pages";
import { notFound } from "next/navigation";
import { cache } from "react";

import { env } from "@/env";

import { can, requireStaff } from "./console";
import { getJson } from "./control-plane";
import type {
    PageRow,
    SearchPageEvent,
    SearchPagesRead,
} from "./search-page-words";
import { hostOf, mergePages } from "./search-page-words";
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
            rows: mergePages(listSearchPages(), read),
        };
    } catch {
        return { status: "failed" };
    }
});

export function readSearchPageHistory(
    path: string,
): Promise<{ events: SearchPageEvent[] } | null> {
    return getJson(`/search-pages/history?path=${encodeURIComponent(path)}`);
}

/** A page's words: a /for/ page or a free tool (#1253); slugs are unique across both. */
export type AnyPage =
    | { kind: "for"; page: SearchPageData }
    | { kind: "tools"; page: ToolPageData };

export const loadPage = cache((slug: string): AnyPage | null => {
    const forPage = loadSearchPage(slug);
    if (forPage) return { kind: "for", page: forPage };
    const tool = loadToolPage(slug);
    return tool ? { kind: "tools", page: tool } : null;
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
        page,
        site: await siteInfo(),
    };
}

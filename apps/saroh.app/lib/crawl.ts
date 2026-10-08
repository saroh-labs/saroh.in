import type { ModulePageStates } from "@saroh/site-blocks";
import { moduleOff } from "./module-pages";
import { PRIVATE_PATH_PREFIXES, isPrivateSitePath } from "./private-paths";

/**
 * What a merchant's site tells search engines (#890): `robots.txt` and
 * `sitemap.xml`, built per host so a custom domain lists its own addresses.
 *
 * Pure: the routes read the site, these decide what to say, and the tests
 * reach them without a server.
 */

/** Google reads at most this many addresses from one sitemap. */
export const SITEMAP_URL_LIMIT = 50_000;

/** What the sitemap is built from: one live site's published content. */
export interface SitemapSource {
    /** `https://rye.saroh.app`, or the custom domain's origin. */
    origin: string;
    pages: readonly { path: string; kind?: string | null }[];
    modules: ModulePageStates | null;
    /** The posts prefix (`blog` unless the merchant chose another word). */
    postsPrefix: string;
    postSlugs: readonly string[];
    /** Null when the shop isn't open on this site. */
    productSlugs: readonly string[] | null;
}

/** The origin a request was made on: its scheme and host. */
export function requestOrigin(requestHeaders: Headers): string | null {
    const host = requestHeaders.get("host")?.trim().toLowerCase();
    if (!host) return null;
    const forwarded = requestHeaders
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim()
        .toLowerCase();
    const scheme = forwarded === "http" ? "http" : "https";
    return `${scheme}://${host}`;
}

function normalise(path: string): string {
    const trimmed = path.trim().replace(/\/+$/, "");
    if (trimmed === "") return "/";
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Every address worth indexing, home first: published pages (not a module
 * page whose module is off), the posts and their index, and the shop and
 * its products while the shop is open. Never a private page. Capped at
 * {@link SITEMAP_URL_LIMIT}.
 */
export function sitemapPaths(source: SitemapSource): string[] {
    const paths: string[] = [];
    const seen = new Set<string>();
    const add = (path: string) => {
        const clean = normalise(path);
        if (seen.has(clean) || isPrivateSitePath(clean)) return;
        seen.add(clean);
        paths.push(clean);
    };

    add("/");
    for (const page of source.pages) {
        if (moduleOff(page, source.modules)) continue;
        add(page.path);
    }
    const prefix = normalise(source.postsPrefix);
    if (source.postSlugs.length > 0) {
        add(prefix);
        for (const slug of source.postSlugs) {
            add(`${prefix}/${encodeURIComponent(slug)}`);
        }
    }
    if (source.productSlugs) {
        add("/shop");
        for (const slug of source.productSlugs) {
            add(`/shop/${encodeURIComponent(slug)}`);
        }
    }
    return paths.slice(0, SITEMAP_URL_LIMIT);
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** The sitemap document for these paths on this origin. */
export function sitemapXml(origin: string, paths: readonly string[]): string {
    const urls = paths
        .map(
            (path) =>
                `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`,
        )
        .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * `robots.txt` for a live site: everything but the private pages, and
 * where the sitemap is.
 */
export function robotsTxt(origin: string): string {
    const disallow = PRIVATE_PATH_PREFIXES.map((p) => `Disallow: ${p}`);
    return [
        "User-agent: *",
        "Allow: /",
        ...disallow,
        "",
        `Sitemap: ${origin}/sitemap.xml`,
        "",
    ].join("\n");
}

/** `robots.txt` for a test release's host: nothing may be crawled. */
export const TEST_HOST_ROBOTS = "User-agent: *\nDisallow: /\n";

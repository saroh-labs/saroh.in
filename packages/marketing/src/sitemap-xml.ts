/**
 * A sitemap index and its sitemaps, written by hand: Next 16's
 * `generateSitemaps` writes no index. Each site groups its own pages and
 * serves them from `app/sitemap.xml/route.ts` and
 * `app/sitemap/[group]/route.ts`, static at build.
 *
 * Every page says the day its words last changed, never the build's; no
 * `changefreq` or `priority`: search engines ignore both.
 */
export interface SitemapEntry {
    url: string;
    lastModified?: string;
    /** hreflang → URL, written as `<xhtml:link rel="alternate">`. */
    alternates?: Readonly<Record<string, string>>;
}

const esc = (s: string) =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
const XHTML = 'xmlns:xhtml="http://www.w3.org/1999/xhtml"';

const item = (
    tag: string,
    loc: string,
    lastmod?: string,
    alternates?: SitemapEntry["alternates"],
) =>
    `<${tag}>\n<loc>${esc(loc)}</loc>\n${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>\n` : ""}${Object.entries(
        alternates ?? {},
    )
        .map(
            ([lang, href]) =>
                `<xhtml:link rel="alternate" hreflang="${esc(lang)}" href="${esc(href)}"/>\n`,
        )
        .join("")}</${tag}>\n`;

/** One group's `<urlset>`. */
export function urlsetXml(entries: readonly SitemapEntry[]): string {
    const ns = entries.some((e) => e.alternates) ? `${NS} ${XHTML}` : NS;
    return `${HEAD}<urlset ${ns}>\n${entries.map((e) => item("url", e.url, e.lastModified, e.alternates)).join("")}</urlset>\n`;
}

/** The index: each group's sitemap at `<siteUrl>/sitemap/<group>.xml`, dated by its newest page. */
export function sitemapIndexXml(
    siteUrl: string,
    groups: ReadonlyMap<string, readonly SitemapEntry[]>,
): string {
    const children = [...groups].map(([g, entries]) =>
        item(
            "sitemap",
            `${siteUrl}/sitemap/${g}.xml`,
            entries
                .map((e) => e.lastModified)
                .filter((d): d is string => d !== undefined)
                .sort()
                .at(-1),
        ),
    );
    return `${HEAD}<sitemapindex ${NS}>\n${children.join("")}</sitemapindex>\n`;
}

export const xmlResponse = (body: string) =>
    new Response(body, {
        headers: { "Content-Type": "application/xml; charset=utf-8" },
    });

/**
 * One group's sitemap for `/sitemap/<group>.xml`, or a 404 for an address
 * that isn't `<a built group>.xml`. Both sites' group routes answer with it.
 */
export function groupSitemapResponse(
    groups: ReadonlyMap<string, readonly SitemapEntry[]>,
    file: string,
): Response {
    const entries = file.endsWith(".xml")
        ? groups.get(file.slice(0, -4))
        : undefined;
    if (!entries) return new Response("Not found", { status: 404 });
    return xmlResponse(urlsetXml(entries));
}

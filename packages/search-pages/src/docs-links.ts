import { DOC_KINDS } from "../kinds";
import type { DocPage } from "./docs-load";

/** A search page's address in any kind: `/for/salons`, `/tools/gst-calculator`, `/gst/clothes`. */
const SEARCH_PAGE_LINK = new RegExp(
    `^/(?:for|tools|${DOC_KINDS.map((k) => k.id).join("|")})/[a-z0-9-]+`,
);

/** A markdown link's target in a field's words: `[name](/tools/x)`. */
const MARKDOWN_HREF = /\]\((\/[a-z0-9/#?=&-]*)\)/g;

/** The GST rail's two tool cards, drawn only while each tool is live. */
const GST_RAIL_TOOLS = [
    "/tools/gst-calculator",
    "/tools/gst-invoice-generator",
];

export interface DocLinks {
    /** Links in the page's words: each must be live before the page is (a dead one would redirect). */
    required: string[];
    /** Links the template draws only while their page is live (rail tools, the trade's /for/ page, related pins). */
    optional: string[];
}

/** The search page a link goes to, without its #part or ?query, or null when it isn't one. */
const searchPageOf = (href: string) => SEARCH_PAGE_LINK.exec(href)?.[0] ?? null;

/** Every href and markdown link in a value, wherever it sits (sources are external and left out). */
function hrefsIn(value: unknown, out: string[]) {
    if (typeof value === "string") {
        for (const m of value.matchAll(MARKDOWN_HREF)) out.push(m[1] ?? "");
    } else if (Array.isArray(value)) {
        for (const v of value) hrefsIn(v, out);
    } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
            if (k === "sources") continue;
            if (k === "href" && typeof v === "string") out.push(v);
            else hrefsIn(v, out);
        }
    }
}

const uniqueSorted = (xs: readonly (string | null)[], self: string) =>
    [...new Set(xs.filter((x): x is string => !!x && x !== self))].sort();

/**
 * The search pages a GST page, guide or download links to (plan
 * 2026-10-31-002, U12): what has to be live before it is. Hubs, Help and
 * other site pages aren't search pages and are left out.
 */
export function docLinks(p: DocPage): DocLinks {
    const found: string[] = [];
    hrefsIn(p, found);
    const required = uniqueSorted(found.map(searchPageOf), p.path);
    const optional = uniqueSorted(
        [
            ...(p.kind === "gst" ? GST_RAIL_TOOLS : []),
            p.kind === "gst" && p.forPage ? `/for/${p.forPage}` : null,
            ...p.related.map((s) => `/${p.kind}/${s}`),
        ],
        p.path,
    ).filter((x) => !required.includes(x));
    return { required, optional };
}

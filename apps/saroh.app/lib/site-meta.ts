import type { Metadata } from "next";

import { plainText } from "./product-json-ld";

/**
 * What a merchant's page tells a search engine about itself: its title,
 * its one address, and a description built only from what the page shows.
 *
 * Pure, so the words are tested without a server.
 */

/** "About · Rye & Co.": the page, then whose site it is. */
export function titled(
    page: string | null | undefined,
    business: string,
): string {
    const name = page?.trim() ?? "";
    // A page named as the business is (a home called "Rye & Co.") says it
    // once.
    return name === "" || name === business.trim()
        ? business
        : `${name} · ${business}`;
}

/**
 * The page's one address, on the host the site is primarily served at.
 *
 * A site answers on its Saroh address and on its own domain with the same
 * pages. Without a signal, a search engine picks one, or splits what it
 * knows between the two. Every page names the primary host's address as
 * canonical (the site's verified custom domain when it has one), and its
 * share card's address resolves against the same origin (`metadataBase`).
 * Where the API named no primary host, the host the request came on
 * stands, as before.
 */
export function canonical(
    site: { primaryHost?: string | null },
    domain: string,
    path: string,
): Pick<Metadata, "metadataBase" | "alternates"> {
    const origin = `https://${site.primaryHost ?? domain}`;
    const trimmed = path.replace(/^\/+|\/+$/g, "");
    return {
        metadataBase: new URL(origin),
        alternates: { canonical: `${origin}/${trimmed}` },
    };
}

/** The most a description runs to before a search engine cuts it. */
export const DESCRIPTION_MAX = 160;

/** Words cut at a word's end, with "…" when anything was left out. */
export function cutAt(text: string, max = DESCRIPTION_MAX): string {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const at = cut.lastIndexOf(" ");
    return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * A product's description for search: the one its merchant wrote, else its
 * blurb, which is the start of what its page says about it (its
 * description, else its key points). Undefined when the page says nothing.
 */
export function productDescription(product: {
    seoDescription: string | null;
    description: string | null;
    keyPoints: readonly string[];
}): string | undefined {
    const written = product.seoDescription?.trim();
    if (written) return written;
    const about = product.description ? plainText(product.description) : "";
    const blurb = about.trim() || product.keyPoints.join(". ").trim();
    return blurb ? cutAt(blurb) : undefined;
}

/** "a", "a and b", "a, b and c", and "a, b, c and more" past three. */
export function listed(names: readonly string[]): string {
    const all = names.map((n) => n.trim()).filter(Boolean);
    const some = all.slice(0, 3);
    if (some.length === 0) return "";
    if (all.length > 3) return `${some.join(", ")} and more`;
    if (some.length === 1) return some[0] ?? "";
    return `${some.slice(0, -1).join(", ")} and ${some.at(-1) ?? ""}`;
}

/**
 * The shop's description: the lead its merchant wrote for the Shop page,
 * else a sentence naming what is sold there. Undefined with neither.
 */
export function shopDescription(input: {
    lead?: string | null;
    business: string;
    products: readonly string[];
}): string | undefined {
    const lead = input.lead?.trim();
    if (lead) return cutAt(lead);
    const what = listed(input.products);
    return what
        ? cutAt(`Shop ${what} from ${input.business} online.`)
        : undefined;
}

/**
 * The booking page's description: the lead its merchant wrote for the Book
 * page, else a sentence naming what can be booked. Undefined with neither.
 */
export function bookDescription(input: {
    lead?: string | null;
    business: string;
    services: readonly string[];
}): string | undefined {
    const lead = input.lead?.trim();
    if (lead) return cutAt(lead);
    const what = listed(input.services);
    return what
        ? cutAt(`Book ${what} with ${input.business} online.`)
        : undefined;
}

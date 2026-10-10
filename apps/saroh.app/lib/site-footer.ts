import { headers } from "next/headers";
import { cache } from "react";

import type { SiteCredit, SiteSeller } from "@saroh/site-blocks";
import { madeWithSarohHref, sellerLead, soldByLine } from "@saroh/site-blocks";

import { serverApiUrl } from "./api-url";
import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

const API_URL = serverApiUrl();

/** What the footer draws beside the snapshot (DEC-101, DEC-102). */
export interface FooterFacts {
    /** The business's contact email, when it has added one. */
    email: string | null;
    /** "Made with Saroh" on Free; null on a paid plan. */
    credit: SiteCredit | null;
    /**
     * Who a customer is buying from (DEC-118), from Settings › Business:
     * each null when the business has set none.
     */
    seller: SellerFacts;
}

export interface SellerFacts {
    legalName: string | null;
    /** The registered address, on one line. */
    address: string | null;
    /** The business's public phone (DEC-053). */
    phone: string | null;
}

const NO_SELLER: SellerFacts = { legalName: null, address: null, phone: null };

/** Nothing extra: no email, no Saroh credit, and no details to name. */
const NONE: FooterFacts = { email: null, credit: null, seller: NO_SELLER };

const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

function sellerFacts(body: unknown): SellerFacts {
    if (body === null || typeof body !== "object") return NO_SELLER;
    const s = body as Record<string, unknown>;
    return {
        legalName: text(s.legalName),
        address: text(s.address),
        phone: text(s.phone),
    };
}

/**
 * The footer's "Sold by" block (DEC-118): the legal name, or the site's own
 * name when the business has set none, then whatever else it has set. "Sold
 * by" where the site's shop serves, "Run by" where it doesn't (bookings, a
 * portfolio). With nothing read (`facts` null), the name alone.
 */
export function siteSeller(
    facts: FooterFacts | null,
    siteName: string,
    sellsProducts: boolean,
): SiteSeller {
    return {
        lead: sellerLead(sellsProducts),
        name: facts?.seller.legalName ?? siteName,
        address: facts?.seller.address ?? null,
        email: facts?.email ?? null,
        phone: facts?.seller.phone ?? null,
    };
}

/** The one line a confirmation carries: "Sold by ‹legal name›". */
export function soldByFor(
    facts: FooterFacts | null,
    siteName: string,
    sellsProducts: boolean,
): string | null {
    return soldByLine(siteSeller(facts, siteName, sellsProducts));
}

/** An 8-character referral code, as the API gives them. */
const REFERRAL_CODE = /^[a-hj-km-np-z2-9]{8}$/;

/**
 * The answer, narrowed rather than cast (#264). Anything malformed reads as
 * nothing to add.
 */
export function footerFacts(body: unknown): FooterFacts {
    if (body === null || typeof body !== "object") return NONE;
    const { email, credit, seller } = body as {
        email?: unknown;
        credit?: unknown;
        seller?: unknown;
    };
    const code =
        credit !== null && typeof credit === "object"
            ? (credit as { referralCode?: unknown }).referralCode
            : undefined;
    return {
        email: typeof email === "string" && email.trim() ? email.trim() : null,
        credit:
            typeof code === "string" && REFERRAL_CODE.test(code)
                ? { href: madeWithSarohHref(code) }
                : null,
        seller: sellerFacts(seller),
    };
}

/**
 * The site footer's live facts: the business's contact email (DEC-101) and,
 * on Free, "Made with Saroh" with its referral code (DEC-102).
 *
 *   GET /public/sites/:siteId/footer
 *
 * Read on every page, never cached: a business that moves to a paid plan
 * loses the credit at once. Signed for the visitor as the visit read is
 * (ADR-011). Never takes the page down, and fails toward no credit: anything
 * but a good answer draws no email and no Saroh credit, so a paying business
 * is never shown one by a failed read.
 */
export const getFooterFacts = cache(async function footerFactsFor(
    siteId: string,
): Promise<FooterFacts> {
    try {
        const requestHeaders = await headers();
        const sent: Record<string, string> = { accept: "application/json" };
        const host = servedHost(requestHeaders);
        try {
            const relay = host ? relayFor(requestHeaders, host) : null;
            if (relay) sent[SITE_RELAY_HEADER] = relay;
        } catch {
            // No SITE_RELAY_SECRET here: read unsigned rather than not at all.
        }
        const res = await fetch(
            `${API_URL}/public/sites/${encodeURIComponent(siteId)}/footer`,
            { cache: "no-store", headers: sent },
        );
        if (!res.ok) return NONE;
        return footerFacts(await res.json().catch(() => null));
    } catch {
        return NONE;
    }
});

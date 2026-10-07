import { headers } from "next/headers";
import { cache } from "react";

import type { SiteCredit } from "@saroh/site-blocks";
import { madeWithSarohHref } from "@saroh/site-blocks";

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
}

/** Nothing extra: no email, and no Saroh credit. */
const NONE: FooterFacts = { email: null, credit: null };

/** An 8-character referral code, as the API gives them. */
const REFERRAL_CODE = /^[a-hj-km-np-z2-9]{8}$/;

/**
 * The answer, narrowed rather than cast (#264). Anything malformed reads as
 * nothing to add.
 */
export function footerFacts(body: unknown): FooterFacts {
    if (body === null || typeof body !== "object") return NONE;
    const { email, credit } = body as { email?: unknown; credit?: unknown };
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

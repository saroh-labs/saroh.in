// Plain helper for the "See a live demo" button (#1191), kept out of the
// client component so the server-rendered heroes can call it.
import type { DemoTrade } from "@/content/demos";
import { DEMO_ADDRESSES, DEMO_PATH } from "@/content/demos";
import type { SolutionSlug } from "@/content/types";
import { env } from "@/env";

/**
 * Which demo a page shows (DEC-195, B12), the one place it is decided: a
 * solution page by its trade (gyms → the gym, every other trade → the
 * salon); a /for/ page by the trade its demo words name, none without.
 */
export const demoTrade = (slug: SolutionSlug): DemoTrade =>
    slug === "gyms" ? "gym" : "salon";

export function demoTradeOf(words: string | undefined): DemoTrade | null {
    if (!words) return null;
    if (/\bgym\b/i.test(words)) return "gym";
    if (/\bsalon\b/i.test(words)) return "salon";
    return null;
}

/** Merchant sites' domain in production; dev and local set their own. */
const SITES_DOMAIN = "saroh.app";

/**
 * The demo's booking page, or null when the button is off: only when
 * `NEXT_PUBLIC_DEMOS` is `on`. Unset is off everywhere, `next dev` included,
 * so production shows nothing until the demo script has run there.
 */
export function demoHref(
    trade: DemoTrade,
    flag: string | undefined = env.NEXT_PUBLIC_DEMOS,
    domain: string = env.NEXT_PUBLIC_SITES_DOMAIN ?? SITES_DOMAIN,
): string | null {
    return flag === "on"
        ? `https://${DEMO_ADDRESSES[trade]}.${domain}${DEMO_PATH}`
        : null;
}

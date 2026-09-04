/**
 * SAROH read as five verbs — Sell, Arrange, Reach, Organise, Host.
 *
 * This is a READING of the name, not its etymology. The name and wordmark are
 * fixed (PRODUCT.md, Brand Commitments); the five words were chosen afterwards
 * to describe what the eight modules actually do. The page does not spell that
 * out — it earns the claim instead, by mapping every verb to modules that
 * already exist rather than to aspirations.
 *
 * Why verbs and not the module names: Product Principle 1 — the merchant
 * answers "what does your business need to do?" in outcomes, and the interface
 * keeps those words. `Reach` is what Communications and Automations are FOR.
 *
 * The mapping is checked against `MODULES` below: every registry module must be
 * covered exactly once. Add a ninth module and this file fails typecheck until
 * someone decides which verb it belongs to — which is the point. A marketing
 * page that quietly stops covering the product is worse than no page.
 */

import { LABEL_BY_KEY, MODULES } from "@/lib/modules";

export interface Verb {
    /** The letter it supplies to SAROH. */
    letter: string;
    verb: string;
    /** What the merchant is doing, in their words. One line. */
    line: string;
    /** Registry keys this verb covers. */
    covers: readonly string[];
}

export const VERBS: readonly Verb[] = [
    {
        letter: "S",
        verb: "Sell",
        line: "Put products in front of people and take the money for them.",
        covers: ["COMMERCE", "PAYMENTS"],
    },
    {
        letter: "A",
        verb: "Arrange",
        line: "Offer your time as something bookable, against availability you control.",
        covers: ["APPOINTMENTS"],
    },
    {
        letter: "R",
        verb: "Reach",
        line: "Follow up — by hand when it matters, by rule when it does not.",
        covers: ["COMMUNICATIONS", "AUTOMATIONS"],
    },
    {
        letter: "O",
        verb: "Organise",
        line: "Keep the people and the work in an order you can act on.",
        covers: ["CRM", "INSIGHTS"],
    },
    {
        letter: "H",
        verb: "Host",
        line: "Be somewhere on the internet that is yours, on your own domain.",
        covers: ["WEBSITE"],
    },
];

/** Module labels for a verb, in registry order, never raw keys. */
export function labelsFor(verb: Verb): string[] {
    return verb.covers.map((k) => LABEL_BY_KEY.get(k) ?? k);
}

/** Slugs for a verb, so each module label can link to its own page. */
export function modulesFor(verb: Verb) {
    return verb.covers.map(
        (k) =>
            MODULES.find((m) => m.key === k) ?? {
                key: k,
                slug: k.toLowerCase(),
                label: k,
            },
    );
}

/**
 * Coverage guard. Runs at import time in dev and at build time in the server
 * render — cheap (8 items), and it turns a silent marketing drift into a loud
 * failure the first time anyone loads the page.
 */
const covered = VERBS.flatMap((v) => v.covers);
const missing = MODULES.filter((m) => !covered.includes(m.key)).map(
    (m) => m.key,
);
const duplicated = covered.filter((k, i) => covered.indexOf(k) !== i);

if (missing.length || duplicated.length) {
    throw new Error(
        "lib/verbs.ts no longer covers the module registry exactly once — " +
            `missing: [${missing.join(", ")}], duplicated: [${duplicated.join(", ")}]. ` +
            "Assign every module to exactly one verb before shipping.",
    );
}

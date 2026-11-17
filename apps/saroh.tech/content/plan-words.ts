/**
 * Every line on saroh.tech that changes when Saroh starts selling its paid
 * plans here, in one place (bug #45). Each is a pair: `on` while Grow and
 * Pro are on sale (the API's `offered`: `SAROH_BILLING_GLOBAL` on and a paid
 * plan published, DEC-211), `off` while everyone is on Free. A page reads
 * `offered` once per build (`paidPlansOn` in `lib/plans.ts`) and takes its
 * words from `planWords(on)`, so flipping the switch in admin changes all of
 * saroh.tech at the next build.
 *
 * No other file may say "Free for now", "Tell me when", "aren't on sale",
 * "Not available yet" about a plan, "come later" or "open soon"
 * (`lib/plan-words.test.ts`). A paid-only feature is tagged with its plan,
 * never hidden (DEC-222). No prices and no limits here.
 */

export interface PlanPair {
    readonly on: string;
    readonly off: string;
}

export const PLAN_WORDS = {
    /** The link beside every plan line, to /pricing. */
    compare: { on: "Compare plans", off: "Tell me when" },
    /** Home's plan block: the lede under "Free to start." and the plan line. */
    homeLede: {
        on: "Start on Free with no card. Move up to Grow or Pro when you need more.",
        off: "Every business is on Free for now. No card needed.",
    },
    homeLine: {
        on: "Start on Free. Grow and Pro are there when you need more.",
        off: "Everyone is on Free for now.",
    },
    /** A Reach page's plan line: Share and posts. */
    socialLine: {
        on: "Free to start. Grow and Pro are there when you need more.",
        off: "Everyone is on Free for now.",
    },
    /** The Website builder page's plan line. */
    websiteLine: {
        on: "The site and the booking page come with every plan, Free included. A domain you own comes with a paid plan.",
        off: "Everyone is on Free for now.",
    },
    /** AI apps is on every plan, Free included (bug #41). */
    aiAppsLine: {
        on: "AI apps is on every plan, Free included. Your assistant's app may need a subscription of its own.",
        off: "Everyone is on Free for now, AI apps included. Your assistant's app may need a subscription of its own.",
    },
    /** Ask AI isn't on Free. No plan is named beside it (DEC-221's `ask-ai-plans` claim). */
    askAiHero: { on: "Comes with a paid plan.", off: "Not part of Free yet." },
    askAiLine: {
        on: "Free to start. Ask AI comes with a paid plan.",
        off: "Everyone is on Free for now. Ask AI isn't part of Free.",
    },
    askAiFaq: {
        on: "No. Ask AI comes with a paid plan. AI apps is on Free, if you'd like to ask Claude or ChatGPT instead.",
        off: "Not yet. Everyone is on Free for now, and Ask AI isn't part of it. AI apps is, if you'd like to ask Claude or ChatGPT instead.",
    },
    /** Website's Approved stage: reviewers are team seats (#33). */
    reviewers: {
        on: "Reviewers come with paid plans.",
        off: "Reviewers come with paid plans.",
    },
    /** A domain you own, as a sentence after "…from the first day." */
    domain: {
        on: "A domain you own comes with a paid plan.",
        off: "A domain you own comes with paid plans, which open soon.",
    },
    /** The own-domain card's line (#32). */
    domainCard: {
        on: "Connected through www. Comes with a paid plan.",
        off: "Connected through www. Comes with a paid plan. Paid plans open soon.",
    },
    /** The same, ending "…, and at a domain you own ‹this›." */
    domainWhen: { on: "on a paid plan", off: "once paid plans open" },
    /** /pricing's title (its mark is "free."), lead and usage note. */
    pricingTitle: {
        on: "Start free. Move up when you need more.",
        off: "Start free. Paid plans come later.",
    },
    pricingIntro: {
        on: "Free is the plan you can start on today, with no card. Grow and Pro are there when your business needs more.",
        off: "Free is the plan you can use today, with no card. Grow and Pro are coming soon, so there's nothing to buy here yet.",
    },
    pricingUsage: {
        on: "Need more than Free includes? Move up to Grow or Pro.",
        off: "You can't buy more yet: paid plans aren't on sale.",
    },
    /** A paid plan's card: its button while on sale, a mark while not. */
    paidCard: { on: "Start on", off: "Coming soon" },
    /** Terms and Billing, "Paying for Saroh". */
    legal: {
        on: "There's a free plan, and it needs no card. Grow and Pro are paid plans, and the pricing page shows what each one includes.",
        off: "There's a free plan, and it needs no card. Paid plans aren't on sale on saroh.tech. This page will say how they work before they are.",
    },
    /**
     * The tag on a feature that comes with a paid plan (DEC-222): drawn
     * while they aren't on sale, nothing once they are.
     */
    paidTag: { on: "", off: "On paid plans" },
} as const satisfies Record<string, PlanPair>;

export type PlanWords = { readonly [K in keyof typeof PLAN_WORDS]: string };

/** Every pair in the wording `on` asks for. */
export function planWords(on: boolean): PlanWords {
    return Object.fromEntries(
        Object.entries(PLAN_WORDS).map(([k, pair]) => [
            k,
            on ? pair.on : pair.off,
        ]),
    ) as PlanWords;
}

/**
 * "Tell me when" under a paid plan (KTD8), drawn only while paid plans
 * aren't on sale: one email when they open.
 */
export const TELL_ME = {
    ask: "Tell me when",
    asked: "We'll tell you",
    askedLine: "We'll email you when paid plans are available.",
    label: "Your email",
    invalid: "Enter an email like name@shop.com.",
    check: "The check didn't pass. Try again.",
    failed: "We couldn't send that just now. Try again in a minute.",
} as const;

/** The features that come with a paid plan, tagged with `paidTag` (DEC-222). */
export const PAID_PLAN_FEATURES: readonly string[] = ["subscriptions"];

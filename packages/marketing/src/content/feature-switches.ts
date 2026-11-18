/**
 * The public sites' release switches (plan 2026-11-13-002, U1 and U2): one
 * `NEXT_PUBLIC_<FEATURE>` per feature, read as one set, so every list a page
 * draws from (feature routes, nav, footer, home grid, sitemap, llms) hides a
 * feature the same way and a release is one switch plus one deploy.
 *
 * This is the only module that reads `FEATURE_SLUGS` for what a site shows:
 * `shownFeatures` decides it (a test holds everything else to it). Pure: each
 * site passes its own env, with each name read literally so Next inlines the
 * value into browser code.
 */
import type { FeatureSlug } from "./types";
import { FEATURE_SLUGS } from "./types";

/** Each switch's key, and the variable that sets it. */
export const RELEASE_SWITCHES = {
    templates: "NEXT_PUBLIC_TEMPLATES",
    "ai-apps": "NEXT_PUBLIC_AI_APPS",
    "ask-ai": "NEXT_PUBLIC_ASK_AI",
    social: "NEXT_PUBLIC_SOCIAL",
    developers: "NEXT_PUBLIC_DEVELOPERS",
    /** docs.saroh.in answers: the owner turns it on after the docs deploy. */
    docs: "NEXT_PUBLIC_DOCS",
    /** saroh.in's /website-library (DEC-228, plan 2026-11-18-001 U11). */
    "website-library": "NEXT_PUBLIC_WEBSITE_LIBRARY",
} as const;
export type ReleaseSwitch = keyof typeof RELEASE_SWITCHES;

/** The switches' values as a site's env holds them, and `NODE_ENV`. */
export type SwitchEnv = {
    [K in ReleaseSwitch as (typeof RELEASE_SWITCHES)[K]]?: string;
} & { NODE_ENV?: string };

/**
 * One switch (DEC-135's rule): on only when it says `on`, so a production
 * build that leaves it out, or misspells it, shows nothing. Unset counts as
 * on only under `next dev`, so local work sees the feature; `off` there
 * checks the hidden state.
 */
export function switchOn(
    flag: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (flag) return flag === "on";
    return nodeEnv === "development";
}

/**
 * The claim switches (DEC-221, decision 1): finer than a feature's release
 * switch. The redesign draws every feature as live; a claim the product
 * can't back in production yet renders only while its switch is on, and
 * otherwise the page shows nothing or "Not available yet", never the claim.
 * Each sits under its feature's release switch (`CLAIM_PARENT`): off with
 * it, whatever it says itself. Same rule as a release switch (DEC-135).
 */
export const CLAIM_SWITCHES = {
    /** Saroh Social posts and schedules for you (claims ledger SH11). */
    "social-posting": "NEXT_PUBLIC_CLAIM_SOCIAL_POSTING",
    /** "Share is free on every plan" (SH7; waits on the catalogue). */
    "share-every-plan": "NEXT_PUBLIC_CLAIM_SHARE_EVERY_PLAN",
    /** Ask AI reads Stock: "bun boxes 38 in stock". */
    "ask-ai-stock": "NEXT_PUBLIC_CLAIM_ASK_AI_STOCK",
    /** Ask AI reads the Website, and changes a price on it by asking. */
    "ask-ai-website": "NEXT_PUBLIC_CLAIM_ASK_AI_WEBSITE",
    /** Ask AI reads Share and Saroh Social's posts. */
    "ask-ai-social": "NEXT_PUBLIC_CLAIM_ASK_AI_SOCIAL",
    /** Questions in Hinglish or Hindi (DEC-075 keeps them off until on). */
    "ask-ai-languages": "NEXT_PUBLIC_CLAIM_ASK_AI_LANGUAGES",
    /** A plan named beside Ask AI: "Ask AI on Grow and Pro". */
    "ask-ai-plans": "NEXT_PUBLIC_CLAIM_ASK_AI_PLANS",
    /** A plan named beside AI apps. */
    "ai-apps-plans": "NEXT_PUBLIC_CLAIM_AI_APPS_PLANS",
    /** Products and the online shop on the merchant's site (`SITE_SHOP`, claims ledger H12). */
    "site-shop": "NEXT_PUBLIC_CLAIM_SITE_SHOP",
    /** Test releases on their own address, and approval before publishing (`SITE_TEST_RELEASES`). */
    "site-test-releases": "NEXT_PUBLIC_CLAIM_SITE_TEST_RELEASES",
    /** Share's "Worth posting today" ideas and the visits a post's link brought. */
    "share-insights": "NEXT_PUBLIC_CLAIM_SHARE_INSIGHTS",
} as const;
export type ClaimSwitch = keyof typeof CLAIM_SWITCHES;

/** The release switch each claim sits under; a Website claim has none. */
export const CLAIM_PARENT: Partial<Record<ClaimSwitch, ReleaseSwitch>> = {
    "social-posting": "social",
    "share-every-plan": "social",
    "share-insights": "social",
    "ask-ai-stock": "ask-ai",
    "ask-ai-website": "ask-ai",
    "ask-ai-social": "ask-ai",
    "ask-ai-languages": "ask-ai",
    "ask-ai-plans": "ask-ai",
    "ai-apps-plans": "ai-apps",
};

/** The claim switches' values as a site's env holds them, with the release switches. */
export type ClaimEnv = SwitchEnv & {
    [K in ClaimSwitch as (typeof CLAIM_SWITCHES)[K]]?: string;
};

/** The claims that are off: their own switch, or their feature's, is off. */
export function claimsOffSet(env: ClaimEnv): ClaimSwitch[] {
    const releaseOff = switchedOffSet(env);
    return (Object.keys(CLAIM_SWITCHES) as ClaimSwitch[]).filter(
        (key) =>
            releaseOff.some((r) => r === CLAIM_PARENT[key]) ||
            !switchOn(env[CLAIM_SWITCHES[key]], env.NODE_ENV),
    );
}

/** The switches that are off, in `RELEASE_SWITCHES`' order. */
export function switchedOffSet(env: SwitchEnv): ReleaseSwitch[] {
    return (Object.keys(RELEASE_SWITCHES) as ReleaseSwitch[]).filter(
        (key) => !switchOn(env[RELEASE_SWITCHES[key]], env.NODE_ENV),
    );
}

/** The feature pages a build shows, in the menu's order: all but the switched-off ones. */
export function shownFeatures(off: readonly string[]): FeatureSlug[] {
    return FEATURE_SLUGS.filter((slug) => !off.includes(slug));
}

/** Every feature a site states content for, shown or not (content checks only). */
export const ALL_FEATURES: readonly FeatureSlug[] = FEATURE_SLUGS;

const COUNT_WORDS = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
] as const;

/** "Nine", "Twelve": a count as a capitalised word, digits past twelve. */
export function countWord(n: number): string {
    return COUNT_WORDS[n] ?? String(n);
}

/**
 * The features tagged "New" on both sites while their release is fresh (the
 * menus, the footer, /features' links): one list, so saroh.in and saroh.tech
 * never disagree (owner, 16 Nov 2026, #23). Empty it in a later commit.
 */
export const NEW_FEATURES: readonly string[] = ["ai-apps", "ask-ai", "social"];

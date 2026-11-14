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

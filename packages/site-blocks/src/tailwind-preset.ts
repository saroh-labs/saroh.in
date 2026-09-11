import type { Config } from "tailwindcss";

/**
 * The `site.*` colour namespace — the merchant's token layer (#252).
 *
 * WHY THIS IS A PRESET AND NOT AN APP'S CONFIG. It used to live in exactly one
 * file, `apps/saroh.app/tailwind.config.ts`, and that is the mechanical reason
 * the live renderer and the editor's preview were written differently:
 * `hero.tsx` could say `bg-site-hero-bg`, and `section-preview.tsx` in
 * `app.saroh.in` had no such class to reach for, so it wrote
 * `bg-[hsl(var(--site-bg))]` instead. Two files drawing the same thing in two
 * notations because only one had the vocabulary — and #189 is what that
 * eventually cost a merchant.
 *
 * Three apps render these blocks now. All three merge this.
 *
 * These resolve to `--site-*` custom properties that {@link SiteTheme} sets per
 * publication. They are DELIBERATELY not Saroh's brand tokens: `saroh.app`
 * serves merchants' storefronts, and painting a bakery in Saroh navy would be
 * a bug, not a rebrand.
 */
export const siteColors = {
    bg: "hsl(var(--site-bg))",
    surface: "hsl(var(--site-surface))",
    fg: "hsl(var(--site-fg))",
    body: "hsl(var(--site-body))",
    muted: "hsl(var(--site-muted))",
    border: "hsl(var(--site-border))",
    accent: "hsl(var(--site-accent))",
    "accent-fg": "hsl(var(--site-accent-fg))",
    // The three band colours a merchant picks separately from the page ground:
    // a hero, a call-to-action strip and a footer each sit on their own colour
    // (#189).
    "hero-bg": "hsl(var(--site-hero-bg))",
    "hero-fg": "hsl(var(--site-hero-fg))",
    "cta-bg": "hsl(var(--site-cta-bg))",
    "cta-fg": "hsl(var(--site-cta-fg))",
    "footer-bg": "hsl(var(--site-footer-bg))",
    "footer-fg": "hsl(var(--site-footer-fg))",
} as const;

/**
 * Merge into an app's Tailwind config to render site blocks in it.
 *
 * Also add this package's source to the app's `content` globs, or every class
 * these blocks write is purged — `packages/ui/src` is already listed in the
 * shared config for exactly that reason.
 */
export const siteBlocksPreset = {
    content: [],
    theme: { extend: { colors: { site: siteColors } } },
} satisfies Partial<Config>;

export default siteBlocksPreset;

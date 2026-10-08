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
    // The "open now" dot (template round 2), on the page and over the
    // page's ink. A palette that names no status leaves both unset, and the
    // dot is the accent where it is drawn, as it always was.
    status: "hsl(var(--site-status, var(--site-accent)))",
    "status-inverse": "hsl(var(--site-status-inverse, var(--site-accent)))",
} as const;

/**
 * The neutral system stack a merchant's text is set in until they choose fonts
 * of their own (H1). `Noto Sans Devanagari` is named so a Hindi line finds a
 * real Devanagari face where the device has one.
 *
 * Deliberately NOT Saroh's faces. `saroh.app` used to load Geist and Bricolage
 * Grotesque on every request, and the booking flow set its headings in Saroh's
 * `font-display`, so a dental clinic's booking page wore Saroh's typography.
 * Gate G7 in `scripts/check-blocks.mjs` keeps them out.
 */
export const SITE_FONT_STACK =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

/**
 * The merchant's type: `font-site-heading` and `font-site-body`, resolving to
 * the `--site-font-*` properties {@link SiteTheme} sets per publication.
 *
 * Each carries the neutral stack as its `var()` fallback, so a surface drawn
 * without `SiteTheme` above it — the renderer's bare apex, the root error
 * boundary before it mounts one — still gets a real face. Without a fallback an
 * unset variable makes the whole `font-family` declaration invalid, and the
 * text drops to the browser's default serif.
 */
export const siteFontFamily = {
    "site-heading": [`var(--site-font-heading, ${SITE_FONT_STACK})`],
    "site-body": [`var(--site-font-body, ${SITE_FONT_STACK})`],
    /*
     * The optional third face, for small machine facts only (a time, a year,
     * a handle): never paragraphs. A pair without a mono face sets no
     * `--site-font-mono`, so these facts fall back to the body face and look
     * like the rest of the page. Never Saroh's `font-mono` (G7).
     */
    "site-mono": [
        `var(--site-font-mono, var(--site-font-body, ${SITE_FONT_STACK}))`,
    ],
};

/**
 * The page's column (`max-w-site-content`): a template's `contentWidth`
 * (DEC-090 type scale) when it sets one, else 1280px, which is the
 * `max-w-screen-xl` every section and the header and footer have always had.
 */
export const siteMaxWidth = {
    "site-content": "var(--site-content-width, 1280px)",
};

/**
 * Merge into an app's Tailwind config to render site blocks in it.
 *
 * Also add this package's source to the app's `content` globs, or every class
 * these blocks write is purged — `packages/ui/src` is already listed in the
 * shared config for exactly that reason.
 */
export const siteBlocksPreset = {
    content: [],
    theme: {
        extend: {
            colors: { site: siteColors },
            fontFamily: siteFontFamily,
            maxWidth: siteMaxWidth,
        },
    },
} satisfies Partial<Config>;

export default siteBlocksPreset;

// The marketing sites' Tailwind values, beside the shared preset's (plan U18,
// KTD-14): `mk-*` keys added, nothing shared redefined. Loaded through jiti from
// each app's tailwind.config.ts, so this file imports nothing.

/**
 * This package's sources, for an app's Tailwind `content` (relative to the app,
 * as `apps/<site>`). Without it every class drawn here is missing from the
 * site's CSS and nothing else says so (`apps/saroh.in/tailwind-content.test.ts`).
 */
export const marketingContent = [
    "../../packages/marketing/src/**/*.{ts,tsx}",
    "!../../packages/marketing/src/**/*.test.{ts,tsx}",
    "!../../packages/marketing/src/{cn,tailwind}.ts",
];

/** A `--mk-*` channel triple from tokens.css, as a Tailwind colour. */
const mk = (name: string) => `hsl(var(--mk-${name}) / <alpha-value>)`;

/** The preset's `theme.extend`, with the `mk-*` values added. */
export function marketingTheme(shared: Record<string, unknown>) {
    return {
        ...shared,
        colors: {
            ...(shared.colors as Record<string, unknown>),
            mk: {
                copy: mk("body"),
                hover: mk("hover"),
                "ink-hover": mk("ink-hover"),
                "line-soft": mk("line-soft"),
                saffron: mk("saffron"),
                "saffron-hover": mk("saffron-hover"),
                "on-ink": mk("on-ink"),
                "on-ink-muted": mk("on-ink-muted"),
                "on-ink-line": mk("on-ink-line"),
                "on-ink-hover": mk("on-ink-hover"),
                "on-ink-accent": mk("on-ink-accent"),
                tint: mk("tint"),
                soon: mk("soon"),
                "line-row": mk("line-row"),
                prose: mk("prose"),
                ok: mk("ok"),
                "ok-tint": mk("ok-tint"),
                good: mk("good"),
                "good-bg": mk("good-bg"),
                bad: mk("bad"),
                "bad-bg": mk("bad-bg"),
                hint: mk("hint"),
                code: mk("code"),
                // The redesign's kit (KIT.md): ledger, warn and the hour tints.
                ledger: mk("ledger"),
                "ledger-fg": mk("ledger-fg"),
                "ledger-muted": mk("ledger-muted"),
                warn: mk("warn"),
                dawn: mk("dawn"),
                noon: mk("noon"),
                afternoon: mk("afternoon"),
                dusk: mk("dusk"),
                lamp: mk("lamp"),
                "lamp-2": mk("lamp-2"),
                "lamp-line": mk("lamp-line"),
                "lamp-fg": mk("lamp-fg"),
                "lamp-meta": mk("lamp-meta"),
                "lamp-saff": mk("lamp-saff"),
                scrim: "var(--mk-scrim)",
            },
        },
        fontFamily: {
            ...(shared.fontFamily as Record<string, string[]>),
            // Plus Jakarta Sans 600: the "Menu" title on the phone sheet,
            // the one place the design sets live text in the wordmark's
            // face. The logo itself is the outlined <Wordmark>.
            wordmark: ["var(--font-wordmark)", "ui-sans-serif", "sans-serif"],
        },
        /*
         * The design's type scale. Display sizes are fluid, as drawn;
         * each carries its tracking, and its line height where the design
         * sets one. Where the design sets none, the text takes the V2
         * shell's `line-height: normal` (app/(site)/layout.tsx), as the
         * design's own page does.
         */
        fontSize: {
            "mk-hero": [
                "clamp(42px, 5.4vw, 68px)",
                { lineHeight: "1.02", letterSpacing: "-0.045em" },
            ],
            "mk-display": [
                "clamp(44px, 6vw, 72px)",
                { lineHeight: "1", letterSpacing: "-0.045em" },
            ],
            "mk-h2": ["clamp(34px, 4vw, 48px)", { letterSpacing: "-0.04em" }],
            "mk-h2-sm": [
                "clamp(34px, 4vw, 44px)",
                { letterSpacing: "-0.035em" },
            ],
            "mk-band": [
                "clamp(38px, 5vw, 60px)",
                { lineHeight: "1", letterSpacing: "-0.045em" },
            ],
            "mk-h3": ["30px", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
            "mk-price": ["42px", { letterSpacing: "-0.03em" }],
            "mk-price-lg": [
                "46px",
                { lineHeight: "1", letterSpacing: "-0.03em" },
            ],
            "mk-pricing-hero": [
                "clamp(42px, 5.6vw, 68px)",
                { lineHeight: "1", letterSpacing: "-0.045em" },
            ],
            // Page titles (DEC-195, V6): an index page (Help, Changelog,
            // Integrations, Templates) and an article (an entry, a help
            // article, an integration, a template, legal, the tools).
            "mk-page": [
                "clamp(36px, 6vw, 60px)",
                { lineHeight: "1.02", letterSpacing: "-0.045em" },
            ],
            "mk-article": [
                "clamp(34px, 6vw, 48px)",
                { lineHeight: "1.02", letterSpacing: "-0.04em" },
            ],
            "mk-h2-xs": [
                "clamp(28px, 3vw, 34px)",
                { letterSpacing: "-0.03em" },
            ],
            // An H2 inside an article's column (an integration page).
            "mk-h2-article": ["26px", { letterSpacing: "-0.02em" }],
            "mk-card-lg": ["22px", { letterSpacing: "-0.02em" }],
            "mk-card": ["21px", { letterSpacing: "-0.02em" }],
            "mk-lead": ["19px", { lineHeight: "1.6" }],
            "mk-intro": ["18px", { lineHeight: "1.6" }],
            "mk-band-body": ["17px", { lineHeight: "1.6" }],
            "mk-body": ["16.5px", { lineHeight: "1.6" }],
            "mk-faq": ["15.5px", { lineHeight: "1.6" }],
            "mk-card-body": ["15px", { lineHeight: "1.55" }],
            "mk-nav": "14.5px",
            "mk-note": "13.5px",
            "mk-eyebrow": ["13px", { letterSpacing: "0.12em" }],
            // The redesign's three heading sizes (KIT.md): 72/42, 44/30 and
            // 20 on desk and phone. Fluid between, landing on 72 and 44 at
            // 1440 wide; nothing else on a page is a heading size.
            "mk-kit-h1": [
                "clamp(42px, 5vw, 72px)",
                { lineHeight: "1.04", letterSpacing: "-0.04em" },
            ],
            "mk-kit-h2": [
                "clamp(30px, 3.06vw, 44px)",
                { lineHeight: "1.06", letterSpacing: "-0.035em" },
            ],
            "mk-kit-h3": [
                "20px",
                { lineHeight: "1.2", letterSpacing: "-0.02em" },
            ],
            // A scene's lead: 20px on desk, 17px on a phone.
            "mk-kit-lead": ["clamp(17px, 1.4vw, 20px)", { lineHeight: "1.55" }],
            // An address set as the hero (AI apps' MCP address, variant I):
            // 76px on desk, down to 24px so a 320px phone never scrolls.
            "mk-address": [
                "clamp(24px, 7.4vw, 76px)",
                { lineHeight: "1", letterSpacing: "-0.04em" },
            ],
        } satisfies Record<
            string,
            string | [string, { lineHeight?: string; letterSpacing?: string }]
        >,
        spacing: {
            // Page gutters: sections, and the slightly tighter nav.
            "mk-gutter": "clamp(20px, 5vw, 56px)",
            "mk-nav": "clamp(16px, 4vw, 56px)",
            "mk-band": "clamp(36px, 6vw, 72px)",
        },
        maxWidth: {
            "mk-page": "1280px",
            // Reading columns (DEC-195, V7), gutter included as mk-page's.
            "mk-article": "760px",
            "mk-list": "900px",
        },
        borderRadius: {
            ...(shared.borderRadius as Record<string, string>),
            "mk-control": "9px",
            "mk-btn": "12px",
            "mk-card": "16px",
            "mk-band": "24px",
            // The kit's radii (KIT.md): cards 16, crops 12, buttons 10.
            "mk-crop": "12px",
            "mk-kit-btn": "10px",
        },
        boxShadow: {
            ...(shared.boxShadow as Record<string, string>),
            "mk-card": "var(--mk-shadow-card)",
            "mk-shot": "var(--mk-shadow-shot)",
            "mk-hero": "var(--mk-shadow-hero)",
            "mk-menu": "var(--mk-shadow-menu)",
            "mk-zoom": "var(--mk-shadow-zoom)",
            "mk-panel": "var(--mk-shadow-panel)",
            "mk-lift": "var(--mk-shadow-lift)",
        },
    };
}

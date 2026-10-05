// The shared @saroh/tailwind-config preset, the same way every other app in
// the monorepo uses it, EXTENDED (not forked) with the Marketing Site V2
// values that only this site has (plan U18, KTD-14).
//
// This file used to be a hand-maintained fork of the preset, and the five-step
// radius scale added to the preset never reached this app. So it spreads the
// preset and adds `mk-*` keys beside the shared ones; nothing shared is
// redefined.
//
// Content globs resolve relative to this app's directory at build time, and the
// preset includes packages/ui's glob so component-only classes are not purged.
import type { Config } from "tailwindcss";

import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

const shared = sharedConfig.theme?.extend ?? {};

/** A `--mk-*` channel triple from app/site.css, as a Tailwind colour. */
const mk = (name: string) => `hsl(var(--mk-${name}) / <alpha-value>)`;

const config: Config = {
    ...sharedConfig,
    theme: {
        ...sharedConfig.theme,
        extend: {
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
                    scrim: "var(--mk-scrim)",
                },
            },
            fontFamily: {
                ...(shared.fontFamily as Record<string, string[]>),
                // Plus Jakarta Sans 600: the "Menu" title on the phone sheet,
                // the one place the design sets live text in the wordmark's
                // face. The logo itself is the outlined <Wordmark>.
                wordmark: [
                    "var(--font-wordmark)",
                    "ui-sans-serif",
                    "sans-serif",
                ],
            },
            /*
             * The design's type scale. Display sizes are fluid, as drawn;
             * each carries its tracking, and its line height where the design
             * sets one. Where the design sets none, the text takes the V2
             * shell's `line-height: normal` (app/(v2)/layout.tsx), as the
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
                "mk-h2": [
                    "clamp(34px, 4vw, 48px)",
                    { letterSpacing: "-0.04em" },
                ],
                "mk-h2-sm": [
                    "clamp(34px, 4vw, 44px)",
                    { letterSpacing: "-0.035em" },
                ],
                "mk-band": [
                    "clamp(38px, 5vw, 60px)",
                    { lineHeight: "1", letterSpacing: "-0.045em" },
                ],
                "mk-h3": [
                    "30px",
                    { lineHeight: "1.1", letterSpacing: "-0.03em" },
                ],
                "mk-price": ["42px", { letterSpacing: "-0.03em" }],
                "mk-price-lg": [
                    "46px",
                    { lineHeight: "1", letterSpacing: "-0.03em" },
                ],
                "mk-pricing-hero": [
                    "clamp(42px, 5.6vw, 68px)",
                    { lineHeight: "1", letterSpacing: "-0.045em" },
                ],
                "mk-h2-xs": [
                    "clamp(28px, 3vw, 34px)",
                    { letterSpacing: "-0.03em" },
                ],
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
            },
            spacing: {
                // Page gutters: sections, and the slightly tighter nav.
                "mk-gutter": "clamp(20px, 5vw, 56px)",
                "mk-nav": "clamp(16px, 4vw, 56px)",
                "mk-band": "clamp(36px, 6vw, 72px)",
            },
            maxWidth: {
                "mk-page": "1280px",
            },
            borderRadius: {
                ...(shared.borderRadius as Record<string, string>),
                "mk-control": "9px",
                "mk-btn": "12px",
                "mk-card": "16px",
                "mk-band": "24px",
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
        },
    },
};

export default config;

import type { Config } from "tailwindcss";

import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

/**
 * The shared Saroh preset, PLUS a `site.*` colour namespace.
 *
 * This app is mostly not a Saroh surface. The `[domain]/*` routes render a
 * MERCHANT's published website at their own hostname, so Saroh's brand tokens
 * (brand / highlight / primary) must never reach them — painting a bakery's
 * storefront in Saroh navy would be a bug, not a rebrand.
 *
 * `site.*` resolves to `--site-*` custom properties that `[domain]/layout.tsx`
 * sets per publication — from the snapshot's own `styleVariables` when it has
 * them (#189), falling back to the stone palette these sections previously
 * hardcoded.
 *
 * `body`, `muted` and `border` stay their own variables, but the publisher now
 * DERIVES them from the chosen ground and text rather than leaving them at the
 * stone defaults. A merchant picks six colours, not nine, and a separate border
 * swatch is how a dark palette ends up with hairlines nobody can see.
 */
const config = {
    ...sharedConfig,
    theme: {
        ...sharedConfig.theme,
        extend: {
            ...sharedConfig.theme?.extend,
            colors: {
                ...sharedConfig.theme?.extend?.colors,
                site: {
                    bg: "hsl(var(--site-bg))",
                    surface: "hsl(var(--site-surface))",
                    fg: "hsl(var(--site-fg))",
                    body: "hsl(var(--site-body))",
                    muted: "hsl(var(--site-muted))",
                    border: "hsl(var(--site-border))",
                    accent: "hsl(var(--site-accent))",
                    "accent-fg": "hsl(var(--site-accent-fg))",
                    // The three band colours a merchant picks separately from
                    // the page ground: a hero, a call-to-action strip and a
                    // footer each sit on their own colour (#189).
                    "hero-bg": "hsl(var(--site-hero-bg))",
                    "hero-fg": "hsl(var(--site-hero-fg))",
                    "cta-bg": "hsl(var(--site-cta-bg))",
                    "cta-fg": "hsl(var(--site-cta-fg))",
                    "footer-bg": "hsl(var(--site-footer-bg))",
                    "footer-fg": "hsl(var(--site-footer-fg))",
                },
            },
        },
    },
} satisfies Config;

export default config;

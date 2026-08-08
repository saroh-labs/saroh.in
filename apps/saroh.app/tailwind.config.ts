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
 * sets per publication. The defaults reproduce the stone palette these sections
 * previously hardcoded, so this refactor is visually a no-op today. Once the
 * publication snapshot carries brand fields, per-merchant theming becomes a data
 * change rather than another 136-class refactor.
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
                },
            },
        },
    },
} satisfies Config;

export default config;

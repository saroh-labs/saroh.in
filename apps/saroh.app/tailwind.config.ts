import type { Config } from "tailwindcss";

import { siteColors } from "@saroh/site-blocks/tailwind-preset";

import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

/**
 * The shared Saroh preset, PLUS the `site.*` colour namespace.
 *
 * This app is mostly not a Saroh surface. The `[domain]/*` routes render a
 * MERCHANT's published website at their own hostname, so Saroh's brand tokens
 * (brand / highlight / primary) must never reach them — painting a bakery's
 * storefront in Saroh navy would be a bug, not a rebrand.
 *
 * `site.*` used to be declared here and ONLY here, which is precisely why the
 * site editor's preview could not write the same classes this app writes and
 * reached for `bg-[hsl(var(--site-bg))]` instead — two implementations of one
 * design, kept apart by a missing vocabulary rather than by intent (#252). It
 * now ships with the blocks, and all three apps that render them merge it.
 */
const config = {
    ...sharedConfig,
    content: [
        ...(sharedConfig.content as string[]),
        // Or every class the blocks write is purged. `packages/ui/src` is in
        // the shared globs for the same reason.
        "../../packages/site-blocks/src/**/*.{ts,tsx}",
    ],
    theme: {
        ...sharedConfig.theme,
        extend: {
            ...sharedConfig.theme?.extend,
            colors: {
                ...sharedConfig.theme?.extend?.colors,
                site: siteColors,
            },
        },
    },
} satisfies Config;

export default config;

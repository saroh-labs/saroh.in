import type { Config } from "tailwindcss";

import { siteColors } from "@saroh/site-blocks/tailwind-preset";

import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

/**
 * The shared Saroh preset, PLUS the merchant `site.*` namespace.
 *
 * This app shows BOTH token layers, and showing them side by side is the point
 * — but they are never mixed. Saroh's own tokens dress the catalog itself: its
 * header, its cards, its captions. `site.*` is what the blocks inside those
 * cards draw with, and it resolves to whichever merchant palette the preview is
 * standing in (see `lib/data/palettes.ts`).
 *
 * A merchant's site must never inherit Saroh's brand. A catalog that painted
 * blocks in Saroh navy would be demonstrating the opposite of what it is for.
 */
const config = {
    ...sharedConfig,
    content: [
        ...(sharedConfig.content as string[]),
        // Or every class the blocks write is purged, and the previews render
        // as unstyled markup. `packages/ui/src` is in the shared globs for the
        // same reason.
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

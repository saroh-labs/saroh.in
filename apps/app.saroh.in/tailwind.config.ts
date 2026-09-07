import type { Config } from "tailwindcss";

import { siteColors } from "@saroh/site-blocks/tailwind-preset";

import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

/**
 * The shared Saroh preset, PLUS the merchant `site.*` namespace.
 *
 * This app is a Saroh surface — except for one panel. The site editor's preview
 * shows a MERCHANT's page, drawn by the same `@saroh/site-blocks` components
 * that serve the published site (#252), and those draw entirely from the
 * `--site-*` layer.
 *
 * That namespace living only in `apps/saroh.app/tailwind.config.ts` is the
 * mechanical reason this app once had a SECOND renderer: `hero.tsx` could write
 * `bg-site-hero-bg` and `section-preview.tsx` had no such class to reach for, so
 * it wrote `bg-[hsl(var(--site-bg))]` instead. Two files drawing one design,
 * kept apart by a missing vocabulary — and #189 is what that cost a merchant.
 *
 * Saroh's own tokens still dress everything around the preview. The two layers
 * sit side by side in this app and must never mix.
 */
const config = {
    ...sharedConfig,
    content: [
        ...(sharedConfig.content as string[]),
        // Or every class the blocks write is purged and the preview renders as
        // unstyled markup. `packages/ui/src` is in the shared globs for the
        // same reason (#92).
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

// The website library's block previews (`app/(library-preview)`, plan
// 2026-11-18-001 KD11): a merchant's page, so the merchant `site.*` layer
// and the blocks' own sources, as saroh.app and ui.saroh.in build it, and
// none of saroh.in's marketing values. Used only by that group's stylesheet
// (`@config` in `library-preview.css`).
import type { Config } from "tailwindcss";

import {
    siteColors,
    siteFontFamily,
    siteMaxWidth,
    siteRadius,
} from "../../packages/site-blocks/src/tailwind-preset";
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

const config = {
    ...sharedConfig,
    content: [
        "./app/(library-preview)/**/*.{ts,tsx}",
        // Or every class the blocks write is purged.
        "../../packages/site-blocks/src/**/*.{ts,tsx}",
        "!../../packages/site-blocks/src/**/*.test.{ts,tsx}",
    ],
    theme: {
        ...sharedConfig.theme,
        extend: {
            ...sharedConfig.theme?.extend,
            colors: {
                ...sharedConfig.theme?.extend?.colors,
                site: siteColors,
            },
            fontFamily: {
                ...sharedConfig.theme?.extend?.fontFamily,
                ...siteFontFamily,
            },
            maxWidth: siteMaxWidth,
            borderRadius: {
                ...sharedConfig.theme?.extend?.borderRadius,
                ...siteRadius,
            },
        },
    },
} satisfies Config;

export default config;

// saroh.in's Tailwind: the shared preset with `packages/marketing`'s theme, so
// the two sites draw from the same values.
import type { Config } from "tailwindcss";

import {
    marketingContent,
    marketingTheme,
} from "../../packages/marketing/src/tailwind";
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

const theme = marketingTheme(sharedConfig.theme?.extend ?? {});

/**
 * The @saroh/ui files saroh.tech draws, rather than the preset's whole
 * packages/ui glob, as saroh.in does. `tailwind-content.test.ts` fails when
 * the site reaches a file not listed.
 */
export const UI_FILES = [
    "components/ui/button.tsx",
    "components/ui/calendar.tsx",
    "components/ui/check-row.tsx",
    "components/ui/checkbox.tsx",
    "components/ui/date-picker.tsx",
    "components/ui/dialog.tsx",
    "components/ui/field.tsx",
    "components/ui/icon-button.tsx",
    "components/ui/input.tsx",
    "components/ui/label.tsx",
    "components/ui/option-select.tsx",
    "components/ui/popover.tsx",
    "components/ui/select.tsx",
    "components/ui/sheet.tsx",
    "components/ui/switch.tsx",
    "components/ui/textarea.tsx",
    "components/ui/tooltip.tsx",
    "components/ui/wordmark.tsx",
    "lib/money.ts",
    "lib/utils.ts",
    "lib/wordmark-geometry.ts",
];

const config: Config = {
    ...sharedConfig,
    content: [
        ...(sharedConfig.content as string[]).filter(
            (glob) => !glob.startsWith("../../packages/ui/"),
        ),
        ...UI_FILES.map((file) => `../../packages/ui/src/${file}`),
        ...marketingContent,
        // "Tell me when"'s Turnstile box (`@saroh/site-blocks/challenge`).
        "../../packages/site-blocks/src/account/challenge.tsx",
    ],
    theme: {
        ...sharedConfig.theme,
        extend: {
            ...theme,
        },
    },
};

export default config;

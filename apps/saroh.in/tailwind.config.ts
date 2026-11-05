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

import {
    marketingContent,
    marketingTheme,
} from "../../packages/marketing/src/tailwind";
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

const shared = sharedConfig.theme?.extend ?? {};

/**
 * The @saroh/ui files saroh.in draws, rather than the preset's whole
 * packages/ui glob: the workspace's components there added about 20 KB of
 * styles this site never used (Lighthouse "unused CSS", 31 Oct 2026).
 * `tailwind-content.test.ts` fails when saroh.in reaches a file not listed.
 */
export const UI_FILES = [
    "components/ui/button.tsx",
    "components/ui/command.tsx",
    "components/ui/copy-button.tsx",
    "components/ui/crash-page.tsx",
    "components/ui/dialog.tsx",
    "components/ui/error-page.tsx",
    "components/ui/input.tsx",
    "components/ui/not-found.tsx",
    "components/ui/phone-input.tsx",
    "components/ui/popover.tsx",
    "components/ui/qr-art.tsx",
    "components/ui/share-card.tsx",
    // The dialog's phone sheet borrows its grab handle (DEC-202).
    "components/ui/sheet.tsx",
    "components/ui/wordmark.tsx",
    "lib/crash-page.ts",
    "lib/phone.ts",
    "lib/qr-art.ts",
    "lib/report-error.ts",
    "lib/saroh-links.ts",
    "lib/share-facts.ts",
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
    ],
    theme: {
        ...sharedConfig.theme,
        extend: marketingTheme(shared),
    },
};

export default config;

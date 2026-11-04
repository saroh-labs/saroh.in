// saroh.in's Tailwind: the shared preset with `packages/marketing`'s theme, so
// the two sites draw from the same values.
import type { Config } from "tailwindcss";

import {
    marketingContent,
    marketingTheme,
} from "../../packages/marketing/src/tailwind";
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

const theme = marketingTheme(sharedConfig.theme?.extend ?? {});

const config: Config = {
    ...sharedConfig,
    content: [...(sharedConfig.content as string[]), ...marketingContent],
    theme: {
        ...sharedConfig.theme,
        extend: {
            ...theme,
        },
    },
};

export default config;

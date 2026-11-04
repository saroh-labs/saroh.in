// saroh.in's Tailwind: the shared preset with `packages/marketing`'s theme, so
// the two sites draw from the same values. The old colour names below are the
// same values under the boards' words, until the pages stop using them (U9).
import type { Config } from "tailwindcss";

import {
    marketingContent,
    marketingTheme,
} from "../../packages/marketing/src/tailwind";
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

const theme = marketingTheme(sharedConfig.theme?.extend ?? {});
const c = (name: string) => `hsl(var(--st-${name}) / <alpha-value>)`;

const config: Config = {
    ...sharedConfig,
    content: [...(sharedConfig.content as string[]), ...marketingContent],
    theme: {
        ...sharedConfig.theme,
        extend: {
            ...theme,
            colors: {
                ...theme.colors,
                paper: c("paper"),
                ink: c("ink"),
                body: c("body"),
                quiet: c("quiet"),
                saffron: c("saffron"),
                "saffron-text": c("saffron-text"),
                surface: c("surface"),
            },
            borderColor: {
                line: "hsl(var(--border))",
                control: "hsl(var(--border-strong))",
                strong: "hsl(var(--border-strong))",
            },
            borderRadius: {
                ...theme.borderRadius,
                control: "9px",
                button: "12px",
                card: "16px",
            },
        },
    },
};

export default config;

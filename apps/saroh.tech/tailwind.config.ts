// The shared @saroh/tailwind-config preset, as saroh.in uses it, extended with
// the boards' colour names. Every board colour is defined in app/tech.css.
import type { Config } from "tailwindcss";

import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

const shared = sharedConfig.theme?.extend ?? {};
const c = (name: string) => `hsl(var(--st-${name}) / <alpha-value>)`;

const config: Config = {
    ...sharedConfig,
    theme: {
        ...sharedConfig.theme,
        extend: {
            ...shared,
            colors: {
                ...(shared.colors as Record<string, unknown>),
                paper: c("paper"),
                ink: c("ink"),
                body: c("body"),
                quiet: c("quiet"),
                saffron: c("saffron"),
                "saffron-text": c("saffron-text"),
                surface: c("surface"),
            },
            borderColor: {
                line: "rgba(28, 28, 26, 0.13)",
                control: "rgba(28, 28, 26, 0.22)",
                strong: "rgba(28, 28, 26, 0.25)",
            },
            fontFamily: {
                ...(shared.fontFamily as Record<string, string[]> | undefined),
                sans: ["var(--font-sans)", "system-ui", "sans-serif"],
                display: ["var(--font-display)", "system-ui", "sans-serif"],
                mono: ["var(--font-mono)", "ui-monospace", "monospace"],
            },
            borderRadius: {
                ...(shared.borderRadius as Record<string, string> | undefined),
                control: "9px",
                button: "12px",
                card: "16px",
            },
        },
    },
};

export default config;

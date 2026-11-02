import type { Config } from "tailwindcss";

/**
 * Its own small theme, not the workspace preset: saroh.tech draws the design
 * system's values from `app/tech.css` and must stay light (the tool pages have
 * a JavaScript and CSS budget). The logo is the one piece taken from @saroh/ui.
 */
const c = (name: string) => `hsl(var(--st-${name}) / <alpha-value>)`;

const config: Config = {
    content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
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
                sans: ["var(--font-sans)", "system-ui", "sans-serif"],
                display: ["var(--font-display)", "system-ui", "sans-serif"],
                mono: ["var(--font-mono)", "ui-monospace", "monospace"],
            },
            borderRadius: { control: "9px", button: "12px", card: "16px" },
        },
    },
    plugins: [],
};

export default config;

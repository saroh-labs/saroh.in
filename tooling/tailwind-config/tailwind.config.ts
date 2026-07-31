import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Tailwind's own default stacks, inlined.
 *
 * `import defaultTheme from "tailwindcss/defaultTheme"` looks tidier but breaks
 * the build: this config is loaded through jiti (by postcss, and again by
 * Turbopack), and jiti does not bind that CJS default export — it fails at
 * runtime with `ReferenceError: defaultTheme is not defined`, not at typecheck.
 * These lists are stable; inlining them keeps the config loader-agnostic.
 */
const FALLBACK_SANS = [
    "ui-sans-serif",
    "system-ui",
    "sans-serif",
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Segoe UI Symbol"',
    '"Noto Color Emoji"',
];
const FALLBACK_MONO = [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    '"Liberation Mono"',
    '"Courier New"',
    "monospace",
];

const config = {
    darkMode: ["class"],
    content: [
        "./pages/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./app/**/*.{ts,tsx}",
        "./src/**/*.{ts,tsx}",
        "../../packages/ui/src/**/*.{ts,tsx}",
    ],
    prefix: "",
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // Saroh brand — midnight navy. `brand` is INTERACTIVE (links,
                // emphasis) and lightens in dark mode; `brand.surface` is a FILL
                // (heroes, filled chrome) and stays deep in both themes. Do not
                // collapse them back into one token — see @saroh/ui globals.css.
                brand: {
                    DEFAULT: "hsl(var(--brand))",
                    foreground: "hsl(var(--brand-foreground))",
                    surface: "hsl(var(--brand-surface))",
                    "surface-foreground":
                        "hsl(var(--brand-surface-foreground))",
                    subtle: "hsl(var(--brand-subtle))",
                    "subtle-foreground": "hsl(var(--brand-subtle-foreground))",
                    50: "hsl(var(--brand-50))",
                    100: "hsl(var(--brand-100))",
                    200: "hsl(var(--brand-200))",
                    300: "hsl(var(--brand-300))",
                    400: "hsl(var(--brand-400))",
                    500: "hsl(var(--brand-500))",
                    600: "hsl(var(--brand-600))",
                    700: "hsl(var(--brand-700))",
                    800: "hsl(var(--brand-800))",
                    900: "hsl(var(--brand-900))",
                    950: "hsl(var(--brand-950))",
                },
                // The lime accent. Deliberately NOT `accent` — that name is
                // taken by shadcn's neutral hover surface and repointing it
                // would turn every menu hover lime.
                highlight: {
                    DEFAULT: "hsl(var(--highlight))",
                    foreground: "hsl(var(--highlight-foreground))",
                    border: "hsl(var(--highlight-border))",
                    subtle: "hsl(var(--highlight-subtle))",
                    "subtle-foreground":
                        "hsl(var(--highlight-subtle-foreground))",
                    50: "hsl(var(--highlight-50))",
                    100: "hsl(var(--highlight-100))",
                    200: "hsl(var(--highlight-200))",
                    300: "hsl(var(--highlight-300))",
                    400: "hsl(var(--highlight-400))",
                    500: "hsl(var(--highlight-500))",
                    600: "hsl(var(--highlight-600))",
                    700: "hsl(var(--highlight-700))",
                    800: "hsl(var(--highlight-800))",
                    900: "hsl(var(--highlight-900))",
                    950: "hsl(var(--highlight-950))",
                },
                success: {
                    DEFAULT: "hsl(var(--success))",
                    foreground: "hsl(var(--success-foreground))",
                },
                warning: {
                    DEFAULT: "hsl(var(--warning))",
                    foreground: "hsl(var(--warning-foreground))",
                },
                info: {
                    DEFAULT: "hsl(var(--info))",
                    foreground: "hsl(var(--info-foreground))",
                },
                chart: {
                    1: "hsl(var(--chart-1))",
                    2: "hsl(var(--chart-2))",
                    3: "hsl(var(--chart-3))",
                    4: "hsl(var(--chart-4))",
                    5: "hsl(var(--chart-5))",
                },
            },
            fontFamily: {
                // The two --font-* vars are set by next/font/local in each app's
                // root layout. --font-mono is intentionally unset (no mono file
                // is shipped); the var resolves to nothing and the stack below
                // takes over.
                sans: ["var(--font-sans)", ...FALLBACK_SANS],
                display: ["var(--font-display)", ...FALLBACK_SANS],
                mono: ["var(--font-mono)", ...FALLBACK_MONO],
            },
            boxShadow: {
                xs: "var(--shadow-xs)",
                sm: "var(--shadow-sm)",
                DEFAULT: "var(--shadow-sm)",
                md: "var(--shadow-md)",
                lg: "var(--shadow-lg)",
                xl: "var(--shadow-xl)",
            },
            transitionTimingFunction: {
                out: "var(--ease-out)",
                "in-out": "var(--ease-in-out)",
            },
            transitionDuration: {
                fast: "var(--duration-fast)",
                base: "var(--duration-base)",
                slow: "var(--duration-slow)",
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
    },
    plugins: [tailwindcssAnimate, forms, typography],
} satisfies Config;

export default config;

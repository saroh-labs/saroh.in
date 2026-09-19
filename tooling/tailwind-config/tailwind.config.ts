import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";

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
    /*
     * `hover:` compiles to `@media (hover: hover)`.
     *
     * Without this a touch device fires hover on tap and then KEEPS it: a rail
     * row stays lit after the finger leaves, so the interface claims a
     * selection that is not there. Two of the four primary scenes (§18) are
     * touch, so a hover state that sticks is a false signifier in half the
     * product. Set here rather than per-utility because every `hover:` in every
     * app wants it, and the ones that do not do not exist.
     */
    future: {
        hoverOnlyWhenSupported: true,
    },
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
                border: {
                    DEFAULT: "hsl(var(--border))",
                    // The hovered edge of an outline control — one step past
                    // `border`, the way hover moves one ramp step everywhere.
                    strong: "hsl(var(--border-strong))",
                },
                input: "hsl(var(--input))",
                // Form field fill: white on Paper, Sunken on dark.
                field: "hsl(var(--field))",
                // One disabled treatment for every variant (brand file §22).
                disabled: {
                    DEFAULT: "hsl(var(--disabled))",
                    foreground: "hsl(var(--disabled-foreground))",
                },
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                // `hover` and `active` are complete colours, not triples: hover
                // is one ramp step and pressed two, and the legacy skins
                // express theirs as an alpha of their own fill. They take no
                // opacity modifier, and do not need one.
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                    hover: "var(--primary-hover)",
                    active: "var(--primary-active)",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                    hover: "var(--secondary-hover)",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                    hover: "var(--destructive-hover)",
                    active: "var(--destructive-active)",
                    subtle: "hsl(var(--destructive-subtle))",
                    "subtle-foreground":
                        "hsl(var(--destructive-subtle-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                    active: "var(--accent-active)",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // Saroh brand — Saffron. `brand` is INTERACTIVE (links,
                // emphasis) and is the text-capable cut: Saffron 700 on light,
                // 400 on dark. `brand.surface` is a FILL (heroes, filled
                // chrome) and stays Ink in both themes. Do not collapse them
                // back into one token — see @saroh/ui globals.css. The numbered
                // steps are the Saffron ramp.
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
                // The Saffron fill, spent on one action per screen. Deliberately
                // NOT `accent` — that name is taken by shadcn's neutral hover
                // surface and repointing it would turn every menu hover
                // Saffron. The numbered steps are the Ink ramp.
                highlight: {
                    DEFAULT: "hsl(var(--highlight))",
                    foreground: "hsl(var(--highlight-foreground))",
                    hover: "var(--highlight-hover)",
                    active: "var(--highlight-active)",
                    "active-foreground": "var(--highlight-active-foreground)",
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
                    subtle: "hsl(var(--success-subtle))",
                    "subtle-foreground":
                        "hsl(var(--success-subtle-foreground))",
                },
                warning: {
                    DEFAULT: "hsl(var(--warning))",
                    foreground: "hsl(var(--warning-foreground))",
                    // The tinted pair, matching `brand` and `highlight`.
                    // `--warning` is a FILL — a mid-amber sized to carry white
                    // or near-black text on top of it. Used as text on a pale
                    // tint (the obvious `bg-warning/15 text-warning`) it lands
                    // at 2.3:1 in every light skin, which is unreadable. These
                    // two exist so "someone is waiting" can be said quietly
                    // without saying it illegibly.
                    subtle: "hsl(var(--warning-subtle))",
                    "subtle-foreground":
                        "hsl(var(--warning-subtle-foreground))",
                },
                info: {
                    DEFAULT: "hsl(var(--info))",
                    foreground: "hsl(var(--info-foreground))",
                    subtle: "hsl(var(--info-subtle))",
                    "subtle-foreground": "hsl(var(--info-subtle-foreground))",
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
                // The --font-* vars are set by next/font/local in each app's
                // root layout: Plus Jakarta Sans (UI and body), Space Grotesk
                // (display to H3 — never body copy) and JetBrains Mono (code,
                // labels, eyebrows). saroh.app sets no --font-mono and falls
                // back to the stack below.
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
            /*
             * Five steps, not three.
             *
             * shadcn ships lg/md/sm derived from a single `--radius` with a
             * 2px spread, which cannot express the shape this system wants:
             * CONTROLS near 9px and CARDS at 14px. Two extra steps above the
             * anchor give that range while everything still moves together if
             * `--radius` changes — a skin can restyle the whole app's corners
             * from one value, which is why the scale is derived rather than
             * hardcoded.
             *
             * At the brand's `--radius: 0.625rem`:
             *   sm 6px · md 8px (buttons, inputs) · lg 10px
             *   xl 14px (cards) · 2xl 18px (panels, modals, sheets)
             * Chips and code blocks take 4px and status pills `rounded-full`.
             */
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
                xl: "calc(var(--radius) + 4px)",
                "2xl": "calc(var(--radius) + 8px)",
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
                "accordion-down":
                    "accordion-down var(--duration-base) var(--ease-out)",
                "accordion-up":
                    "accordion-up var(--duration-fast) var(--ease-out)",
            },
        },
    },
    plugins: [
        tailwindcssAnimate,
        forms,
        typography,
        /**
         * `coarse:` — a touch pointer, i.e. the phone and the shop floor.
         *
         * Two of the four primary scenes are touch (PRODUCT.md), and §17 asks
         * for critical workflows to be DESIGNED for the phone rather than
         * compressed from the desk. A control sized for a mouse is a control
         * sized for a pointer that lands within a pixel; a thumb — possibly
         * gloved, in a hurry, on a warehouse floor — is not that.
         *
         * This is a media query rather than a breakpoint on purpose. Width says
         * how much room there is; it does not say what is doing the pointing. A
         * narrow desktop window is still a mouse and should keep the dense
         * layout, while a tablet at 1024px is a thumb and should not.
         *
         * Use it to enlarge a target (`coarse:min-h-11`), never to hide one.
         */
        plugin(({ addVariant }) => {
            addVariant("coarse", "@media (pointer: coarse)");
            addVariant("fine", "@media (pointer: fine)");
        }),
    ],
} satisfies Config;

export default config;

import type { SiteLook } from "./site-drawing";

const SERIF = "var(--font-site-serif), Georgia, serif";
const SANS = "var(--font-site-sans), ui-sans-serif, system-ui, sans-serif";

/**
 * Each trade's example site look, drawn the same on saroh.in and saroh.tech
 * (owner, 16 Nov 2026, bugs #8 and #19–#22): a bakery is Rye & Co.'s cream
 * and terracotta on either site, never a grey default on one of them. A
 * merchant's colours, never Saroh's (`--site-*` channels).
 */
export const TRADE_LOOKS = {
    bakery: {
        bg: "36.5 51.1% 91.2%",
        surface: "35.3 68% 95.1%",
        fg: "28.4 28.4% 13.1%",
        muted: "30 21.6% 29%",
        accent: "17.7 62.3% 43.7%",
        accentFg: "35.3 68% 95.1%",
        fontHeading: SERIF,
        fontBody: SANS,
        headingWeight: 600,
        radius: 4,
    },
    salon: {
        bg: "286.7 39.1% 13.5%",
        surface: "289.7 37.6% 18.2%",
        fg: "33.9 48.9% 90.8%",
        muted: "316.7 18.7% 81.2%",
        accent: "41.6 54% 53.9%",
        accentFg: "286.7 39.1% 13.5%",
        fontHeading: SANS,
        fontBody: SANS,
        headingWeight: 800,
        radius: 14,
    },
    gym: {
        bg: "150 10.5% 7.5%",
        surface: "140 9.7% 12.2%",
        fg: "85.7 20% 93.1%",
        muted: "100 8.2% 71.4%",
        accent: "74.5 84.7% 61.6%",
        accentFg: "150 10.5% 7.5%",
        fontHeading: SANS,
        fontBody: SANS,
        headingWeight: 700,
        radius: 8,
    },
    florist: {
        bg: "26.7 52.9% 96.7%",
        surface: "6.7 42.9% 91.8%",
        fg: "345 23.5% 13.3%",
        muted: "333.6 12.8% 38.2%",
        accent: "350.1 57.2% 39.4%",
        accentFg: "26.7 52.9% 96.7%",
        fontHeading: SERIF,
        fontBody: SANS,
        headingWeight: 600,
        radius: 10,
    },
} satisfies Record<string, SiteLook>;

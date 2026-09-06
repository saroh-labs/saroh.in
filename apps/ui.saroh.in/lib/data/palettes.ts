/**
 * Merchant palettes for the catalog (#252).
 *
 * A block draws entirely from the `--site-*` layer, and the single most
 * important thing this catalog has to demonstrate is that the layer is real:
 * the same component, unchanged, in three different merchants' colours, none of
 * them Saroh's. A catalog that could only show one palette would be showing the
 * blocks and hiding the point.
 *
 * These are the shape a publication's `styleVariables` has — what the publisher
 * resolves from a merchant's six colour choices and five scalars, and what
 * `SiteTheme` writes into a `<style>` element. They are hand-authored here, not
 * fetched: this app has no backend and needs none.
 *
 * `--site-muted` and `--site-border` are DERIVED by the publisher rather than
 * chosen — a merchant picks six colours, not nine, and a separate border swatch
 * is how a dark palette ends up with hairlines nobody can see. They are written
 * out here because a preview has no publisher to derive them.
 */

/** One merchant's resolved token set, as a snapshot would carry it. */
export interface Palette {
    /** Stable id, used in preview URLs. */
    id: string;
    /** What a reader sees above the preview. */
    label: string;
    /** What this palette is here to prove. */
    note: string;
    variables: Record<string, string>;
}

const SHARED_SCALARS = {
    "--site-page-margin": "38px",
    "--site-section-padding": "52px",
    "--site-grid-gap": "14px",
} as const;

export const PALETTES: readonly [Palette, ...Palette[]] = [
    {
        id: "paper",
        label: "Paper",
        note: "A light ground with an ink accent — closest to the fallback an unstyled site gets.",
        variables: {
            "--site-bg": "0 0% 100%",
            "--site-surface": "40 20% 97%",
            "--site-fg": "24 10% 10%",
            "--site-body": "24 6% 34%",
            "--site-muted": "24 6% 46%",
            "--site-border": "24 10% 88%",
            "--site-accent": "24 10% 10%",
            "--site-accent-fg": "0 0% 100%",
            "--site-hero-bg": "40 20% 97%",
            "--site-hero-fg": "24 10% 10%",
            "--site-cta-bg": "24 10% 10%",
            "--site-cta-fg": "0 0% 98%",
            "--site-footer-bg": "24 10% 10%",
            "--site-footer-fg": "0 0% 98%",
            "--site-radius": "2px",
            "--site-heading-scale": "1",
            ...SHARED_SCALARS,
        },
    },
    {
        id: "terracotta",
        label: "Terracotta",
        note: "A warm ground with a clay accent, and a hero band that is not the page colour.",
        variables: {
            "--site-bg": "36 33% 97%",
            "--site-surface": "36 30% 94%",
            "--site-fg": "20 25% 15%",
            "--site-body": "20 12% 38%",
            "--site-muted": "20 10% 50%",
            "--site-border": "28 25% 86%",
            "--site-accent": "18 45% 45%",
            "--site-accent-fg": "0 0% 98%",
            "--site-hero-bg": "28 40% 90%",
            "--site-hero-fg": "20 25% 15%",
            "--site-cta-bg": "18 45% 45%",
            "--site-cta-fg": "0 0% 98%",
            "--site-footer-bg": "20 25% 15%",
            "--site-footer-fg": "36 33% 97%",
            "--site-radius": "8px",
            "--site-heading-scale": "1.05",
            ...SHARED_SCALARS,
        },
    },
    {
        id: "ink",
        label: "Ink",
        note: "A dark ground. The palette that catches contrast bugs — see #263.",
        variables: {
            "--site-bg": "220 18% 9%",
            "--site-surface": "220 16% 13%",
            "--site-fg": "0 0% 98%",
            "--site-body": "220 8% 74%",
            "--site-muted": "220 8% 60%",
            "--site-border": "220 12% 24%",
            "--site-accent": "170 60% 55%",
            "--site-accent-fg": "220 18% 9%",
            "--site-hero-bg": "220 16% 13%",
            "--site-hero-fg": "0 0% 98%",
            "--site-cta-bg": "170 60% 55%",
            "--site-cta-fg": "220 18% 9%",
            "--site-footer-bg": "220 16% 13%",
            "--site-footer-fg": "0 0% 98%",
            "--site-radius": "0px",
            "--site-heading-scale": "0.95",
            ...SHARED_SCALARS,
        },
    },
];

/** A palette by id, or the first one. Preview URLs carry the id. */
export function paletteById(id: string | undefined): Palette {
    return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/**
 * The widths a preview is offered at.
 *
 * These are real iframe widths, not a `max-width` on a div — Tailwind's `sm:`
 * and `lg:` are VIEWPORT media queries, so a block inside a 375px-wide
 * container still lays itself out as though it had the whole window. A catalog
 * claiming to show the phone case while showing the desktop one would be worse
 * than not claiming it.
 */
export const PREVIEW_WIDTHS = [
    { id: "phone", label: "Phone", px: 375 },
    { id: "desk", label: "Desk", px: 1280 },
] as const;

export type PreviewWidth = (typeof PREVIEW_WIDTHS)[number]["id"];

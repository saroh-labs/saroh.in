/**
 * A template's own palette (DEC-090): exact colours for the `--site-*` roles.
 *
 * Website › Style's rows are curated swatch KEYS (`site-style.ts` in the
 * API), and that stays the merchant's vocabulary. A template's design,
 * though, is drawn in exact colours — the blog's one red, the ceramics
 * studio's deep green — that no curated row holds, and nine more rows would
 * be nine more choices for a merchant who never needed them. So a template
 * may carry a palette: one exact colour per role, checked here, and a
 * merchant may pick it only as one of their template's colourways. The API
 * enforces that (`site-style-offer.ts`); this module is the colour rules both
 * sides share.
 *
 * Pure: no React, no Nest. Lives in the contract package for the reason
 * `fonts.ts` does — the API reaches it through `@saroh/templates`, the editor
 * directly, so the rule is written once and the preview cannot drift from
 * what publishes.
 *
 * Only `#RRGGBB`. A palette is written by a template author and compared by
 * value, so one spelling per colour; and a value is never written into CSS as
 * given — it is turned into the HSL triple the `--site-*` layer already
 * carries (`paletteVariables`), which the renderer's guard accepts as it
 * always has.
 */

/** The roles a palette colours, in the order `--site-*` declares them. */
export const PALETTE_ROLES = [
    "bg",
    "surface",
    "fg",
    "body",
    "muted",
    "border",
    "accent",
    "accentFg",
    "heroBg",
    "heroFg",
    "ctaBg",
    "ctaFg",
    "footerBg",
    "footerFg",
] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

/** A complete palette: every role, each `#RRGGBB` in capitals. */
export type SitePalette = Record<PaletteRole, string>;

/**
 * What a template writes. Four roles are required; the rest fall back as
 * the design system's own rules would draw them (see {@link PALETTE_FALLBACK}).
 */
export type SitePaletteInput = Pick<
    SitePalette,
    "bg" | "fg" | "accent" | "accentFg"
> &
    Partial<SitePalette>;

const REQUIRED: readonly PaletteRole[] = ["bg", "fg", "accent", "accentFg"];

/**
 * Where an absent role comes from. The page's colours stand in for a band
 * that was not given its own (a hero, a footer on the page ground is the
 * common design), and the call-to-action band is the accent.
 *
 * `border` is not here: an absent hairline is mixed from the text into the
 * ground, as Website › Style's derived hairline is, because a fixed pale
 * border is invisible on a dark ground.
 */
const PALETTE_FALLBACK: Partial<Record<PaletteRole, PaletteRole>> = {
    surface: "bg",
    body: "fg",
    muted: "body",
    heroBg: "bg",
    heroFg: "fg",
    ctaBg: "accent",
    ctaFg: "accentFg",
    footerBg: "bg",
    footerFg: "fg",
};

/** The `--site-*` property each role sets. */
export const PALETTE_VARIABLES: Record<PaletteRole, string> = {
    bg: "--site-bg",
    surface: "--site-surface",
    fg: "--site-fg",
    body: "--site-body",
    muted: "--site-muted",
    border: "--site-border",
    accent: "--site-accent",
    accentFg: "--site-accent-fg",
    heroBg: "--site-hero-bg",
    heroFg: "--site-hero-fg",
    ctaBg: "--site-cta-bg",
    ctaFg: "--site-cta-fg",
    footerBg: "--site-footer-bg",
    footerFg: "--site-footer-fg",
};

/** WCAG AA for body text: what every text pairing must reach. */
export const PALETTE_MIN_CONTRAST = 4.5;

/**
 * The pairs a visitor reads: text role on the ground it sits on, and what to
 * call the pair when it fails. `accent` on the page is here because the
 * accent IS text — links, "Shop →", an eyebrow — not only a fill. Hairlines
 * (`border`) are decoration and carry no ratio.
 */
export const PALETTE_CONTRAST_PAIRS: readonly {
    text: PaletteRole;
    ground: PaletteRole;
    label: string;
}[] = [
    { text: "fg", ground: "bg", label: "Text on the page" },
    { text: "body", ground: "bg", label: "Body copy on the page" },
    { text: "muted", ground: "bg", label: "Quiet text on the page" },
    { text: "accent", ground: "bg", label: "Links on the page" },
    { text: "fg", ground: "surface", label: "Text on a card" },
    { text: "body", ground: "surface", label: "Body copy on a card" },
    { text: "accentFg", ground: "accent", label: "Text on the accent" },
    { text: "heroFg", ground: "heroBg", label: "Text on the hero" },
    {
        text: "ctaFg",
        ground: "ctaBg",
        label: "Text on the call-to-action band",
    },
    { text: "footerFg", ground: "footerBg", label: "Text on the footer" },
];

/** One refused role, by its field path, and why in plain words. */
export interface PaletteProblem {
    field: string;
    message: string;
}

export type PaletteResult =
    | { ok: true; palette: SitePalette }
    | { ok: false; problems: PaletteProblem[] };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A `#RRGGBB` value in capitals, or null for anything else. */
export function normalizeHex(value: unknown): string | null {
    return typeof value === "string" && HEX.test(value.trim())
        ? value.trim().toUpperCase()
        : null;
}

function channels(hex: string): [number, number, number] {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
    return `#${[r, g, b]
        .map((c) => Math.round(c).toString(16).padStart(2, "0"))
        .join("")}`.toUpperCase();
}

/** WCAG 2 relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = channels(hex).map((c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two `#RRGGBB` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `ratio` of the way from `from` to `to`, channel by channel. */
function mixHex(from: string, to: string, ratio: number): string {
    const a = channels(from);
    const b = channels(to);
    return toHex(
        [0, 1, 2].map((i) => a[i] + ratio * (b[i] - a[i])) as [
            number,
            number,
            number,
        ],
    );
}

/**
 * Validate a palette and complete it.
 *
 * Refuses, never coerces: a colour that is not `#RRGGBB`, or a pairing under
 * {@link PALETTE_MIN_CONTRAST}, is a problem named by its field
 * (`palette.muted`), every one of them at once so a template author fixes a
 * palette in one pass. An unknown role is refused too, rather than dropped:
 * it is a typo for a role that then silently falls back.
 */
export function parsePalette(input: unknown): PaletteResult {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return {
            ok: false,
            problems: [
                { field: "palette", message: "A palette must be an object" },
            ],
        };
    }
    const raw = input as Record<string, unknown>;
    const problems: PaletteProblem[] = [];
    const known = new Set<string>(PALETTE_ROLES);
    for (const key of Object.keys(raw)) {
        if (!known.has(key)) {
            problems.push({
                field: `palette.${key}`,
                message: `"${key}" is not a palette role`,
            });
        }
    }

    const given: Partial<SitePalette> = {};
    for (const role of PALETTE_ROLES) {
        const value = raw[role];
        if (value === undefined) {
            if (REQUIRED.includes(role)) {
                problems.push({
                    field: `palette.${role}`,
                    message: `The palette needs a ${role} colour`,
                });
            }
            continue;
        }
        const hex = normalizeHex(value);
        if (!hex) {
            problems.push({
                field: `palette.${role}`,
                message: `${role} must be a colour written #RRGGBB`,
            });
            continue;
        }
        given[role] = hex;
    }
    if (problems.length > 0) return { ok: false, problems };

    const palette = { ...given } as SitePalette;
    // Fallbacks resolve in declaration order, so `muted` finds `body` filled.
    for (const role of PALETTE_ROLES) {
        if (palette[role]) continue;
        const from = PALETTE_FALLBACK[role];
        palette[role] = from
            ? palette[from]
            : mixHex(palette.bg, palette.fg, 0.11); // border
    }

    for (const pair of PALETTE_CONTRAST_PAIRS) {
        const ratio = contrastRatio(palette[pair.text], palette[pair.ground]);
        if (ratio < PALETTE_MIN_CONTRAST) {
            problems.push({
                field: `palette.${pair.text}`,
                message: `${pair.label} reads at ${ratio.toFixed(2)}:1; it needs ${PALETTE_MIN_CONTRAST}:1`,
            });
        }
    }
    return problems.length > 0
        ? { ok: false, problems }
        : { ok: true, palette };
}

/** Whether two complete palettes are the same colours. */
export function samePalette(a: SitePalette, b: SitePalette): boolean {
    return PALETTE_ROLES.every((role) => a[role] === b[role]);
}

const round = (n: number) => Number(n.toFixed(2)).toString();

/**
 * A `#RRGGBB` colour as the HSL triple the `--site-*` layer carries
 * (`"8.18 73.33% 35.29%"`). Two decimals, so the colour a browser draws from
 * `hsl(var(--site-accent))` is the exact one the template named.
 */
export function hexToHslTriple(hex: string): string {
    const [r, g, b] = channels(hex).map((c) => c / 255) as [
        number,
        number,
        number,
    ];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return `0 0% ${round(l * 100)}%`;
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return `${round(h * 60)} ${round(s * 100)}% ${round(l * 100)}%`;
}

/** A complete palette as `--site-*` custom properties. */
export function paletteVariables(palette: SitePalette): Record<string, string> {
    return Object.fromEntries(
        PALETTE_ROLES.map((role) => [
            PALETTE_VARIABLES[role],
            hexToHslTriple(palette[role]),
        ]),
    );
}

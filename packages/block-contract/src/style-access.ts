import { DEFAULT_FONT_PAIR } from "./fonts";
import type { LookId } from "./looks";
import { LOOK_IDS } from "./looks";
import type { SitePalette } from "./palette";
import { samePalette } from "./palette";

/**
 * Free and paid looks, typefaces and colourways (DEC-177): the one rule the
 * API's style save (`site-style-free.ts`) and the app's Style panel
 * (`lib/sites/style-access.ts`) both run, so the panel refuses in place
 * exactly what the save would refuse (review #22).
 *
 * - WHICH are free is the live catalogue's `freeStyles`; on top of it,
 *   every site always has the visitor's system font
 *   ({@link DEFAULT_FONT_PAIR}), its own template's typefaces and the
 *   colourway it was made in.
 * - A colourway is its exact palette (DEC-090): a style is in a colourway
 *   when its palette is that colourway's. One with no palette is never
 *   told apart, so never paid.
 * - Classic (no look), and whatever the site already has (the draft's look,
 *   pair or colourway, and the live site's look), are always allowed.
 */

export type StyleKind = "look" | "fontPair" | "colourway";

/** The catalogue's free lists, as `@saroh/pricing-catalog` serves them. */
export interface FreeStyleLists {
    looks: readonly string[];
    fontPairs: readonly string[];
    /** `template:colourway` ids ({@link colourwayKey}). */
    colourways: readonly string[];
}

/** What a site may choose for nothing, by kind: ids as the editor holds them. */
export interface SiteFreeStyles {
    looks: LookId[];
    fontPairs: string[];
    /** The site's template's colourways, by their own id (`kesar`). */
    colourways: string[];
}

/** What the editor's Style panel needs to mark and refuse a paid choice. */
export interface SiteStyleAccess {
    free: SiteFreeStyles;
    /** The plan includes `themes`: every choice is open to it. */
    paidIncluded: boolean;
}

/** One of a template's colourways, as far as the rule needs it. */
export interface StyleColourwayRef {
    id: string;
    palette?: SitePalette;
}

/** The parts of a style the rule reads. */
export interface StyleChoiceHeld {
    look?: LookId | null;
    fontPair?: string | null;
    palette?: SitePalette;
}

/** A template as the rule reads it: its colourway presets. */
export interface StyleTemplateRef {
    id: string;
    styles?: readonly { id: string; style: { fontPair?: unknown } }[];
}

/** A colourway's id in the catalogue: unique only with its template's. */
export function colourwayKey(templateId: string, colourwayId: string): string {
    return `${templateId}:${colourwayId}`;
}

/**
 * What one site may choose for nothing: the catalogue's free lists, as they
 * apply to its template, plus what every site always has.
 */
export function siteFreeStyles(
    lists: FreeStyleLists,
    template: StyleTemplateRef | null | undefined,
    startColourway: string | null | undefined,
): SiteFreeStyles {
    const looks = LOOK_IDS.filter((l) => lists.looks.includes(l));
    const presets = template?.styles ?? [];
    const ownPairs = presets.flatMap((p) =>
        typeof p.style.fontPair === "string" ? [p.style.fontPair] : [],
    );
    const fontPairs = Array.from(
        new Set<string>([DEFAULT_FONT_PAIR, ...ownPairs, ...lists.fontPairs]),
    );
    // The one it was made in, else the template's first (as Reset reads it).
    const start = presets.some((p) => p.id === startColourway)
        ? startColourway
        : presets[0]?.id;
    const colourways = presets
        .filter(
            (p) =>
                p.id === start ||
                (!!template &&
                    lists.colourways.includes(colourwayKey(template.id, p.id))),
        )
        .map((p) => p.id);
    return { looks, fontPairs, colourways };
}

/** The colourway a palette is, by its exact colours; null for none. */
export function colourwayOfPalette(
    palette: SitePalette | undefined,
    colourways: readonly StyleColourwayRef[],
): string | null {
    if (!palette) return null;
    return (
        colourways.find((c) => c.palette && samePalette(c.palette, palette))
            ?.id ?? null
    );
}

/** The id a style holds for each kind; Classic is null, no pair the default. */
export function heldStyleIds(
    style: StyleChoiceHeld | undefined,
    colourways: readonly StyleColourwayRef[],
): Record<StyleKind, string | null> {
    return {
        look: style?.look ?? null,
        fontPair: style?.fontPair ?? DEFAULT_FONT_PAIR,
        colourway: colourwayOfPalette(style?.palette, colourways),
    };
}

const FREE_LIST: Record<StyleKind, keyof SiteFreeStyles> = {
    look: "looks",
    fontPair: "fontPairs",
    colourway: "colourways",
};

/** Not free for this site: marked "Paid plans". */
export function isPaidStyle(
    free: SiteFreeStyles,
    kind: StyleKind,
    id: string,
    colourways: readonly StyleColourwayRef[],
): boolean {
    if (
        kind === "colourway" &&
        !colourways.some((c) => c.id === id && c.palette)
    ) {
        return false;
    }
    return !(free[FREE_LIST[kind]] as string[]).includes(id);
}

/**
 * Whether choosing `id` needs the plan's `themes` row: paid, and not what
 * the site already has (keeping or going back to that is always allowed).
 */
export function needsPaidPlan(
    {
        free,
        held,
        liveLook,
        colourways,
    }: {
        free: SiteFreeStyles;
        held: Record<StyleKind, string | null>;
        liveLook?: LookId | null;
        colourways: readonly StyleColourwayRef[];
    },
    kind: StyleKind,
    id: string,
): boolean {
    return (
        isPaidStyle(free, kind, id, colourways) &&
        held[kind] !== id &&
        !(kind === "look" && id === liveLook)
    );
}

/** A part of a style save that is paid and not already the site's. */
export interface PaidStylePart {
    field: "look" | "fontPair" | "palette";
    /** The look, pair or colourway (`template:colourway`) chosen. */
    id: string;
}

/**
 * The parts of `next` that are paid for this site and not what it already
 * has. Empty: the save needs no plan row.
 */
export function paidStyleParts(
    next: StyleChoiceHeld,
    {
        stored,
        liveLook,
        templateId,
        colourways,
        free,
    }: {
        /** The draft's style before this save. */
        stored: StyleChoiceHeld | undefined;
        /** The live site's look, when it has one. */
        liveLook?: LookId | null;
        /** The site's template; none, and no colourway is told apart. */
        templateId: string | null;
        colourways: readonly StyleColourwayRef[];
        free: SiteFreeStyles;
    },
): PaidStylePart[] {
    const known = templateId ? colourways : [];
    const want = heldStyleIds(next, known);
    const ctx = {
        free,
        held: heldStyleIds(stored, known),
        liveLook,
        colourways: known,
    };
    const paid: PaidStylePart[] = [];
    if (want.look && needsPaidPlan(ctx, "look", want.look)) {
        paid.push({ field: "look", id: want.look });
    }
    if (want.fontPair && needsPaidPlan(ctx, "fontPair", want.fontPair)) {
        paid.push({ field: "fontPair", id: want.fontPair });
    }
    if (
        templateId &&
        want.colourway &&
        needsPaidPlan(ctx, "colourway", want.colourway)
    ) {
        paid.push({
            field: "palette",
            id: colourwayKey(templateId, want.colourway),
        });
    }
    return paid;
}

/**
 * Fixtures the API's and the app's tests both run (review #22): one site
 * made in its template's first colourway, with the template's pair, and
 * what each choice needs on a plan without `themes`. Each side draws the
 * three colourways' palettes its own way (the API parses a template's), so
 * the fixture names only their ids.
 */
export const STYLE_ACCESS_FIXTURE = {
    templateId: "studio",
    /** The template's colourways, its first first. */
    colourwayIds: ["first", "freed", "paid"],
    /** The template's own pair, on every colourway. */
    ownPair: "fraunces-inter-tight",
    lists: {
        looks: ["quiet"],
        fontPairs: [],
        colourways: ["studio:freed"],
    },
    startColourway: "first",
} as const satisfies {
    templateId: string;
    colourwayIds: readonly string[];
    ownPair: string;
    lists: FreeStyleLists;
    startColourway: string;
};

export const STYLE_ACCESS_CASES: readonly {
    name: string;
    kind: StyleKind;
    id: string;
    /** The live site's look. */
    liveLook?: LookId;
    paid: boolean;
    refused: boolean;
}[] = [
    {
        name: "a free look",
        kind: "look",
        id: "quiet",
        paid: false,
        refused: false,
    },
    {
        name: "a paid look",
        kind: "look",
        id: "live",
        paid: true,
        refused: true,
    },
    {
        name: "the live site's paid look",
        kind: "look",
        id: "folio",
        liveLook: "folio",
        paid: true,
        refused: false,
    },
    {
        name: "the system font",
        kind: "fontPair",
        id: DEFAULT_FONT_PAIR,
        paid: false,
        refused: false,
    },
    {
        name: "the template's own pair",
        kind: "fontPair",
        id: "fraunces-inter-tight",
        paid: false,
        refused: false,
    },
    {
        name: "a paid pair",
        kind: "fontPair",
        id: "archivo",
        paid: true,
        refused: true,
    },
    {
        name: "the colourway it was made in",
        kind: "colourway",
        id: "first",
        paid: false,
        refused: false,
    },
    {
        name: "a colourway the catalogue frees",
        kind: "colourway",
        id: "freed",
        paid: false,
        refused: false,
    },
    {
        name: "a paid colourway",
        kind: "colourway",
        id: "paid",
        paid: true,
        refused: true,
    },
];

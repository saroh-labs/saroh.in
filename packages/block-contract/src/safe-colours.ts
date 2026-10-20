import type { LookId } from "./looks";
import { LOOKS } from "./looks";
import type { PaletteRole, SitePalette } from "./palette";
import {
    contrastRatio,
    mixHex,
    PALETTE_GRAPHIC_CONTRAST,
    PALETTE_MIN_CONTRAST,
    relativeLuminance,
} from "./palette";

/**
 * Colours made safe, never refused (KD4, D-18, D-01).
 *
 * A look is drawn in the business's own colours, and a business's colour is
 * whatever it is: a bright yellow, a pale pink, its ink. `parsePalette`
 * refuses a palette that fails a contrast pair, which is right for a
 * template author fixing a file and wrong for a merchant whose brand is
 * yellow. So a look DERIVES what it draws from the colours it is given:
 *
 * - the accent, as a fill, is moved toward the text until it reaches 3:1
 *   on the page and on a card, and text on it is ink or white, whichever
 *   reads (4.5:1);
 * - the accent as text (`accentText`) is moved further, to 4.5:1 on both;
 * - a control's edge (`rule`) reaches 3:1 on both;
 * - every text colour reaches 4.5:1 on what it sits on.
 *
 * An accent that is the ink itself has nothing to move: it stays ink, and
 * the look draws it as an outline (`accentTreatment: "outline"`), so a
 * button is still told apart from a heading.
 *
 * The result always passes `parsePalette`: that one contrast check is the
 * proof, and the tests hold every row combination and every template
 * colourway to it. Pure: no React, no Nest.
 */

/** How a look draws its accent: filled, or (an ink accent) outlined. */
export type AccentTreatment = "fill" | "outline";

export interface SafeColours {
    /** Every role, the safe roles included; passes `parsePalette`. */
    palette: SitePalette & {
        accentText: string;
        accentSoft: string;
        rule: string;
        footerMuted: string;
    };
    accentTreatment: AccentTreatment;
}

const WHITE = "#FFFFFF";
const BLACK = "#000000";
/** The ink a look sets on a light fill when the palette has none darker. */
const INK = "#111111";

/**
 * Below this an accent is the ink, not a colour: there is no hue to keep,
 * and moving it would only make a grey.
 */
const INK_LIKE = 1.5;

/** How far toward the page an accent's tint sits. */
const SOFT_MIX = 0.88;

/** How far toward the footer its quiet text starts. */
const FOOTER_MUTED_MIX = 0.35;

/** Steps when moving a colour toward another: 2% each. */
const STEPS = 50;

function worst(colour: string, grounds: readonly string[]): number {
    return Math.min(...grounds.map((g) => contrastRatio(colour, g)));
}

/** Black or white, whichever reads better on every ground. */
function extremeFor(grounds: readonly string[]): string {
    return worst(BLACK, grounds) >= worst(WHITE, grounds) ? BLACK : WHITE;
}

/**
 * The first colour on the way from `colour` to `toward` that `ok` accepts,
 * nearest first; then the extreme that reads on `grounds` (black or white,
 * which always reaches 4.5:1 on a single ground).
 */
function moveUntil(
    colour: string,
    toward: string,
    grounds: readonly string[],
    ok: (candidate: string) => boolean,
): string {
    for (let i = 0; i <= STEPS; i++) {
        const candidate = mixHex(colour, toward, i / STEPS);
        if (ok(candidate)) return candidate;
    }
    const extreme = extremeFor(grounds);
    for (let i = 0; i <= STEPS; i++) {
        const candidate = mixHex(colour, extreme, i / STEPS);
        if (ok(candidate)) return candidate;
    }
    return extreme;
}

/**
 * `colour` if it reads at `min` on every ground, else moved toward `toward`.
 * Exported for the invoice paper's colour (`invoice-paper.ts`), which keeps
 * a business's colour readable by the same rule a look does.
 */
export function reaching(
    colour: string,
    grounds: readonly string[],
    min: number,
    toward: string,
): string {
    return moveUntil(colour, toward, grounds, (c) => worst(c, grounds) >= min);
}

/** Ink or white on `fill`, whichever reads better. */
export function textOn(fill: string, ink: string): string {
    return contrastRatio(ink, fill) >= contrastRatio(WHITE, fill) ? ink : WHITE;
}

/**
 * Text on a band: kept when it reads at 4.5:1, else ink or white, else
 * black or white (one of which always does).
 */
function readableOn(text: string, ground: string, ink: string): string {
    if (contrastRatio(text, ground) >= PALETTE_MIN_CONTRAST) return text;
    const choice = textOn(ground, ink);
    return contrastRatio(choice, ground) >= PALETTE_MIN_CONTRAST
        ? choice
        : extremeFor([ground]);
}

/**
 * Safe colours for a look, from a complete palette (a template's, or the
 * one Website › Style's rows resolve to).
 */
export function deriveSafeColours(
    input: SitePalette,
    look: LookId,
): SafeColours {
    const p: Record<string, string> = { ...input };

    // Live draws cards: a surface a step off the page, unless the
    // palette already has its own.
    const tint = LOOKS[look].colour.surfaceTint;
    if (tint > 0 && p.surface === p.bg) {
        p.surface = mixHex(p.bg, p.fg, tint);
    }
    const page = [p.bg, p.surface];

    // The ink: the page's text, when it reads, else black or white.
    p.fg = reaching(p.fg, page, PALETTE_MIN_CONTRAST, extremeFor(page));
    const fg = p.fg;
    p.body = reaching(p.body, page, PALETTE_MIN_CONTRAST, fg);
    p.muted = reaching(p.muted, page, PALETTE_MIN_CONTRAST, fg);

    // What a light fill's text is: the darkest colour on the page, when
    // it is dark enough to be ink.
    const darkest = [fg, p.bg].sort(
        (a, b) => relativeLuminance(a) - relativeLuminance(b),
    )[0];
    const ink = relativeLuminance(darkest) < 0.05 ? darkest : INK;

    let accentTreatment: AccentTreatment = "fill";
    const given = p.accent;
    if (contrastRatio(given, fg) < INK_LIKE) {
        p.accent = fg;
        accentTreatment = "outline";
    } else {
        p.accent = moveUntil(
            given,
            fg,
            page,
            (c) =>
                worst(c, page) >= PALETTE_GRAPHIC_CONTRAST &&
                contrastRatio(textOn(c, ink), c) >= PALETTE_MIN_CONTRAST,
        );
    }
    const accent = p.accent;
    // The template's own text on its accent, while it still reads.
    p.accentFg =
        accent === given &&
        contrastRatio(p.accentFg, accent) >= PALETTE_MIN_CONTRAST
            ? p.accentFg
            : readableOn(textOn(accent, ink), accent, ink);
    p.accentText = reaching(accent, page, PALETTE_MIN_CONTRAST, fg);
    p.rule = reaching(p.border, page, PALETTE_GRAPHIC_CONTRAST, fg);
    p.accentSoft = moveUntil(
        mixHex(accent, p.bg, SOFT_MIX),
        p.bg,
        [fg],
        (c) => contrastRatio(fg, c) >= PALETTE_MIN_CONTRAST,
    );

    // A call-to-action band in the accent stays in it, moved with it.
    if (p.ctaBg === given) p.ctaBg = accent;
    const bands: [PaletteRole, PaletteRole][] = [
        ["heroFg", "heroBg"],
        ["ctaFg", "ctaBg"],
        ["footerFg", "footerBg"],
    ];
    for (const [text, ground] of bands) {
        p[text] = readableOn(p[text], p[ground], ink);
    }
    const footerFg = p.footerFg;
    const footerBg = p.footerBg;
    p.footerMuted = moveUntil(
        mixHex(footerFg, footerBg, FOOTER_MUTED_MIX),
        footerFg,
        [footerBg],
        (c) => contrastRatio(c, footerBg) >= PALETTE_MIN_CONTRAST,
    );

    return {
        palette: p as SafeColours["palette"],
        accentTreatment,
    };
}

import type { PaperStyle } from "@saroh/block-contract";
import {
    PAPER_INK,
    PAPER_STYLE_WORDS,
    PAPER_STYLES,
    paperColourOf,
    paperColours,
} from "@saroh/block-contract";

/**
 * How a draft's paper looks, as the style panel offers it (DEC-173, U15
 * #1127). Pure. The colour rule itself is the shared one
 * (`@saroh/block-contract` `paperColours`), so the panel says "made deeper"
 * exactly when the paper and the PDF draw it deeper.
 *
 * A draft's own choice is two fields, each "" while it follows the
 * business's default: the style and the colour fall back on their own, as
 * the API reads them.
 */

/**
 * The colours the panel offers (INVNewEdit's style rail): ink, then the
 * board's four. They are the paper's ink, data stored on the invoice and
 * printed on the PDF, so they are hex values here and never a theme token.
 */
export const PAPER_SWATCHES = [
    PAPER_INK,
    "#6B3F1D",
    "#2F5D50",
    "#3B4A8C",
    "#9B2C4A",
] as const;

/** A swatch's name for a screen reader. */
export function swatchName(hex: string): string {
    return hex === PAPER_INK ? "Ink" : `Colour ${hex}`;
}

/** A colour as typed: `#RRGGBB` in capitals, or null when it isn't one. */
export function typedColour(typed: string): string | null {
    const t = typed.trim();
    const hex = t.startsWith("#") ? t : `#${t}`;
    return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

/** The business's default look, as the settings read gives it. */
export interface PaperDefault {
    style: PaperStyle;
    colour: string | null;
}

/** What the draft chose itself: "" follows the default. */
export interface PaperChoice {
    paperStyle?: PaperStyle | "";
    paperColour?: string;
}

/** The look the paper is drawn in: the draft's own, else the default. */
export function lookOf(
    choice: PaperChoice,
    fallback: PaperDefault,
): { style: PaperStyle; colour: string | null } {
    return {
        // "" follows the default, as left out does.
        style:
            choice.paperStyle === undefined || choice.paperStyle === ""
                ? fallback.style
                : choice.paperStyle,
        colour: choice.paperColour
            ? paperColourOf(choice.paperColour)
            : fallback.colour,
    };
}

/** The draft chose a style or a colour of its own. */
export function hasOwnLook(choice: PaperChoice): boolean {
    return Boolean(choice.paperStyle) || Boolean(choice.paperColour);
}

/** "Classic · ink", "Band · #6B3F1D": a look in a few words. */
export function lookWords(look: PaperDefault): string {
    const name = PAPER_STYLE_WORDS[look.style].name;
    const colour = paperColourOf(look.colour);
    return colour && colour !== PAPER_INK
        ? `${name} · ${colour}`
        : `${name} · ink`;
}

/**
 * Whether the paper draws `colour` other than as chosen, so it reads: a
 * pale colour as text is moved toward ink, and a band no text reads on is
 * moved too. The panel says so in a line, rather than refusing it.
 */
export function colourMoved(style: PaperStyle, colour: string | null): boolean {
    const hex = paperColourOf(colour);
    if (!hex) return false;
    const drawn = paperColours(style, hex);
    if (style === "BAND") return drawn.band?.fill !== hex;
    return drawn.accent !== hex;
}

/** The three styles, in the panel's order, with their words. */
export const STYLE_CHOICES = PAPER_STYLES.map((value) => ({
    value,
    ...PAPER_STYLE_WORDS[value],
}));

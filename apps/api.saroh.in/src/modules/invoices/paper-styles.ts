import { BadRequestException } from "@nestjs/common";
import type { PaperStyle } from "@saroh/block-contract";
import {
    PAPER_STYLES,
    paperColourOf,
    paperStyleOf,
} from "@saroh/block-contract";

/**
 * Invoice styles (DEC-173, U6 #1118): Classic, Band and Compact, in the
 * business's colour. The styles, the colour rule and the Rule 46 field list
 * live in `@saroh/block-contract` (`invoice-paper.ts`), so the app's paper
 * and this API's PDF draw from one rule; this file is the API's side —
 * what a write may store, and which look a paper is drawn in.
 *
 * - The business's default is `BusinessProfile.invoiceStyle` and
 *   `invoiceColour`: null style is Classic, null colour is ink. Owner or
 *   Admin sets it (`org:update`), on Settings.
 * - A draft may choose its own (`Invoice.paperStyle`, `paperColour`); null
 *   follows the business's default, read when the draft is.
 * - Issuing freezes the look it went out in (`documentColumns`, DEC-082):
 *   a later change of default never redraws issued paper. Null on issued
 *   paper is Classic in ink, which is every invoice issued before styles.
 * - The logo is the one live part (DEC-082).
 */

export {
    bandTextTone,
    PAPER_STYLES,
    paperColours,
    RULE_46_FIELDS,
} from "@saroh/block-contract";
export type { PaperStyle } from "@saroh/block-contract";

/** The look a paper is drawn in. */
export interface InvoicePaper {
    style: PaperStyle;
    /** `#RRGGBB`, or null for ink. */
    colour: string | null;
}

/** As stored: a style or colour each, or null. */
export interface PaperColumns {
    style?: string | null;
    colour?: string | null;
}

/** "Classic in ink": a paper with nothing chosen. */
export const PLAIN_PAPER: InvoicePaper = { style: "CLASSIC", colour: null };

/**
 * The look of a paper: its own choice where it made one, else the
 * business's default, else Classic in ink. Style and colour each fall back
 * on their own, so a draft that only chose Band keeps the business's
 * colour. Issued paper is read with no default: what it froze is all.
 */
export function resolvePaper(
    own: PaperColumns | null | undefined,
    fallback: PaperColumns | null | undefined = null,
): InvoicePaper {
    const style = own?.style ?? fallback?.style ?? null;
    const colour = own?.colour ?? fallback?.colour ?? null;
    return { style: paperStyleOf(style), colour: paperColourOf(colour) };
}

/** The message a colour that isn't `#RRGGBB` is refused with. */
export const COLOUR_MESSAGE = "A colour like #6B3F1D";
/** The message a style that isn't one of the three is refused with. */
export const STYLE_MESSAGE = "Choose Classic, Band or Compact";

/** `#RRGGBB`, or "" to clear: the DTOs' shape for a colour. */
export const COLOUR_INPUT = /^(#[0-9A-Fa-f]{6})?$/;
/** A style, or "" to clear: the DTOs' list. */
export const STYLE_INPUTS: readonly string[] = [...PAPER_STYLES, ""];

/**
 * A style and colour a write sent, as columns: "" or null clears one (back
 * to the default), absent leaves it. Refused with a 400 on the field
 * otherwise — the DTO checks the shape too; this is the last word.
 */
export function paperWrite(
    sent: { style?: string | null; colour?: string | null },
    fields: { style: string; colour: string },
): { style?: PaperStyle | null; colour?: string | null } {
    const out: { style?: PaperStyle | null; colour?: string | null } = {};
    if (sent.style !== undefined) {
        if (sent.style === null || sent.style === "") {
            out.style = null;
        } else if ((PAPER_STYLES as readonly string[]).includes(sent.style)) {
            out.style = sent.style as PaperStyle;
        } else {
            throw new BadRequestException({
                message: STYLE_MESSAGE,
                details: { field: fields.style },
            });
        }
    }
    if (sent.colour !== undefined) {
        if (sent.colour === null || sent.colour.trim() === "") {
            out.colour = null;
        } else {
            const hex = paperColourOf(sent.colour);
            if (!hex) {
                throw new BadRequestException({
                    message: COLOUR_MESSAGE,
                    details: { field: fields.colour },
                });
            }
            out.colour = hex;
        }
    }
    return out;
}

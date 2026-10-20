import { contrastRatio, normalizeHex, PALETTE_MIN_CONTRAST } from "./palette";
import { reaching, textOn } from "./safe-colours";

/**
 * How an invoice's paper looks (DEC-173, #1118): three styles in the
 * business's colour, shared by the API's PDF (`invoices/invoice-pdf.ts`)
 * and the app's paper (`components/invoices/invoice-paper.tsx`), so the two
 * draw the same colours from the same rule. Pure: no React, no Nest.
 *
 * - **Classic**, plain and printable: today's paper. In a colour, the
 *   title and the heavy rules take it.
 * - **Band**, the business's colour across the top, the seller and the
 *   number on it.
 * - **Compact**, for long trade orders: smaller rows, and the seller and
 *   the buyer side by side.
 *
 * No style hides a field a GST tax invoice must carry (CGST Rule 46): the
 * list is {@link RULE_46_FIELDS}, and the PDF's spec and the paper's test
 * check every style against it.
 *
 * A colour is the business's own, whatever it is. It is never refused for
 * being pale or dark; what is drawn is made to read (WCAG 4.5:1 for text)
 * by the safe-colour rule the site looks use (`safe-colours.ts`).
 */

export const PAPER_STYLES = ["CLASSIC", "BAND", "COMPACT"] as const;
export type PaperStyle = (typeof PAPER_STYLES)[number];

/** The words each style is offered under (INVNewEdit's style rail). */
export const PAPER_STYLE_WORDS: Record<
    PaperStyle,
    { name: string; hint: string }
> = {
    CLASSIC: { name: "Classic", hint: "Plain and printable" },
    BAND: { name: "Band", hint: "Your colour across the top" },
    COMPACT: { name: "Compact", hint: "Fits long trade orders" },
};

/** The paper's ink: its text, and its colour when none is chosen. */
export const PAPER_INK = "#1C1C19";
/** The paper itself. */
export const PAPER_WHITE = "#FFFFFF";

export function isPaperStyle(value: unknown): value is PaperStyle {
    return (
        typeof value === "string" &&
        (PAPER_STYLES as readonly string[]).includes(value)
    );
}

/** A stored style as drawn: anything else, null included, is Classic. */
export function paperStyleOf(value: unknown): PaperStyle {
    return isPaperStyle(value) ? value : "CLASSIC";
}

/** A colour as stored: `#RRGGBB` in capitals, or null (ink). */
export function paperColourOf(value: unknown): string | null {
    return normalizeHex(value);
}

/** The text tone on a band: ink or white. */
export type BandTone = "INK" | "WHITE";

/**
 * Ink or white on a band of `fill`, whichever reads better: a pale yellow
 * takes ink, a dark blue white. Worked out, never typed.
 */
export function bandTextTone(fill: string): BandTone {
    return textOn(fill, PAPER_INK) === PAPER_INK ? "INK" : "WHITE";
}

/** What a paper draws in colour, every pair readable. */
export interface PaperColours {
    /**
     * The colour as text and rules on the paper: the business's colour
     * when it reads at 4.5:1 on white, else moved toward ink until it
     * does. Ink when no colour is chosen.
     */
    accent: string;
    /**
     * Whether a colour was chosen at all. Without one, Classic and Compact
     * draw as they always have: a quiet title and ink rules.
     */
    coloured: boolean;
    /**
     * The band, on Band: its fill and the text on it. The fill is the
     * business's colour unless neither ink nor white reads on it at 4.5:1
     * (a mid grey, say); then it is moved, darker for white text or
     * lighter for ink, until the tone it takes does.
     */
    band: { fill: string; text: string; tone: BandTone } | null;
}

/** The colours a paper in `style` and `colour` draws. */
export function paperColours(
    style: PaperStyle,
    colour: string | null | undefined,
): PaperColours {
    const hex = paperColourOf(colour);
    const base = hex ?? PAPER_INK;
    const accent = reaching(
        base,
        [PAPER_WHITE],
        PALETTE_MIN_CONTRAST,
        PAPER_INK,
    );
    if (style !== "BAND") {
        return { accent, coloured: hex !== null, band: null };
    }
    const tone = bandTextTone(base);
    const text = tone === "INK" ? PAPER_INK : PAPER_WHITE;
    const fill =
        contrastRatio(text, base) >= PALETTE_MIN_CONTRAST
            ? base
            : reaching(
                  base,
                  [text],
                  PALETTE_MIN_CONTRAST,
                  tone === "INK" ? PAPER_WHITE : PAPER_INK,
              );
    return { accent, coloured: hex !== null, band: { fill, text, tone } };
}

/**
 * The particulars a GST tax invoice must carry (CGST Rules, rule 46), each
 * by the clause that asks for it. Every style draws every one; none can be
 * hidden or dropped. The signature is on the paper that carries one (Saroh's
 * own invoices today; a business's signature is #1060). A paper that charges
 * no GST (an unregistered business's invoice or receipt) carries none of the
 * GST ones and says it is not registered.
 */
export const RULE_46_FIELDS = [
    { key: "sellerName", clause: "46(a)", label: "Seller's name" },
    { key: "sellerAddress", clause: "46(a)", label: "Seller's address" },
    { key: "sellerGstin", clause: "46(a)", label: "Seller's GSTIN" },
    { key: "number", clause: "46(b)", label: "Invoice number" },
    { key: "date", clause: "46(c)", label: "Date of issue" },
    { key: "buyerName", clause: "46(d)", label: "Buyer's name" },
    { key: "buyerAddress", clause: "46(d)", label: "Buyer's address" },
    { key: "buyerGstin", clause: "46(d)", label: "Buyer's GSTIN" },
    { key: "hsn", clause: "46(g)", label: "HSN or SAC code" },
    { key: "description", clause: "46(h)", label: "Description" },
    { key: "quantity", clause: "46(i)", label: "Quantity" },
    { key: "total", clause: "46(j)", label: "Total value" },
    { key: "taxableValue", clause: "46(k)", label: "Taxable value" },
    { key: "rate", clause: "46(l)", label: "Rate of tax" },
    { key: "taxSplit", clause: "46(m)", label: "CGST and SGST, or IGST" },
    { key: "placeOfSupply", clause: "46(n)", label: "Place of supply" },
    { key: "reverseCharge", clause: "46(p)", label: "Reverse charge" },
    { key: "signature", clause: "46(q)", label: "Signature" },
] as const;

export type Rule46Field = (typeof RULE_46_FIELDS)[number]["key"];

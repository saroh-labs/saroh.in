import { GALLERY_SAMPLES } from "./gallery-samples";
import { instantiateTemplate } from "./instantiate";
import { listTemplates } from "./registry";

/**
 * The pre-publish check's matcher for gallery sample words (DEC-182).
 *
 * "Use this look with its starter content" copies a template's pages into
 * the draft with the design's sample words: a stylist called Meher, a
 * coach's line, the bakery's story, a rate, the hours a studio keeps. They
 * are a sample business's, not the merchant's, so the check names every
 * block still holding one, by page and section, and none goes live
 * unnoticed. Advisory like the placeholder flag beside it: words the owner
 * decides to keep are theirs.
 *
 * Matched as whole pieces of text (a field, or a paragraph between tags),
 * never inside a longer sentence, so an owner's own sentence that happens
 * to share a word is not caught. A long piece (a sentence, a name with its
 * place, a price line) is enough on its own; a short one (a first name, a
 * figure) only with another sample piece in the same block, so a real
 * stylist who is also called Meher is not named for it.
 */

/** A piece this long names a block by itself (a sentence, a role, a place). */
const LONG = 12;
/** Shorter than this is never a sample's own (a "·", a "2"). */
const SHORTEST = 3;

/** Every string inside a value, however deep. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

/** Text compared as its words: spacing and entities folded. */
function folded(text: string): string {
    return (
        text
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            // Last, so "&amp;lt;" stays "&lt;" (CodeQL: double unescaping).
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
    );
}

/**
 * Each sample piece, folded, with the template it is from. A piece some
 * template lays down itself (a fact's label, "In practice") is the
 * template's words, not the sample's, and is left out. Worked out once,
 * on first use.
 */
let samplePieces: ReadonlyMap<string, string> | null = null;

function piecesOfSamples(): ReadonlyMap<string, string> {
    if (samplePieces) return samplePieces;
    const templates = new Set<string>();
    for (const t of listTemplates()) {
        const made = instantiateTemplate(t, {
            organizationName: "Sample",
            modules: ["WEBSITE", ...(t.uses ?? [])],
        });
        for (const page of made.pages) {
            for (const section of page.sections) {
                for (const text of strings(section.content)) {
                    for (const piece of piecesOf(text)) templates.add(piece);
                }
            }
        }
    }
    const pieces = new Map<string, string>();
    for (const [templateId, sample] of Object.entries(GALLERY_SAMPLES)) {
        for (const text of strings(sample)) {
            const piece = folded(text);
            if (
                piece.length >= SHORTEST &&
                !templates.has(piece) &&
                !pieces.has(piece)
            ) {
                pieces.set(piece, templateId);
            }
        }
    }
    samplePieces = pieces;
    return pieces;
}

/**
 * A text's pieces: the runs between tags, and between line breaks. A scan
 * of `<` and `>`, not a regex over the markup, so it stays linear.
 */
function piecesOf(value: string): string[] {
    const out: string[] = [];
    let at = 0;
    for (;;) {
        const open = value.indexOf("<", at);
        const close = open === -1 ? -1 : value.indexOf(">", open + 1);
        const run =
            open === -1 || close === -1
                ? value.slice(at)
                : value.slice(at, open);
        for (const line of run.split("\n")) {
            const piece = folded(line);
            if (piece !== "") out.push(piece);
        }
        if (open === -1 || close === -1) break;
        at = close + 1;
    }
    return out;
}

/**
 * Whether a whole piece of text is a gallery sample's own words, as the
 * check reads it: what "Bring in my details" may replace (DEC-182), and
 * nothing the owner has typed over.
 */
export function isGallerySample(text: unknown): boolean {
    return typeof text === "string" && piecesOfSamples().has(folded(text));
}

/** A sample piece found in a block, and the template it is from. */
export interface GallerySampleFound {
    /** The sample's words, as the block has them. */
    words: string;
    templateId: string;
}

/**
 * The first gallery sample piece in a block's text, or null: one long
 * piece, or two short ones (see above). `values` is the block's visitor
 * text, field by field; HTML is read as its runs of text.
 */
export function gallerySampleIn(
    values: readonly string[],
): GallerySampleFound | null {
    let short: GallerySampleFound | null = null;
    const seen = new Set<string>();
    for (const value of values) {
        for (const piece of piecesOf(value)) {
            const templateId = piecesOfSamples().get(piece);
            if (templateId === undefined || seen.has(piece)) continue;
            seen.add(piece);
            const found = { words: piece, templateId };
            if (piece.length >= LONG) return found;
            if (short) return short;
            short = found;
        }
    }
    return null;
}

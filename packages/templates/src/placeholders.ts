/**
 * The pre-publish check's matcher for a template's placeholder words, shared
 * (template samples): the API's `placeholderText` flag
 * (`apps/api.saroh.in/src/modules/sites/site-flags.ts`) names a merchant's
 * block that still has them, and the gallery's render test holds every
 * gallery render to having none left. One list, so the two never drift.
 */

/**
 * The words an industry template ships in place of the owner's own
 * (template polish): text that says it is a placeholder, or that tells the
 * owner what to write — "Your degree — the subject, where you studied",
 * "Say how the work is fired", "Your first coach". Matched at the START of
 * a piece of text and on a template's own phrasing, so an owner's sentence
 * that happens to begin "Say" or "Your" is not caught: the list below is
 * the templates' (`./templates/*.ts`), and a template
 * adding a new kind of instruction adds its opening here.
 */
export const TEMPLATE_PLACEHOLDER_PATTERNS: readonly RegExp[] = [
    /\bplaceholders?\b/i,
    /^your (first|second|third|fourth|fifth|lead|next|most recent) (project|coach|offer|engagement|piece|class|service)\b/i,
    /^your [^.!?—\n]{1,48} — /i,
    /^your (day rate|monthly rate|usual range)\b/i,
    /^write (a few lines|two or three|a line|a sentence|a paragraph)\b/i,
    /^say (how|what|where|which|whether|who|when|why|a little|plainly)\b/i,
    /^name something you\b/i,
    /^add one of these\b/i,
    /^one sentence on what you\b/i,
    // The Personal template's second offer and the About page's second
    // paragraph, which the openings above did not reach (DEC-141).
    /^another thing you do\b/i,
    /^then say what\b/i,
];

/**
 * Notes to the owner that a template once put where a visitor reads
 * (DEC-141): `starter@3`'s hero line told the owner what to write, and
 * every site published before it was replaced showed that to customers.
 *
 * Kept apart from the patterns above because they are held to a harder
 * rule. A placeholder is flagged; one of these is REFUSED at publish
 * (`site-flags.ts`, `ownerNoteFlags`), because it is not unfinished copy
 * but an instruction addressed to somebody else. Compared whole, as text:
 * a sentence the owner wrote that merely contains the words is theirs.
 *
 * `starter@3`'s line is spelled out here rather than imported: this file
 * is the check's list, and a template rewording its constant must not
 * silently take the old words off it.
 */
export const OWNER_NOTES: readonly string[] = [
    "Say what you do and where, in one line.",
];

/** Text compared as its words: case, spacing and the full stop ignored. */
function asWords(value: string): string {
    return value
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\.$/, "")
        .toLocaleLowerCase();
}

const OWNER_NOTE_WORDS = new Set(OWNER_NOTES.map(asWords));

/** Whether a piece of text is, whole, a template's note to the owner. */
export function isOwnerNote(value: unknown): boolean {
    return typeof value === "string" && OWNER_NOTE_WORDS.has(asWords(value));
}

/**
 * The stock sentences the first three starters gave every site (DEC-141):
 * "It starts with a conversation…", "began with a simple idea…". Not
 * instructions, but not the business's words either: each one made the same
 * claim on every starter site whatever the business was. A block that still
 * holds one is named by the pre-publish check, with the words. Matched
 * anywhere in a piece of text, since the business's name was woven round
 * them; each is long and particular enough that nobody writes it by chance.
 */
export const TEMPLATE_STOCK_PHRASES: readonly string[] = [
    // starter@1
    "we build products and experiences our customers love",
    "started with a simple idea: do great work and treat people well",
    " — we're glad you're here",
    // starter@2 and @3
    "have a look around to see the work, how it's done and who it's for",
    "it starts with a conversation: what you need, when you need it and what good looks like",
    "began with a simple idea: do good work, and treat people well",
    "welcome — here's what",
    // personal@1
    "welcome — here's how",
];

/** Curly apostrophes and an escaped one read as a plain one. */
function plainQuotes(value: string): string {
    return value.replace(/&#39;|&apos;|[‘’]/g, "'");
}

/** A starter's stock sentence in one piece of text, or null. */
export function templateStockPhraseIn(value: string): string | null {
    const text = plainQuotes(value).replace(/\s+/g, " ").toLocaleLowerCase();
    return TEMPLATE_STOCK_PHRASES.some((phrase) => text.includes(phrase))
        ? value.replace(/\s+/g, " ").trim()
        : null;
}

/**
 * A template's placeholder words in one piece of text, or null: words that
 * say what to write, a note to the owner, or a starter's stock sentence.
 */
export function templatePlaceholderIn(value: string): string | null {
    for (const line of value.split(/\n+/)) {
        const t = line.trim();
        if (t === "") continue;
        if (
            TEMPLATE_PLACEHOLDER_PATTERNS.some((re) => re.test(t)) ||
            isOwnerNote(t) ||
            templateStockPhraseIn(t) !== null
        ) {
            return t;
        }
    }
    return null;
}

/**
 * The first piece of a block's text still in a template's words. HTML is
 * read as its runs of text between tags, so one placeholder paragraph is
 * found inside a longer text block. A scan of `<` and `>`, not a regex over
 * the markup, so it stays linear (CodeQL js/polynomial-redos).
 */
export function templatePlaceholderInAny(values: string[]): string | null {
    for (const value of values) {
        let at = 0;
        for (;;) {
            const open = value.indexOf("<", at);
            const close = open === -1 ? -1 : value.indexOf(">", open + 1);
            const piece =
                open === -1 || close === -1
                    ? value.slice(at)
                    : value.slice(at, open);
            const found = templatePlaceholderIn(piece);
            if (found) return found;
            if (open === -1 || close === -1) break;
            at = close + 1;
        }
    }
    return null;
}

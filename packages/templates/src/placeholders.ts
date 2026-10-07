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
];

/** A template's placeholder words in one piece of text, or null. */
export function templatePlaceholderIn(value: string): string | null {
    for (const line of value.split(/\n+/)) {
        const t = line.trim();
        if (
            t !== "" &&
            TEMPLATE_PLACEHOLDER_PATTERNS.some((re) => re.test(t))
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

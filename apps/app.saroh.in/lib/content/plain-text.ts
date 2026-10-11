/**
 * A post's body as plain paragraphs, for the read view a reader gets
 * (`post-read-view.tsx`).
 *
 * The body is the editor's HTML, and a draft's is sanitized only when it is
 * published (`posts.service.ts`). So a draft is never drawn as markup here:
 * every tag is dropped and what is left is text React escapes. Block ends
 * become paragraph breaks so the writing still reads as written.
 */
const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|pre|tr)\s*>|<br\s*\/?>/gi;

const ENTITIES: Readonly<Record<string, string>> = {
    "&nbsp;": " ",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
};

/**
 * Every tag gone, and a script's or a style's contents with it.
 *
 * Read one character at a time, not by replacing patterns: taking a
 * pattern out of a string can leave the same pattern behind
 * ("<scr<script>ipt>"), and a reader that never copies a bracket has
 * nothing of the kind to leave. What comes back holds no "<" and no ">".
 */
function withoutTags(html: string): string {
    const lower = html.toLowerCase();
    let text = "";
    let at = 0;
    while (at < html.length) {
        const open = html.indexOf("<", at);
        if (open === -1) {
            text += html.slice(at);
            break;
        }
        text += html.slice(at, open);
        const close = html.indexOf(">", open + 1);
        // A bracket that never closes: the rest is not a tag, and is dropped
        // with its bracket rather than drawn.
        if (close === -1) break;
        at = close + 1;
        for (const hidden of ["script", "style"]) {
            const named = lower.startsWith(hidden, open + 1);
            const ends = lower.charAt(open + 1 + hidden.length);
            if (!named || !(ends === ">" || ends === "/" || /\s/.test(ends))) {
                continue;
            }
            // Skip to the end of its closing tag, or to the end of the body.
            const end = lower.indexOf(`</${hidden}`, at);
            const after = end === -1 ? -1 : lower.indexOf(">", end);
            at = after === -1 ? html.length : after + 1;
        }
    }
    return text.split(">").join("");
}

export function postParagraphs(html: string | null | undefined): string[] {
    if (!html) return [];
    const text = withoutTags(html.replace(BLOCK_END, "\n"))
        .replace(/&(nbsp|lt|gt|quot|#39|apos);/g, (e) => ENTITIES[e] ?? e)
        // Last, so "&amp;lt;" reads "&lt;" and never becomes a bracket.
        .replace(/&amp;/g, "&");
    return text
        .split(/\n+/)
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean);
}

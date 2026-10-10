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
const HIDDEN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const ENTITIES: Readonly<Record<string, string>> = {
    "&nbsp;": " ",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
};

export function postParagraphs(html: string | null | undefined): string[] {
    if (!html) return [];
    const text = html
        .replace(HIDDEN, "")
        .replace(BLOCK_END, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&(nbsp|lt|gt|quot|#39|apos);/g, (e) => ENTITIES[e] ?? e)
        // Last, so "&amp;lt;" reads "&lt;" and never becomes a bracket.
        .replace(/&amp;/g, "&");
    return text
        .split(/\n+/)
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean);
}

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

/**
 * Every tag gone, and a script's or a style's contents with it. Done again
 * until nothing changes: taking one tag out can leave another behind
 * ("<scr<script>ipt>"), and what is left must hold none at all.
 */
function withoutTags(html: string): string {
    let text = html;
    for (;;) {
        const next = text.replace(HIDDEN, "").replace(/<[^>]*>/g, "");
        if (next === text) return text.replace(/[<>]/g, "");
        text = next;
    }
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

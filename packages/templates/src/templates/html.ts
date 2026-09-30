/**
 * Escape text for the rich-text HTML a template weaves it into: a name like
 * "Rye & Co." is text, not markup. Every template that puts the owner's own
 * words into a `richText` section escapes them here (`starter@1` interpolates
 * raw and stays as shipped).
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

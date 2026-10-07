import { footerLine } from "@saroh/site-blocks";

import type { SiteFooter } from "./service";

/**
 * The footer as the inspector's one-line field sees it (round 2, G6).
 *
 * The live footer (`SiteFooter`, G17) draws the merchant's line, then
 * " · Made with Saroh" on Free. The inspector edits that line as plain text, so it can
 * only take a footer that IS one plain line. Anything richer — two
 * paragraphs, a list, a link or bold text — would lose its markup in a text
 * box, so it stays with the rich editor in Website settings and the
 * inspector says so, rather than flattening it on the first keystroke.
 *
 * Whether a footer is one line is `footerLine`'s answer, the same function
 * the live footer draws with, so the two can never disagree about it.
 */
export type FooterLineField = { kind: "line"; text: string } | { kind: "rich" };

/** Any tag at all: a line with inline markup is not plain text. */
const TAG = /<[a-z/!]/i;

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
};

/** The text a sanitized line of html stands for. */
function decodeEntities(html: string): string {
    return html.replace(
        /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
        (whole, code: string) => {
            if (code.startsWith("#")) {
                const n = /^#x/i.test(code)
                    ? parseInt(code.slice(2), 16)
                    : parseInt(code.slice(1), 10);
                return n >= 0 && n <= 0x10ffff
                    ? String.fromCodePoint(n)
                    : whole;
            }
            return ENTITIES[code.toLowerCase()] ?? whole;
        },
    );
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** What the inspector's field shows for this footer, or that it can't. */
export function footerLineField(footer: SiteFooter | null): FooterLineField {
    if (footer === null || footer.value.trim() === "") {
        return { kind: "line", text: "" };
    }
    const line = footerLine(footer);
    if (line === null) return { kind: "rich" };
    if (line.kind === "text") return { kind: "line", text: line.value };
    if (TAG.test(line.value)) return { kind: "rich" };
    return { kind: "line", text: decodeEntities(line.value).trim() };
}

/**
 * The footer to save for what was typed in the field.
 *
 * Empty is no footer: the API stores nothing, and the live footer falls back
 * to the site's name (G17). Otherwise the line keeps the footer's format, so
 * Website settings opens it the way it was written. As html it is one
 * escaped paragraph, which is exactly what `footerLine` reads back as a line
 * and what the API's sanitizer leaves as it is.
 */
export function footerFromLine(
    text: string,
    format: SiteFooter["format"] = "html",
): SiteFooter | null {
    const line = text.trim();
    if (line === "") return null;
    return format === "markdown"
        ? { format, value: line }
        : { format, value: `<p>${escapeHtml(line)}</p>` };
}

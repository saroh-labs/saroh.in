/**
 * The small Markdown the legal pages are written in (`content/privacy.ts`):
 * `## ` headings, paragraphs, `- ` lists, pipe tables (a header row, the
 * `| --- |` rule, then rows) and `**bold**` inside any of them. Nothing else
 * is read, so the owner's words reach the page exactly as written.
 */
export type LegalBlock =
    | { kind: "heading"; id: string; text: string }
    | { kind: "paragraph"; text: string }
    | { kind: "list"; items: string[] }
    | { kind: "table"; head: string[]; rows: string[][] };

/** A run of inline text: plain, or bold. */
export interface InlineRun {
    text: string;
    bold: boolean;
}

/** A heading's anchor: "Who we are" → "who-we-are". */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

const cells = (line: string) =>
    line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());

export function parseLegal(source: string): LegalBlock[] {
    const blocks: LegalBlock[] = [];
    const chunks = source
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/)
        .map((c) => c.trim())
        .filter(Boolean);
    for (const chunk of chunks) {
        const lines = chunk.split("\n");
        if (chunk.startsWith("## ")) {
            const text = chunk.slice(3).trim();
            blocks.push({ kind: "heading", id: slugify(text), text });
        } else if (lines.every((l) => l.startsWith("- "))) {
            blocks.push({
                kind: "list",
                items: lines.map((l) => l.slice(2).trim()),
            });
        } else if (lines.every((l) => l.trim().startsWith("|"))) {
            const [head = "", rule = "", ...rows] = lines;
            if (!/^\|?\s*:?-{3,}/.test(rule.trim())) {
                throw new Error(`A table without its rule row: ${head}`);
            }
            blocks.push({
                kind: "table",
                head: cells(head),
                rows: rows.map(cells),
            });
        } else {
            blocks.push({ kind: "paragraph", text: lines.join(" ") });
        }
    }
    return blocks;
}

/** Splits `**bold**` out of a line of text. */
export function inlineRuns(text: string): InlineRun[] {
    return text
        .split(/(\*\*[^*]+\*\*)/)
        .filter(Boolean)
        .map((part) =>
            part.startsWith("**") && part.endsWith("**")
                ? { text: part.slice(2, -2), bold: true }
                : { text: part, bold: false },
        );
}

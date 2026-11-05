import type { Block, Inline, OutlineItem } from "./types";

/**
 * The body of a GST page, guide or download: a small markdown subset,
 * parsed into typed blocks when the page loads. Nothing else is accepted,
 * so a page can't carry raw HTML, JSX, code or a heading level the
 * templates don't draw.
 *
 *   ## Words                 an H2; its id (for OnThisPage) is its words, slugged
 *   Words…                   a paragraph; lines up to a blank line join
 *   - words                  an unordered list (one level)
 *   1. words                 an ordered list (one level)
 *   | a | b |                a table: head row, then |---|---|, then rows
 *   > words                  a callout ("In Saroh …"); its lines join
 *   ![what it shows](/a.png) an image on a line of its own; the alt is required
 *
 * Inside words: **bold** and [words](https://… or /path). A "[" only ever
 * starts a link, a "*" only bold. Every scan is an indexOf that moves
 * forward or fails, so hostile input parses in linear time (CodeQL
 * js/polynomial-redos).
 */

const HREF = /^(https:\/\/[^\s()<>]+|\/[^\s()<>]*)$/;
/** HTML, JSX and code have no place in the words. */
const FORBIDDEN = /[<>{}`]/;

function fail(where: string, message: string): never {
    throw new Error(`${where}: ${message}`);
}

/** Bold and links in a run of words. */
export function parseInline(where: string, s: string): Inline[] {
    const out: Inline[] = [];
    let from = 0;
    let i = 0;
    const text = () => {
        if (i > from) out.push({ t: "text", text: s.slice(from, i) });
    };
    const plain = (w: string, what: string) => {
        if (!w.trim() || /[[\]*]/.test(w))
            fail(where, `${what} holds plain words only: "${w}"`);
    };
    while (i < s.length) {
        const c = s[i];
        if (c === "*" && s[i + 1] === "*") {
            const end = s.indexOf("**", i + 2);
            if (end < 0) fail(where, `"**" isn't closed`);
            const bold = s.slice(i + 2, end);
            plain(bold, "bold");
            text();
            out.push({ t: "bold", text: bold });
            i = from = end + 2;
            continue;
        }
        if (c === "[") {
            const mid = s.indexOf("](", i + 1);
            if (mid < 0) fail(where, `a "[" starts a link: [words](https://…)`);
            const end = s.indexOf(")", mid + 2);
            if (end < 0) fail(where, "a link isn't closed with )");
            const label = s.slice(i + 1, mid);
            const href = s.slice(mid + 2, end);
            plain(label, "a link");
            if (!HREF.test(href))
                fail(where, `a link goes to https://… or /path, not "${href}"`);
            text();
            out.push({ t: "link", text: label, href });
            i = from = end + 1;
            continue;
        }
        if (c === "*" || c === "]") fail(where, `a stray "${c}"`);
        i++;
    }
    text();
    return out;
}

/** A heading's id: its words, lower case, joined by dashes. */
export function slugId(text: string): string {
    const s = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let a = 0;
    let b = s.length;
    while (a < b && s[a] === "-") a++;
    while (b > a && s[b - 1] === "-") b--;
    return s.slice(a, b) || "section";
}

type Kind = "p" | "ul" | "ol" | "table" | "callout";
interface Line {
    text: string;
    where: string;
}

function cells(l: Line): string[] {
    if (l.text.length < 2 || !l.text.endsWith("|"))
        fail(l.where, "a table row starts and ends with |");
    return l.text
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
}

function table(lines: Line[]): Block {
    const [head, sep, ...rows] = lines as [Line, ...Line[]];
    const h = cells(head);
    if (!sep || !cells(sep).every((c) => /^:?-+:?$/.test(c)))
        fail(head.where, "a table's second row is |---|---|");
    if (!rows.length) fail(head.where, "a table has no rows");
    const body = rows.map((r) => {
        const c = cells(r);
        if (c.length !== h.length)
            fail(
                r.where,
                `this row has ${c.length} cells, the head ${h.length}`,
            );
        return c.map((x) => parseInline(r.where, x));
    });
    return {
        type: "table",
        head: h.map((x) => parseInline(head.where, x)),
        rows: body,
    };
}

function image(l: Line): Block {
    const mid = l.text.indexOf("](");
    if (mid < 0 || !l.text.endsWith(")"))
        fail(
            l.where,
            "an image is ![what it shows](/path.png), alone on its line",
        );
    const alt = l.text.slice(2, mid).trim();
    const src = l.text.slice(mid + 2, -1);
    if (!alt)
        fail(
            l.where,
            "an image needs its alt text: ![what it shows](/path.png)",
        );
    if (/[[\]*]/.test(alt)) fail(l.where, "an image's alt is plain words");
    if (!HREF.test(src))
        fail(l.where, `an image is at https://… or /path, not "${src}"`);
    return { type: "image", src, alt };
}

/**
 * The body's blocks, in order. `file` and `firstLine` (the body's first
 * line in the file) make every error say where it is: "content/x.mdx:12: …".
 */
export function parseBlocks(
    file: string,
    body: string,
    firstLine = 1,
): Block[] {
    const blocks: Block[] = [];
    const ids = new Set<string>();
    let kind: Kind | null = null;
    let group: Line[] = [];

    const flush = () => {
        if (!kind || !group.length) return;
        const join = () =>
            parseInline(
                group[0]?.where ?? file,
                group.map((g) => g.text).join(" "),
            );
        if (kind === "p") blocks.push({ type: "p", inline: join() });
        else if (kind === "callout")
            blocks.push({ type: "callout", inline: join() });
        else if (kind === "table") blocks.push(table(group));
        else
            blocks.push({
                type: kind,
                items: group.map((g) => parseInline(g.where, g.text)),
            });
        kind = null;
        group = [];
    };
    const add = (k: Kind, l: Line) => {
        if (kind !== k) flush();
        kind = k;
        group.push(l);
    };

    body.split(/\r?\n/).forEach((raw, i) => {
        const where = `${file}:${firstLine + i}`;
        const line = raw.trim();
        if (!line) return flush();
        const callout = line === ">" || line.startsWith("> ");
        const words = callout ? line.slice(1).trim() : line;
        if (FORBIDDEN.test(words) || /^(import|export)\s/.test(words))
            fail(
                where,
                `no HTML, JSX or code in the words: "${line.slice(0, 40)}"`,
            );
        if (callout) return add("callout", { text: words, where });
        if (line.startsWith("## ")) {
            flush();
            const text = line.slice(3).trim();
            if (!text || /[[\]*#]/.test(text))
                fail(where, "a heading is plain words");
            let id = slugId(text);
            for (let n = 2; ids.has(id); n++) id = `${slugId(text)}-${n}`;
            ids.add(id);
            blocks.push({ type: "h2", id, text });
            return;
        }
        if (line.startsWith("#"))
            fail(where, `only "## " headings: "${line.slice(0, 40)}"`);
        if (line.startsWith("![")) {
            flush();
            blocks.push(image({ text: line, where }));
            return;
        }
        if (line.startsWith("- "))
            return add("ul", { text: line.slice(2).trim(), where });
        const ol = /^\d+\.\s/.exec(line);
        if (ol)
            return add("ol", { text: line.slice(ol[0].length).trim(), where });
        if (line.startsWith("|")) return add("table", { text: line, where });
        add("p", { text: line, where });
    });
    flush();
    return blocks;
}

/** The H2s, for OnThisPage. */
export const outlineOf = (blocks: readonly Block[]): OutlineItem[] =>
    blocks.flatMap((b) =>
        b.type === "h2" ? [{ id: b.id, text: b.text }] : [],
    );

/** Every word the blocks show, for word checks: a block, item or cell a line. */
export function blockWords(blocks: readonly Block[]): string {
    const run = (xs: readonly Inline[]) => xs.map((x) => x.text).join("");
    return blocks
        .map((b) => {
            switch (b.type) {
                case "h2":
                    return b.text;
                case "image":
                    return b.alt;
                case "p":
                case "callout":
                    return run(b.inline);
                case "ul":
                case "ol":
                    return b.items.map(run).join("\n");
                case "table":
                    return [b.head, ...b.rows]
                        .map((r) => r.map(run).join("\n"))
                        .join("\n");
            }
        })
        .join("\n");
}

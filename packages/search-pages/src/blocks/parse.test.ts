import { describe, expect, it } from "vitest";

import {
    blockWords,
    outlineOf,
    parseBlocks,
    parseInline,
    slugId,
} from "./parse";

const F = "content/guides/x.mdx";

describe("parseBlocks", () => {
    it("reads a guide's body into blocks in order, with an outline for OnThisPage", () => {
        const body = [
            "## Remind them the day before",
            "",
            "A short message, sent",
            "the evening before.",
            "",
            "| When | What |",
            "|---|:---:|",
            "| The day before | **Your time** |",
            "",
            "## Ask for a deposit",
            "",
            "- **Long:** a quarter",
            "- Short: none",
            "",
            "1. Say the rule",
            "2. Give a [link](/help/bookings)",
            "",
            "> **In Saroh** you can ask for a deposit.",
            "> See [bookings](https://saroh.in/help).",
            "",
            "![A reminder on a phone](/guides/reminder.png)",
            "",
            "## Remind them the day before",
        ].join("\n");
        const blocks = parseBlocks(F, body);
        expect(blocks.map((b) => b.type)).toEqual([
            "h2",
            "p",
            "table",
            "h2",
            "ul",
            "ol",
            "callout",
            "image",
            "h2",
        ]);
        expect(blocks[1]).toEqual({
            type: "p",
            inline: [
                {
                    t: "text",
                    text: "A short message, sent the evening before.",
                },
            ],
        });
        expect(blocks[2]).toEqual({
            type: "table",
            head: [
                [{ t: "text", text: "When" }],
                [{ t: "text", text: "What" }],
            ],
            rows: [
                [
                    [{ t: "text", text: "The day before" }],
                    [{ t: "bold", text: "Your time" }],
                ],
            ],
        });
        expect(blocks[5]).toMatchObject({
            type: "ol",
            items: [
                [{ t: "text", text: "Say the rule" }],
                [
                    { t: "text", text: "Give a " },
                    { t: "link", text: "link", href: "/help/bookings" },
                ],
            ],
        });
        expect(blocks[6]).toMatchObject({
            type: "callout",
            inline: [
                { t: "bold", text: "In Saroh" },
                { t: "text", text: " you can ask for a deposit. See " },
                { t: "link", text: "bookings", href: "https://saroh.in/help" },
                { t: "text", text: "." },
            ],
        });
        expect(blocks[7]).toEqual({
            type: "image",
            src: "/guides/reminder.png",
            alt: "A reminder on a phone",
        });
        expect(outlineOf(blocks)).toEqual([
            {
                id: "remind-them-the-day-before",
                text: "Remind them the day before",
            },
            { id: "ask-for-a-deposit", text: "Ask for a deposit" },
            {
                id: "remind-them-the-day-before-2",
                text: "Remind them the day before",
            },
        ]);
        expect(blockWords(blocks)).toContain("Long: a quarter");
    });

    it.each([
        ["an image without alt", "![](/a.png)", /:3: an image needs its alt/],
        [
            "an image with blank alt",
            "![  ](/a.png)",
            /:3: an image needs its alt/,
        ],
        ["raw HTML", "Words <b>bold</b>", /:3: no HTML, JSX or code/],
        ["a JSX tag", "<Callout />", /:3: no HTML, JSX or code/],
        ["a JSX expression", "Total {sum}", /:3: no HTML, JSX or code/],
        ["an import", "import X from 'y'", /:3: no HTML, JSX or code/],
        ["code", "Run `rm`", /:3: no HTML, JSX or code/],
        ["an H3", "### Small", /:3: only "## " headings/],
        ["an H1", "# Big", /:3: only "## " headings/],
        ["unclosed bold", "**bold", /:3: "\*\*" isn't closed/],
        ["a stray star", "5 * 3", /:3: a stray "\*"/],
        ["a placeholder", "[to confirm] words", /:3: a "\[" starts a link/],
        ["a script link", "[x](javascript:alert(1))", /:3: a link goes to/],
        ["an unclosed link", "[x](/a", /:3: a link isn't closed/],
        [
            "a short table row",
            "| a | b |\n|---|---|\n| c |",
            /:5: this row has 1 cells/,
        ],
        [
            "a table with no rule",
            "| a | b |\n| c | d |",
            /:3: a table's second row/,
        ],
    ])("refuses %s, naming the file and line", (_, line, err) => {
        expect(() => parseBlocks(F, line, 3)).toThrow(err);
        expect(() => parseBlocks(F, line, 3)).toThrow(F);
    });

    it("parses hostile input in linear time", () => {
        const n = 200_000;
        for (const s of [
            "*".repeat(n),
            "[".repeat(n),
            "[](".repeat(n / 3),
            "<".repeat(n),
            "a**".repeat(n / 3),
            `${"a ".repeat(n)}`,
            `|${" |".repeat(n / 2)}`,
            `## ${"- ".repeat(n / 2)}`,
        ]) {
            const t = performance.now();
            try {
                parseBlocks(F, s);
            } catch {
                // refusing is fine; taking long is not
            }
            expect(performance.now() - t).toBeLessThan(500);
        }
        const t = performance.now();
        parseInline(F, "**b** [l](/x) ".repeat(n / 10));
        expect(performance.now() - t).toBeLessThan(500);
    });

    it("slugs ids from the heading's words", () => {
        expect(slugId("What “without input tax credit” means")).toBe(
            "what-without-input-tax-credit-means",
        );
        expect(slugId("!!!")).toBe("section");
    });
});

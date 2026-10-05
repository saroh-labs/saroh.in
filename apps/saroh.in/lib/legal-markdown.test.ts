import { describe, expect, it } from "vitest";

import { PRIVACY } from "@/content/privacy";

import { inlineRuns, parseLegal, slugify } from "./legal-markdown";

describe("parseLegal", () => {
    it("reads headings, paragraphs, lists and tables", () => {
        const blocks = parseLegal(
            "## Who we are\n\nOne line.\n\n- **A.** first\n- second\n\n| What | Why |\n| --- | --- |\n| Account | To sign in |",
        );
        expect(blocks).toEqual([
            { kind: "heading", id: "who-we-are", text: "Who we are" },
            { kind: "paragraph", text: "One line." },
            { kind: "list", items: ["**A.** first", "second"] },
            {
                kind: "table",
                head: ["What", "Why"],
                rows: [["Account", "To sign in"]],
            },
        ]);
    });

    it("splits bold out of a line", () => {
        expect(inlineRuns("Our servers are in **India**. Some")).toEqual([
            { text: "Our servers are in ", bold: false },
            { text: "India", bold: true },
            { text: ". Some", bold: false },
        ]);
    });

    it("anchors headings without apostrophes", () => {
        expect(slugify("Why we're allowed to")).toBe("why-were-allowed-to");
    });
});

describe("the Privacy Policy", () => {
    const blocks = parseLegal(PRIVACY.body);

    it("has the owner's twelve sections, in order", () => {
        expect(
            blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : [])),
        ).toEqual([
            "Who we are",
            "Two kinds of data",
            "What we collect",
            "Why we're allowed to",
            "Who we share it with",
            "Where it's stored",
            "How long we keep it",
            "Your rights",
            "Cookies",
            "How we protect it",
            "Age",
            "Changes",
        ]);
    });

    it("keeps every table whole: rows as wide as their header", () => {
        const tables = blocks.flatMap((b) => (b.kind === "table" ? [b] : []));
        expect(tables).toHaveLength(3);
        for (const t of tables) {
            for (const row of t.rows) expect(row).toHaveLength(t.head.length);
        }
    });

    it("loses no words: every line of the source is in a block", () => {
        const text = JSON.stringify(blocks);
        for (const line of PRIVACY.body.split("\n")) {
            const words = line
                .replace(/^## |^- |^\|/g, "")
                .split("|")
                .map((c) => c.trim())
                .filter((c) => c && !/^-+$/.test(c));
            for (const w of words)
                expect(text).toContain(JSON.stringify(w).slice(1, -1));
        }
    });

    it("names no price", () => {
        expect(PRIVACY.body).not.toMatch(/₹|Rs\.?\s?\d|INR/);
    });
});

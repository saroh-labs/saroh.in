import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SOURCES, TOOL_SOURCES } from "./content.gen";
import {
    allSearchPages,
    allToolPages,
    listSearchPages,
    loadSearchPage,
    loadToolPage,
    parseQuestions,
    parseSearchPage,
    parseToolPage,
} from "./load";
import { rupee } from "./money";

const CONTENT = path.join(__dirname, "..", "content");

describe("content", () => {
    it.each([
        ["for", SOURCES],
        ["tools", TOOL_SOURCES],
    ] as const)(
        "the embedded copy matches content/%s (run `pnpm --filter @saroh/search-pages content`)",
        (kind, sources) => {
            const dir = path.join(CONTENT, kind);
            const files = readdirSync(dir)
                .filter((f) => f.endsWith(".mdx"))
                .sort();
            expect(Object.keys(sources).sort()).toEqual(
                files.map((f) => f.slice(0, -4)),
            );
            for (const f of files)
                expect(sources[f.slice(0, -4)]).toBe(
                    readFileSync(path.join(dir, f), "utf8"),
                );
        },
    );

    it("every page parses against the schema, and no two share a search", () => {
        const pages = allSearchPages();
        expect(pages.map((p) => p.slug)).toEqual(
            expect.arrayContaining([
                "salons",
                "dental-clinics",
                "yoga-studios",
                "home-bakers",
            ]),
        );
        expect(new Set(pages.map((p) => p.search.toLowerCase())).size).toBe(
            pages.length,
        );
    });

    it("lists every kind, /for/ first, no two pages sharing a slug or a search", () => {
        const all = listSearchPages();
        expect(all.map((p) => p.kind)).toEqual(
            [...all.map((p) => p.kind)].sort(),
        );
        expect(listSearchPages({ kind: "for" })).toHaveLength(
            allSearchPages().length,
        );
        expect(listSearchPages({ kind: "tools" })).toHaveLength(
            allToolPages().length,
        );
        expect(new Set(all.map((p) => p.slug)).size).toBe(all.length);
        expect(new Set(all.map((p) => p.search.toLowerCase())).size).toBe(
            all.length,
        );
    });

    it("lists the tools the site and admin read, the two app tools marked", () => {
        const tools = listSearchPages({ kind: "tools" });
        expect(tools.find((p) => p.slug === "no-show-cost-calculator")).toEqual(
            expect.objectContaining({
                path: "/tools/no-show-cost-calculator",
                kind: "tools",
                group: "Money",
                inApp: false,
            }),
        );
        expect(tools.filter((p) => p.inApp).map((p) => p.path)).toEqual([
            "/tools/link-preview",
            "/tools/qr-code-maker",
        ]);
        expect(loadToolPage("no-show-cost-calculator")?.questions).toHaveLength(
            3,
        );
        expect(loadToolPage("qr-code-maker")?.questions).toEqual([]);
        expect(loadToolPage("salons")).toBeNull();
    });

    it("refuses a tool file that's wrong, and a tool with no questions unless it's in the app", () => {
        const src = TOOL_SOURCES["no-show-cost-calculator"] ?? "";
        expect(() =>
            parseToolPage(
                "content/tools/no-show-cost-calculator.mdx",
                src.replace("group: Money", "group: Cash"),
            ),
        ).toThrow(/group/);
        const head = src.slice(0, src.indexOf("\n---\n") + 5);
        expect(() =>
            parseToolPage("content/tools/no-show-cost-calculator.mdx", head),
        ).toThrow(/no questions/);
        expect(
            parseToolPage(
                "content/tools/no-show-cost-calculator.mdx",
                head.replace("updated:", "inApp: true\nupdated:"),
            ).questions,
        ).toEqual([]);
    });

    it("lists the manifest the site and admin read", () => {
        const salons = listSearchPages({ kind: "for" }).find(
            (p) => p.slug === "salons",
        );
        expect(salons).toMatchObject({
            path: "/for/salons",
            slug: "salons",
            kind: "for",
            name: "Salons",
            family: "Beauty",
            familySlug: "beauty",
            search: "salon software",
            updated: "2026-10-26",
        });
        expect(Object.keys(salons ?? {}).sort()).toEqual([
            "description",
            "family",
            "familySlug",
            "kind",
            "name",
            "path",
            "search",
            "slug",
            "title",
            "updated",
        ]);
        expect(loadSearchPage("nope")).toBeNull();
        expect(loadSearchPage("dental-clinics")?.questions[0]?.question).toBe(
            "What does Start free include?",
        );
    });

    it("refuses a page whose frontmatter is wrong, naming the field", () => {
        const src = (SOURCES.salons ?? "").replace(
            "shape: appointments",
            "shape: rooms",
        );
        expect(() => parseSearchPage("content/for/salons.mdx", src)).toThrow(
            /shape/,
        );
        const noBooking = (SOURCES.salons ?? "").replace(
            /\n {2}booking:\n[\s\S]*?\n {2}today:/,
            "\n  today:",
        );
        expect(() =>
            parseSearchPage("content/for/salons.mdx", noBooking),
        ).toThrow(/scene.booking/);
    });

    it("reads questions as plain words only", () => {
        expect(
            parseQuestions(
                "x",
                "## Can I?\n\nYes.\n\nAnd more.\n\n## Why?\nBecause\nit is.",
            ),
        ).toEqual([
            { question: "Can I?", answer: ["Yes.", "And more."] },
            { question: "Why?", answer: ["Because it is."] },
        ]);
        expect(() => parseQuestions("x", "Hello\n## Q\n\nA")).toThrow(
            /before the first/,
        );
        expect(() => parseQuestions("x", "## Q\n\n- a list")).toThrow(
            /plain words/,
        );
        expect(() =>
            parseQuestions("x", "## Q\n\nSee [this](https://x)"),
        ).toThrow(/plain words/);
        expect(() => parseQuestions("x", "## Q\n\n## R\n\nA")).toThrow(
            /no answer/,
        );
    });
});

describe("rupee", () => {
    it("groups the Indian way", () => {
        expect(rupee(1200)).toBe("₹1,200");
        expect(rupee(118400)).toBe("₹1,18,400");
        expect(rupee(1016.95)).toBe("₹1,016.95");
        expect(rupee(1200, true)).toBe("₹1,200.00");
        expect(rupee(80)).toBe("₹80");
    });
});

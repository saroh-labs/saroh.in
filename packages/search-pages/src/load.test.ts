import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SOURCES } from "./content.gen";
import {
    allSearchPages,
    listSearchPages,
    loadSearchPage,
    parseQuestions,
    parseSearchPage,
} from "./load";
import { rupee } from "./money";

const DIR = path.join(__dirname, "..", "content", "for");

describe("content", () => {
    it("the embedded copy matches content/for (run `pnpm --filter @saroh/search-pages content`)", () => {
        const files = readdirSync(DIR)
            .filter((f) => f.endsWith(".mdx"))
            .sort();
        expect(Object.keys(SOURCES).sort()).toEqual(
            files.map((f) => f.slice(0, -4)),
        );
        for (const f of files)
            expect(SOURCES[f.slice(0, -4)]).toBe(
                readFileSync(path.join(DIR, f), "utf8"),
            );
    });

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

    it("lists the manifest the site and admin read", () => {
        const salons = listSearchPages().find((p) => p.slug === "salons");
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

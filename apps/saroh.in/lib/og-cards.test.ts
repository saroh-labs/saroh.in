import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INTEGRATION_SLUGS } from "@/content/integrations";

import { docPages } from "./docs-pages";
import { helpArticles } from "./help-docs";
import { integrationMeta } from "./integration-docs";
import { HELP_CARDS, INTEGRATION_CARDS } from "./og-cards.gen";
import { searchPageRoute } from "./search-page-route";

// The share cards draw from og-cards.gen.ts (a Worker can't read content/):
// it must match the articles. Behind? Run `node og-cards.config.js`.
describe("og-cards.gen.ts", () => {
    it("has every Help article's area and title", () => {
        expect(HELP_CARDS).toEqual(
            Object.fromEntries(
                helpArticles().map((a) => [
                    a.slug,
                    { area: a.area, title: a.title },
                ]),
            ),
        );
    });

    it("has every integration's name and intro", () => {
        expect(INTEGRATION_CARDS).toEqual(
            Object.fromEntries(
                INTEGRATION_SLUGS.map((s) => {
                    const fm = integrationMeta(s);
                    return [s, { name: fm.name, intro: fm.intro }];
                }),
            ),
        );
    });
});

// A share card is drawn on request by the Worker, which can't read files:
// no opengraph-image may reach the .mdx readers (27 Oct: every Help and
// Integrations card was a 500 on saroh.in).
describe("share cards", () => {
    it("never import a module that reads content/ from disk", () => {
        const cards: string[] = [];
        const walk = (dir: string) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                const p = join(dir, e.name);
                if (e.isDirectory()) walk(p);
                else if (/^opengraph-image\.tsx?$/.test(e.name)) cards.push(p);
            }
        };
        walk(join(__dirname, "../app"));
        expect(cards.length).toBeGreaterThan(5);
        const readers =
            /from "@\/lib\/(help-docs|integration-docs|changelog-docs)"|from "node:fs"|search-pages\/docs-embedded|\.mdx"/;
        expect(
            cards.filter((f) => readers.test(readFileSync(f, "utf8"))),
        ).toEqual([]);
    });
});

// A GST page's, guide's or download's card reads the build's generated copy
// (lib/docs-content.gen.ts, live pages only in production), never a file and
// never og-cards.gen.ts, which is committed and would carry drafts' words.
describe("GST, guide and download cards", () => {
    it("has a card for every page this build carries, from the generated copy", () => {
        const pages = docPages.all();
        expect(pages.length).toBeGreaterThan(0);
        for (const p of pages)
            expect(searchPageRoute(p.kind).shareCard(p.slug), p.path).toEqual(
                expect.objectContaining({ title: p.h1 }),
            );
    });

    it("og-cards.gen.ts holds none of their words", () => {
        const gen = readFileSync(join(__dirname, "og-cards.gen.ts"), "utf8");
        for (const p of docPages.all()) expect(gen).not.toContain(p.h1);
    });
});

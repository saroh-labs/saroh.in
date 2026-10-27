import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INTEGRATION_SLUGS } from "@/content/integrations";

import { helpArticles } from "./help-docs";
import { integrationMeta } from "./integration-docs";
import { HELP_CARDS, INTEGRATION_CARDS } from "./og-cards.gen";

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
            /from "@\/lib\/(help-docs|integration-docs|changelog-docs)"|from "node:fs"/;
        expect(
            cards.filter((f) => readers.test(readFileSync(f, "utf8"))),
        ).toEqual([]);
    });
});

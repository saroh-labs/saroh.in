import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { embeddedDocs as embedText } from "../scripts/embed-docs.mjs";
import { DOC_FILES, DOC_SOURCES } from "./docs-content.gen";
import { embeddedDocs } from "./docs-embedded";
import type { DocSources } from "./docs-load";
import { createDocsLoader, parseDocPage } from "./docs-load";
import { listSearchPages } from "./load";

const GST = DOC_SOURCES.gst?.["salon-and-beauty-services"] ?? "";
const GUIDE = DOC_SOURCES.guides?.["reduce-no-shows"] ?? "";
const DOWNLOAD = DOC_SOURCES.downloads?.["customer-list-template"] ?? "";

/** A loader over these sources plus the fixtures, held unique against /for/ and tools. */
const loader = (sources: DocSources, partial = false) =>
    createDocsLoader({
        sources,
        files: DOC_FILES,
        others: () => listSearchPages(),
        partial,
    });

describe("docs content", () => {
    it("the embedded copy matches content/ (run `pnpm --filter @saroh/search-pages docs-content`)", () => {
        expect(
            readFileSync(path.join(__dirname, "docs-content.gen.ts"), "utf8"),
        ).toBe(embedText());
    });

    it("a live-only embed holds only the live pages' words and files", () => {
        const live = embedText({ live: ["/gst/salon-and-beauty-services"] });
        expect(live).toContain('"salon-and-beauty-services"');
        expect(live).not.toContain("reduce-no-shows");
        expect(live).not.toContain("customer-list");
        expect(embedText({ live: [] })).not.toContain("---");
    });

    it("every page in the code loads, unique across every kind", () => {
        const paths = embeddedDocs.all().map((p) => p.path);
        expect(paths.filter((p) => p.startsWith("/gst/"))).toHaveLength(19);
        expect(paths.filter((p) => p.startsWith("/guides/"))).toEqual([
            "/guides/booking-deposits",
            "/guides/collect-payments-on-whatsapp",
            "/guides/memberships-that-renew",
            "/guides/more-google-reviews",
            "/guides/reduce-no-shows",
            "/guides/waitlist-for-cancelled-slots",
            "/guides/when-you-need-a-gst-invoice",
            "/guides/win-back-customers",
            "/guides/your-first-website",
        ]);
        expect(paths.filter((p) => p.startsWith("/downloads/"))).toEqual([
            "/downloads/appointment-book",
            "/downloads/bill-of-supply-format",
            "/downloads/customer-list-template",
            "/downloads/gst-invoice-format",
            "/downloads/receipt-format",
            "/downloads/salon-rate-card",
        ]);
        expect(paths).toContain("/gst/salon-and-beauty-services");
    });

    it("reads a GST trade page into facts, an invoice table, mistakes and questions", () => {
        const p = embeddedDocs.load("gst", "salon-and-beauty-services");
        if (p?.kind !== "gst") throw new Error("no salon page");
        expect(p.type).toBe("trade");
        expect(p.facts).toHaveLength(4);
        expect(p.table.kind).toBe("invoice");
        expect(p.table.rows).toHaveLength(2);
        expect(p.mistakes).toHaveLength(3);
        expect(p.questions).toHaveLength(3);
        expect(p.questions[0]?.answer).toHaveLength(1);
        expect(p.answer).toContainEqual({
            t: "bold",
            text: "5% GST, without input tax credit",
        });
        expect(p.outline.map((o) => o.id)).toEqual([
            "what-without-input-tax-credit-means",
            "products-you-sell-are-taxed-on-their-own",
            "if-you-aren-t-registered",
        ]);
    });

    it("reads a guide's blocks and outline, and works out its reading time", () => {
        const p = embeddedDocs
            .list("guides")
            .find((g) => g.slug === "reduce-no-shows");
        expect(p?.body.map((b) => b.type)).toEqual(
            expect.arrayContaining(["h2", "p", "table", "ul", "callout", "ol"]),
        );
        expect(p?.outline).toHaveLength(4);
        expect(p?.readMinutes).toBe(3);
        expect(
            parseDocPage(
                "guides",
                GUIDE.replace("published:", "readMinutes: 7\npublished:"),
                "reduce-no-shows",
            ),
        ).toMatchObject({ readMinutes: 7 });
    });

    it("gives each download file its size, or null when it isn't there", () => {
        expect(
            embeddedDocs.load("downloads", "customer-list-template"),
        ).toMatchObject({
            files: [
                { name: "customer-list.xlsx", format: "Excel" },
                { name: "customer-list.csv", format: "CSV", bytes: 213 },
            ],
        });
        expect(
            parseDocPage("downloads", DOWNLOAD, "customer-list-template", {}),
        ).toMatchObject({ files: [{ bytes: null }, { bytes: null }] });
    });

    it.each([
        [
            "an unknown field",
            GST.replace("topic:", "colour: red\ntopic:"),
            /content\/gst\/salon-and-beauty-services\.mdx[\s\S]*colour/,
        ],
        ["a missing field", GST.replace(/^checkedOn: .*\n/m, ""), /checkedOn/],
        [
            "30 February",
            GST.replace("checkedOn: 2026-10-24", "checkedOn: 2026-02-30"),
            /checkedOn: isn't a real date/,
        ],
        [
            "month 13",
            GST.replace("updated: 2026-10-24", "updated: 2026-13-01"),
            /updated: isn't a real date/,
        ],
        [
            "a date in the future",
            GST.replace("updated: 2026-10-24", "updated: 2999-01-01"),
            /updated: is in the future/,
        ],
        [
            "a short table row",
            GST.replace('- ["D-Tan facial", "999722",', '- ["D-Tan facial",'),
            /table\.rows: a row has 5 cells/,
        ],
        [
            "a body image without alt",
            `${GST}\n![](/a.png)\n`,
            /salon-and-beauty-services\.mdx:\d+: an image needs its alt/,
        ],
        [
            "raw HTML in the body",
            `${GST}\n<div>hi</div>\n`,
            /\.mdx:\d+: no HTML/,
        ],
    ])("refuses %s, naming the file and the field or line", (_, src, err) => {
        expect(() =>
            parseDocPage("gst", src, "salon-and-beauty-services"),
        ).toThrow(err);
    });

    it("names the body's line in the file", () => {
        const src = `${GST}\n![](/a.png)\n`;
        const line = src.split("\n").indexOf("![](/a.png)") + 1;
        expect(() =>
            parseDocPage("gst", src, "salon-and-beauty-services"),
        ).toThrow(`salon-and-beauty-services.mdx:${line}:`);
    });

    it("refuses a published date after updated", () => {
        expect(() =>
            parseDocPage(
                "guides",
                GUIDE.replace("updated: 2026-10-31", "updated: 2026-10-23"),
                "reduce-no-shows",
            ),
        ).toThrow(/updated: is before published/);
    });

    it("refuses a slug another kind has, and a search used twice across kinds", () => {
        const salons = GUIDE.replace("slug: reduce-no-shows", "slug: salons");
        expect(() => loader({ guides: { salons } }).all()).toThrow(
            /\/guides\/salons and \/for\/salons share the slug/,
        );
        const calc = GUIDE.replace(
            "search: how to reduce no-shows",
            "search: GST calculator",
        );
        expect(() =>
            loader({ guides: { "reduce-no-shows": calc } }).all(),
        ).toThrow(/both answer "GST calculator"/);
        const twice = DOWNLOAD.replace(
            "search: customer list template",
            "search: how to reduce no-shows",
        );
        expect(() =>
            loader({
                guides: { "reduce-no-shows": GUIDE },
                downloads: { "customer-list-template": twice },
            }).all(),
        ).toThrow(/both answer/);
    });

    it("refuses a related pin to a page of its kind that doesn't exist, or to itself", () => {
        const pin = (slugs: string) =>
            GUIDE.replace(/^related: .*$/m, `related: [${slugs}]`);
        expect(() =>
            loader({
                guides: { "reduce-no-shows": pin("bridal-studios") },
            }).all(),
        ).toThrow(/related names no guides page "bridal-studios"/);
        // A page of another kind isn't a pin's page.
        expect(() =>
            loader({
                guides: { "reduce-no-shows": pin("salon-and-beauty-services") },
                gst: DOC_SOURCES.gst,
            }).all(),
        ).toThrow(/related names no guides page/);
        expect(() =>
            loader({
                guides: { "reduce-no-shows": pin("reduce-no-shows") },
            }).all(),
        ).toThrow(/names the page itself/);
    });

    it("drops a pin to a page left out of a live-only map", () => {
        const pinned = GUIDE.replace(/^related: .*$/m, "related: [waitlists]");
        const [p] = loader(
            { guides: { "reduce-no-shows": pinned } },
            true,
        ).all();
        expect(p?.related).toEqual([]);
    });
});

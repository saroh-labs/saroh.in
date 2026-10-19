import { describe, expect, it } from "vitest";

import { markChanges } from "./pricing-marks";
import { previewHref, previewViewFrom } from "./pricing-preview";
import type { CompareRow } from "./pricing-view";
import { pricingPageModel } from "./pricing-view";
import { fakeCatalog } from "./pricing.fixture";

function line(rows: CompareRow[], label: string) {
    const r = rows.find((x) => x.kind === "line" && x.label === label);
    if (r?.kind !== "line") throw new Error(`No row ${label}`);
    return r;
}

/** "Show what changed" on the draft preview (admin redesign U13, R24). */
describe("markChanges", () => {
    const live = pricingPageModel(fakeCatalog());

    it("marks nothing when the draft is live as it is", () => {
        const marked = markChanges(pricingPageModel(fakeCatalog()), live);
        for (const p of marked.views["month-excl"].plans) {
            expect(p.changed).toBeUndefined();
        }
        for (const r of marked.rows) {
            if (r.kind === "line") {
                expect(r.added).toBeUndefined();
                expect(r.cells.every((c) => c.was === undefined)).toBe(true);
            }
        }
    });

    it("marks a renamed plan, a new price and a changed card line", () => {
        const draft = pricingPageModel(
            fakeCatalog((c) => {
                c.plans[1].name = "Plan Bee";
                c.plans[1].pricePaise = 12_300;
                c.modules[1].cells.grow = {
                    inc: true,
                    text: "Many",
                    card: "Many items",
                };
            }),
        );
        const marked = markChanges(draft, live);
        for (const key of ["month-excl", "year-incl"] as const) {
            const grow = marked.views[key].plans.find((p) => p.id === "grow");
            expect(grow?.changed).toEqual({
                name: true,
                price: true,
                lines: ["Many items"],
            });
            const free = marked.views[key].plans.find((p) => p.id === "free");
            expect(free?.changed).toBeUndefined();
        }
        const products = line(marked.rows, "Products");
        expect(products.cells.map((c) => c.was)).toEqual([
            undefined,
            "More",
            undefined,
        ]);
    });

    it("says what a cell was when the draft takes it off a plan", () => {
        const draft = pricingPageModel(
            fakeCatalog((c) => {
                c.modules[0].cells.free = { inc: false };
            }),
        );
        const website = line(markChanges(draft, live).rows, "Website");
        expect(website.cells[0]).toMatchObject({ yes: false, was: "One" });
    });

    it("marks a row live doesn't have", () => {
        const draft = pricingPageModel(
            fakeCatalog((c) => {
                c.modules[0].name = "Your site";
            }),
        );
        expect(line(markChanges(draft, live).rows, "Your site").added).toBe(
            true,
        );
    });
});

describe("the preview's address", () => {
    it("reads the defaults from a bare address", () => {
        expect(previewViewFrom({})).toEqual({
            show: "draft",
            width: "desktop",
            marks: true,
            frame: false,
        });
        expect(previewHref(previewViewFrom({}))).toBe("/pricing/draft");
    });

    it("keeps every choice in the address, and nothing it doesn't know", () => {
        const view = previewViewFrom({
            show: "live",
            width: ["phone", "desktop"],
            marks: "off",
            frame: "1",
        });
        expect(view).toEqual({
            show: "live",
            width: "phone",
            marks: false,
            frame: true,
        });
        expect(previewHref(view)).toBe(
            "/pricing/draft?show=live&width=phone&marks=off&frame=1",
        );
        expect(previewViewFrom({ show: "other", width: "tv" })).toMatchObject({
            show: "draft",
            width: "desktop",
        });
    });
});

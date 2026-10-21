import type { VisitSourceAggregate } from "./visit-sources";
import {
    foldVisitSources,
    MIN_VISITS_PER_LABEL,
    OTHER_LINKS_REF,
} from "./visit-sources";

function row(
    type: string,
    dimension: string,
    dimensionValue: string,
    count: number,
    siteId = "",
): VisitSourceAggregate {
    return { siteId, type, dimension, dimensionValue, count };
}

describe("foldVisitSources — the read U16 builds on (U15)", () => {
    it("gives all five groups in order, zeros included", () => {
        const read = foldVisitSources([]);
        expect(read.sources.map((s) => s.source)).toEqual([
            "instagram",
            "google",
            "whatsapp",
            "direct",
            "other",
        ]);
        expect(read.sources[0]).toEqual({
            source: "instagram",
            visits: 0,
            looked: 0,
            started: 0,
            paid: 0,
        });
        expect(read.refs).toEqual([]);
    });

    it("adds each step's days up by source and by ref, paid net of refunds", () => {
        const read = foldVisitSources([
            row("site.visit", "source", "instagram", 10),
            row("site.visit", "source", "instagram", 4),
            row("site.looked", "source", "instagram", 6),
            row("site.started", "source", "instagram", 3),
            row("order.paid", "source", "instagram", 2),
            row("order.refunded", "source", "instagram", 1),
            row("site.visit", "ref", "diwali-post", 5),
            row("site.visit", "ref", "story", 7),
            row("order.paid", "ref", "diwali-post", 1),
            // Totals and other dimensions are not this read's.
            row("site.visit", "", "", 99),
            row("site.view", "path", "/", 50),
        ]);
        expect(read.sources[0]).toEqual({
            source: "instagram",
            visits: 14,
            looked: 6,
            started: 3,
            paid: 1,
        });
        expect(read.refs).toEqual([
            { ref: "story", visits: 7, looked: 0, started: 0, paid: 0 },
            { ref: "diwali-post", visits: 5, looked: 0, started: 0, paid: 1 },
        ]);
    });

    it("narrows the visit steps to one site, keeping paid the business's", () => {
        const rows = [
            row("site.visit", "source", "google", 9),
            row("site.visit", "source", "google", 4, "site_1"),
            row("site.visit", "source", "google", 5, "site_2"),
            row("order.paid", "source", "google", 2),
        ];
        expect(foldVisitSources(rows).sources[1]).toMatchObject({
            visits: 9,
            paid: 2,
        });
        expect(foldVisitSources(rows, "site_1").sources[1]).toMatchObject({
            visits: 4,
            paid: 2,
        });
    });

    it("never reads paid below zero, nor a value that isn't well formed", () => {
        const read = foldVisitSources([
            row("order.refunded", "source", "other", 2),
            row("site.visit", "source", "tiktok", 3),
            row("site.visit", "ref", "someone@example.com", 3),
        ]);
        expect(read.sources[4]).toMatchObject({ source: "other", paid: 0 });
        expect(read.sources.reduce((n, s) => n + s.visits, 0)).toBe(0);
        expect(read.refs).toEqual([]);
    });

    it("folds labels with fewer than three visits into one Other links row, last (U15 privacy review)", () => {
        expect(MIN_VISITS_PER_LABEL).toBe(3);
        const read = foldVisitSources([
            row("site.visit", "ref", "diwali-post", 12),
            row("site.visit", "ref", "story", 3),
            // One or two people: maybe a link sent to one person.
            row("site.visit", "ref", "asha-wedding", 1),
            row("site.looked", "ref", "asha-wedding", 1),
            row("order.paid", "ref", "asha-wedding", 1),
            row("site.visit", "ref", "for-ravi", 2),
            row("site.started", "ref", "for-ravi", 1),
            // A paid order whose label had no visit in the range.
            row("order.paid", "ref", "old-post", 1),
        ]);
        expect(read.refs).toEqual([
            { ref: "diwali-post", visits: 12, looked: 0, started: 0, paid: 0 },
            { ref: "story", visits: 3, looked: 0, started: 0, paid: 0 },
            { ref: OTHER_LINKS_REF, visits: 3, looked: 1, started: 1, paid: 2 },
        ]);
        expect(JSON.stringify(read)).not.toMatch(/asha|ravi|old-post/);
    });

    it("the Other links row can't be taken for a merchant's label", () => {
        // `_` is outside a label's shape, so no label is ever OTHER_LINKS_REF.
        const read = foldVisitSources([
            row("site.visit", "ref", OTHER_LINKS_REF, 50),
        ]);
        expect(read.refs).toEqual([]);
    });

    it("gives no Other links row when every label is shown", () => {
        const read = foldVisitSources([row("site.visit", "ref", "story", 3)]);
        expect(read.refs.map((r) => r.ref)).toEqual(["story"]);
    });
});

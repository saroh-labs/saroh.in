import { REFS_SHOWN, shapeSources, sourceRows, visitPath } from "./sources";
import type { VisitSourcesRead } from "./visit-sources";
import { OTHER_LINKS_LABEL, OTHER_LINKS_REF } from "./visit-sources";

const row = (
    source: VisitSourcesRead["sources"][number]["source"],
    visits: number,
    looked = 0,
    started = 0,
    paid = 0,
) => ({ source, visits, looked, started, paid });

describe("visitPath", () => {
    it("adds the sources up, each step at most the one before", () => {
        expect(
            visitPath([
                row("instagram", 10, 12, 3, 5),
                row("google", 5, 2, 4, 1),
            ]),
        ).toEqual({ visits: 15, looked: 14, started: 7, paid: 6 });
        expect(visitPath([row("instagram", 4, 9, 9, 9)])).toEqual({
            visits: 4,
            looked: 4,
            started: 4,
            paid: 4,
        });
    });

    it("is all zeros with nothing counted", () => {
        expect(visitPath([])).toEqual({
            visits: 0,
            looked: 0,
            started: 0,
            paid: 0,
        });
    });
});

describe("sourceRows", () => {
    it("folds a source under the minimum into Other sites, last, and drops one nobody came from", () => {
        expect(
            sourceRows([
                row("instagram", 20, 0, 0, 2),
                row("google", 40, 0, 0, 6),
                row("whatsapp", 4, 0, 0, 1),
                row("direct", 0),
                row("other", 2),
            ]),
        ).toEqual({
            sources: [
                { source: "google", visits: 40, paid: 6 },
                { source: "instagram", visits: 20, paid: 2 },
                { source: "other", visits: 6, paid: 1 },
            ],
            folded: ["whatsapp"],
        });
    });

    it("keeps a source exactly at the minimum, and leaves Other out when nothing is in it", () => {
        expect(sourceRows([row("direct", 5, 0, 0, 1)])).toEqual({
            sources: [{ source: "direct", visits: 5, paid: 1 }],
            folded: [],
        });
    });

    it("folds paid with no visit in the period into Other sites", () => {
        expect(sourceRows([row("google", 0, 0, 0, 3)])).toEqual({
            sources: [{ source: "other", visits: 0, paid: 3 }],
            folded: ["google"],
        });
    });
});

describe("shapeSources", () => {
    const at = {
        period: "4w" as const,
        days: 28,
        from: "2026-09-22",
        to: "2026-10-19",
        siteId: null,
    };

    it("says counting began inside the period, and from which day", () => {
        const read: VisitSourcesRead = {
            countedFrom: new Date("2026-10-10T00:00:00Z"),
            sources: [row("instagram", 9, 3, 1, 1)],
            refs: [],
        };
        expect(shapeSources(read, at)).toMatchObject({
            countedFrom: "2026-10-10",
            countedPart: true,
            path: { visits: 9, looked: 3, started: 1, paid: 1 },
        });
        expect(
            shapeSources(
                { ...read, countedFrom: new Date("2026-09-22T00:00:00Z") },
                at,
            ).countedPart,
        ).toBe(false);
    });

    it("says nothing is counted yet", () => {
        expect(
            shapeSources({ countedFrom: null, sources: [], refs: [] }, at),
        ).toMatchObject({ countedFrom: null, countedPart: false });
    });

    it("names the folded labels Other links and keeps them last", () => {
        const step = { looked: 0, started: 0 };
        const shaped = shapeSources(
            {
                countedFrom: null,
                sources: [],
                refs: [
                    { ref: "diwali-post", visits: 12, paid: 2, ...step },
                    { ref: OTHER_LINKS_REF, visits: 4, paid: 1, ...step },
                ],
            },
            at,
        );
        expect(shaped.refs).toEqual([
            { ref: "diwali-post", visits: 12, paid: 2 },
            { ref: OTHER_LINKS_LABEL, visits: 4, paid: 1 },
        ]);
        expect(shaped.moreRefs).toBe(0);
    });

    it("shows the first links and counts the rest", () => {
        const refs = Array.from({ length: REFS_SHOWN + 3 }, (_, i) => ({
            ref: `post-${i}`,
            visits: 100 - i,
            looked: 0,
            started: 0,
            paid: 0,
        }));
        const shaped = shapeSources(
            { countedFrom: null, sources: [], refs },
            at,
        );
        expect(shaped.refs).toHaveLength(REFS_SHOWN);
        expect(shaped.refs[0]).toEqual({ ref: "post-0", visits: 100, paid: 0 });
        expect(shaped.moreRefs).toBe(3);
    });
});

import { describe, expect, it } from "vitest";

import type { PickRow } from "./pick";
import { firstPicks, worthPosting } from "./today";

const item = (kind: PickRow["kind"], ref: string, hasPhoto = false) => ({
    kind,
    ref,
    name: ref,
    price: kind === "product" ? "₹360" : null,
    url: `https://rye.example.com/${ref}`,
    offerId: kind === "offer" ? ref : null,
    hasPhoto,
});
const row = (
    kind: PickRow["kind"],
    ref: string,
    at: string,
    live = true,
    hasPhoto = false,
): PickRow => ({
    key: `${kind}:${ref}`,
    kind,
    name: ref,
    line: kind,
    image: null,
    at,
    item: live ? item(kind, ref, hasPhoto) : null,
});

// Monday 16 Nov 2026, 10:00 in India.
const NOW = new Date("2026-11-16T04:30:00Z");
const ZONE = "Asia/Kolkata";

describe("worthPosting (BSocialHome*)", () => {
    it("leads with an offer ending this week, soonest first, then what is new", () => {
        const rows = [
            row("offer", "Weekend bakes", "2026-11-22T18:00:00Z"),
            row("offer", "Far off", "2026-12-20T18:00:00Z"),
            row("offer", "Ended", "2026-11-10T18:00:00Z"),
            row("product", "Chocolate plaque", "2026-11-15T09:00:00Z"),
            row("product", "Old loaf", "2026-10-01T09:00:00Z"),
            row("post", "Rye loaf", "2026-11-14T09:00:00Z"),
            row("product", "Draft cake", "2026-11-16T01:00:00Z", false),
        ];
        const out = worthPosting(rows, ZONE, NOW);
        expect(out.map((s) => s.key)).toEqual([
            "offer:Weekend bakes",
            "product:Chocolate plaque",
            "post:Rye loaf",
        ]);
        expect(out[0]?.title).toBe("Weekend bakes ends Sunday");
        expect(out[0]?.line).toBe("A post today gives it 7 days.");
        expect(out[1]?.title).toBe("New: Chocolate plaque");
        // Never claims a share it can't know about.
        expect(out.every((s) => !s.line.includes("posted"))).toBe(true);
    });

    it("is empty with nothing new or ending", () => {
        expect(
            worthPosting(
                [row("product", "Old", "2026-01-01T00:00:00Z")],
                ZONE,
                NOW,
            ),
        ).toEqual([]);
    });
});

describe("firstPicks (BSocialEmpty*)", () => {
    it("picks a product with a photo first, then an offer", () => {
        const rows = [
            row("book", "page", ""),
            row("product", "No photo", "2026-11-15T00:00:00Z"),
            row("product", "Buns", "2026-11-01T00:00:00Z", true, true),
            row("offer", "Weekend", "2026-11-22T00:00:00Z"),
        ];
        expect(firstPicks(rows).map((p) => [p.key, p.why])).toEqual([
            ["product:Buns", "From your shop"],
            ["offer:Weekend", "Your offer"],
        ]);
    });

    it("fills from anything live when there is no product or offer", () => {
        const rows = [row("book", "page", ""), row("post", "Draft", "", false)];
        expect(firstPicks(rows).map((p) => p.key)).toEqual(["book:page"]);
    });
});

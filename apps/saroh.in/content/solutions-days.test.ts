import { hourAnchor } from "@saroh/marketing/kit/time";
import { describe, expect, it } from "vitest";

import { searchPages } from "@/lib/search-pages";
import { say } from "@saroh/marketing/solutions/words";

import { TRADE_DAYS } from "./solutions-days";
import { HUB_GROUPS } from "./solutions-hub";
import { WORLD } from "./world";

const forSlugs = searchPages
    .listSearchPages({ kind: "for" })
    .map((p) => p.slug);

describe("the written days (DEC-221)", () => {
    it.each(TRADE_DAYS.map((d) => [d.slug, d] as const))(
        "%s tells every hour of its world day, and no other",
        (_, d) => {
            const world = (d.business.day ?? []).map(
                (h) => h.anchor ?? hourAnchor(h.at),
            );
            const told = [
                d.start.anchor,
                ...d.hours.map((h) => h.anchor),
                ...(d.next ? [d.next.anchor] : []),
            ];
            expect(told).toEqual(world);
            expect(forSlugs).toContain(d.slug);
            expect(d.business.tradePage).toBe(`/for/${d.slug}`);
        },
    );

    it("names only the world's orders and bills", () => {
        for (const d of TRADE_DAYS) {
            const b = d.business;
            const text = JSON.stringify(d);
            const [lo, hi] = (b.orderRange ?? ["", ""]).map((x) =>
                Number(x.split("-")[1]),
            );
            for (const id of text.match(/ORD-\d{4}/g) ?? []) {
                const n = Number(id.split("-")[1]);
                expect(n, `${d.slug}: ${id}`).toBeGreaterThanOrEqual(lo);
                expect(n, `${d.slug}: ${id}`).toBeLessThanOrEqual(hi);
            }
            const [ilo, ihi] = (b.invoiceRange ?? ["", ""]).map((x) =>
                Number(x.split("-")[1]),
            );
            for (const id of text.match(/INV-\d{4}/g) ?? []) {
                const n = Number(id.split("-")[1]);
                expect(n, `${d.slug}: ${id}`).toBeGreaterThanOrEqual(ilo);
                expect(n, `${d.slug}: ${id}`).toBeLessThanOrEqual(ihi);
            }
            // No other example business's people in this day.
            const others = [WORLD.lead, ...WORLD.others].filter(
                (x) => x.key !== b.key,
            );
            for (const o of others) {
                for (const c of o.customers)
                    expect(text, c.name).not.toContain(c.name);
            }
        }
    });

    it("draws a claim's words only while it is on", () => {
        const rye = TRADE_DAYS.find((d) => d.slug === "home-bakers");
        const night = rye?.hours.find((h) => h.anchor === "9pm");
        expect(night).toBeDefined();
        if (!night) return;
        expect(say(night.title, () => true)).toContain("in Hinglish");
        expect(say(night.title, () => false)).toBe(
            "She asks what sold most this week.",
        );
        expect(say(night.after ?? "", () => false)).not.toMatch(/Grow|Pro/);
        expect(night.claimed?.claim).toBe("ask-ai-languages");
        const social = JSON.stringify(
            TRADE_DAYS.flatMap((d) =>
                d.hours.map((h) => say(h.lead, () => false)),
            ),
        );
        expect(social).not.toMatch(
            /posts? and schedules?|Sharing is free|Grow and Pro/,
        );
    });
});

describe("the hub's moments", () => {
    it("places every /for page once, and only pages that exist", () => {
        const placed = HUB_GROUPS.flatMap((g) => g.trades.map((t) => t.slug));
        expect(new Set(placed).size).toBe(placed.length);
        expect([...placed].sort()).toEqual([...forSlugs].sort());
    });
});

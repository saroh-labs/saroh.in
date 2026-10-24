import { describe, expect, it } from "vitest";

import { edit, fixture } from "./catalog.fixture";
import type { Catalog } from "./schema";
import { cellOf } from "./schema";

import {
    addMonthsUtc,
    MOVE_NOTICE_DAYS,
    moveDateFor,
    moveNoticeDays,
    PRICE_NOTICE_DAYS,
    withLiveAdditions,
} from "./moves";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("moveDateFor", () => {
    it("takes the first renewal at least 7 days after go-live", () => {
        // Renews 3 Oct, live 1 Oct: 3 Oct is too soon (before 8 Oct), so 3 Nov.
        expect(moveDateFor(d("2026-10-03"), d("2026-10-01"))).toEqual(
            d("2026-11-03"),
        );
    });

    it("keeps a renewal exactly 7 days out, or later", () => {
        expect(moveDateFor(d("2026-10-08"), d("2026-10-01"))).toEqual(
            d("2026-10-08"),
        );
        expect(moveDateFor(d("2026-10-20"), d("2026-10-01"))).toEqual(
            d("2026-10-20"),
        );
    });

    it("steps a yearly subscription by a year", () => {
        expect(moveDateFor(d("2026-10-03"), d("2026-10-01"), "year")).toEqual(
            d("2027-10-03"),
        );
    });

    it("steps from a renewal already in the past", () => {
        expect(moveDateFor(d("2026-08-15"), d("2026-10-01"))).toEqual(
            d("2026-10-15"),
        );
    });

    it("keeps month-end renewals at the month's end", () => {
        expect(addMonthsUtc(d("2026-01-31"), 1)).toEqual(d("2026-02-28"));
        expect(moveDateFor(d("2026-01-31"), d("2026-01-30"))).toEqual(
            d("2026-02-28"),
        );
        expect(moveDateFor(d("2026-01-31"), d("2026-02-25"))).toEqual(
            d("2026-03-31"),
        );
    });

    it("takes the first renewal at least 30 days out for a price change (DEC-161)", () => {
        // Renews 20 Oct, live 1 Oct: 20 Oct is under 30 days, so 20 Nov.
        expect(
            moveDateFor(d("2026-10-20"), d("2026-10-01"), "month", 30),
        ).toEqual(d("2026-11-20"));
        expect(
            moveDateFor(d("2026-10-31"), d("2026-10-01"), "month", 30),
        ).toEqual(d("2026-10-31"));
    });
});

describe("moveNoticeDays", () => {
    it("is 30 days when the price a business pays changes, else 7", () => {
        expect(PRICE_NOTICE_DAYS).toBe(30);
        expect(MOVE_NOTICE_DAYS).toBe(7);
        expect(moveNoticeDays(11_100, 12_300)).toBe(30);
        expect(moveNoticeDays(12_300, 11_100)).toBe(30);
        expect(moveNoticeDays(11_100, 11_100)).toBe(7);
    });
});

describe("withLiveAdditions (DEC-186)", () => {
    const mod = (c: Catalog, id: string) => {
        const m = c.modules.find((x) => x.id === id);
        if (!m) throw new Error(`no row ${id}`);
        return m;
    };
    const cell = (c: Catalog, id: string, plan: string) =>
        cellOf(mod(c, id), plan);

    it("gives an older version's plan a row the live one has added, and nothing else", () => {
        const own = fixture();
        const live = edit(own, (c) => {
            mod(c, "roles").cells.b = mod(c, "roles").cells.c;
            // Taken away, a lower limit and a dearer plan on live: none
            // of them reaches it.
            mod(c, "invoicing").cells.b = { inc: false, off: "locked" };
            mod(c, "members").cells.b = mod(c, "members").cells.a;
            for (const p of c.plans) p.pricePaise += 100;
        });

        const out = withLiveAdditions(own, live);

        expect(cell(out, "roles", "b").inc).toBe(true);
        expect(cell(out, "roles", "a").inc).toBe(false);
        expect(cell(out, "invoicing", "b").inc).toBe(true);
        expect(cell(out, "members", "b")).toEqual(cell(own, "members", "b"));
        expect(out.plans).toBe(own.plans);
        expect(cell(own, "roles", "b").inc).toBe(false);
    });

    it("returns the same rows when the live version adds nothing", () => {
        const own = fixture();
        expect(withLiveAdditions(own, fixture()).modules).toEqual(own.modules);
    });
});

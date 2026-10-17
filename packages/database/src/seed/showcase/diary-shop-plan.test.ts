import { describe, expect, it } from "vitest";

import type { PlacedProduct } from "./diary-shop-plan";
import { planDiaryShop } from "./diary-shop-plan";
import type { DsBusiness } from "./diary-shop-types";
import { MOTION } from "./physio-data";
import { NOOR } from "./salon-data";

/**
 * The diary-and-counter planner on any day: every half hour's `now` it might
 * be seeded at — weekdays and weekends, the days around Diwali, month and
 * financial-year ends — plans without throwing, and what it plans is a
 * diary the product could have made.
 */
const placed = (biz: DsBusiness): PlacedProduct[] =>
    biz.products.map((p, i) => ({
        productId: `p${i}`,
        variantIds: p.variants.map((_, j) => `v${i}_${j}`),
        stockLevelId: p.variants.length === 0 ? `s${i}` : null,
        variantStock: p.variants.map((_, j) => `s${i}_${j}`),
    }));

const NOWS = [
    "2026-10-16T04:00:00Z",
    "2026-10-18T13:30:00Z", // a Sunday afternoon
    "2026-11-07T18:30:00Z", // midnight before Diwali, Kolkata
    "2026-11-09T06:00:00Z",
    "2027-03-31T12:00:00Z", // financial year's last day
    "2027-01-31T20:00:00Z",
    "2026-12-24T02:30:00Z",
];

describe.each([
    ["Gulmohar Salon & Bridal", NOOR],
    ["Stride Physio", MOTION],
])("%s", (_name, biz) => {
    it.each(NOWS)("plans a sound diary at %s", (iso) => {
        const now = new Date(iso);
        const w = planDiaryShop(
            {
                biz,
                now,
                orgId: "org",
                storeId: "store",
                ownerUserId: "owner",
                deskUserId: "desk",
            },
            placed(biz),
        );
        const t = now.getTime();
        const live = w.bookings.filter((b) => b.status !== "CANCELLED");
        // Nobody, staff or client, in two places at once.
        for (const key of ["staffId", "contactId"] as const) {
            const by = new Map<string, { s: number; e: number }[]>();
            for (const b of live) {
                const k = String(b[key]);
                const s = new Date(b.startAt).getTime();
                const e = new Date(b.endAt).getTime();
                const list = by.get(k) ?? [];
                expect(
                    list.some((x) => x.s < e && s < x.e),
                    `${key} ${k} double-booked`,
                ).toBe(false);
                list.push({ s, e });
                by.set(k, list);
            }
        }
        for (const b of w.bookings) {
            const created = new Date(b.createdAt ?? 0).getTime();
            expect(created).toBeLessThan(new Date(b.startAt).getTime());
            expect(created).toBeLessThanOrEqual(t);
            if (b.outcome)
                expect(new Date(b.endAt).getTime()).toBeLessThanOrEqual(t);
        }
        for (const d of w.docs) {
            expect(d.issuedAt.getTime()).toBeLessThanOrEqual(t);
            if (d.paidAt)
                expect(d.paidAt.getTime()).toBeGreaterThanOrEqual(
                    d.issuedAt.getTime(),
                );
        }
        expect(live.length).toBeGreaterThan(300);
    });
});

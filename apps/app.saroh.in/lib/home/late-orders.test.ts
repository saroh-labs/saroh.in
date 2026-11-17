import { describe, expect, it } from "vitest";

import { holdsNews, oldestLateDays } from "./late-orders";
import type { HomeNeedGroup } from "./service";

const now = new Date("2026-11-15T18:00:00Z");

function orders(late: number, at: string | null): HomeNeedGroup {
    return {
        kind: "ORDERS",
        count: 5,
        late,
        totals: null,
        oldest: at
            ? {
                  id: "o",
                  title: "ORD-1",
                  who: null,
                  at,
                  amountMinor: null,
                  currency: null,
              }
            : null,
        rows: [],
        more: 0,
        href: "/commerce/orders",
        codes: ["COMMERCE_OPEN_ORDERS"],
    };
}

describe("holdsNews", () => {
    it("holds the news while an order is more than 3 days late", () => {
        const home = { needGroups: [orders(2, "2026-11-11T09:00:00Z")] };
        expect(oldestLateDays(home, now)).toBe(4);
        expect(holdsNews(home, now)).toBe(true);
    });

    it("shows it when the oldest late order is 3 days late or less", () => {
        const home = { needGroups: [orders(1, "2026-11-12T19:00:00Z")] };
        expect(oldestLateDays(home, now)).toBe(2);
        expect(holdsNews(home, now)).toBe(false);
    });

    it("shows it with nothing late, however old the orders", () => {
        const home = { needGroups: [orders(0, "2026-10-01T09:00:00Z")] };
        expect(oldestLateDays(home, now)).toBeNull();
        expect(holdsNews(home, now)).toBe(false);
    });

    it("shows it with no orders group or no groups", () => {
        expect(holdsNews({ needGroups: [] }, now)).toBe(false);
        expect(holdsNews({ needGroups: null }, now)).toBe(false);
    });
});

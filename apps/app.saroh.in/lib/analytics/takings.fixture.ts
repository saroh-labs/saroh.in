import type { TakingsRead, TakingsWeek } from "./takings";

/**
 * A takings read for tests: twelve weeks from Monday 6 Jul 2026, each
 * taking `rupees[i]` (whole rupees) at Hill Road unless `split` says
 * otherwise. The week in progress is 28 Sep.
 */
export function takingsRead(
    rupees: readonly number[],
    over: Partial<TakingsRead> & {
        /** Per week: where its money came from, in rupees. */
        split?: (Record<string, number> | undefined)[];
        /** Paid orders per week (default: one per ₹1,000, at least 3). */
        orders?: readonly number[];
    } = {},
): TakingsRead {
    const { split: splits, orders, ...rest } = over;
    const monday = new Date(Date.UTC(2026, 6, 6));
    const weeks: TakingsWeek[] = rupees.map((r, i) => {
        const start = new Date(monday.getTime() + i * 7 * 86_400_000);
        const end = new Date(start.getTime() + 6 * 86_400_000);
        const split = splits?.[i] ?? (r > 0 ? { "location:hill": r } : {});
        const count =
            orders?.[i] ?? (r > 0 ? Math.max(3, Math.round(r / 1000)) : 0);
        return {
            start: start.toISOString().slice(0, 10),
            end: end.toISOString().slice(0, 10),
            takingsMinor: r * 100,
            orderTakingsMinor: r * 100,
            orders: count,
            payments: count,
            places: Object.entries(split)
                .filter(([, v]) => v > 0)
                .map(([key, v]) => ({ key, takingsMinor: v * 100 }))
                .sort((a, b) => b.takingsMinor - a.takingsMinor),
        };
    });
    return {
        zone: "Asia/Kolkata",
        currency: "INR",
        otherCurrencies: [],
        firstSaleOn: "2026-01-05",
        thisWeekStart: "2026-09-28",
        locations: 1,
        places: [
            { key: "location:hill", kind: "LOCATION", name: "Hill Road" },
            { key: "location:bandra", kind: "LOCATION", name: "Bandra" },
            { key: "online", kind: "ONLINE", name: null },
            { key: "invoices", kind: "INVOICES", name: null },
        ],
        weeks,
        ...rest,
    };
}

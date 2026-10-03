import { describe, expect, it } from "vitest";

import type { OrderFilterOptions } from "@/lib/orders/business-service";
import {
    dayOrNull,
    filteredEmptyTitle,
    filterParams,
    filtersActive,
    filtersOn,
    NO_FILTERS,
    readOrdersFilters,
    stepOptions,
} from "@/lib/orders/list-filters";
import {
    nextPageHref,
    orderListParams,
    ordersEmptyCopy,
    ordersHref,
    readOrdersQuery,
} from "@/lib/orders/list-query";

/** The Orders list's filter bar (plan B, B4): the address and the words. */

const options: OrderFilterOptions = {
    types: [
        { type: "PICKUP", label: "Pick-up" },
        { type: "SHIPPING", label: "Shipping" },
        { type: "APPOINTMENT_ONLINE", label: "Appointment, online" },
    ],
    steps: [
        { key: "new", label: "New", types: ["PICKUP", "SHIPPING"] },
        { key: "ready", label: "Ready", types: ["PICKUP", "SHIPPING"] },
        {
            key: "handed-to-courier",
            label: "Handed to courier",
            types: ["SHIPPING"],
        },
        { key: "collected", label: "Collected", types: ["PICKUP"] },
        { key: "refunded", label: "Refunded", types: [] },
    ],
    product: { id: "p_cake", name: "Cake" },
};

describe("readOrdersFilters", () => {
    it("reads every filter, in any case", () => {
        expect(
            readOrdersFilters({
                date: "Custom",
                from: "2026-09-01",
                to: "2026-09-07",
                step: "Handed-To-Courier",
                fulfilment: "shipping",
                payment: "Unpaid",
                product: "p_cake",
                attention: "true",
                late: "true",
            }),
        ).toEqual({
            date: "custom",
            from: "2026-09-01",
            to: "2026-09-07",
            step: "handed-to-courier",
            fulfilment: "SHIPPING",
            payment: "unpaid",
            product: "p_cake",
            attention: true,
            late: true,
        });
    });

    it("reads anything malformed as no filter, never an error", () => {
        expect(
            readOrdersFilters({
                date: "fortnight",
                step: "ready; drop",
                fulfilment: "teleport",
                payment: "sometimes",
                product: "../x",
                attention: "yes",
                late: "yes",
            }),
        ).toEqual(NO_FILTERS);
    });

    it("keeps a range's days only for a custom range, and only real days", () => {
        expect(
            readOrdersFilters({ date: "7d", from: "2026-09-01" }).from,
        ).toBeNull();
        expect(dayOrNull("2026-02-30")).toBeNull();
        expect(dayOrNull("2026-2-3")).toBeNull();
        expect(dayOrNull("2026-02-28")).toBe("2026-02-28");
    });
});

describe("the filters in the address", () => {
    it("survive a reload: written, then read back the same", () => {
        const q = readOrdersQuery({
            tab: "open",
            step: "ready",
            fulfilment: "shipping",
            date: "7d",
            attention: "true",
            late: "true",
        });
        const href = ordersHref(q);
        expect(href).toBe(
            "/commerce/orders?tab=open&date=7d&step=ready&fulfilment=shipping&attention=true&late=true",
        );
        const again = readOrdersQuery(
            Object.fromEntries(new URL(href, "https://x").searchParams),
        );
        expect(again).toEqual(q);
    });

    it("stay while paging, and a change of filter starts at page one", () => {
        const q = readOrdersQuery({
            payment: "paid",
            cursor: "c2",
            back: "c1",
        });
        expect(nextPageHref(q, "c3")).toBe(
            "/commerce/orders?payment=paid&cursor=c3&back=c1%2Cc2",
        );
        expect(ordersHref(q, { late: true })).toBe(
            "/commerce/orders?payment=paid&late=true",
        );
        expect(ordersHref(q, { ...NO_FILTERS })).toBe("/commerce/orders");
    });
});

describe("filterParams — what the API is asked", () => {
    it("sends a preset as the API's date, and a way as a list", () => {
        const q = readOrdersQuery({
            date: "today",
            fulfilment: "pickup",
            payment: "partly-refunded",
            product: "p_cake",
            step: "ready",
            late: "true",
            attention: "true",
        });
        expect(orderListParams(q)).toMatchObject({
            date: "today",
            fulfilment: ["PICKUP"],
            payment: "PARTLY_REFUNDED",
            productId: "p_cake",
            step: "ready",
            late: true,
            attention: true,
        });
        expect(orderListParams(q).from).toBeUndefined();
    });

    it("sends a custom range as days, the right way round", () => {
        const q = readOrdersQuery({
            date: "custom",
            from: "2026-09-10",
            to: "2026-09-01",
        });
        expect(filterParams(q)).toMatchObject({
            date: undefined,
            from: "2026-09-01",
            to: "2026-09-10",
        });
    });

    it("never asks for Late or Needs attention false: off is every order", () => {
        expect(filterParams(NO_FILTERS)).toEqual({
            date: undefined,
            from: undefined,
            to: undefined,
            step: undefined,
            fulfilment: undefined,
            payment: undefined,
            productId: undefined,
            late: undefined,
            attention: undefined,
        });
        expect(filterParams(NO_FILTERS)).toHaveProperty("attention", undefined);
    });
});

describe("filtersActive", () => {
    it("counts a custom range only once it has a day", () => {
        expect(filtersActive(NO_FILTERS)).toBe(false);
        expect(filtersActive({ ...NO_FILTERS, date: "custom" })).toBe(false);
        expect(
            filtersActive({ ...NO_FILTERS, date: "custom", to: "2026-09-01" }),
        ).toBe(true);
        expect(filtersActive({ ...NO_FILTERS, late: true })).toBe(true);
        expect(filtersActive({ ...NO_FILTERS, attention: true })).toBe(true);
    });
});

describe("filtersOn — the phone's Filters count (B5)", () => {
    it("is 0 with nothing on, and a custom date without a day is not on", () => {
        expect(filtersOn(NO_FILTERS)).toBe(0);
        expect(filtersOn({ ...NO_FILTERS, date: "custom" })).toBe(0);
    });

    it("counts a date once, preset or range, and each other filter", () => {
        expect(
            filtersOn({
                ...NO_FILTERS,
                date: "custom",
                from: "2026-09-01",
                to: "2026-09-10",
            }),
        ).toBe(1);
        expect(
            filtersOn({
                ...NO_FILTERS,
                date: "today",
                step: "ready",
                fulfilment: "PICKUP",
                payment: "unpaid",
                product: "p1",
                attention: true,
                late: true,
            }),
        ).toBe(7);
    });

    it("agrees with filtersActive", () => {
        const some = { ...NO_FILTERS, late: true };
        expect(filtersOn(some) > 0).toBe(filtersActive(some));
        expect(filtersOn(NO_FILTERS) > 0).toBe(filtersActive(NO_FILTERS));
    });
});

describe("stepOptions", () => {
    it("offers every step the business's orders show", () => {
        expect(stepOptions(options, null)).toHaveLength(5);
    });

    it("narrows to the chosen way's steps, keeping Refunded", () => {
        expect(stepOptions(options, "PICKUP").map((s) => s.key)).toEqual([
            "new",
            "ready",
            "collected",
            "refunded",
        ]);
    });
});

describe("the empty state for filters", () => {
    it("says which filters found nothing", () => {
        const q = readOrdersQuery({ fulfilment: "shipping", date: "7d" });
        expect(filteredEmptyTitle(q, options)).toBe(
            "No shipping orders in the last 7 days",
        );
        expect(ordersEmptyCopy(q, null, options)).toMatchObject({
            kind: "filter",
            action: "clear-filters",
        });
    });

    it("says Needs attention in the sentence (B15)", () => {
        const q = readOrdersQuery({ attention: "true", date: "today" });
        expect(filteredEmptyTitle(q, options)).toBe(
            "No orders that need attention today",
        );
    });

    it("puts every filter into the sentence", () => {
        const q = readOrdersQuery({
            late: "true",
            payment: "unpaid",
            fulfilment: "shipping",
            step: "handed-to-courier",
            product: "p_cake",
            date: "custom",
            from: "2026-09-03",
            to: "2026-09-09",
        });
        expect(filteredEmptyTitle(q, options)).toBe(
            "No late unpaid shipping orders at Handed to courier with Cake between 3 Sep and 9 Sep",
        );
    });

    it("reads Refunded as what the orders are, and a way with a comma", () => {
        expect(
            filteredEmptyTitle(
                readOrdersQuery({ step: "refunded", date: "today" }),
                options,
            ),
        ).toBe("No orders that were refunded today");
        expect(
            filteredEmptyTitle(
                readOrdersQuery({ fulfilment: "appointment_online" }),
                options,
            ),
        ).toBe("No online appointment orders");
    });

    it("leaves out what it has no words for, rather than guess", () => {
        const q = readOrdersQuery({ step: "ready", date: "yesterday" });
        expect(filteredEmptyTitle(q, null)).toBe("No orders yesterday");
    });

    it("lets a search speak first", () => {
        const q = readOrdersQuery({ q: "asha", late: "true" });
        expect(ordersEmptyCopy(q, null, options).kind).toBe("search");
    });
});

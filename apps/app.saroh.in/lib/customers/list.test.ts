import { describe, expect, it } from "vitest";

import type { CustomerRow, CustomersPage, ListQuery } from "./list";
import {
    allowedQuery,
    apiSearch,
    chipsFor,
    customersText,
    emptyTitle,
    isNarrowed,
    lastSub,
    listHref,
    noOrderText,
    pageCount,
    pageText,
    readListQuery,
    rowName,
    rowSub,
    rowTags,
    sortsFor,
    spentText,
    unlinkedText,
} from "./list";

/**
 * The Customers list's address and words (C4). The address is what a
 * shared link opens, so an unknown value must open the list, not an error;
 * and a part of a row the viewer can't read must never turn into a zero or
 * a tag.
 */

const BASE: ListQuery = {
    q: "",
    chip: "all",
    sort: null,
    store: null,
    page: 1,
};

function row(over: Partial<CustomerRow> = {}): CustomerRow {
    return {
        contactId: "c1",
        name: "Priya Raman",
        email: "priya@example.com",
        phone: "+91 98450 11223",
        signsIn: false,
        possibleDuplicate: false,
        offers: false,
        attention: [],
        hiddenSensitiveCount: 0,
        ...over,
    };
}

function page(over: Partial<CustomersPage> = {}): CustomersPage {
    return {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        everyone: 0,
        counts: { all: 0, offers: 0, attention: 0 },
        unlinkedPaying: 0,
        sees: { orders: false, spent: false, subscriptions: false },
        sort: "name",
        chip: "all",
        ...over,
    };
}

describe("readListQuery", () => {
    it("reads every part of the address", () => {
        expect(
            readListQuery({
                q: " asha ",
                chip: "returning",
                sort: "spent",
                store: "st_1",
                page: "3",
            }),
        ).toEqual({
            q: "asha",
            chip: "returning",
            sort: "spent",
            store: "st_1",
            page: 3,
        });
    });

    it("opens the plain list for an unknown or broken address", () => {
        expect(
            readListQuery({
                chip: "vip",
                sort: "age",
                page: "-2",
                store: "  ",
            }),
        ).toEqual(BASE);
        expect(readListQuery({ page: "2.5" }).page).toBe(1);
        expect(readListQuery({ page: "abc" }).page).toBe(1);
    });

    it("takes the first of a repeated value", () => {
        expect(readListQuery({ chip: ["open", "offers"] }).chip).toBe("open");
    });

    it("reads the old ?storefront= as the storefront filter", () => {
        expect(readListQuery({ storefront: "st_2" }).store).toBe("st_2");
        expect(readListQuery({ storefront: "st_2", store: "st_1" }).store).toBe(
            "st_1",
        );
    });

    it("keeps a search to the API's 100 characters", () => {
        expect(readListQuery({ q: "x".repeat(140) }).q).toHaveLength(100);
    });
});

describe("listHref", () => {
    it("leaves the defaults out of the address", () => {
        expect(listHref(BASE)).toBe("/commerce/customers");
    });

    it("writes what narrows the list", () => {
        expect(
            listHref(BASE, {
                q: "98450",
                chip: "open",
                sort: "name",
                store: "st_1",
            }),
        ).toBe("/commerce/customers?q=98450&chip=open&sort=name&store=st_1");
    });

    it("starts again on page 1 when anything but the page changes", () => {
        const on3 = { ...BASE, page: 3 };
        expect(listHref(on3, { chip: "returning" })).toBe(
            "/commerce/customers?chip=returning",
        );
        expect(listHref(on3, { page: 4 })).toBe("/commerce/customers?page=4");
        // Picking what is already picked is not a change.
        expect(listHref(on3, { chip: "all" })).toBe(
            "/commerce/customers?page=3",
        );
    });

    it("round-trips through readListQuery", () => {
        const q: ListQuery = {
            q: "asha rao",
            chip: "attention",
            sort: "last",
            store: "st_9",
            page: 2,
        };
        const href = listHref(q);
        const params = Object.fromEntries(
            new URLSearchParams(href.split("?")[1]),
        );
        expect(readListQuery(params)).toEqual(q);
    });
});

describe("apiSearch", () => {
    it("asks the API only for what narrows", () => {
        expect(apiSearch(BASE)).toBe("");
        expect(apiSearch({ ...BASE, q: "a&b", chip: "offers", page: 2 })).toBe(
            "q=a%26b&chip=offers&page=2",
        );
    });
});

describe("allowedQuery", () => {
    const member = (a: string) => a === "contact:read" || a === "order:read";
    const reviewer = (a: string) => a === "contact:read";

    it("keeps what the viewer may ask", () => {
        const q = { ...BASE, chip: "open" as const, sort: "last" as const };
        expect(allowedQuery(q, member)).toEqual(q);
    });

    it("drops a sort by Spent for a role without invoice:read", () => {
        expect(
            allowedQuery({ ...BASE, sort: "spent" }, member).sort,
        ).toBeNull();
    });

    it("drops order chips, sorts and the storefront without order:read", () => {
        const q = allowedQuery(
            { ...BASE, chip: "returning", sort: "last", store: "st_1" },
            reviewer,
        );
        expect(q).toEqual(BASE);
    });

    it("keeps the chips every reader may use", () => {
        expect(
            allowedQuery({ ...BASE, chip: "attention" }, reviewer).chip,
        ).toBe("attention");
        expect(
            allowedQuery({ ...BASE, chip: "subscribers" }, member).chip,
        ).toBe("all");
    });
});

describe("isNarrowed and emptyTitle", () => {
    it("tells a narrowed list from the whole one", () => {
        expect(isNarrowed(BASE)).toBe(false);
        expect(isNarrowed({ ...BASE, sort: "name", page: 2 })).toBe(false);
        expect(isNarrowed({ ...BASE, q: "x" })).toBe(true);
        expect(isNarrowed({ ...BASE, chip: "open" })).toBe(true);
        expect(isNarrowed({ ...BASE, store: "s" })).toBe(true);
    });

    it("names the search that found nothing", () => {
        expect(emptyTitle({ ...BASE, q: "zed" })).toBe(
            "No customers match “zed”",
        );
        expect(emptyTitle({ ...BASE, chip: "open" })).toBe(
            "No customers match these filters",
        );
    });
});

describe("chipsFor and sortsFor", () => {
    it("shows only the chips the API counted, in the design's order", () => {
        const chips = chipsFor(
            page({
                counts: { attention: 2, all: 9, offers: 4, returning: 3 },
            }),
        );
        expect(chips.map((c) => c.label)).toEqual([
            "All",
            "Returning",
            "Said yes to offers",
            "Needs attention",
        ]);
        expect(chips[1]).toEqual({
            key: "returning",
            label: "Returning",
            count: 3,
        });
    });

    it("offers a sort only when its column is there", () => {
        expect(sortsFor(page())).toEqual(["name"]);
        expect(
            sortsFor(
                page({
                    sees: { orders: true, spent: false, subscriptions: true },
                }),
            ),
        ).toEqual(["last", "name"]);
        expect(
            sortsFor(
                page({
                    sees: { orders: true, spent: true, subscriptions: true },
                }),
            ),
        ).toEqual(["last", "spent", "name"]);
    });
});

describe("counts and pages", () => {
    it("says how many customers", () => {
        expect(customersText(1)).toBe("1 customer");
        expect(customersText(5000)).toBe("5,000 customers");
        expect(customersText(0)).toBe("0 customers");
    });

    it("says which rows a page shows", () => {
        expect(pageText(page({ total: 120, page: 1 }))).toBe(
            "Showing 1–50 of 120",
        );
        expect(pageText(page({ total: 120, page: 3 }))).toBe(
            "Showing 101–120 of 120",
        );
        expect(pageCount(page({ total: 120 }))).toBe(3);
        expect(pageCount(page({ total: 0 }))).toBe(1);
    });

    it("names the unlinked paying customers, singular and plural", () => {
        expect(unlinkedText(1)).toBe(
            "1 paying customer isn't linked to a contact yet",
        );
        expect(unlinkedText(12)).toBe(
            "12 paying customers aren't linked to a contact yet",
        );
    });
});

describe("a row", () => {
    it("is named by the person, else their email", () => {
        expect(rowName(row())).toBe("Priya Raman");
        expect(rowName(row({ name: null }))).toBe("priya@example.com");
        expect(rowName(row({ name: null, email: null }))).toBe("No name given");
    });

    it("says how to reach them, without repeating the email as the name", () => {
        expect(rowSub(row())).toBe("+91 98450 11223 · priya@example.com");
        expect(rowSub(row({ name: null }))).toBe("+91 98450 11223");
        expect(rowSub(row({ phone: null, email: null }))).toBe(
            "No phone or email",
        );
    });

    it("tags Needs attention in words, red for Allergy and Medical", () => {
        const tags = rowTags(
            row({
                attention: [
                    { kind: "ALLERGY", label: "Sesame", sensitive: false },
                    { kind: "MEDICAL", label: "Pregnant", sensitive: true },
                    { kind: "ACCESS", label: "Wheelchair", sensitive: false },
                    { kind: "OTHER", label: "Prefers calls", sensitive: false },
                ],
            }),
        );
        expect(tags).toEqual([
            { label: "Allergy: Sesame", tone: "bad" },
            { label: "Medical: Pregnant", tone: "bad" },
            { label: "Access: Wheelchair", tone: "off" },
            { label: "Other: Prefers calls", tone: "off" },
        ]);
    });

    it("tags Subscriber, New and a possible duplicate", () => {
        expect(
            rowTags(
                row({
                    subscriber: true,
                    returning: false,
                    orders: {
                        count: 1,
                        open: 0,
                        lastAt: null,
                        lastStorefront: null,
                    },
                    possibleDuplicate: true,
                }),
            ).map((t) => t.label),
        ).toEqual(["Subscriber", "New", "Possible duplicate"]);
    });

    it("never tags what the viewer can't read", () => {
        // No `order:read`: `returning` and `orders` are absent, so no "New";
        // no `subscription:read`: no "Subscriber".
        expect(rowTags(row())).toEqual([]);
        // Returning, or no orders at all: not New.
        expect(
            rowTags(
                row({
                    returning: true,
                    orders: {
                        count: 3,
                        open: 0,
                        lastAt: null,
                        lastStorefront: null,
                    },
                }),
            ),
        ).toEqual([]);
        expect(
            rowTags(
                row({
                    returning: false,
                    orders: {
                        count: 0,
                        open: 0,
                        lastAt: null,
                        lastStorefront: null,
                    },
                }),
            ),
        ).toEqual([]);
    });

    it("puts open orders under the last order, then where it was", () => {
        const at = { id: "s1", name: "Hill Road" };
        const orders = (open: number) => ({
            count: 4,
            open,
            lastAt: "2026-09-20T10:00:00.000Z",
            lastStorefront: at,
        });
        expect(lastSub(row({ orders: orders(2) }), true)).toEqual({
            text: "2 open",
            open: true,
        });
        expect(lastSub(row({ orders: orders(1) }), false)?.text).toBe("1 open");
        expect(lastSub(row({ orders: orders(0) }), true)).toEqual({
            text: "At Hill Road",
            open: false,
        });
        // One storefront: where they bought says nothing.
        expect(lastSub(row({ orders: orders(0) }), false)).toBeNull();
    });

    it("says someone signs in when they have never ordered", () => {
        expect(
            lastSub(
                row({
                    signsIn: true,
                    orders: {
                        count: 0,
                        open: 0,
                        lastAt: null,
                        lastStorefront: null,
                    },
                }),
                false,
            ),
        ).toEqual({ text: "Signs in on your website", open: false });
        expect(lastSub(row({ signsIn: true }), false)?.text).toBe(
            "Signs in on your website",
        );
    });

    it("shows Spent in each currency, and a dash for nothing paid", () => {
        expect(spentText([])).toBe("—");
        expect(spentText([{ currency: "INR", amount: "5000.00" }])).toBe(
            "₹5,000",
        );
        expect(spentText([{ currency: "INR", amount: "1250.50" }])).toBe(
            "₹1,250.50",
        );
        expect(
            spentText([
                { currency: "INR", amount: "100.00" },
                { currency: "USD", amount: "20.00" },
            ]),
        ).toBe("₹100 + $20");
    });
});

describe("noOrderText (DEC-056, C14)", () => {
    it("says someone added on the list was added by hand, and nothing of anyone else", () => {
        expect(noOrderText(row({ addedByHand: true }))).toBe("Added by hand");
        expect(noOrderText(row({ addedByHand: false }))).toBe("—");
        expect(noOrderText(row())).toBe("—");
    });
});

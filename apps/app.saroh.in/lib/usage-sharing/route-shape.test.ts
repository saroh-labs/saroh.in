import { describe, expect, it } from "vitest";

import { routeShape } from "./route-shape";

describe("routeShape (DEC-160): what a page visit says of an address", () => {
    it("leaves a screen's own address as it is", () => {
        expect(routeShape("/", {})).toBe("/");
        expect(routeShape("/commerce/orders", {})).toBe("/commerce/orders");
        expect(routeShape("/settings/profile", null)).toBe("/settings/profile");
    });

    it("names a parameter instead of giving its value", () => {
        expect(
            routeShape("/commerce/orders/seed_order_seven", {
                orderId: "seed_order_seven",
            }),
        ).toBe("/commerce/orders/[orderId]");
        expect(
            routeShape("/stores/northwind/customers/asha-rao", {
                storeId: "northwind",
                customerId: "asha-rao",
            }),
        ).toBe("/stores/[storeId]/customers/[customerId]");
        expect(routeShape("/join/abcdefgh", { token: "abcdefgh" })).toBe(
            "/join/[token]",
        );
    });

    it("names every segment of a catch-all, and decodes what the address encoded", () => {
        expect(
            routeShape("/invoices/acme/overdue", { rest: ["acme", "overdue"] }),
        ).toBe("/invoices/[rest]/[rest]");
        expect(
            routeShape("/contacts/asha%20rao", { contactId: "asha rao" }),
        ).toBe("/contacts/[contactId]");
    });

    it("hides a segment that looks like an id even when nobody named it", () => {
        expect(routeShape("/commerce/orders/cmf3k2x9a0001", {})).toBe(
            "/commerce/orders/[id]",
        );
        expect(routeShape("/x/42", {})).toBe("/x/[id]");
        expect(routeShape("/x/asha@example.com", {})).toBe("/x/[id]");
    });

    it("never carries a query string or a fragment", () => {
        expect(routeShape("/commerce/orders?q=asha#top", {})).toBe(
            "/commerce/orders",
        );
    });
});

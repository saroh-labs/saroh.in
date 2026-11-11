import { describe, expect, it } from "vitest";

import { buildOpenApi } from "./openapi";
import { bookBody, orderBody, STOREFRONT_ROUTES } from "./storefront";

describe("storefront contract (U7)", () => {
    it("puts every storefront route in storefront.json, each with a capability", () => {
        const doc = buildOpenApi("storefront");
        expect(Object.keys(doc.paths)).toEqual([
            "/{key}/plans",
            "/{key}/posts",
            "/{key}/posts/{slug}",
            "/{key}/products",
            "/{key}/products/{slug}",
            "/{key}/services",
            "/{key}/services/{serviceId}/availability",
            "/{key}/services/{serviceId}/days",
            "/{key}/services/{serviceId}/staff",
            "/{key}/stock",
            "/write/bookings",
            "/write/forms/{formId}/submissions",
            "/write/holds",
            "/write/holds/release",
            "/write/orders",
            "/write/payments",
        ]);
        for (const route of STOREFRONT_ROUTES) {
            expect(route.capability).toBeTruthy();
            if (route.surface === "storefront" && route.method !== "get") {
                expect(route.path.startsWith("/write/")).toBe(true);
            }
        }
    });

    it("puts the mint route on the secret surface", () => {
        expect(
            Object.keys(buildOpenApi("v1").paths).includes(
                "/storefront-tokens",
            ),
        ).toBe(true);
    });

    it("refuses a bad booking and fills an order's defaults", () => {
        expect(
            bookBody.safeParse({
                serviceId: "svc",
                startAt: "tomorrow",
                name: "Asha",
                email: "asha@example.com",
            }).success,
        ).toBe(false);
        const order = orderBody.parse({
            name: "Asha",
            email: "asha@example.com",
            lines: [{ listingId: "l1", quantity: 1 }],
            fulfilment: "PICKUP",
            idempotencyKey: "order-key-1",
        });
        expect(order.payment).toBe("ONLINE");
    });
});

import { describe, expect, it } from "vitest";

import { buildOpenApi } from "./openapi";
import {
    bookBody,
    orderBody,
    STOREFRONT_ROUTES,
    storefrontPlans,
    storefrontPosts,
    storefrontProducts,
    storefrontServices,
    storefrontSlots,
    storefrontStaff,
    storefrontStock,
} from "./storefront";

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
            lines: [{ productId: "p1", quantity: 1 }],
            fulfilment: "pickup",
        });
        expect(order.payment).toBe("online");
        expect(
            orderBody.safeParse({
                name: "Asha",
                lines: [{ listingId: "l1", quantity: 1 }],
                fulfilment: "pickup",
            }).success,
        ).toBe(false);
    });

    it("lists with /v1's page and accepts Idempotency-Key on every write", () => {
        const doc = buildOpenApi("storefront");
        for (const [path, ops] of Object.entries(doc.paths)) {
            for (const [method, op] of Object.entries(ops)) {
                const o = op as {
                    parameters?: { name: string }[];
                    responses: Record<string, unknown>;
                };
                const names = (o.parameters ?? []).map((p) => p.name);
                if (method !== "get") {
                    expect(names, path).toContain("Idempotency-Key");
                }
                for (const status of ["400", "401", "403", "404", "429"]) {
                    expect(
                        o.responses[status],
                        `${path} ${status}`,
                    ).toBeTruthy();
                }
            }
        }
        for (const list of [
            storefrontProducts,
            storefrontStock,
            storefrontServices,
            storefrontSlots,
            storefrontStaff,
            storefrontPosts,
            storefrontPlans,
        ]) {
            expect(Object.keys(list.shape)).toEqual(
                expect.arrayContaining(["data", "nextCursor"]),
            );
        }
        // The token is given once: a replay would have to keep it.
        const mint = (
            buildOpenApi("v1").paths["/storefront-tokens"] as {
                post: { parameters?: { name: string }[] };
            }
        ).post;
        expect(mint.parameters ?? []).toEqual([]);
    });
});

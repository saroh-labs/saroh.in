import { describe, expect, it } from "vitest";

import { buildOpenApi } from "../openapi";
import { createBookingBody } from "./bookings";
import { createProductBody, setStockBody } from "./catalogue";
import "./index";
import { createOrderBody } from "./orders";

describe("v1 contract (plan 2026-11-10-001, U8)", () => {
    const doc = buildOpenApi("v1");
    const operations = Object.entries(doc.paths).flatMap(([path, ops]) =>
        Object.entries(ops).map(([method, op]) => ({
            route: `${method.toUpperCase()} ${path}`,
            capability: (op as { "x-saroh-capability": string | null })[
                "x-saroh-capability"
            ],
        })),
    );

    it("documents every secret route, each with a capability", () => {
        expect(operations.map((o) => o.route).sort()).toMatchSnapshot();
        for (const op of operations) expect(op.capability).toBeTruthy();
    });

    it("declares Idempotency-Key and its 409 on every write but the token mint", () => {
        for (const [path, ops] of Object.entries(doc.paths)) {
            for (const [method, op] of Object.entries(ops)) {
                if (method === "get") continue;
                const o = op as {
                    parameters?: { name: string }[];
                    responses: Record<string, unknown>;
                };
                const names = (o.parameters ?? []).map((p) => p.name);
                expect(names.includes("Idempotency-Key"), path).toBe(
                    path !== "/storefront-tokens",
                );
                expect(o.responses["409"], path).toBeTruthy();
            }
        }
    });

    it("takes a price only in whole, non-negative minor units", () => {
        const ok = {
            name: "Loaf",
            price: { amountMinor: 4500, currency: "INR" },
        };
        expect(createProductBody.safeParse(ok).success).toBe(true);
        for (const amountMinor of [-1, 45.5, "4500"]) {
            expect(
                createProductBody.safeParse({
                    ...ok,
                    price: { amountMinor, currency: "INR" },
                }).success,
            ).toBe(false);
        }
        expect(
            createProductBody.safeParse({
                ...ok,
                price: { amountMinor: 1, currency: "rupees" },
            }).success,
        ).toBe(false);
    });

    it("refuses unknown fields and a body naming nobody", () => {
        expect(
            createProductBody.safeParse({
                name: "Loaf",
                price: { amountMinor: 1, currency: "INR" },
                organizationId: "org_b",
            }).success,
        ).toBe(false);
        expect(
            createBookingBody.safeParse({
                serviceId: "svc",
                startAt: "2026-11-12T10:00:00Z",
            }).success,
        ).toBe(false);
        expect(
            createOrderBody.safeParse({
                items: [{ productId: "p", quantity: 1 }],
            }).success,
        ).toBe(false);
    });

    it("counts stock as a whole or per variant, never negative", () => {
        expect(setStockBody.safeParse({ quantity: 3 }).success).toBe(true);
        expect(
            setStockBody.safeParse({
                variants: [{ variantId: "v", quantity: 1, lowStockAlert: 0 }],
            }).success,
        ).toBe(true);
        expect(setStockBody.safeParse({ quantity: -1 }).success).toBe(false);
    });
});

import { describe, expect, it, vi } from "vitest";

import { isPrivateSitePath } from "@/lib/private-paths";

import CheckoutPage from "./page";

/**
 * `/checkout/<order>` was the first buyer checkout, with raw statuses and
 * a developer's placeholder where the payment should be. Nothing links to
 * it; an old link lands on the order's own page.
 */

const redirect = vi.hoisted(() =>
    vi.fn((to: string) => {
        throw new Error(`redirect:${to}`);
    }),
);

vi.mock("next/navigation", () => ({ redirect }));

function open(orderId: string) {
    return CheckoutPage({
        params: Promise.resolve({ domain: "rye.saroh.app", orderId }),
    });
}

describe("the old checkout address", () => {
    it("sends the customer to the order's page, on the same site", async () => {
        await expect(open("ord_1")).rejects.toThrow(
            "redirect:/shop/order/ord_1",
        );
        expect(redirect).toHaveBeenCalledWith("/shop/order/ord_1");
    });

    it("never builds an address out of what was typed", async () => {
        await expect(open("../account?x=1")).rejects.toThrow(
            "redirect:/shop/order/..%2Faccount%3Fx%3D1",
        );
    });

    it("leads between two private addresses: never indexed, never kept by the page cache", () => {
        expect(isPrivateSitePath("/checkout/ord_1")).toBe(true);
        expect(isPrivateSitePath("/shop/order/ord_1")).toBe(true);
    });
});

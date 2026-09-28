import { describe, expect, it } from "vitest";

import {
    orderLockedText,
    orderPowers,
    ordersAccess,
    ordersLockedCopy,
    ordersPlace,
} from "./access";

describe("orderPowers — each the power its endpoint asks (B16)", () => {
    const none = {
        stage: false,
        create: false,
        edit: false,
        payLink: false,
        refund: false,
        export: false,
    };
    const all = {
        stage: true,
        create: true,
        edit: true,
        payLink: true,
        refund: true,
        export: true,
    };

    it("counter staff with order:create take orders and make their pay links, nothing more", () => {
        expect(
            orderPowers({
                role: "MEMBER",
                actions: ["order:create", "order:read", "contact:read"],
            }),
        ).toEqual({ ...none, create: true, payLink: true });
    });

    it("order:edit changes orders and replaces pay links; no refund, no export", () => {
        expect(
            orderPowers({ role: "MEMBER", actions: ["order:edit"] }),
        ).toEqual({ ...none, edit: true, payLink: true });
    });

    it("refund and export are their own", () => {
        expect(
            orderPowers({ role: "MEMBER", actions: ["order:refund"] }),
        ).toEqual({ ...none, refund: true });
        expect(
            orderPowers({ role: "MEMBER", actions: ["order:export"] }),
        ).toEqual({ ...none, export: true });
    });

    it("the kitchen only moves steps", () => {
        expect(
            orderPowers({ role: "MEMBER", actions: ["order:stage"] }),
        ).toEqual({ ...none, stage: true });
    });

    it("reads the old umbrellas an API before B16 sends", () => {
        expect(
            orderPowers({
                role: "OWNER",
                actions: [
                    "order:read",
                    "order:write",
                    "order:stage",
                    "payment:manage",
                ],
            }),
        ).toEqual(all);
    });

    it("falls back to the built-in roles without resolved actions", () => {
        expect(orderPowers({ role: "OWNER" })).toEqual(all);
        expect(orderPowers({ role: "ADMIN" })).toEqual(all);
        expect(orderPowers({ role: "MEMBER" })).toEqual({
            ...none,
            stage: true,
        });
        expect(orderPowers({ role: "REVIEWER" })).toEqual(none);
    });

    it("leaves it to the API when there is no organization", () => {
        expect(orderPowers(null)).toEqual(all);
    });
});

describe("ordersAccess", () => {
    it("opens Orders with order:read, and shows the money", () => {
        expect(
            ordersAccess({ role: "MEMBER", actions: ["order:read"] }),
        ).toEqual({ open: true, money: true });
    });

    it("opens the kitchen's view with order:stage alone, without money", () => {
        expect(
            ordersAccess({ role: "MEMBER", actions: ["order:stage"] }),
        ).toEqual({ open: true, money: false });
    });

    it("locks a role holding neither, whatever else it holds", () => {
        // A role the business made for the catalogue.
        expect(
            ordersAccess({
                role: "MEMBER",
                actions: ["store:read", "inventory:write"],
            }),
        ).toEqual({ open: false, money: false });
        // The Reviewer bundle, resolved.
        expect(
            ordersAccess({ role: "REVIEWER", actions: ["site:read"] }),
        ).toEqual({ open: false, money: false });
    });

    it("falls back to the built-in roles without resolved actions", () => {
        expect(ordersAccess({ role: "OWNER" })).toEqual({
            open: true,
            money: true,
        });
        expect(ordersAccess({ role: "ADMIN" })).toEqual({
            open: true,
            money: true,
        });
        expect(ordersAccess({ role: "MEMBER" })).toEqual({
            open: true,
            money: false,
        });
        expect(ordersAccess({ role: "REVIEWER" })).toEqual({
            open: false,
            money: false,
        });
    });

    it("leaves it to the API when there is no organization", () => {
        expect(ordersAccess(null)).toEqual({ open: true, money: true });
    });
});

describe("ordersLockedCopy", () => {
    it("says what a Reviewer's role covers, and who can change it", () => {
        const copy = ordersLockedCopy({ role: "REVIEWER" }, "Rye & Co.");
        expect(copy.description).toBe(
            "Your role in Rye & Co. is Reviewer, which covers one website and nothing about the business around it. Orders are not part of it.",
        );
        expect(copy.note).toBe(
            "The rail does not offer Sell to this role, so you have reached it by address. Ask an Owner or Admin of Rye & Co. if you need it.",
        );
    });

    it("names a role the business made", () => {
        expect(
            ordersLockedCopy(
                { role: "MEMBER", roleLabel: " Catalogue " },
                "Rye & Co.",
            ).description,
        ).toBe(
            "Your role in Rye & Co. is Catalogue. Orders are not part of it.",
        );
    });

    it("doesn't guess a name it wasn't given", () => {
        expect(
            ordersLockedCopy({ role: "MEMBER", roleLabel: null }, "Rye & Co.")
                .description,
        ).toBe("Your role in Rye & Co. doesn't include orders.");
    });
});

describe("orderLockedText", () => {
    it("is the design's sentence for a Reviewer", () => {
        expect(orderLockedText({ role: "REVIEWER" })).toBe(
            "Your role is Reviewer, which can see the website but not this. An owner or admin can change that in Team.",
        );
    });

    it("names any other role, or leaves the name out", () => {
        expect(
            orderLockedText({ role: "MEMBER", roleLabel: "Catalogue" }),
        ).toBe(
            "Your role is Catalogue, which doesn't include orders. An owner or admin can change that in Team.",
        );
        expect(orderLockedText({ role: "MEMBER" })).toBe(
            "Your role doesn't include orders. An owner or admin can change that in Team.",
        );
    });
});

describe("ordersPlace — where Sell's gate shows Orders' locked card (DEC-056)", () => {
    it("the list, and New order, are the list", () => {
        expect(ordersPlace("/commerce/orders")).toBe("list");
        expect(ordersPlace("/commerce/orders/")).toBe("list");
        expect(ordersPlace("/commerce/orders/new")).toBe("list");
    });

    it("an order is one order", () => {
        expect(ordersPlace("/commerce/orders/cm_order_1")).toBe("order");
    });

    it("anywhere else in Sell keeps the gate's own denial", () => {
        expect(ordersPlace("/commerce/products")).toBeNull();
        expect(ordersPlace("/commerce")).toBeNull();
        expect(ordersPlace("/orders")).toBeNull();
        expect(ordersPlace(null)).toBeNull();
    });
});

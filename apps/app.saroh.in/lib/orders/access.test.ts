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

    it("never reads the role's name: without resolved actions nothing is offered (DEC-098)", () => {
        for (const role of ["OWNER", "ADMIN", "MEMBER", "REVIEWER"] as const) {
            expect(orderPowers({ role })).toEqual(none);
        }
    });

    it("a Member given the order powers may do what an Owner may", () => {
        expect(
            orderPowers({
                role: "MEMBER",
                actions: [
                    "order:stage",
                    "order:create",
                    "order:edit",
                    "order:refund",
                    "order:export",
                ],
            }),
        ).toEqual(all);
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

    it("never reads the role's name: without resolved actions no money (DEC-098)", () => {
        for (const role of ["OWNER", "ADMIN", "MEMBER", "REVIEWER"] as const) {
            expect(ordersAccess({ role })).toEqual({
                open: false,
                money: false,
            });
        }
    });

    it("leaves it to the API when there is no organization", () => {
        expect(ordersAccess(null)).toEqual({ open: true, money: true });
    });
});

describe("ordersLockedCopy", () => {
    const WHO = "An owner or admin can change this in Settings › Team.";

    it("says a Reviewer's role, that it doesn't include Orders, and who can change it", () => {
        const copy = ordersLockedCopy({ role: "REVIEWER" }, "Rye & Co.");
        expect(copy.description).toBe(
            "Your role in Rye & Co. is Reviewer. It doesn't include Orders.",
        );
        expect(copy.note).toBe(WHO);
    });

    it("never says how they got here: a link leads here as well as an address", () => {
        const copy = ordersLockedCopy({ role: "MEMBER" }, "Rye & Co.");
        expect(`${copy.description} ${copy.note}`).not.toMatch(
            /by address|rail does not offer/,
        );
    });

    it("names a role the business made", () => {
        expect(
            ordersLockedCopy(
                { role: "MEMBER", roleLabel: " Catalogue " },
                "Rye & Co.",
            ).description,
        ).toBe(
            "Your role in Rye & Co. is Catalogue. It doesn't include Orders.",
        );
    });

    it("doesn't guess a name it wasn't given", () => {
        expect(
            ordersLockedCopy({ role: "MEMBER", roleLabel: null }, "Rye & Co.")
                .description,
        ).toBe("Your role in Rye & Co. doesn't include Orders.");
        // A made role maps to MEMBER, and its key is never shown.
        expect(
            ordersLockedCopy(
                { role: "MEMBER", roleKey: "role_8f2c" },
                "Rye & Co.",
            ).description,
        ).toBe("Your role in Rye & Co. doesn't include Orders.");
    });

    it("names a Member the API said is the built-in", () => {
        expect(
            ordersLockedCopy({ role: "MEMBER", roleKey: "MEMBER" }, "Rye & Co.")
                .description,
        ).toBe("Your role in Rye & Co. is Member. It doesn't include Orders.");
    });
});

describe("orderLockedText", () => {
    const WHO = "An owner or admin can change this in Settings › Team.";

    it("is the one sentence for a Reviewer", () => {
        expect(orderLockedText({ role: "REVIEWER" })).toBe(
            `Your role is Reviewer. It doesn't include Orders. ${WHO}`,
        );
    });

    it("names any other role, or leaves the name out", () => {
        expect(
            orderLockedText({ role: "MEMBER", roleLabel: "Catalogue" }),
        ).toBe(`Your role is Catalogue. It doesn't include Orders. ${WHO}`);
        expect(orderLockedText({ role: "MEMBER" })).toBe(
            `Your role doesn't include Orders. ${WHO}`,
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

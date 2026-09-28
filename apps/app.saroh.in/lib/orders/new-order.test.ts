import { describe, expect, it } from "vitest";

import type { CustomerPick } from "@/lib/customers/picker";
import {
    bump,
    cashChange,
    clashText,
    createLabel,
    EMPTY_ADDRESS,
    findSellables,
    itemCount,
    partyOf,
    payNote,
    payOptions,
    reachOf,
    roomFor,
    sheetProblem,
} from "@/lib/orders/new-order";

const rupees = (cents: number) => `₹${cents / 100}`;
const walkIn = (phone = ""): CustomerPick => ({
    kind: "walk-in",
    name: "Asha",
    phone,
});
const known: CustomerPick = {
    kind: "contact",
    id: "k1",
    name: "Priya",
    email: "priya@example.in",
    phone: "+91 98450 00001",
};

describe("cash change (B13)", () => {
    it("₹500 given for ₹430 is ₹70 change", () => {
        expect(cashChange("500", 43_000)).toEqual({
            kind: "change",
            cents: 7_000,
        });
    });

    it("says how short it is", () => {
        expect(cashChange("400", 43_000)).toEqual({
            kind: "short",
            cents: 3_000,
        });
    });

    it("reads what people type, and says nothing for nothing", () => {
        expect(cashChange("₹ 1,000", 43_000)).toEqual({
            kind: "change",
            cents: 57_000,
        });
        expect(cashChange("430.00", 43_000)).toEqual({
            kind: "change",
            cents: 0,
        });
        expect(cashChange("", 43_000)).toEqual({ kind: "none" });
        expect(cashChange("abc", 43_000)).toEqual({ kind: "none" });
    });
});

describe("the payment chips", () => {
    it("offers a link only with a way to reach them and a provider", () => {
        const off = (pick: CustomerPick | null, canLink = true) =>
            payOptions({ pick, way: "PICKUP", canLink }).find(
                (p) => p.key === "LINK",
            )?.off;
        expect(off(known)).toBeNull();
        expect(off(walkIn("+91 90000 11111"))).toBeNull();
        expect(off(walkIn())).toBe("Needs a customer with a phone or email");
        expect(off(known, false)).toBe(
            "Connect a payment provider to send a link",
        );
    });

    it("turns pay on collection off for a delivery", () => {
        const later = (way: "PICKUP" | "LOCAL_DELIVERY") =>
            payOptions({ pick: known, way, canLink: true }).find(
                (p) => p.key === "LATER",
            )?.off;
        expect(later("PICKUP")).toBeNull();
        expect(later("LOCAL_DELIVERY")).toBe(
            "Deliveries are paid before they go",
        );
    });

    it("says what is recorded and what is charged before the button", () => {
        expect(payNote("CASH", "₹430", null)).toBe(
            "Paid now. It goes in the till, not a payout.",
        );
        expect(payNote("LINK", "₹430", "priya@example.in")).toContain(
            "send to priya@example.in",
        );
        expect(createLabel("CASH", "₹430", true)).toBe(
            "Take ₹430 cash · create",
        );
        expect(createLabel("CASH", "₹0", false)).toBe("Create order");
        expect(createLabel("LATER", "₹430", true)).toBe(
            "Create · pay on collection",
        );
    });
});

describe("what stops the button", () => {
    const base = {
        lines: 2,
        pick: walkIn(),
        way: "PICKUP" as const,
        address: EMPTY_ADDRESS,
        pay: "CASH" as const,
        payOff: null,
        cash: { kind: "none" as const },
        format: rupees,
    };

    it("is nothing for a walk-in's pick-up paid in cash", () => {
        expect(sheetProblem(base)).toBeNull();
    });

    it("asks for items, then who, then how it leaves", () => {
        expect(sheetProblem({ ...base, lines: 0 })).toBe(
            "Add at least one item.",
        );
        expect(sheetProblem({ ...base, pick: null })).toBe(
            "Pick a customer, or take a walk-in's name.",
        );
        expect(sheetProblem({ ...base, way: null })).toBe(
            "Pick how it leaves.",
        );
    });

    it("needs the whole address and someone to reach for a delivery", () => {
        expect(sheetProblem({ ...base, way: "LOCAL_DELIVERY" })).toBe(
            "Add the delivery address.",
        );
        const address = {
            line1: "12 Church St",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560001",
        };
        expect(sheetProblem({ ...base, way: "LOCAL_DELIVERY", address })).toBe(
            "Deliveries need a customer to send the tracking to.",
        );
        expect(
            sheetProblem({
                ...base,
                way: "LOCAL_DELIVERY",
                address,
                pick: known,
            }),
        ).toBeNull();
    });

    it("refuses cash short of the total", () => {
        expect(
            sheetProblem({ ...base, cash: { kind: "short", cents: 3_000 } }),
        ).toBe("That's ₹30 short.");
    });
});

describe("a line's allergy clash", () => {
    const peanuts = { id: "a_peanut", name: "Peanuts" };
    const sesame = { id: "a_sesame", name: "Sesame" };

    it("warns on a line that contains what they're allergic to", () => {
        expect(
            clashText(
                { contains: [peanuts], mayContain: [] },
                new Set(["a_peanut"]),
            ),
        ).toBe("Contains peanuts");
    });

    it("says may contain when that is all it is", () => {
        expect(
            clashText(
                { contains: [sesame], mayContain: [peanuts] },
                new Set(["a_peanut"]),
            ),
        ).toBe("May contain peanuts");
    });

    it("matches by id, never by spelling, and says nothing for a walk-in", () => {
        expect(
            clashText(
                {
                    contains: [{ id: "other", name: "Peanuts" }],
                    mayContain: [],
                },
                new Set(["a_peanut"]),
            ),
        ).toBe("");
        expect(
            clashText({ contains: [peanuts], mayContain: [] }, new Set()),
        ).toBe("");
    });
});

describe("the cart", () => {
    it("adds, counts and takes away", () => {
        let lines = bump([], "bread", 1);
        lines = bump(lines, "bread", 1);
        lines = bump(lines, "cake", 1);
        expect(itemCount(lines)).toBe("3 items");
        lines = bump(lines, "cake", -1);
        expect(lines).toEqual([{ key: "bread", quantity: 2 }]);
        expect(itemCount([])).toBe("Nothing yet");
    });

    it("stops at what is left at the storefront", () => {
        expect(roomFor({ left: 3, soldOut: false }, 2)).toBe(1);
        expect(roomFor({ left: 3, soldOut: false }, 3)).toBe(0);
        expect(roomFor({ left: null, soldOut: false }, 9)).toBeNull();
        expect(roomFor({ left: 5, soldOut: true }, 0)).toBe(0);
    });

    it("shows 5 before typing and 8 once typed", () => {
        const many = Array.from({ length: 12 }, (_, i) => ({
            name: `Loaf ${i}`,
        }));
        expect(findSellables(many, "")).toHaveLength(5);
        expect(findSellables(many, "loaf")).toHaveLength(8);
        expect(findSellables(many, "Loaf 11")).toEqual([{ name: "Loaf 11" }]);
    });
});

describe("who the API is told it is for", () => {
    it("a walk-in: a name, and a phone only when given", () => {
        expect(partyOf(walkIn())).toEqual({ walkIn: { name: "Asha" } });
        expect(partyOf(walkIn("+91 90000 11111"))).toEqual({
            walkIn: { name: "Asha", phone: "+91 90000 11111" },
        });
        expect(reachOf(walkIn())).toBeNull();
    });

    it("a picked person by their contact; someone new by email", () => {
        expect(partyOf(known)).toEqual({ contactId: "k1" });
        expect(
            partyOf({
                kind: "new",
                name: "Nisha",
                email: " nisha@example.in ",
                phone: "",
            }),
        ).toEqual({ customer: { email: "nisha@example.in", name: "Nisha" } });
    });
});

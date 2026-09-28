import { isWalkIn, orderPartyName, WALK_IN, walkInOf } from "./walk-in";

/**
 * Walk-in orders (plan B, B13): every reader names an order's party
 * through here, so a walk-in reads the same everywhere and never blank.
 */
describe("walk-in orders (B13)", () => {
    const walkIn = {
        customerId: null,
        walkInName: " Asha ",
        walkInPhone: "+91 98450 00002",
    };

    it("is a walk-in only with no customer", () => {
        expect(isWalkIn(walkIn)).toBe(true);
        expect(isWalkIn({ customerId: "c_1", walkInName: "Asha" })).toBe(false);
    });

    it("hands the phone only to a caller who reads contacts", () => {
        expect(walkInOf(walkIn, true)).toEqual({
            name: "Asha",
            phone: "+91 98450 00002",
        });
        expect(walkInOf(walkIn, false)).toEqual({ name: "Asha", phone: null });
        expect(walkInOf({ customerId: "c_1" }, true)).toBeNull();
    });

    it("never reads blank: a walk-in with no name is Walk-in", () => {
        expect(walkInOf({ customerId: null, walkInName: "  " }, true)).toEqual({
            name: WALK_IN,
            phone: null,
        });
        expect(orderPartyName({ customerId: null })).toBe(WALK_IN);
    });

    it("names a customer by name, else email", () => {
        expect(
            orderPartyName({
                customerId: "c_1",
                customer: {
                    firstName: "Priya",
                    lastName: "Rao",
                    email: "p@x.in",
                },
            }),
        ).toBe("Priya Rao");
        expect(
            orderPartyName({
                customerId: "c_1",
                customer: { firstName: null, lastName: null, email: "p@x.in" },
            }),
        ).toBe("p@x.in");
    });

    it("labels a walk-in where asked", () => {
        expect(orderPartyName(walkIn)).toBe("Asha");
        expect(orderPartyName(walkIn, { label: true })).toBe("Asha (walk-in)");
    });
});

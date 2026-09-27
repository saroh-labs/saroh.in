import { describe, expect, it } from "vitest";

import {
    bookerFor,
    defaultPay,
    paidWithFor,
    payChoices,
    payNote,
} from "@/lib/services/booking-pay";

describe("how a booking made by hand is paid (E4)", () => {
    it("offers Send a pay link first, and as the default, only when it can be sent", () => {
        expect(payChoices(true).map((c) => c.label)).toEqual([
            "Send a pay link",
            "Pays at the session",
            "Paid now",
        ]);
        expect(defaultPay(true)).toBe("LINK");
        // Unpriced, no invoice:write, or no provider: not offered at all.
        expect(payChoices(false).map((c) => c.key)).toEqual(["DESK", "PAID"]);
        expect(defaultPay(false)).toBe("DESK");
    });

    it("books a link unpaid, and says Saroh doesn't send it", () => {
        expect(paidWithFor("LINK")).toBeUndefined();
        expect(paidWithFor("DESK")).toBe("DESK");
        expect(paidWithFor("PAID")).toBe("PAID");
        expect(payNote("LINK")).toContain("doesn't send it for you");
    });

    it("books a contact by id, and someone new by email with what else was given", () => {
        expect(
            bookerFor({
                kind: "contact",
                id: "c_1",
                name: "Priya",
                email: null,
                phone: null,
            }),
        ).toEqual({ contactId: "c_1" });
        expect(
            bookerFor({
                kind: "new",
                name: "Priya Raman",
                email: "priya@example.com",
                phone: "",
            }),
        ).toEqual({
            bookerEmail: "priya@example.com",
            bookerName: "Priya Raman",
        });
    });

    it("can't book nobody, or a walk-in with no record", () => {
        expect(bookerFor(null)).toBeNull();
        expect(bookerFor({ kind: "walk-in", name: "Ravi", phone: "" })).toBe(
            null,
        );
    });
});

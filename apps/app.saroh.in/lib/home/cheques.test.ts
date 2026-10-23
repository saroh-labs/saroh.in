/**
 * "Cheques not in the bank" on Home (plan U18, DEC-173): when it is drawn,
 * what it says, how it counts and where it sits among the groups.
 */
import { describe, expect, it } from "vitest";

import {
    chequesWaiting,
    deskChequesAt,
    phoneChequesAt,
    totalWithCheques,
} from "./cheques";
import { chequesLine, chequesTitle } from "./group-words";
import type { HomeNeedGroup } from "./service";

const CHEQUES = {
    count: 2,
    totals: [{ currency: "INR", amountMinor: 1_400_000 }],
    href: "/billing/invoices?view=cheques",
};

function g(kind: HomeNeedGroup["kind"], late = 0): HomeNeedGroup {
    return {
        kind,
        count: 1,
        late,
        totals: null,
        oldest: null,
        rows: [],
        more: 0,
        href: "/",
        codes: [],
    };
}

describe("chequesWaiting", () => {
    it("is the figure while a cheque waits", () => {
        expect(chequesWaiting({ chequesWaiting: CHEQUES })).toBe(CHEQUES);
    });
    it("is null while none waits, without money access, or with no week", () => {
        expect(chequesWaiting({ chequesWaiting: null })).toBeNull();
        expect(chequesWaiting({})).toBeNull();
        expect(chequesWaiting(null)).toBeNull();
        expect(
            chequesWaiting({ chequesWaiting: { ...CHEQUES, count: 0 } }),
        ).toBeNull();
    });
});

describe("the words", () => {
    it("says how many and their total", () => {
        expect(chequesTitle(CHEQUES)).toBe(
            "2 cheques not in the bank · ₹14,000",
        );
        expect(
            chequesTitle({
                ...CHEQUES,
                count: 1,
                totals: [{ currency: "INR", amountMinor: 840_000 }],
            }),
        ).toBe("1 cheque not in the bank · ₹8,400");
    });
    it("says each currency once and leaves out an empty total", () => {
        const t = chequesTitle({
            ...CHEQUES,
            totals: [
                { currency: "INR", amountMinor: 1_400_000 },
                { currency: "USD", amountMinor: 12_000 },
                { currency: "EUR", amountMinor: 0 },
            ],
        });
        expect(t.startsWith("2 cheques not in the bank · ₹14,000 + ")).toBe(
            true,
        );
        expect(t).not.toContain("€");
        expect(chequesTitle({ ...CHEQUES, totals: [] })).toBe(
            "2 cheques not in the bank",
        );
    });
    it("draws no tag: nothing about it is late", () => {
        expect(chequesLine(CHEQUES)).toEqual({
            title: "2 cheques not in the bank · ₹14,000",
            sub: "Received, waiting to clear",
            tag: null,
        });
    });
});

describe("counting and placing", () => {
    it("counts as one thing however many wait", () => {
        expect(totalWithCheques(24, CHEQUES)).toBe(25);
        expect(totalWithCheques(24, { ...CHEQUES, count: 9 })).toBe(25);
        expect(totalWithCheques(24, null)).toBe(24);
    });
    it("sits under the bills at a desk, or in their place", () => {
        expect(deskChequesAt([g("ORDERS"), g("BILLS"), g("REVIEWS")])).toBe(2);
        expect(deskChequesAt([g("ORDERS"), g("REVIEWS")])).toBe(1);
        expect(deskChequesAt([g("ORDERS")])).toBe(1);
        expect(deskChequesAt([])).toBe(0);
    });
    it("sits under the bills on a phone, or after what is late", () => {
        expect(phoneChequesAt([g("ORDERS", 3), g("BILLS", 2)])).toBe(2);
        expect(phoneChequesAt([g("ORDERS", 3), g("PAYMENTS")])).toBe(1);
        expect(phoneChequesAt([g("ENQUIRIES")])).toBe(0);
        expect(phoneChequesAt([g("ORDERS", 1)])).toBe(1);
    });
});

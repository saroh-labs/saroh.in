import { describe, expect, it } from "vitest";

import type { RenewalChange } from "./renewal-change";
import { renewalAmountChanges, renewalChangeLines } from "./renewal-change";

/*
 * What a GST change does to the members already on a plan, in words
 * (12 Oct 2026): the sums are the API's, the plurals and the money are ours.
 */

const change = (over: Partial<RenewalChange> = {}): RenewalChange => ({
    members: 12,
    groups: [{ members: 12, currency: "INR", from: "2000.00", to: "2360.00" }],
    changed: 12,
    aboveAutopayLimit: 0,
    ...over,
});

describe("renewalChangeLines", () => {
    it("says nothing when nobody is on the plan, or its GST is as published", () => {
        expect(renewalChangeLines(null)).toEqual([]);
        expect(renewalChangeLines(undefined)).toEqual([]);
        expect(
            renewalChangeLines(change({ members: 0, groups: [], changed: 0 })),
        ).toEqual([]);
    });

    it("says one price group in one sentence", () => {
        expect(renewalChangeLines(change())).toEqual([
            "12 members' next renewal changes from ₹2,000 to ₹2,360.",
        ]);
    });

    it("says one member in the singular", () => {
        expect(
            renewalChangeLines(
                change({
                    members: 1,
                    changed: 1,
                    groups: [
                        {
                            members: 1,
                            currency: "INR",
                            from: "2000.00",
                            to: "2360.00",
                        },
                    ],
                }),
            ),
        ).toEqual(["1 member's next renewal changes from ₹2,000 to ₹2,360."]);
    });

    it("lists each price when members pay different ones, and adds them up", () => {
        expect(
            renewalChangeLines(
                change({
                    members: 15,
                    changed: 15,
                    groups: [
                        {
                            members: 12,
                            currency: "INR",
                            from: "2000.00",
                            to: "2360.00",
                        },
                        {
                            members: 3,
                            currency: "INR",
                            from: "1500.00",
                            to: "1770.00",
                        },
                    ],
                }),
            ),
        ).toEqual([
            "15 members' next renewal changes:",
            "12 members from ₹2,000 to ₹2,360.",
            "3 members from ₹1,500 to ₹1,770.",
        ]);
    });

    it("says who pays by autopay with a limit below the new amount", () => {
        expect(renewalChangeLines(change({ aboveAutopayLimit: 3 }))).toEqual([
            "12 members' next renewal changes from ₹2,000 to ₹2,360.",
            "3 of them pay by autopay with a limit below the new amount. Their renewal goes out as an invoice with a payment link.",
        ]);
        expect(
            renewalChangeLines(change({ aboveAutopayLimit: 1 })).at(-1),
        ).toBe(
            "1 of them pays by autopay with a limit below the new amount. Their renewal goes out as an invoice with a payment link.",
        );
        // The only member on the plan.
        expect(
            renewalChangeLines(
                change({
                    members: 1,
                    changed: 1,
                    aboveAutopayLimit: 1,
                    groups: [
                        {
                            members: 1,
                            currency: "INR",
                            from: "2000.00",
                            to: "2360.00",
                        },
                    ],
                }),
            ).at(-1),
        ).toBe(
            "They pay by autopay with a limit below the new amount. Their renewal goes out as an invoice with a payment link.",
        );
    });

    it("says the amount stays the same, with the GST inside, where the price includes it", () => {
        const same = change({
            changed: 0,
            groups: [
                {
                    members: 12,
                    currency: "INR",
                    from: "2000.00",
                    to: "2000.00",
                },
            ],
        });
        expect(renewalChangeLines(same)).toEqual([
            "12 members' next renewal stays the same amount.",
            "Their invoice will show the GST inside it.",
        ]);
        // An exempt plan's invoice has no GST inside to show.
        expect(renewalChangeLines(same, { gstInside: false })).toEqual([
            "12 members' next renewal stays the same amount.",
        ]);
        // Never an autopay line when nobody's amount moves.
        expect(
            renewalChangeLines({ ...same, aboveAutopayLimit: 2 }).join(" "),
        ).not.toContain("autopay");
    });

    it("says an amount that goes down the same way", () => {
        expect(
            renewalChangeLines(
                change({
                    groups: [
                        {
                            members: 12,
                            currency: "INR",
                            from: "2360.00",
                            to: "2000.00",
                        },
                    ],
                }),
            ),
        ).toEqual(["12 members' next renewal changes from ₹2,360 to ₹2,000."]);
    });

    it("says who stays the same when only some change", () => {
        expect(
            renewalChangeLines(
                change({
                    members: 14,
                    changed: 12,
                    groups: [
                        {
                            members: 12,
                            currency: "INR",
                            from: "2000.00",
                            to: "2360.00",
                        },
                        {
                            members: 2,
                            currency: "INR",
                            from: "0.00",
                            to: "0.00",
                        },
                    ],
                }),
            ),
        ).toEqual([
            "12 members' next renewal changes from ₹2,000 to ₹2,360.",
            "2 members' next renewal stays the same amount.",
        ]);
    });

    it("keeps paise, and groups large counts as every other number", () => {
        expect(
            renewalChangeLines(
                change({
                    members: 1204,
                    changed: 1204,
                    groups: [
                        {
                            members: 1204,
                            currency: "INR",
                            from: "999.00",
                            to: "1048.95",
                        },
                    ],
                }),
            ),
        ).toEqual([
            "1,204 members' next renewal changes from ₹999 to ₹1,048.95.",
        ]);
    });
});

describe("renewalAmountChanges", () => {
    it("is true only when someone's amount moves", () => {
        expect(renewalAmountChanges(change())).toBe(true);
        expect(renewalAmountChanges(null)).toBe(false);
        expect(
            renewalAmountChanges(
                change({
                    changed: 0,
                    groups: [
                        {
                            members: 12,
                            currency: "INR",
                            from: "2000.00",
                            to: "2000.00",
                        },
                    ],
                }),
            ),
        ).toBe(false);
    });
});

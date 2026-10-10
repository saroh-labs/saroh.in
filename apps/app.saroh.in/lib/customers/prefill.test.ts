import { describe, expect, it } from "vitest";

import type { CustomerPick } from "./picker";
import type { PrefillSource } from "./prefill";
import {
    arrivalContactId,
    isOpeningPick,
    pickFromPerson,
    withoutArrival,
} from "./prefill";

/**
 * New order and New booking arriving from a person's page with them already
 * chosen (#247): what the address carries, the pick it becomes, and when
 * the flow has nothing to lose.
 */

const person = (
    contact: Partial<PrefillSource["contact"]> = {},
    siteAccount: PrefillSource["siteAccount"] = null,
): PrefillSource => ({
    contact: {
        id: "c_1",
        name: "Priya Raman",
        email: "priya.raman@example.com",
        phone: "+91 98450 12345",
        ...contact,
    },
    siteAccount,
});

describe("arrivalContactId", () => {
    it("is the contact named beside new=1", () => {
        expect(arrivalContactId({ new: "1", contactId: "c_1" })).toBe("c_1");
    });

    it("takes the first of a repeated parameter, trimmed", () => {
        expect(
            arrivalContactId({ new: "1", contactId: [" c_1 ", "c_2"] }),
        ).toBe("c_1");
    });

    it("is no one without new=1, or with a blank id", () => {
        expect(arrivalContactId({ contactId: "c_1" })).toBeNull();
        expect(arrivalContactId({ new: "0", contactId: "c_1" })).toBeNull();
        expect(arrivalContactId({ new: "1", contactId: "  " })).toBeNull();
        expect(arrivalContactId({ new: "1" })).toBeNull();
    });
});

describe("pickFromPerson", () => {
    it("is the picker's answer for someone the business knows", () => {
        expect(pickFromPerson(person())).toEqual({
            kind: "contact",
            id: "c_1",
            name: "Priya Raman",
            email: "priya.raman@example.com",
            phone: "+91 98450 12345",
        });
    });

    it("says nothing it doesn't have", () => {
        expect(
            pickFromPerson(person({ name: "  ", phone: " " })),
        ).toMatchObject({ name: null, phone: null });
    });

    it("never carries a site account's placeholder email (DEC-049)", () => {
        expect(
            pickFromPerson(person({ email: "acc_9@account.invalid" }))?.email,
        ).toBeNull();
        expect(
            pickFromPerson(
                person(
                    { email: "acc_9@account.invalid" },
                    { email: "priya@example.com" },
                ),
            )?.email,
        ).toBe("priya@example.com");
    });

    it("is no one for a record whose details were removed (C11)", () => {
        expect(
            pickFromPerson(person({ email: "removed+c_1@removed.invalid" })),
        ).toBeNull();
        expect(
            pickFromPerson(person({ removedAt: "2026-10-01T00:00:00Z" })),
        ).toBeNull();
    });
});

describe("isOpeningPick — what closing the flow would lose", () => {
    const priya = pickFromPerson(person()) as CustomerPick;

    it("holds when the picker still has who it opened with", () => {
        expect(isOpeningPick(null, null)).toBe(true);
        expect(isOpeningPick(priya, priya)).toBe(true);
        // A re-read of the same person is still them.
        expect(isOpeningPick({ ...priya }, priya)).toBe(true);
    });

    it("breaks once the merchant picks someone else, or no one", () => {
        expect(isOpeningPick(null, priya)).toBe(false);
        expect(isOpeningPick(priya, null)).toBe(false);
        expect(
            isOpeningPick(
                {
                    kind: "contact",
                    id: "c_2",
                    name: null,
                    email: null,
                    phone: null,
                },
                priya,
            ),
        ).toBe(false);
        expect(
            isOpeningPick({ kind: "walk-in", name: "Priya", phone: "" }, priya),
        ).toBe(false);
    });
});

describe("withoutArrival", () => {
    it("drops new and contactId and keeps the rest", () => {
        expect(
            withoutArrival(
                "/bookings",
                "?layout=week&new=1&contactId=c_1&date=2026-10-09",
            ),
        ).toBe("/bookings?layout=week&date=2026-10-09");
    });

    it("is the bare path when nothing else is left", () => {
        expect(withoutArrival("/bookings", "?new=1&contactId=c_1")).toBe(
            "/bookings",
        );
        expect(withoutArrival("/bookings", "")).toBe("/bookings");
    });
});

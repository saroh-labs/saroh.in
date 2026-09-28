import type { MergeAccount, MergeContact } from "./merge-plan";
import {
    accountPlan,
    accountSentences,
    consentOutcome,
    defaultSurvivor,
    fieldOptions,
    keptAddresses,
    mergeRefusals,
    moveCounts,
    offeredEmail,
    survivorFields,
    survivorVerification,
} from "./merge-plan";

/**
 * The merge's rules, pure (DEC-042, C9): consent per channel, the site
 * account (ADR-011), the survivor's fields, verification (DEC-049), the
 * refusals and the counts the preview names.
 */

function contact(over: Partial<MergeContact> = {}): MergeContact {
    return {
        id: "a",
        firstName: "Asha",
        lastName: "Rao",
        email: "asha@example.in",
        phone: "+91 98450 00001",
        company: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        emailVerifiedAt: null,
        emailVerifiedVia: null,
        ...over,
    };
}

const asha = contact();
const ashaToo = contact({
    id: "b",
    firstName: "Asha R",
    lastName: null,
    email: "asha.r@gmail.com",
    phone: "98450 00002",
    company: "Rao Studio",
    createdAt: new Date("2026-06-01T00:00:00Z"),
});
const none = { survivor: null, other: null };

const lastYear = new Date("2025-09-01T00:00:00Z");
const lastWeek = new Date("2026-09-21T00:00:00Z");

describe("defaultSurvivor (default 22)", () => {
    it("offers the older contact", () => {
        expect(defaultSurvivor(asha, ashaToo)).toBe("a");
        expect(defaultSurvivor(ashaToo, asha)).toBe("a");
    });

    it("breaks a tie on the id, so the offer never flips", () => {
        const same = contact({ id: "z" });
        expect(defaultSurvivor(same, asha)).toBe("a");
    });
});

describe("consentOutcome (default 24)", () => {
    const revokedLastYear = { status: "REVOKED", updatedAt: lastYear };
    const grantedLastWeek = { status: "GRANTED", updatedAt: lastWeek };

    it("A revoked last year, B granted last week with B's email, B's email kept → granted", () => {
        expect(
            consentOutcome(
                { survivor: revokedLastYear, other: grantedLastWeek },
                { survivor: false, other: true },
            ),
        ).toEqual({ status: "GRANTED", from: "other" });
    });

    it("the same, but the survivor keeps A's email → revoked: the grant came with B's", () => {
        expect(
            consentOutcome(
                { survivor: revokedLastYear, other: grantedLastWeek },
                { survivor: true, other: false },
            ),
        ).toEqual({ status: "REVOKED", from: "survivor" });
    });

    it("A granted, B revoked later → revoked", () => {
        expect(
            consentOutcome(
                {
                    survivor: { status: "GRANTED", updatedAt: lastYear },
                    other: { status: "REVOKED", updatedAt: lastWeek },
                },
                { survivor: true, other: true },
            ),
        ).toEqual({ status: "REVOKED", from: "other" });
    });

    it("never turns an opt-out into an opt-in with an older grant", () => {
        expect(
            consentOutcome(
                {
                    survivor: { status: "REVOKED", updatedAt: lastWeek },
                    other: { status: "GRANTED", updatedAt: lastYear },
                },
                { survivor: true, other: true },
            ),
        ).toEqual({ status: "REVOKED", from: "survivor" });
    });

    it("drops a grant whose address goes, leaving the channel not asked", () => {
        expect(
            consentOutcome(
                { other: grantedLastWeek },
                { survivor: true, other: false },
            ),
        ).toEqual({ status: null, from: null });
    });

    it("drops even the survivor's own grant when it takes the other's address", () => {
        expect(
            consentOutcome(
                { survivor: grantedLastWeek },
                { survivor: false, other: true },
            ),
        ).toEqual({ status: null, from: null });
    });

    it("says not asked when neither was asked", () => {
        expect(consentOutcome({}, { survivor: true, other: true })).toEqual({
            status: null,
            from: null,
        });
    });
});

describe("keptAddresses", () => {
    it("reads the email by address and the phone by its digits", () => {
        const fields = survivorFields(asha, ashaToo, none, {
            name: "survivor",
            email: "other",
            phone: "survivor",
        });
        expect(keptAddresses(asha, ashaToo, none, fields)).toEqual({
            EMAIL: { survivor: false, other: true },
            WHATSAPP: { survivor: true, other: false },
        });
    });

    it("reads a placeholder side's address as its account's email", () => {
        const separate = contact({
            id: "b",
            email: "account+b@account.invalid",
        });
        const accounts = {
            survivor: null,
            other: { id: "acc", email: "asha.r@gmail.com" },
        };
        const fields = survivorFields(asha, separate, accounts, {
            name: "survivor",
            email: "other",
            phone: "survivor",
        });
        expect(fields.email).toBe("asha.r@gmail.com");
        expect(keptAddresses(asha, separate, accounts, fields).EMAIL).toEqual({
            survivor: false,
            other: true,
        });
    });
});

describe("the email choice never offers a placeholder (DEC-049)", () => {
    const separate = contact({ id: "b", email: "account+b@account.invalid" });

    it("offers the account's verified email instead", () => {
        expect(
            offeredEmail(separate, { id: "acc", email: "asha@example.in" }),
        ).toBe("asha@example.in");
    });

    it("offers nothing when a placeholder has no account", () => {
        expect(offeredEmail(separate, null)).toBeNull();
        expect(
            offeredEmail(contact({ email: "merged+x@removed.invalid" }), null),
        ).toBeNull();
    });

    it("lists both values of each field, as the design does", () => {
        expect(
            fieldOptions(asha, separate, {
                survivor: null,
                other: { id: "acc", email: "asha@example.in" },
            }),
        ).toEqual({
            name: { survivor: "Asha Rao", other: "Asha Rao" },
            email: {
                survivor: "asha@example.in",
                other: "asha@example.in",
            },
            phone: {
                survivor: "+91 98450 00001",
                other: "+91 98450 00001",
            },
        });
    });

    it("keeps the survivor's own email when neither side offers one", () => {
        const survivor = contact({ email: "account+a@account.invalid" });
        expect(
            survivorFields(survivor, separate, none, {
                name: "survivor",
                email: "other",
                phone: "survivor",
            }).email,
        ).toBe("account+a@account.invalid");
    });
});

describe("survivorFields (default 89)", () => {
    it("takes name, email and phone as picked", () => {
        expect(
            survivorFields(asha, ashaToo, none, {
                name: "other",
                email: "other",
                phone: "other",
            }),
        ).toEqual({
            firstName: "Asha R",
            lastName: null,
            email: "asha.r@gmail.com",
            phone: "98450 00002",
            company: "Rao Studio",
        });
    });

    it("fills an empty company from the other, and keeps the survivor's own", () => {
        const both = survivorFields(
            contact({ company: "Asha's" }),
            ashaToo,
            none,
            { name: "survivor", email: "survivor", phone: "survivor" },
        );
        expect(both.company).toBe("Asha's");
    });

    it("never loses a value by picking an empty one", () => {
        const noPhone = contact({
            phone: null,
            firstName: null,
            lastName: null,
        });
        const fields = survivorFields(noPhone, ashaToo, none, {
            name: "survivor",
            email: "survivor",
            phone: "survivor",
        });
        expect(fields.phone).toBe("98450 00002");
        expect(fields.firstName).toBe("Asha R");
    });
});

describe("accountPlan (ADR-011)", () => {
    const a: MergeAccount = { id: "acc_a", email: "asha@example.in" };
    const b: MergeAccount = { id: "acc_b", email: "asha.r@gmail.com" };

    it("only the other has one → it moves, and the merchant must confirm", () => {
        expect(
            accountPlan({
                survivor: null,
                other: b,
                carry: true,
                otherBrings: false,
            }),
        ).toMatchObject({
            action: "move",
            seesCombined: b,
            confirmationRequired: true,
        });
    });

    it("\"Don't carry the sign-in over\" → it's retired, and nobody new sees anything", () => {
        expect(
            accountPlan({
                survivor: null,
                other: b,
                carry: false,
                otherBrings: true,
            }),
        ).toEqual({
            action: "retire",
            seesCombined: null,
            retired: b,
            retiredInto: null,
            confirmationRequired: false,
        });
    });

    it("both have one → the other's is retired into the survivor's", () => {
        expect(
            accountPlan({
                survivor: a,
                other: b,
                carry: true,
                otherBrings: true,
            }),
        ).toEqual({
            action: "retire",
            seesCombined: a,
            retired: b,
            retiredInto: a,
            confirmationRequired: true,
        });
    });

    it("the survivor's account asks for confirmation only when it gains records", () => {
        expect(
            accountPlan({
                survivor: a,
                other: null,
                carry: true,
                otherBrings: false,
            }).confirmationRequired,
        ).toBe(false);
        expect(
            accountPlan({
                survivor: a,
                other: null,
                carry: true,
                otherBrings: true,
            }).confirmationRequired,
        ).toBe(true);
    });

    it("neither signs in → nothing to confirm", () => {
        expect(
            accountPlan({ ...none, carry: true, otherBrings: true }),
        ).toMatchObject({ action: "none", confirmationRequired: false });
    });

    it("names who will see the record, and whose email stops reaching it, masked", () => {
        expect(
            accountSentences(
                accountPlan({
                    survivor: a,
                    other: b,
                    carry: true,
                    otherBrings: true,
                }),
            ),
        ).toEqual({
            seesCombined:
                "a…@example.in signs in on your website and will see everything here",
            stopsReaching:
                "a…@gmail.com will be asked to sign in with a…@example.in instead",
        });
    });
});

describe("survivorVerification (DEC-049)", () => {
    const now = new Date("2026-09-28T00:00:00Z");

    it("stamps STAFF_CONFIRMED when the survivor holds its account's email", () => {
        expect(
            survivorVerification({
                email: "asha@example.in",
                account: { id: "acc", email: "asha@example.in" },
                survivor: asha,
                other: ashaToo,
                now,
            }),
        ).toEqual({
            emailVerifiedAt: now,
            emailVerifiedVia: "STAFF_CONFIRMED",
        });
    });

    it("keeps a stamp only for the very address it proved", () => {
        const proved = contact({
            id: "b",
            email: "asha.r@gmail.com",
            emailVerifiedAt: lastWeek,
            emailVerifiedVia: "BOOKING_CONFIRMATION",
        });
        expect(
            survivorVerification({
                email: "asha.r@gmail.com",
                account: null,
                survivor: asha,
                other: proved,
                now,
            }),
        ).toEqual({
            emailVerifiedAt: lastWeek,
            emailVerifiedVia: "BOOKING_CONFIRMATION",
        });
        expect(
            survivorVerification({
                email: "asha@example.in",
                account: null,
                survivor: asha,
                other: proved,
                now,
            }),
        ).toEqual({ emailVerifiedAt: null, emailVerifiedVia: null });
    });
});

describe("mergeRefusals (defaults 23, 90)", () => {
    it("names the plan and the course", () => {
        expect(
            mergeRefusals({ samePlans: ["Monthly"], sameCourses: ["Pottery"] }),
        ).toEqual([
            {
                reason: "same-plan",
                message: "Cancel one of their Monthly subscriptions first",
            },
            {
                reason: "same-course",
                message: "Cancel one of their Pottery enrolments first",
            },
        ]);
    });

    it("refuses nothing otherwise", () => {
        expect(mergeRefusals({ samePlans: [], sameCourses: [] })).toEqual([]);
    });
});

describe("moveCounts", () => {
    it("names each kind with its count and drops the empty ones", () => {
        expect(moveCounts({ orders: 2, notes: 1, bookings: 0 })).toEqual([
            { key: "orders", count: 2, label: "2 orders" },
            { key: "notes", count: 1, label: "1 note" },
        ]);
    });
});

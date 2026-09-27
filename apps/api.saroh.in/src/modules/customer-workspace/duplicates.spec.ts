import {
    reservedAccountEmail,
    reservedMergedEmail,
    reservedRemovedEmail,
} from "../contacts/contact-email";
import type { ContactIdentity } from "./duplicates";
import {
    duplicatesOf,
    matchStoreCustomer,
    normaliseEmail,
    normalisePhone,
    pairContacts,
    pairsAmong,
    storeCustomerMatches,
} from "./duplicates";

const contact = (over: Partial<ContactIdentity> & { id: string }) => ({
    email: null,
    phone: null,
    account: null,
    ...over,
});

describe("normaliseEmail", () => {
    it("trims and lower-cases", () => {
        expect(normaliseEmail("  Asha@Example.COM ")).toBe("asha@example.com");
    });

    it("reads nothing, a blank and every reserved placeholder as no email", () => {
        expect(normaliseEmail(null)).toBeNull();
        expect(normaliseEmail(undefined)).toBeNull();
        expect(normaliseEmail("   ")).toBeNull();
        expect(normaliseEmail(reservedAccountEmail("c1"))).toBeNull();
        expect(normaliseEmail(reservedMergedEmail("c1"))).toBeNull();
        expect(normaliseEmail(reservedRemovedEmail("c1"))).toBeNull();
        expect(normaliseEmail(" REMOVED+c1@Removed.Invalid ")).toBeNull();
    });
});

describe("normalisePhone", () => {
    it("keeps digits only", () => {
        expect(normalisePhone("(555) 010-2030")).toBe("5550102030");
    });

    it("drops the 91 of an Indian number, so the ways it is typed meet", () => {
        const ten = "9876543210";
        expect(normalisePhone("+91 98765 43210")).toBe(ten);
        expect(normalisePhone("91-98765-43210")).toBe(ten);
        expect(normalisePhone("98765 43210")).toBe(ten);
    });

    it("keeps a 91 that is part of a ten-digit number", () => {
        expect(normalisePhone("9198765432")).toBe("9198765432");
    });

    it("reads nothing, or fewer than seven digits, as no phone", () => {
        expect(normalisePhone(null)).toBeNull();
        expect(normalisePhone("")).toBeNull();
        expect(normalisePhone("ext 12")).toBeNull();
        expect(normalisePhone("123456")).toBeNull();
        expect(normalisePhone("1234567")).toBe("1234567");
    });
});

describe("pairContacts", () => {
    it("pairs two contacts who share a phone, not an email, when neither signs in", () => {
        const a = contact({
            id: "a",
            email: "a@x.com",
            phone: "+91 98765 43210",
        });
        const b = contact({ id: "b", email: "b@x.com", phone: "98765-43210" });
        expect(pairContacts(a, b)).toEqual(["phone"]);
        expect(pairContacts(b, a)).toEqual(["phone"]);
    });

    it("never pairs on a phone when one of them signs in", () => {
        const a = contact({ id: "a", email: "a@x.com", phone: "9876543210" });
        const b = contact({
            id: "b",
            email: reservedAccountEmail("b"),
            phone: "9876543210",
            account: { email: "b@x.com" },
        });
        expect(pairContacts(a, b)).toEqual([]);
        expect(pairContacts(b, a)).toEqual([]);
    });

    it("pairs a contact with the separate contact a sign-in made for its email", () => {
        // A4: the contact holding asha@x.com wasn't verified, so her first
        // sign-in got a separate contact with a placeholder email.
        const known = contact({
            id: "known",
            email: "Asha@X.com",
            phone: "9876543210",
        });
        const separate = contact({
            id: "separate",
            email: reservedAccountEmail("separate"),
            account: { email: "asha@x.com" },
        });
        expect(pairContacts(known, separate)).toEqual(["email"]);
        expect(pairContacts(separate, known)).toEqual(["email"]);
    });

    it("pairs on an email and a phone at once", () => {
        const a = contact({ id: "a", email: "Sam@x.com", phone: "7000000001" });
        const b = contact({
            id: "b",
            email: "sam@x.com ",
            phone: "+91 7000000001",
        });
        expect(pairContacts(a, b)).toEqual(["email", "phone"]);
    });

    it("never pairs two reserved placeholders, however alike", () => {
        const a = contact({ id: "a", email: reservedMergedEmail("x") });
        const b = contact({ id: "b", email: reservedMergedEmail("x") });
        expect(pairContacts(a, b)).toEqual([]);
    });

    it("never pairs a pair staff split with This isn't them, from either side", () => {
        const known = contact({
            id: "known",
            email: "asha@x.com",
            phone: "9876543210",
        });
        const moved = contact({
            id: "moved",
            email: reservedAccountEmail("moved"),
            account: { email: "asha@x.com" },
            unlinkedFrom: ["known"],
        });
        expect(pairContacts(known, moved)).toEqual([]);
        expect(pairContacts(moved, known)).toEqual([]);
        expect(
            pairContacts(
                { ...known, unlinkedFrom: ["moved"] },
                { ...moved, unlinkedFrom: [] },
            ),
        ).toEqual([]);
    });

    it("never pairs a contact with itself, or on a name", () => {
        const a = contact({ id: "a", email: "a@x.com", phone: "9876543210" });
        expect(pairContacts(a, a)).toEqual([]);
        expect(
            pairContacts(
                contact({ id: "a", email: "a@x.com" }),
                contact({ id: "b", email: "b@x.com" }),
            ),
        ).toEqual([]);
    });
});

describe("matchStoreCustomer", () => {
    it("matches a store customer on the contact's email or its account's", () => {
        const known = contact({ id: "c", email: "asha@x.com" });
        expect(
            matchStoreCustomer(known, {
                id: "s",
                email: " ASHA@x.com",
                phone: null,
            }),
        ).toEqual(["email"]);
        const separate = contact({
            id: "c2",
            email: reservedAccountEmail("c2"),
            account: { email: "asha@x.com" },
        });
        expect(
            matchStoreCustomer(separate, {
                id: "s",
                email: "asha@x.com",
                phone: null,
            }),
        ).toEqual(["email"]);
    });

    it("never matches an anonymised store customer's placeholder", () => {
        const c = contact({ id: "c", email: reservedRemovedEmail("s") });
        expect(
            matchStoreCustomer(c, {
                id: "s",
                email: reservedRemovedEmail("s"),
                phone: null,
            }),
        ).toEqual([]);
    });

    it("matches on phone only when the contact doesn't sign in", () => {
        const s = { id: "s", email: "other@x.com", phone: "+91 98765 43210" };
        expect(
            matchStoreCustomer(
                contact({ id: "c", email: "c@x.com", phone: "9876543210" }),
                s,
            ),
        ).toEqual(["phone"]);
        expect(
            matchStoreCustomer(
                contact({
                    id: "c",
                    email: "c@x.com",
                    phone: "9876543210",
                    account: { email: "c@x.com" },
                }),
                s,
            ),
        ).toEqual([]);
    });
});

describe("lists of candidates", () => {
    const me = contact({ id: "me", email: "me@x.com", phone: "9876543210" });

    it("keeps only the candidates that pair, in order", () => {
        expect(
            duplicatesOf(me, [
                contact({ id: "p", phone: "+91 9876543210" }),
                contact({ id: "q", phone: "1111111111" }),
                me,
                contact({
                    id: "r",
                    email: "x",
                    account: { email: "ME@x.com" },
                }),
            ]),
        ).toEqual([
            { id: "p", matchedOn: ["phone"] },
            { id: "r", matchedOn: ["email"] },
        ]);
        expect(
            storeCustomerMatches(me, [
                { id: "s1", email: "me@x.com", phone: null },
                { id: "s2", email: "no@x.com", phone: "0" },
            ]),
        ).toEqual([{ id: "s1", matchedOn: ["email"] }]);
    });

    it("finds each pair in a set once", () => {
        expect(
            pairsAmong([
                me,
                contact({ id: "p", phone: "9876543210" }),
                contact({ id: "q", phone: "9876543210" }),
                contact({ id: "z", phone: "5555555555" }),
            ]),
        ).toEqual([
            { a: "me", b: "p", matchedOn: ["phone"] },
            { a: "me", b: "q", matchedOn: ["phone"] },
            { a: "p", b: "q", matchedOn: ["phone"] },
        ]);
    });
});

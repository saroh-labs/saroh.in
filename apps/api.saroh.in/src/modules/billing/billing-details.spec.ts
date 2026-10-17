// Who Saroh bills, before it charges (17 Oct 2026): what is missing, and a
// checkout refused by field until it's given. Pure; made-up businesses.
import type { BillingParty, BillingProfile } from "./billing-details";
import {
    addressComplete,
    checkoutDetails,
    missingBillingDetails,
} from "./billing-details";

const wholeProfile: BillingProfile = {
    legalName: "Rye Bakes LLP",
    contactEmail: null,
    phone: null,
    taxId: null,
    gstState: "29",
    addressLine1: "3 Hill Road",
    addressLine2: null,
    city: "Bengaluru",
    postalCode: "560038",
};

const party = (over: Partial<BillingParty> = {}): BillingParty => ({
    profile: wholeProfile,
    orgName: "Rye",
    userEmail: "owner@example.com",
    userName: "Asha",
    ...over,
});

const withProfile = (p: Partial<BillingProfile> | null): BillingParty =>
    party({ profile: p ? { ...wholeProfile, ...p } : null });

/** The refusal's `details`, or null when nothing was refused. */
function refusal(fn: () => unknown): {
    field?: string;
    missing?: string[];
    status?: number;
} | null {
    try {
        fn();
    } catch (e) {
        const err = e as {
            getStatus?: () => number;
            getResponse?: () => {
                details?: { field?: string; missing?: string[] };
            };
        };
        return {
            status: err.getStatus?.(),
            ...err.getResponse?.()?.details,
        };
    }
    return null;
}

describe("missingBillingDetails", () => {
    it("is nothing for a business with a name, email, whole address and state", () => {
        expect(missingBillingDetails(party())).toEqual([]);
    });

    it("takes the business's name when there is no legal name, and the contact email when the owner has none", () => {
        expect(
            missingBillingDetails(
                party({
                    profile: {
                        ...wholeProfile,
                        legalName: " ",
                        contactEmail: "hello@example.com",
                    },
                    userEmail: null,
                }),
            ),
        ).toEqual([]);
    });

    it("names each thing missing, in the form's order", () => {
        expect(
            missingBillingDetails({
                profile: null,
                orgName: null,
                userEmail: null,
                userName: null,
            }),
        ).toEqual(["name", "email", "address", "state"]);
        expect(missingBillingDetails(withProfile({ gstState: null }))).toEqual([
            "state",
        ]);
    });

    it("an address without its city or a six-digit PIN isn't whole", () => {
        expect(addressComplete(withProfile({ city: "" }).profile)).toBe(false);
        expect(
            addressComplete(withProfile({ postalCode: "5600" }).profile),
        ).toBe(false);
        expect(
            addressComplete(withProfile({ postalCode: "560 038" }).profile),
        ).toBe(true);
        expect(addressComplete(null)).toBe(false);
    });
});

describe("checkoutDetails", () => {
    it("asks nothing of a business that has it all, and keeps nothing", () => {
        expect(checkoutDetails(party(), {}, null)).toEqual({
            profile: {},
            billToEmail: null,
            billToPhone: null,
        });
    });

    it("refuses, by field and with a 400, each thing missing", () => {
        const none: BillingParty = {
            profile: null,
            orgName: null,
            userEmail: null,
            userName: null,
        };
        expect(refusal(() => checkoutDetails(none, {}, null))).toEqual({
            status: 400,
            field: "billingName",
            missing: ["name", "email", "address", "state"],
        });
        expect(
            refusal(() => checkoutDetails(none, { billingName: "Rye" }, null))
                ?.field,
        ).toBe("billingEmail");
        expect(
            refusal(() =>
                checkoutDetails(
                    none,
                    { billingName: "Rye", billingEmail: "not-an-email" },
                    null,
                ),
            )?.field,
        ).toBe("billingEmail");
        expect(
            refusal(() =>
                checkoutDetails(
                    none,
                    { billingName: "Rye", billingEmail: "a@example.com" },
                    null,
                ),
            )?.field,
        ).toBe("addressLine1");
        expect(
            refusal(() =>
                checkoutDetails(
                    withProfile({ city: null }),
                    { registeredAddress: { line1: "3 Hill Road" } },
                    null,
                ),
            )?.field,
        ).toBe("city");
        expect(
            refusal(() =>
                checkoutDetails(withProfile({ gstState: null }), {}, null),
            )?.field,
        ).toBe("billingState");
    });

    it("keeps what was missing and given: the address, state and name on the profile, an email on the checkout", () => {
        const none: BillingParty = {
            profile: null,
            orgName: null,
            userEmail: null,
            userName: null,
        };
        expect(
            checkoutDetails(
                none,
                {
                    billingName: "Rye Bakes LLP",
                    billingEmail: " Owner@Example.com ",
                    registeredAddress: {
                        line1: "4 Mill Road",
                        city: "Pune",
                        postalCode: "411 001",
                    },
                },
                "27",
            ),
        ).toEqual({
            profile: {
                legalName: "Rye Bakes LLP",
                addressLine1: "4 Mill Road",
                addressLine2: null,
                city: "Pune",
                postalCode: "411001",
                gstState: "27",
            },
            billToEmail: "owner@example.com",
            billToPhone: null,
        });
    });

    it("never takes a name, address or state over the ones the business has", () => {
        expect(
            checkoutDetails(
                party(),
                {
                    billingName: "Someone Else",
                    registeredAddress: {
                        line1: "9 Other Road",
                        city: "Delhi",
                        postalCode: "110001",
                    },
                },
                "07",
            ).profile,
        ).toEqual({});
    });

    it("a phone is optional, kept when the business has none, and checked when given", () => {
        expect(
            checkoutDetails(party(), { phone: "+91 98450-12345" }, null)
                .billToPhone,
        ).toBe("+919845012345");
        expect(
            refusal(() => checkoutDetails(party(), { phone: "98450" }, null))
                ?.field,
        ).toBe("phone");
        expect(
            checkoutDetails(
                withProfile({ phone: "+919800000000" }),
                { phone: "+919845012345" },
                null,
            ).billToPhone,
        ).toBeNull();
    });
});

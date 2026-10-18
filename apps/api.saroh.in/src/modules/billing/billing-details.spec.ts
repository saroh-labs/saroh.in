// Who Saroh bills, before it charges (17 Oct 2026): the business's billing
// profile (DEC-167), what is missing on it, and a checkout refused by field
// until it's given. Pure; made-up businesses and profiles.
import type { BilledProfile, BillingParty } from "./billing-details";
import {
    addressComplete,
    checkoutDetails,
    missingBillingDetails,
} from "./billing-details";

const wholeProfile: BilledProfile = {
    id: "bp_1",
    legalName: "Rye Bakes LLP",
    billingEmail: "accounts@example.com",
    phone: null,
    gstin: null,
    gstState: "29",
    addressLine1: "3 Hill Road",
    addressLine2: null,
    city: "Bengaluru",
    postalCode: "560038",
    providerCustomerId: null,
};

const party = (over: Partial<BillingParty> = {}): BillingParty => ({
    profile: wholeProfile,
    orgName: "Rye",
    orgSlug: "rye",
    ...over,
});

const withProfile = (p: Partial<BilledProfile>): BillingParty =>
    party({ profile: { ...wholeProfile, ...p } });

/** A profile with nothing on it but what the database requires (blank). */
const emptyProfile = withProfile({
    legalName: " ",
    billingEmail: "",
    gstState: null,
    addressLine1: null,
    city: null,
    postalCode: null,
});

const NO_STATE = { state: null, gstin: null };

/** A real-shaped GSTIN for Karnataka (29) that checks out. */
const GSTIN_29 = "29ABCDE1234F1Z5";

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
    it("is nothing for a profile with a name, email, whole address and state", () => {
        expect(missingBillingDetails(party())).toEqual([]);
    });

    it("takes the business's name when the profile's legal name is blank", () => {
        expect(missingBillingDetails(withProfile({ legalName: " " }))).toEqual(
            [],
        );
    });

    it("a business with no billing profile is missing only that", () => {
        expect(missingBillingDetails(party({ profile: null }))).toEqual([
            "profile",
        ]);
    });

    it("names each thing missing, in the form's order", () => {
        expect(
            missingBillingDetails({ ...emptyProfile, orgName: null }),
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
        expect(checkoutDetails(party(), {}, NO_STATE)).toEqual({
            profile: {},
        });
    });

    it("refuses a business with no billing profile first, whatever was sent", () => {
        expect(
            refusal(() =>
                checkoutDetails(
                    party({ profile: null }),
                    {
                        billingName: "Rye",
                        billingEmail: "a@example.com",
                        registeredAddress: {
                            line1: "4 Mill Road",
                            city: "Pune",
                            postalCode: "411001",
                        },
                    },
                    { state: "27", gstin: null },
                ),
            ),
        ).toEqual({
            status: 400,
            field: "billing-profile",
            missing: ["profile"],
        });
    });

    it("refuses, by field and with a 400, each thing missing", () => {
        const none: BillingParty = { ...emptyProfile, orgName: null };
        expect(refusal(() => checkoutDetails(none, {}, NO_STATE))).toEqual({
            status: 400,
            field: "billingName",
            missing: ["name", "email", "address", "state"],
        });
        expect(
            refusal(() =>
                checkoutDetails(none, { billingName: "Rye" }, NO_STATE),
            )?.field,
        ).toBe("billingEmail");
        expect(
            refusal(() =>
                checkoutDetails(
                    none,
                    { billingName: "Rye", billingEmail: "not-an-email" },
                    NO_STATE,
                ),
            )?.field,
        ).toBe("billingEmail");
        expect(
            refusal(() =>
                checkoutDetails(
                    none,
                    { billingName: "Rye", billingEmail: "a@example.com" },
                    NO_STATE,
                ),
            )?.field,
        ).toBe("addressLine1");
        expect(
            refusal(() =>
                checkoutDetails(
                    withProfile({ city: null }),
                    { registeredAddress: { line1: "3 Hill Road" } },
                    NO_STATE,
                ),
            )?.field,
        ).toBe("city");
        expect(
            refusal(() =>
                checkoutDetails(withProfile({ gstState: null }), {}, NO_STATE),
            )?.field,
        ).toBe("billingState");
    });

    it("keeps everything missing and given on the billing profile", () => {
        const none: BillingParty = { ...emptyProfile, orgName: null };
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
                    phone: "+91 98450-12345",
                },
                { state: "27", gstin: null },
            ),
        ).toEqual({
            profile: {
                legalName: "Rye Bakes LLP",
                billingEmail: "owner@example.com",
                addressLine1: "4 Mill Road",
                addressLine2: null,
                city: "Pune",
                postalCode: "411001",
                gstState: "27",
                phone: "+919845012345",
            },
        });
    });

    it("a GSTIN given replaces the profile's, with its state", () => {
        expect(
            checkoutDetails(
                withProfile({ gstState: "27", gstin: null }),
                {},
                { state: "29", gstin: GSTIN_29 },
            ).profile,
        ).toEqual({ gstin: GSTIN_29, gstState: "29" });
        expect(
            checkoutDetails(
                withProfile({ gstin: GSTIN_29 }),
                {},
                { state: "29", gstin: GSTIN_29 },
            ).profile,
        ).toEqual({});
    });

    it("a state given that disagrees with the profile's GSTIN is refused", () => {
        expect(
            refusal(() =>
                checkoutDetails(
                    withProfile({ gstin: GSTIN_29 }),
                    {},
                    { state: "27", gstin: null },
                ),
            ),
        ).toMatchObject({ status: 400, field: "billingState" });
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
                NO_STATE,
            ).profile,
        ).toEqual({});
    });

    it("a phone is optional, kept when the profile has none, and checked when given", () => {
        expect(
            checkoutDetails(party(), { phone: "+91 98450-12345" }, NO_STATE)
                .profile.phone,
        ).toBe("+919845012345");
        expect(
            refusal(() =>
                checkoutDetails(party(), { phone: "98450" }, NO_STATE),
            )?.field,
        ).toBe("phone");
        expect(
            checkoutDetails(
                withProfile({ phone: "+919800000000" }),
                { phone: "+919845012345" },
                NO_STATE,
            ).profile.phone,
        ).toBeUndefined();
    });
});

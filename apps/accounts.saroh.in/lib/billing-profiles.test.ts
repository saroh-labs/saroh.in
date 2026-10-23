/**
 * The words of the account's Billing profiles (DEC-167 step 2), against the
 * design's own strings: the GSTIN/state and duplicate-email errors, the
 * paid and free move notes, "Save for 2 businesses", and the lines a
 * profile and a business read in. Made-up profiles.
 */
import { describe, expect, it } from "vitest";

import type {
    BillingProfile,
    OwnedBusiness,
    ProfileBusiness,
} from "./billing-profiles";
import {
    billNowOption,
    chips,
    editSays,
    emailTakenBy,
    gstinStateProblem,
    moveBusinessLine,
    moveConfirm,
    moveNote,
    moveTarget,
    paysForCount,
    paysForLine,
    phoneLabel,
    planLine,
    profileEdit,
    profileProblems,
    startFrom,
    syncBadge,
    valuesOf,
} from "./billing-profiles";

const GURUGRAM: ProfileBusiness = {
    id: "org_g",
    name: "Pulse Fitness Gurugram",
    owner: true,
    plan: { name: "Pro", cycle: "month" },
    paid: true,
    nextChargeAt: "2026-11-03T06:00:00.000Z",
    pendingMove: null,
};
const YOGA: ProfileBusiness = {
    id: "org_y",
    name: "Yoga Corner",
    owner: true,
    plan: { name: "Free", cycle: "month" },
    paid: false,
    nextChargeAt: null,
    pendingMove: null,
};

const PULSE: BillingProfile = {
    id: "bp_pulse",
    legalName: "Pulse Fitness LLP",
    gstin: "06AAAAA0000A1Z5",
    gstState: "06",
    addressLine1: "Plot 14, Sector 3, HSIIDC",
    addressLine2: null,
    city: "Rohtak",
    postalCode: "124001",
    billingEmail: "pulsefitness@example.com",
    phone: null,
    businesses: 2,
    sync: "linked",
    payingFor: [
        { ...GURUGRAM, name: "Pulse Fitness Rohtak", id: "org_r" },
        GURUGRAM,
    ],
    movingIn: [],
};

describe("errors in the design's words", () => {
    it("a GSTIN of another state names both", () => {
        expect(gstinStateProblem("07AAAAA0000A1Z5", "06")).toBe(
            "This GSTIN starts with 07 (Delhi), but the state below is Haryana (06). Change one so they match.",
        );
        expect(gstinStateProblem("06AAAAA0000A1Z5", "06")).toBeNull();
    });

    it("an email another profile uses names that profile", () => {
        expect(emailTakenBy("PulseFitness@example.com ", [PULSE])).toBe(
            "Pulse Fitness LLP already uses this email. Use a different one, so Razorpay can tell the two apart.",
        );
        expect(emailTakenBy("pulsefaridabad@example.com", [PULSE])).toBeNull();
    });

    it("checks the fields in order, before anything is sent", () => {
        const v = {
            ...valuesOf(PULSE),
            gstin: "07AAAAA0000A1Z5",
            billingEmail: PULSE.billingEmail,
        };
        expect(profileProblems(v, [PULSE]).map(([f]) => f)).toEqual([
            "gstin",
            "billingEmail",
        ]);
        expect(profileProblems({ ...v, registered: "no" }, []).length).toBe(0);
    });

    it("says a phone that isn't a whole number on its field (#1036)", () => {
        const v = { ...valuesOf(PULSE), registered: "no" as const };
        expect(profileProblems({ ...v, phone: "+9198450" }, [])).toEqual([
            ["phone", expect.stringMatching(/whole phone number/)],
        ]);
        expect(profileProblems({ ...v, phone: "+919845012345" }, [])).toEqual(
            [],
        );
        expect(profileProblems({ ...v, phone: "" }, [])).toEqual([]);
    });
});

describe("edit and add", () => {
    it("Save names how many businesses it changes, and the note names them", () => {
        expect(editSays(PULSE)).toEqual({
            note: "Saroh's next invoice for Pulse Fitness Rohtak and Pulse Fitness Gurugram uses these details. Invoices already sent keep theirs. Razorpay gets the change in the background.",
            save: "Save for 2 businesses",
        });
        expect(editSays({ payingFor: [YOGA] }).save).toBe("Save");
    });

    it("sends only what changed", () => {
        expect(
            profileEdit({ ...valuesOf(PULSE), city: "Hisar" }, PULSE),
        ).toEqual({ city: "Hisar" });
        expect(
            profileEdit({ ...valuesOf(PULSE), registered: "no" }, PULSE),
        ).toEqual({ gstin: "" });
    });

    it("starting from another profile copies its address and GST, never its email", () => {
        const v = startFrom(PULSE);
        expect(v).toMatchObject({
            gstin: "06AAAAA0000A1Z5",
            city: "Rohtak",
            billingEmail: "",
            legalName: "",
        });
    });

    it("offers a free business now and a paid one only once the new profile is linked", () => {
        const owned = (b: ProfileBusiness): OwnedBusiness => ({
            ...b,
            billingProfileId: "bp_x",
        });
        expect(billNowOption(owned(YOGA))).toEqual({
            label: "Yoga Corner · Free, moves now",
            disabled: false,
        });
        expect(billNowOption(owned(GURUGRAM))).toMatchObject({
            label: "Pulse Fitness Gurugram · moves at its renewal, 3 Nov",
            disabled: true,
        });
    });
});

describe("moving a business", () => {
    it("a paid business moves at its renewal", () => {
        expect(moveBusinessLine(GURUGRAM, "Pulse Fitness LLP")).toBe(
            "Pro · next charge 3 Nov · billed to Pulse Fitness LLP",
        );
        expect(
            moveNote(GURUGRAM, "Pulse Fitness LLP", "Raja Ji Dhaba Pvt Ltd"),
        ).toEqual({
            strong: "It moves at its next renewal, on 3 Nov.",
            rest: "Until then Saroh keeps billing Pulse Fitness LLP. Before 3 Nov, authorise the plan on Raja Ji Dhaba Pvt Ltd. It takes a minute, and nothing is charged twice or missed.",
        });
        expect(moveConfirm(GURUGRAM)).toBe("Move at next renewal");
    });

    it("a free business moves now", () => {
        expect(moveBusinessLine(YOGA, "Asha Verma")).toBe(
            "Free · billed to Asha Verma",
        );
        expect(moveNote(YOGA, "Asha Verma", "Raja Ji Dhaba Pvt Ltd")).toEqual({
            strong: "It moves now.",
            rest: "Yoga Corner is on Free, so there's nothing to charge. When it moves to a paid plan, Saroh bills Raja Ji Dhaba Pvt Ltd.",
        });
        expect(moveConfirm(YOGA)).toBe("Move now");
    });

    it("a profile Razorpay hasn't linked can't take a paid business", () => {
        const mill = {
            ...PULSE,
            id: "bp_mill",
            sync: "failed" as const,
            payingFor: [],
        };
        expect(moveTarget(mill, GURUGRAM, PULSE.id)).toEqual({
            line: "Couldn't link at Razorpay yet · fix it before moving a paid business here",
            disabled: true,
        });
        expect(moveTarget(mill, YOGA, PULSE.id)).toEqual({
            line: "GSTIN 06AAAAA0000A1Z5 · pays for nothing yet",
            disabled: false,
        });
        expect(moveTarget(PULSE, GURUGRAM, PULSE.id)).toEqual({
            line: "Bills it now",
            disabled: true,
        });
    });
});

describe("lines", () => {
    it("reads a profile and a business as the design does", () => {
        expect(chips(PULSE)).toEqual([
            "Pulse Fitness Rohtak",
            "Pulse Fitness Gurugram",
        ]);
        expect(chips({ payingFor: [] })).toEqual(["Pays for nothing yet"]);
        const moving = {
            payingFor: [
                {
                    ...YOGA,
                    pendingMove: {
                        toProfileId: "x",
                        toLegalName: "X",
                        at: null,
                        authorised: false,
                    },
                },
            ],
        };
        expect(chips(moving)).toEqual(["Yoga Corner · moving"]);
        expect(paysForLine(moving)).toBe("Pays for Yoga Corner (moving)");
        expect(paysForCount(2)).toBe("pays for 2 businesses");
        expect(phoneLabel("+919845012345")).toBe("+91 98450 12345");
        expect(phoneLabel("+441134960000")).toBe("+44 113 496 0000");
        expect(phoneLabel(null)).toBe("");
        expect(planLine(GURUGRAM)).toBe("Pro · monthly autopay");
        expect(planLine(YOGA)).toBe("Free");
        expect(syncBadge("linked", "list")).toBeNull();
        expect(syncBadge("linked", "page")).toEqual({
            label: "Linked at Razorpay",
            variant: "success",
        });
        expect(syncBadge("failed", "list")?.label).toBe("Couldn't link");
        expect(syncBadge("linking", "list")?.label).toBe("Linking");
    });
});

import { ConflictException } from "@nestjs/common";

import type { BusinessDetailsColumns } from "./business-details";
import {
    assertBusinessDetails,
    BUSINESS_DETAILS_MISSING,
    businessDetailsMessage,
    missingFrom,
    onlyStateMissing,
} from "./business-details";

const complete: BusinessDetailsColumns = {
    addressLine1: "3 Hill Road",
    city: "Bengaluru",
    postalCode: "560038",
    gstState: "29",
    country: "IN",
    gstRegistered: false,
    taxId: null,
};

describe("missingFrom (DEC-068)", () => {
    it("needs nothing from an unregistered business with its address", () => {
        expect(missingFrom(complete)).toEqual([]);
    });

    it("misses the address when there is no profile at all", () => {
        expect(missingFrom(null)).toEqual(["address"]);
    });

    it.each([
        ["addressLine1", { addressLine1: null }],
        ["city", { city: "  " }],
        ["postalCode", { postalCode: "" }],
        ["state", { gstState: null }],
    ])("misses the address without its %s", (_, change) => {
        expect(missingFrom({ ...complete, ...change })).toEqual(["address"]);
    });

    it("asks no Indian state of a business registered abroad", () => {
        expect(
            missingFrom({ ...complete, country: "GB", gstState: null }),
        ).toEqual([]);
    });

    it("asks a state when the country is unsaid or India", () => {
        for (const country of [null, "", "India"]) {
            expect(
                missingFrom({ ...complete, country, gstState: null }),
            ).toEqual(["address"]);
        }
    });

    it("misses the GSTIN of a GST-registered business without one", () => {
        expect(
            missingFrom({ ...complete, gstRegistered: true, taxId: null }),
        ).toEqual(["gstin"]);
        expect(
            missingFrom({
                ...complete,
                gstRegistered: true,
                taxId: "29ABCDE1234F1Z5",
            }),
        ).toEqual([]);
    });

    it("lists both, address first", () => {
        expect(
            missingFrom({
                ...complete,
                city: null,
                gstRegistered: true,
                taxId: "",
            }),
        ).toEqual(["address", "gstin"]);
    });
});

describe("businessDetailsMessage", () => {
    it("says what to add, in merchant words", () => {
        expect(businessDetailsMessage(["address"])).toBe(
            "Add your registered address first. Every invoice prints it.",
        );
        expect(businessDetailsMessage(["gstin"])).toMatch(/^Add your GSTIN/);
        expect(businessDetailsMessage(["address", "gstin"])).toMatch(
            /address and GSTIN/,
        );
    });
});

describe("assertBusinessDetails", () => {
    const db = (row: BusinessDetailsColumns | null) => ({
        businessProfile: { findUnique: jest.fn().mockResolvedValue(row) },
    });

    it("lets a business with its details through", async () => {
        await expect(
            assertBusinessDetails(db(complete) as never, "org_1"),
        ).resolves.toBeUndefined();
    });

    it("refuses with a 409 whose details name what is missing", async () => {
        const err = await assertBusinessDetails(
            db({ ...complete, addressLine1: null }) as never,
            "org_1",
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toEqual({
            message:
                "Add your registered address first. Every invoice prints it.",
            details: {
                reason: BUSINESS_DETAILS_MISSING,
                missing: ["address"],
            },
        });
    });

    it("names the state when only the state is missing (UX-018)", async () => {
        const err = await assertBusinessDetails(
            db({ ...complete, gstState: null }) as never,
            "org_1",
        ).catch((e: unknown) => e);
        expect((err as ConflictException).getResponse()).toEqual({
            message:
                "Add your state to your address first. It's printed on every invoice, and GST depends on it.",
            details: {
                reason: BUSINESS_DETAILS_MISSING,
                missing: ["address"],
                onlyState: true,
            },
        });
    });
});

describe("onlyStateMissing", () => {
    it("is true only when the address is whole but for an Indian state", () => {
        expect(onlyStateMissing({ ...complete, gstState: null })).toBe(true);
        expect(onlyStateMissing({ ...complete, gstState: "" })).toBe(true);
        expect(onlyStateMissing(complete)).toBe(false);
        expect(
            onlyStateMissing({ ...complete, gstState: null, city: null }),
        ).toBe(false);
        // Abroad, no Indian state is asked at all.
        expect(
            onlyStateMissing({ ...complete, gstState: null, country: "GB" }),
        ).toBe(false);
        expect(onlyStateMissing(null)).toBe(false);
    });
});

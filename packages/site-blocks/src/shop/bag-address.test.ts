import { describe, expect, it } from "vitest";

import { phoneOk } from "../lib/phone";
import type { DeliveryAddress } from "./api";
import {
    addressBlank,
    addressLeft,
    addressLines,
    EMPTY_ADDRESS,
    trimmed,
} from "./bag-address";
import { holdReason } from "./bag-sheet";
import { INDIA_STATES, stateIn } from "./india-states";

const HOME: DeliveryAddress = {
    name: "Asha Rao",
    phone: "98450 12345",
    line1: "12 Hill Road",
    line2: "",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400050",
};

describe("a delivery's address in the bag", () => {
    it("needs every line a courier does, then a phone to ring", () => {
        expect(addressLeft(EMPTY_ADDRESS)).toBe(
            "Add the address to deliver to.",
        );
        expect(addressLeft({ ...HOME, postalCode: " " })).toBe(
            "Add the address to deliver to.",
        );
        expect(addressLeft({ ...HOME, phone: "" })).toBe(
            "Add a phone number for the delivery.",
        );
        expect(addressLeft({ ...HOME, phone: "ring the bell" })).toBe(
            "Check the phone number.",
        );
        expect(addressLeft(HOME)).toBeNull();
    });

    it("takes a state only from the list", () => {
        expect(addressLeft({ ...HOME, state: "Atlantis" })).toBe(
            "Add the address to deliver to.",
        );
        expect(addressLeft({ ...HOME, state: "maharashtra " })).toBeNull();
        expect(trimmed({ ...HOME, state: "orissa" }).state).toBe("Odisha");
    });

    it("knows an untouched address from a started one", () => {
        expect(addressBlank(EMPTY_ADDRESS)).toBe(true);
        expect(addressBlank({ ...EMPTY_ADDRESS, phone: " " })).toBe(true);
        expect(addressBlank({ ...EMPTY_ADDRESS, city: "Pune" })).toBe(false);
    });

    it("reads an address out as lines, leaving out what isn't there", () => {
        expect(addressLines(HOME)).toEqual([
            "Asha Rao",
            "12 Hill Road",
            "Mumbai, Maharashtra 400050",
            // Grouped with its country code, as every saved number (#1036).
            "+91 98450 12345",
        ]);
    });

    it("says the phone is what's missing, beside the button", () => {
        const quote = {
            currency: "INR",
            lines: [],
            ways: [
                {
                    type: "LOCAL_DELIVERY" as const,
                    label: "Local delivery",
                    fee: null,
                },
            ],
            fulfilment: "LOCAL_DELIVERY" as const,
            subtotal: "0.00",
            delivery: "0.00",
            total: "0.00",
            ready: true,
        };
        expect(
            holdReason({
                quote,
                way: "LOCAL_DELIVERY",
                addressOk: false,
                addressNote: "Add a phone number for the delivery.",
                payable: true,
            }),
        ).toBe("Add a phone number for the delivery.");
        expect(
            holdReason({
                quote,
                way: "LOCAL_DELIVERY",
                addressOk: false,
                payable: true,
            }),
        ).toBe("Add the address to deliver to.");
    });
});

describe("India's states and union territories", () => {
    it("lists all 36, in alphabetical order, each once", () => {
        expect(INDIA_STATES).toHaveLength(36);
        expect([...INDIA_STATES].sort()).toEqual([...INDIA_STATES]);
        expect(new Set(INDIA_STATES).size).toBe(36);
    });

    it("reads what people type as the list names it, or as not chosen", () => {
        expect(stateIn("Tamil Nadu")).toBe("Tamil Nadu");
        expect(stateIn(" tamilnadu")).toBe("Tamil Nadu");
        expect(stateIn("Pondicherry")).toBe("Puducherry");
        expect(stateIn("New Delhi")).toBe("Delhi");
        expect(stateIn("29")).toBe("");
        expect(stateIn("")).toBe("");
        expect(stateIn(null)).toBe("");
    });
});

describe("phoneOk", () => {
    it("takes a number as people write one", () => {
        for (const phone of [
            "9845012345",
            "+91 98450 12345",
            "(080) 4099-2210",
            " 022 4000 0000 ",
        ]) {
            expect(phoneOk(phone)).toBe(true);
        }
    });

    it("refuses words, too few digits and punctuation alone", () => {
        for (const phone of ["", "call me", "12345", "------", "98450x12345"]) {
            expect(phoneOk(phone)).toBe(false);
        }
    });
});

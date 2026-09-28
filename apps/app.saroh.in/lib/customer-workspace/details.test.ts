import { describe, expect, it } from "vitest";

import type { CustomerDetail } from "./detail";
import {
    addressLine,
    countryOptions,
    detailsPatch,
    detailsProblems,
    draftFrom,
    maskedEmail,
    signInNote,
} from "./details";

/** Customer Detail's edit sheet (C8): the draft, its checks, what it sends. */

function contact(
    over: Partial<CustomerDetail["contact"]> = {},
): CustomerDetail["contact"] {
    return {
        id: "c_1",
        name: "Ananya Rao",
        firstName: "Ananya",
        lastName: "Rao",
        email: "ananya@example.com",
        phone: "+91 98450 00001",
        company: null,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        ...over,
    };
}

const home = {
    addressLine1: "12 Hill Road",
    addressLine2: "Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560038",
    country: "IN",
};

describe("draftFrom", () => {
    it("starts a new address in India, with nothing filled", () => {
        const d = draftFrom(contact());
        expect(d).toMatchObject({
            email: "ananya@example.com",
            addressLine1: "",
            state: "",
            country: "IN",
        });
    });

    it("reads an Indian state's name as the select's code", () => {
        expect(draftFrom(contact(home)).state).toBe("29");
    });

    it("keeps another country's state as typed", () => {
        expect(
            draftFrom(contact({ state: "Greater London", country: "GB" }))
                .state,
        ).toBe("Greater London");
    });
});

describe("detailsProblems", () => {
    const ok = draftFrom(contact());

    it("finds nothing wrong with a good draft", () => {
        expect(detailsProblems(ok)).toEqual({});
    });

    it("says a customer needs a name, and an email must look like one", () => {
        expect(
            detailsProblems({
                ...ok,
                firstName: " ",
                lastName: "",
                email: "ananya@",
            }),
        ).toEqual({
            firstName: "A customer needs a name.",
            email: "That doesn't look like an email address.",
        });
    });

    it("refuses a four-digit PIN in India, and not elsewhere", () => {
        expect(detailsProblems({ ...ok, postalCode: "5600" })).toEqual({
            postalCode: "A PIN code is six digits, like 560038.",
        });
        expect(detailsProblems({ ...ok, postalCode: "560 038" })).toEqual({});
        expect(
            detailsProblems({ ...ok, postalCode: "5600", country: "AU" }),
        ).toEqual({});
    });
});

describe("detailsPatch", () => {
    const initial = draftFrom(contact());

    it("sends nothing when nothing changed", () => {
        expect(detailsPatch(initial, { ...initial })).toEqual({});
    });

    it("sends a new email, lower-cased and trimmed", () => {
        expect(
            detailsPatch(initial, {
                ...initial,
                email: " Ananya.Rao@Gmail.com ",
            }),
        ).toEqual({ email: "ananya.rao@gmail.com" });
    });

    it("doesn't count the same email in capitals as a change", () => {
        expect(
            detailsPatch(initial, { ...initial, email: "ANANYA@example.com" }),
        ).toEqual({});
    });

    it("sends the whole address when one line of it changes", () => {
        expect(
            detailsPatch(initial, {
                ...initial,
                addressLine1: "12 Hill Road ",
                city: "Bengaluru",
            }),
        ).toEqual({
            addressLine1: "12 Hill Road",
            addressLine2: "",
            city: "Bengaluru",
            state: "",
            postalCode: "",
            country: "IN",
        });
    });
});

describe("the sheet's lines", () => {
    it("masks the email they sign in with", () => {
        expect(maskedEmail("ananya@gmail.com")).toBe("a•••@gmail.com");
        expect(signInNote("ananya@gmail.com")).toBe(
            "They sign in with a•••@gmail.com; messages about their orders go there.",
        );
    });

    it("writes the address as one line, naming a country outside India", () => {
        expect(addressLine(home)).toBe(
            "12 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
        );
        expect(
            addressLine({
                addressLine1: "221B Baker Street",
                addressLine2: null,
                city: "London",
                state: null,
                postalCode: "NW1 6XE",
                country: "GB",
            }),
        ).toBe("221B Baker Street, London NW1 6XE, United Kingdom");
        expect(addressLine({})).toBeNull();
    });

    it("offers India first, and keeps a country the list lacks", () => {
        expect(countryOptions("IN")[0]).toEqual({
            value: "IN",
            label: "India",
        });
        expect(countryOptions("JP").at(-1)).toEqual({
            value: "JP",
            label: "Japan",
        });
    });
});

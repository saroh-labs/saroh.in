import { describe, expect, it } from "vitest";

import type { SiteContact } from "@/lib/organizations/settings-service";

import { settingsEditHref, settingsSheetFromParam } from "./settings-edit";
import {
    addressLine,
    addressRowLines,
    addressSavedWords,
    addressSourceOf,
} from "./site-contact";

const place = (
    name: string | null,
    address: string,
    source: "location" | "registered" = "location",
) => ({ source, name, address });

const contact = (places: SiteContact["places"]): SiteContact => ({
    phone: null,
    email: null,
    places,
    social: [],
});

describe("the Address row (DEC-125)", () => {
    it("is one place's address on a line, unnamed", () => {
        expect(
            addressRowLines([place("Indiranagar", "12th Main\n Bengaluru ")]),
        ).toEqual(["12th Main, Bengaluru"]);
    });

    it("names each place when there are several", () => {
        expect(
            addressRowLines([
                place("Indiranagar", "12th Main"),
                place("Koramangala", "80 Feet Road"),
            ]),
        ).toEqual(["Indiranagar: 12th Main", "Koramangala: 80 Feet Road"]);
    });

    it("says when it is the registered address", () => {
        expect(
            addressRowLines([place(null, "14 Hill Road", "registered")]),
        ).toEqual(["14 Hill Road · your registered address"]);
    });

    it("is nothing when the site shows no address", () => {
        expect(addressRowLines([])).toEqual([]);
        expect(addressLine(" \n ")).toBe("");
    });
});

describe("where the address comes from", () => {
    it("is the locations, the registered address, or nowhere", () => {
        expect(addressSourceOf(contact([place("A", "1 A St")]))).toBe(
            "locations",
        );
        expect(
            addressSourceOf(contact([place(null, "1 A St", "registered")])),
        ).toBe("registered");
        expect(addressSourceOf(contact([]))).toBe("none");
    });

    it("says what the choice did", () => {
        expect(addressSavedWords(true)).toBe(
            "Your website shows your registered address now",
        );
        expect(addressSavedWords(false)).toBe(
            "Your website no longer shows your registered address",
        );
    });
});

describe("a link to a Contact and social row", () => {
    it("opens its sheet in its group", () => {
        expect(settingsEditHref("site_1", "contact-social")).toBe(
            "/sites/site_1/settings?section=contact&edit=contact-social",
        );
        for (const sheet of [
            "contact-phone",
            "contact-email",
            "contact-address",
            "contact-social",
        ]) {
            expect(settingsSheetFromParam(sheet)).toBe(sheet);
        }
    });
});

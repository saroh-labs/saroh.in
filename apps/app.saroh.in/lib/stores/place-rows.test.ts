import { describe, expect, it } from "vitest";

import {
    ADDRESS_FIELD_ID,
    HOURS_FIELD_ID,
    KIND_FIELD_ID,
} from "./location-readiness";
import {
    addressLine,
    PLACE_ROW_ID,
    PLACE_SHEETS,
    placeEditId,
    placeSheetFor,
    placeSheetFromParam,
    placeSheetToOpen,
} from "./place-rows";

/** The place's rows and the sheets they open. Made-up values only. */
describe("The place's sheets", () => {
    it("a link names one in ?edit=, and anything else opens none", () => {
        for (const sheet of PLACE_SHEETS) {
            expect(placeSheetFromParam(sheet)).toBe(sheet);
        }
        expect(placeSheetFromParam("details")).toBe("details");
        expect(placeSheetFromParam("people")).toBeNull();
        expect(placeSheetFromParam("")).toBeNull();
        expect(placeSheetFromParam(null)).toBeNull();
    });

    it("the fields the readiness card and Delivery send someone to each have a sheet", () => {
        expect(placeSheetFor(ADDRESS_FIELD_ID)).toBe("address");
        expect(placeSheetFor(HOURS_FIELD_ID)).toBe("hours");
        expect(placeSheetFor(KIND_FIELD_ID)).toBe("kind");
        expect(placeSheetFor("location-panel")).toBeNull();
        expect(placeSheetFor(undefined)).toBeNull();
    });

    it("every row has its own id, and its Edit one of its own", () => {
        const rows = PLACE_SHEETS.map((s) => PLACE_ROW_ID[s]);
        expect(new Set(rows).size).toBe(PLACE_SHEETS.length);
        expect(placeEditId("address")).toBe("location-address-edit");
        // The sheets' own fields keep the ids the page always had.
        expect(rows).not.toContain(ADDRESS_FIELD_ID);
        expect(rows).not.toContain(HOURS_FIELD_ID);
        expect(rows).not.toContain(KIND_FIELD_ID);
    });
});

describe("placeSheetToOpen", () => {
    const page = { canEdit: true, kind: "SHOP", hasDetails: true } as const;

    it("opens the sheet asked for on a place customers visit", () => {
        for (const sheet of PLACE_SHEETS) {
            expect(placeSheetToOpen(sheet, page)).toBe(sheet);
        }
    });

    it("asks whether customers come here before an address or hours nobody visits", () => {
        const online = { ...page, kind: "ONLINE" } as const;
        expect(placeSheetToOpen("address", online)).toBe("kind");
        expect(placeSheetToOpen("hours", online)).toBe("kind");
        expect(placeSheetToOpen("name", online)).toBe("name");
    });

    it("opens none for a description that couldn't be read, or a read-only role", () => {
        expect(
            placeSheetToOpen("details", { ...page, hasDetails: false }),
        ).toBeNull();
        expect(
            placeSheetToOpen("name", { ...page, canEdit: false }),
        ).toBeNull();
    });
});

describe("addressLine", () => {
    it("joins the saved lines with commas", () => {
        expect(addressLine("12 Hill Road\nBandra")).toBe(
            "12 Hill Road, Bandra",
        );
        expect(addressLine("12 Hill Road,\n\n  Bandra West ,\nMumbai")).toBe(
            "12 Hill Road, Bandra West, Mumbai",
        );
    });

    it("is null when there is no address to say", () => {
        expect(addressLine(null)).toBeNull();
        expect(addressLine(" \n ")).toBeNull();
    });
});

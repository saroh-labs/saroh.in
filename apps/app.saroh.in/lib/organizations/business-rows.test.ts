import { describe, expect, it } from "vitest";

import {
    BUSINESS_ROW_ID,
    BUSINESS_SHEET_TAB,
    BUSINESS_SHEETS,
    BUSINESS_TABS,
    businessEditHref,
    businessEditId,
    businessSheetFromParam,
    businessSheetToOpen,
    businessTabHref,
} from "./business-rows";
import { nameLabelOf, savedWords, sheetWords } from "./business-sheet-words";

describe("Settings › Business's sheets", () => {
    it("every sheet sits on a tab the page has, with a row of its own", () => {
        for (const sheet of BUSINESS_SHEETS) {
            expect(BUSINESS_TABS).toContain(BUSINESS_SHEET_TAB[sheet]);
        }
        const rows = BUSINESS_SHEETS.map((s) => BUSINESS_ROW_ID[s]);
        expect(new Set(rows).size).toBe(rows.length);
        expect(businessEditId("taxId")).toBe("business-tax-id-edit");
    });

    it("reads a sheet from the address, and nothing else", () => {
        expect(businessSheetFromParam("logo")).toBe("logo");
        expect(businessSheetFromParam("taxId")).toBe("taxId");
        expect(businessSheetFromParam("identity")).toBeNull();
        expect(businessSheetFromParam("")).toBeNull();
        expect(businessSheetFromParam(null)).toBeNull();
    });

    it("a link names the row's tab and its sheet", () => {
        expect(businessTabHref("hours")).toBe(
            "/settings/organization?section=hours",
        );
        expect(businessEditHref("logo")).toBe(
            "/settings/organization?section=identity&edit=logo",
        );
        expect(businessEditHref("taxId")).toBe(
            "/settings/organization?section=tax&edit=taxId",
        );
        expect(businessEditHref("pay")).toBe(
            "/settings/organization?section=pay&edit=pay",
        );
        expect(businessEditHref("address")).toBe(
            "/settings/organization?section=address&edit=address",
        );
    });

    describe("the sheet a request really opens", () => {
        const page = { canEdit: true, canEditHours: true, registered: true };

        it("is the one asked for, for someone who may change the business", () => {
            for (const sheet of BUSINESS_SHEETS) {
                expect(businessSheetToOpen(sheet, page)).toBe(sheet);
            }
        });

        it("is none for a read-only role", () => {
            for (const sheet of BUSINESS_SHEETS) {
                expect(
                    businessSheetToOpen(sheet, { ...page, canEdit: false }),
                ).toBeNull();
            }
        });

        it("is none for hours without a location to keep them, or the right to change one", () => {
            expect(
                businessSheetToOpen("hours", { ...page, canEditHours: false }),
            ).toBeNull();
            expect(
                businessSheetToOpen("name", { ...page, canEditHours: false }),
            ).toBe("name");
        });

        it("asks about GST first when delivery's GST is asked of an unregistered business", () => {
            expect(
                businessSheetToOpen("delivery", { ...page, registered: false }),
            ).toBe("gst");
        });
    });
});

describe("the sheets' words", () => {
    const business = { kind: "BUSINESS", registered: false };

    it("names the name in the kind's words", () => {
        expect(nameLabelOf("BUSINESS")).toBe("Business name");
        expect(nameLabelOf("SOLO")).toBe("Your name or brand");
        expect(nameLabelOf(undefined)).toBe("Business name");
        expect(sheetWords("name", { kind: "WORK", registered: false })).toEqual(
            {
                title: "Your name or brand",
                description: "The name readers know you by.",
            },
        );
    });

    it("the tax number is a GSTIN only for a registered business", () => {
        expect(sheetWords("taxId", business).title).toBe("Tax ID");
        expect(
            sheetWords("taxId", { kind: "BUSINESS", registered: true }).title,
        ).toBe("GSTIN");
    });

    it("every sheet has a title and a line under it, with no em dash", () => {
        for (const sheet of BUSINESS_SHEETS) {
            const words = sheetWords(sheet, business);
            expect(words.title).not.toBe("");
            expect(words.description).not.toBe("");
            expect(`${words.title}${words.description}`).not.toContain("—");
        }
    });

    it("a save says invoices use it only for what prints on one", () => {
        expect(savedWords("legalName", business)).toBe(
            "Legal name saved. Invoices from now on use it.",
        );
        expect(savedWords("address", business)).toBe(
            "Registered address saved. Invoices from now on use it.",
        );
        expect(savedWords("kind", business)).toBe("What this is saved");
        expect(savedWords("phone", business)).toBe(
            "Phone on your website saved",
        );
    });
});

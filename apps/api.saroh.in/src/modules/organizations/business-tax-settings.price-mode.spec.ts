import { BadRequestException } from "@nestjs/common";

import type { TaxCurrent } from "./business-tax-settings";
import {
    priceTermsChange,
    taxChanges,
    taxView,
    touchesTax,
} from "./business-tax-settings";
import { settingsChanges, settingsSnapshot } from "./settings-audit";

/**
 * "GST on your prices" in the business's tax settings (12 Oct 2026): a
 * registered business chooses whether its prices include GST or GST is
 * added; one that is not registered is never asked, and a stray request is
 * refused. Pure.
 */

const registered: TaxCurrent = {
    gstRegistered: true,
    gstState: "29",
    taxId: "29AAGCR4375J1ZU",
    country: "IN",
    invoicePrefix: "RC",
    invoiceNumberFormat: null,
    addressLine1: "14 Hill Road",
    addressLine2: null,
    city: "Bengaluru",
    postalCode: "560038",
};

const unregistered: TaxCurrent = {
    ...registered,
    gstRegistered: false,
    taxId: null,
};

const sent = (tax: Record<string, unknown>) => ({
    tax: tax as never,
    taxId: undefined,
    country: undefined,
    address: undefined,
});

describe("reading the choice", () => {
    const columns = {
        gstRegistered: true,
        gstState: "29",
        invoicePrefix: "RC",
        deliveryGstRate: "18",
        deliverySacCode: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        postalCode: null,
    };

    it("is 'prices include GST' for every business until it chooses", () => {
        expect(taxView(null).priceMode).toBe("INCLUDED");
        expect(taxView(columns).priceMode).toBe("INCLUDED");
        expect(
            taxView({ ...columns, gstPriceMode: "INCLUDED" }).priceMode,
        ).toBe("INCLUDED");
    });

    it("reads 'GST is added' once chosen, and anything unknown as included", () => {
        expect(taxView({ ...columns, gstPriceMode: "ADDED" }).priceMode).toBe(
            "ADDED",
        );
        expect(taxView({ ...columns, gstPriceMode: "nope" }).priceMode).toBe(
            "INCLUDED",
        );
    });
});

describe("saving the choice", () => {
    it("is a tax change", () => {
        expect(touchesTax(sent({ priceMode: "ADDED" }))).toBe(true);
    });

    it("writes it for a registered business, and nothing else", () => {
        expect(taxChanges(registered, sent({ priceMode: "ADDED" }))).toEqual({
            gstPriceMode: "ADDED",
        });
        expect(taxChanges(registered, sent({ priceMode: "INCLUDED" }))).toEqual(
            {
                gstPriceMode: "INCLUDED",
            },
        );
    });

    it("leaves it alone when it is not sent", () => {
        expect(
            taxChanges(registered, sent({ deliveryRate: "5" })),
        ).not.toHaveProperty("gstPriceMode");
    });

    it("refuses it on its own field for a business that is not registered", () => {
        for (const current of [unregistered, null]) {
            try {
                taxChanges(current, sent({ priceMode: "ADDED" }));
                throw new Error("expected a refusal");
            } catch (err) {
                expect(err).toBeInstanceOf(BadRequestException);
                expect(
                    (err as BadRequestException).getResponse(),
                ).toMatchObject({
                    message:
                        "Only a GST-registered business chooses how its prices carry GST.",
                    details: { field: "priceMode" },
                });
            }
        }
    });

    it("takes it in the same save that registers the business", () => {
        const data = taxChanges(unregistered, {
            tax: { registered: true, priceMode: "ADDED" } as never,
            taxId: "29AAGCR4375J1ZU",
            country: undefined,
            address: undefined,
        });
        expect(data).toMatchObject({
            gstRegistered: true,
            gstPriceMode: "ADDED",
        });
    });

    it("refuses it in the save that takes the registration off", () => {
        expect(() =>
            taxChanges(
                registered,
                sent({ registered: false, priceMode: "ADDED" }),
            ),
        ).toThrow(BadRequestException);
    });
});

describe("the activity record", () => {
    it("says what it was and what it became", () => {
        const row = (gstPriceMode: string) => ({
            name: "Rye & Co.",
            businessProfile: { gstRegistered: true, gstPriceMode },
        });
        expect(
            settingsChanges(
                ["gstPriceMode"],
                settingsSnapshot(row("INCLUDED")),
                settingsSnapshot(row("ADDED")),
            ),
        ).toEqual([
            { field: "gstPriceMode", before: "INCLUDED", after: "ADDED" },
        ]);
    });

    it("records nothing when the save did not change it", () => {
        const row = {
            name: "Rye & Co.",
            businessProfile: { gstRegistered: true, gstPriceMode: "ADDED" },
        };
        expect(
            settingsChanges(
                ["gstPriceMode"],
                settingsSnapshot(row),
                settingsSnapshot(row),
            ),
        ).toEqual([]);
    });
});

/**
 * GST is part of MRP (12 Oct 2026): a tax save that adds GST to prices
 * that had none added can take products above their MRP, so the settings
 * service counts them first. Which saves those are is decided here.
 */
describe("whether a save adds GST to the business's prices", () => {
    const change = (
        current: TaxCurrent | null,
        data: Parameters<typeof priceTermsChange>[1],
        taxId?: string,
    ) => priceTermsChange(current, data, taxId);

    it("switching to GST is added does", () => {
        expect(change(registered, { gstPriceMode: "ADDED" })).toEqual({
            before: { registered: true, mode: "INCLUDED" },
            after: { registered: true, mode: "ADDED" },
            addsGst: true,
        });
    });

    it("switching back to includes GST never does", () => {
        expect(
            change(
                { ...registered, gstPriceMode: "ADDED" },
                { gstPriceMode: "INCLUDED" },
            ).addsGst,
        ).toBe(false);
    });

    it("saving the same choice again, or something else, does not", () => {
        const added = { ...registered, gstPriceMode: "ADDED" };
        expect(change(added, { gstPriceMode: "ADDED" }).addsGst).toBe(false);
        expect(change(added, { invoicePrefix: "RC" }).addsGst).toBe(false);
        expect(change(registered, { invoicePrefix: "RC" }).addsGst).toBe(false);
    });

    it("registering does: a product can already be set to GST is added, and an old choice comes back", () => {
        expect(
            change(
                unregistered,
                { gstRegistered: true, gstState: "29" },
                "29AAGCR4375J1ZU",
            ),
        ).toEqual({
            before: { registered: false, mode: "INCLUDED" },
            after: { registered: true, mode: "INCLUDED" },
            addsGst: true,
        });
        expect(
            change(
                { ...unregistered, gstPriceMode: "ADDED" },
                { gstRegistered: true },
                "29AAGCR4375J1ZU",
            ).after,
        ).toEqual({ registered: true, mode: "ADDED" });
    });

    it("deregistering does not, and a business with no profile is not registered", () => {
        expect(change(registered, { gstRegistered: false }).addsGst).toBe(
            false,
        );
        expect(change(null, {}).after).toEqual({
            registered: false,
            mode: "INCLUDED",
        });
    });

    it("is registered only with the switch, a GSTIN and a state, as prices are", () => {
        // The switch alone, with no GSTIN on file: no GST is charged.
        expect(
            change(unregistered, { gstRegistered: true }).after.registered,
        ).toBe(false);
        expect(
            change({ ...registered, gstState: null }, { gstPriceMode: "ADDED" })
                .addsGst,
        ).toBe(false);
    });
});

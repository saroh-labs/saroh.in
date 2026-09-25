// A settings save as Settings › Activity reads it (#509): each business
// detail printed as a person reads it, before and after.
import type { SettingsRow } from "./settings-audit";
import { settingsChanges, settingsSnapshot } from "./settings-audit";

const AT = new Date("2026-09-25T08:00:00Z");

const row = (
    over: Partial<NonNullable<SettingsRow["businessProfile"]>> = {},
    name = "Rye & Co",
): SettingsRow => ({
    name,
    businessProfile: {
        legalName: "Rye and Company Pvt Ltd",
        type: "company",
        country: "IN",
        taxId: null,
        timezone: null,
        gstRegistered: false,
        gstState: null,
        invoicePrefix: null,
        invoiceNumberFormat: null,
        deliveryGstRate: { toString: () => "18.00" },
        deliverySacCode: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        postalCode: null,
        ...over,
    },
});

describe("settingsSnapshot", () => {
    it("prints each detail the way a person reads it", () => {
        const snap = settingsSnapshot(
            row({
                gstRegistered: true,
                gstState: "29",
                invoicePrefix: "RC",
                addressLine1: "14 Hill Road",
                addressLine2: "Indiranagar",
                city: "Bengaluru",
                postalCode: "560038",
                deliveryGstRate: { toString: () => "5.00" },
            }),
            AT,
        );
        expect(snap).toMatchObject({
            name: "Rye & Co",
            gstRegistered: true,
            gstState: "Karnataka",
            invoicePrefix: "RC",
            deliveryGstRate: "5%",
            registeredAddress: "14 Hill Road, Indiranagar, Bengaluru 560038",
            invoiceNumberFormat:
                "RC/26-27/0001 · new count each financial year",
        });
    });

    it("reads a business with no profile as blank", () => {
        expect(
            settingsSnapshot({ name: "New", businessProfile: null }, AT),
        ).toMatchObject({
            name: "New",
            legalName: null,
            gstRegistered: false,
            registeredAddress: null,
        });
    });

    it("never reads the contact email or the website", () => {
        const snap = settingsSnapshot(row(), AT);
        expect(snap).not.toHaveProperty("contactEmail");
        expect(snap).not.toHaveProperty("website");
    });
});

describe("settingsChanges", () => {
    it("says the invoice prefix before and after", () => {
        expect(
            settingsChanges(
                ["invoicePrefix"],
                settingsSnapshot(row({ invoicePrefix: "INV" }), AT),
                settingsSnapshot(row({ invoicePrefix: "RC" }), AT),
            ),
        ).toEqual([{ field: "invoicePrefix", before: "INV", after: "RC" }]);
    });

    it("says the address once, as one printed line, however many lines moved", () => {
        const changes = settingsChanges(
            ["addressLine1", "city", "postalCode"],
            settingsSnapshot(row(), AT),
            settingsSnapshot(
                row({
                    addressLine1: "14 Hill Road",
                    city: "Bengaluru",
                    postalCode: "560038",
                }),
                AT,
            ),
        );
        expect(changes).toEqual([
            {
                field: "registeredAddress",
                before: null,
                after: "14 Hill Road, Bengaluru 560038",
            },
        ]);
    });

    it("gives the contact email and the website no value, even when sent", () => {
        const changes = settingsChanges(
            ["contactEmail", "website", "legalName"],
            { ...settingsSnapshot(row(), AT), contactEmail: "a@rye.in" },
            {
                ...settingsSnapshot(row({ legalName: "Rye LLP" }), AT),
                contactEmail: "b@rye.in",
            },
        );
        expect(changes).toEqual([
            {
                field: "legalName",
                before: "Rye and Company Pvt Ltd",
                after: "Rye LLP",
            },
        ]);
        expect(JSON.stringify(changes)).not.toContain("rye.in");
    });

    it("prints a new number format as the number it gives", () => {
        const [change] = settingsChanges(
            ["invoiceNumberFormat"],
            settingsSnapshot(row({ invoicePrefix: "RC" }), AT),
            settingsSnapshot(
                row({
                    invoicePrefix: "RC",
                    invoiceNumberFormat: {
                        parts: ["PREFIX", "YEAR", "MONTH"],
                        separator: "-",
                        digits: 3,
                        restart: "MONTH",
                    },
                }),
                AT,
            ),
        );
        expect(change).toEqual({
            field: "invoiceNumberFormat",
            before: "RC-0001 · one running count",
            after: "RC-2026-09-001 · new count each month",
        });
    });
});

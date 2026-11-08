import { taxChanges } from "./business-tax-settings";

const sent = (tax: object) =>
    ({ tax, taxId: undefined, country: undefined, address: {} }) as never;

describe("what each edition may set", () => {
    it("lets Global name its tax and year", () => {
        expect(
            taxChanges(
                null,
                sent({ taxName: "VAT", taxRate: "20", yearStartMonth: 1 }),
                "GLOBAL",
            ),
        ).toMatchObject({ taxName: "VAT", taxRate: "20", yearStartMonth: 1 });
    });

    it("clears them with an empty value", () => {
        expect(
            taxChanges(null, sent({ taxName: "", taxRate: "" }), "GLOBAL"),
        ).toMatchObject({ taxName: null, taxRate: null });
    });

    it("refuses GST on Global", () => {
        expect(() =>
            taxChanges(null, sent({ registered: true }), "GLOBAL"),
        ).toThrow(/GST/);
    });

    it("refuses GST's state, delivery rate and SAC on Global, naming the field", () => {
        const field = (tax: object) => {
            try {
                taxChanges(null, sent(tax), "GLOBAL");
            } catch (e) {
                return (
                    e as { getResponse(): { details: { field: string } } }
                ).getResponse().details.field;
            }
            return null;
        };
        expect(field({ state: "29" })).toBe("state");
        expect(field({ deliveryRate: "18" })).toBe("deliveryRate");
        expect(field({ deliverySac: "996812" })).toBe("deliverySac");
        expect(field({ priceMode: "ADDED" })).toBe("priceMode");
        // Clearing what was never there is no harm.
        expect(field({ state: "", deliverySac: "" })).toBeNull();
    });

    it("still takes GST's state, delivery rate and SAC in India", () => {
        expect(
            taxChanges(
                null,
                sent({ state: "29", deliveryRate: "5", deliverySac: "996812" }),
                "INDIA",
            ),
        ).toMatchObject({
            gstState: "29",
            deliveryGstRate: "5",
            deliverySacCode: "996812",
        });
    });

    it("refuses Global's fields on India", () => {
        expect(() =>
            taxChanges(null, sent({ yearStartMonth: 1 }), "INDIA"),
        ).toThrow(/GST law/);
        expect(() => taxChanges(null, sent({ taxName: "VAT" }))).toThrow();
    });
});

describe("a business's own address, by its country (U3, KTD-A)", () => {
    const address = (
        country: string,
        a: Record<string, string>,
        current: object | null = null,
    ) =>
        taxChanges(
            current as never,
            { tax: undefined, taxId: undefined, country, address: a } as never,
            "GLOBAL",
        );
    const refusal = (fn: () => unknown) => {
        try {
            fn();
        } catch (e) {
            return (e as { getResponse(): unknown }).getResponse();
        }
        throw new Error("not refused");
    };

    it("refuses a US address with an Indian PIN and no state, on its fields", () => {
        const us = {
            line1: "1 Main St",
            city: "New Delhi",
            postalCode: "110001",
        };
        expect(refusal(() => address("US", us))).toMatchObject({
            message: expect.stringMatching(/^A ZIP code is 5 digits.*94105/),
            details: { field: "postalCode" },
        });
        expect(
            refusal(() => address("US", { ...us, postalCode: "78701" })),
        ).toMatchObject({
            message: "Choose your state.",
            details: { field: "region" },
        });
    });

    it("saves a US address with its state as the code", () => {
        expect(
            address("US", {
                line1: "500 Congress Ave",
                city: "Austin",
                postalCode: "78701",
                region: "Texas",
            }),
        ).toMatchObject({ postalCode: "78701", region: "TX" });
    });

    it("checks a postcode sent alone against the region on file", () => {
        const onFile = {
            addressLine1: "500 Congress Ave",
            city: "Austin",
            postalCode: "78701",
            region: "TX",
        };
        expect(address("US", { postalCode: "73301" }, onFile)).toEqual({
            postalCode: "73301",
        });
        expect(
            refusal(() =>
                address(
                    "US",
                    { postalCode: "73301" },
                    { ...onFile, region: null },
                ),
            ),
        ).toMatchObject({ details: { field: "region" } });
    });

    it("takes a UK postcode with no region; refuses an Indian one with the UK example", () => {
        expect(
            address("GB", {
                line1: "10 Downing St",
                city: "London",
                postalCode: "sw1a2aa",
            }),
        ).toMatchObject({ postalCode: "SW1A 2AA" });
        expect(
            refusal(() =>
                address("GB", {
                    line1: "1 High St",
                    city: "London",
                    postalCode: "110001",
                }),
            ),
        ).toMatchObject({ message: expect.stringContaining("SW1A 1AA") });
    });

    it("asks no postcode in the UAE", () => {
        expect(
            address("AE", { line1: "1 Sheikh Zayed Rd", city: "Dubai" }),
        ).toEqual({ addressLine1: "1 Sheikh Zayed Rd", city: "Dubai" });
    });

    it("saves anything for a country without rules (no regression)", () => {
        expect(
            address("BR", {
                line1: "Av Paulista 1",
                city: "Sao Paulo",
                postalCode: "01310-100",
                region: "SP",
            }),
        ).toMatchObject({ postalCode: "01310-100", region: "SP" });
    });

    it("lets a whole address be cleared", () => {
        expect(
            address("US", {
                line1: "",
                line2: "",
                city: "",
                postalCode: "",
                region: "",
            }),
        ).toMatchObject({ postalCode: null, region: null });
    });

    it("refuses a region from an Indian business, and leaves India's PIN rule as it was", () => {
        const india = (a: Record<string, string>) =>
            taxChanges(
                null,
                {
                    tax: undefined,
                    taxId: undefined,
                    country: "IN",
                    address: a,
                } as never,
                "INDIA",
            );
        expect(refusal(() => india({ region: "KA" }))).toMatchObject({
            message: "Your state comes from your GST state.",
            details: { field: "region" },
        });
        expect(india({ region: "", postalCode: "560 038" })).toEqual({
            postalCode: "560038",
        });
        expect(() => india({ postalCode: "78701" })).toThrow(
            "A PIN code is six digits, like 560038.",
        );
    });
});

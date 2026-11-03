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

    it("refuses Global's fields on India", () => {
        expect(() =>
            taxChanges(null, sent({ yearStartMonth: 1 }), "INDIA"),
        ).toThrow(/GST law/);
        expect(() => taxChanges(null, sent({ taxName: "VAT" }))).toThrow();
    });
});

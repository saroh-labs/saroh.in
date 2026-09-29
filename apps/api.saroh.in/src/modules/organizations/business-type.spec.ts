// The legal form's two spellings of a private limited company: F10b stores
// `pvt` and still accepts an old client's `company` until Z4.
import { businessTypeRead, businessTypeWrite } from "./business-type";

describe("businessTypeWrite", () => {
    it("stores a private limited company as pvt, whichever spelling is sent", () => {
        expect(businessTypeWrite("pvt")).toBe("pvt");
        expect(businessTypeWrite("company")).toBe("pvt");
    });

    it("stores the other types as sent", () => {
        for (const t of [
            "individual",
            "partnership",
            "llp",
            "public",
            "trust",
        ]) {
            expect(businessTypeWrite(t)).toBe(t);
        }
    });

    it("clears on an empty string, and leaves an unsent type alone", () => {
        expect(businessTypeWrite("")).toBeNull();
        expect(businessTypeWrite(null)).toBeNull();
        expect(businessTypeWrite(undefined)).toBeUndefined();
    });
});

describe("businessTypeRead", () => {
    it("reads a company row as pvt", () => {
        expect(businessTypeRead("company")).toBe("pvt");
        expect(businessTypeRead("pvt")).toBe("pvt");
    });

    it("reads the rest as stored, and none as null", () => {
        expect(businessTypeRead("llp")).toBe("llp");
        expect(businessTypeRead(null)).toBeNull();
        expect(businessTypeRead("")).toBeNull();
    });
});

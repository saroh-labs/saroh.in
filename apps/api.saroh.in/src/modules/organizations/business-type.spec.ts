// The legal form's two spellings of a private limited company, while the
// rename from `company` to `pvt` runs readers first (release boundary 9).
import { businessTypeRead, businessTypeWrite } from "./business-type";

describe("businessTypeWrite", () => {
    it("keeps a private limited company as company this release", () => {
        expect(businessTypeWrite("pvt")).toBe("company");
        expect(businessTypeWrite("company")).toBe("company");
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

import { refuseCountryOutsideEdition } from "./business-country";

const refused = (...args: Parameters<typeof refuseCountryOutsideEdition>) => {
    try {
        refuseCountryOutsideEdition(...args);
        return null;
    } catch (error) {
        return (error as Error).message;
    }
};

describe("refuseCountryOutsideEdition", () => {
    it("keeps India's rule", () => {
        expect(refused("INDIA", undefined)).toBeNull();
        expect(refused("INDIA", "")).toBeNull();
        expect(refused("INDIA", "in")).toBeNull();
        expect(refused("INDIA", "India")).toBeNull();
        expect(refused("INDIA", "US")).toMatch(/India/);
        expect(refused("INDIA", "US", "US")).toBeNull();
    });

    it("needs a real country at Global's setup, and never India", () => {
        expect(refused("GLOBAL", "GB")).toBeNull();
        expect(refused("GLOBAL", undefined)).toMatch(/Choose/);
        expect(refused("GLOBAL", "")).toMatch(/Choose/);
        expect(refused("GLOBAL", "Germany")).toMatch(/Choose/);
        expect(refused("GLOBAL", "IN")).toMatch(/India/);
    });

    it("doesn't let a Global business change it afterwards", () => {
        expect(refused("GLOBAL", undefined, "GB")).toBeNull();
        expect(refused("GLOBAL", "gb", "GB")).toBeNull();
        expect(refused("GLOBAL", "US", "GB")).toMatch(/Contact us/);
    });
});

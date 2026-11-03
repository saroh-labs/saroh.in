import { otherAuthAddress } from "./auth-address";

process.env.GLOBAL_DEV_DOMAIN = "global-dev.example";

describe("otherAuthAddress", () => {
    const production = "https://api.saroh.in";

    it("keeps the configured instance on its own address", () => {
        expect(otherAuthAddress("api.saroh.in", production)).toBeNull();
        expect(otherAuthAddress("API.saroh.in:443", production)).toBeNull();
    });

    it("picks the other edition's address in the same environment", () => {
        expect(otherAuthAddress("api.saroh.tech", production)).toBe(
            "https://api.saroh.tech",
        );
        expect(
            otherAuthAddress("api.global-dev.example", "https://api.saroh.io"),
        ).toBe("https://api.global-dev.example");
    });

    it("never crosses environments", () => {
        expect(
            otherAuthAddress("api.global-dev.example", production),
        ).toBeNull();
        expect(
            otherAuthAddress("api.saroh.tech", "https://api.saroh.io"),
        ).toBeNull();
    });

    it("ignores any other address, and a local stack", () => {
        expect(otherAuthAddress("evil.example.com", production)).toBeNull();
        expect(otherAuthAddress("api.saroh.app", production)).toBeNull();
        expect(otherAuthAddress(undefined, production)).toBeNull();
        expect(otherAuthAddress("api.saroh.tech", undefined)).toBeNull();
        expect(
            otherAuthAddress("api.saroh.tech", "https://api.saroh.localhost"),
        ).toBeNull();
    });
});

import type { SignInWay } from "./sign-in-way-rules";
import { effectiveWays } from "./sign-in-way-rules";

/** What the site offers from what the business chose (DEC-196). */
describe("effectiveWays", () => {
    const usable = (...ways: SignInWay[]) => new Set<SignInWay>(ways);

    it("keeps the business's order, dropping what doesn't work now", () => {
        expect(
            effectiveWays(["WHATSAPP", "EMAIL"], usable("EMAIL", "WHATSAPP")),
        ).toEqual(["WHATSAPP", "EMAIL"]);
        expect(
            effectiveWays(["SMS", "WHATSAPP", "EMAIL"], usable("EMAIL")),
        ).toEqual(["EMAIL"]);
    });

    it("falls back to email when nothing chosen works, so nobody is locked out", () => {
        expect(effectiveWays(["WHATSAPP"], usable("EMAIL"))).toEqual(["EMAIL"]);
        expect(effectiveWays([], usable("EMAIL"))).toEqual(["EMAIL"]);
    });
});

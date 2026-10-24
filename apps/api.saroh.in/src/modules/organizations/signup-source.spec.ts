import { signupSourceOf } from "./signup-source";

// Where a business came from (#1190): only the four keys, each a short
// safe string; anything else dropped, never refused. The stored value is
// `signup-source.db.spec.ts`.
describe("signupSourceOf", () => {
    it("keeps the four values as sent", () => {
        expect(
            signupSourceOf({
                src: "solutions-salons-hero",
                utmSource: "google",
                utmMedium: "cpc",
                utmCampaign: "salons_oct.v2",
            }),
        ).toEqual({
            src: "solutions-salons-hero",
            utmSource: "google",
            utmMedium: "cpc",
            utmCampaign: "salons_oct.v2",
        });
    });

    it("drops a malformed value, and any other key, keeping the rest", () => {
        expect(
            signupSourceOf({
                src: "<script>",
                utmSource: "google",
                utmMedium: "a b",
                utmCampaign: "x".repeat(65),
                email: "you@example.com",
            }),
        ).toEqual({ utmSource: "google" });
    });

    it.each([undefined, null, "src=ad", ["ad"], {}, { src: 7 }, { src: "" }])(
        "is nothing for %j",
        (raw) => {
            expect(signupSourceOf(raw)).toBeNull();
        },
    );
});

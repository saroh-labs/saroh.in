import { describe, expect, it } from "vitest";

import {
    CLAIM_PARENT,
    CLAIM_SWITCHES,
    claimsOffSet,
    RELEASE_SWITCHES,
} from "./feature-switches";

/** Every release and claim switch `on`, in a production build. */
const allOn = () => ({
    NODE_ENV: "production",
    ...Object.fromEntries(
        Object.values(RELEASE_SWITCHES).map((n) => [n, "on"]),
    ),
    ...Object.fromEntries(Object.values(CLAIM_SWITCHES).map((n) => [n, "on"])),
});

describe("claim switches (DEC-221, decision 1)", () => {
    it("a production build that leaves them out shows no unlive claim", () => {
        expect(claimsOffSet({ NODE_ENV: "production" })).toEqual(
            Object.keys(CLAIM_SWITCHES),
        );
    });

    it("unset counts as on only under next dev", () => {
        expect(claimsOffSet({ NODE_ENV: "development" })).toEqual([]);
    });

    it("each claim is on only when it says on", () => {
        for (const [key, name] of Object.entries(CLAIM_SWITCHES)) {
            expect(claimsOffSet({ ...allOn(), [name]: "off" })).toEqual([key]);
            // A misspelling never shows a claim.
            expect(claimsOffSet({ ...allOn(), [name]: "yes" })).toEqual([key]);
            expect(
                claimsOffSet({
                    ...allOn(),
                    [name]: "off",
                    NODE_ENV: "development",
                }),
            ).toEqual([key]);
        }
        expect(claimsOffSet(allOn())).toEqual([]);
    });

    it("a claim is off with its feature, whatever its own switch says", () => {
        for (const [key, parent] of Object.entries(CLAIM_PARENT)) {
            const off = claimsOffSet({
                ...allOn(),
                [RELEASE_SWITCHES[parent]]: "off",
            });
            expect(off, key).toContain(key);
        }
    });

    it("covers the unlive claims the owner named", () => {
        expect(Object.keys(CLAIM_SWITCHES)).toEqual(
            expect.arrayContaining([
                "social-posting",
                "ask-ai-stock",
                "ask-ai-website",
                "ask-ai-social",
                "ai-apps-plans",
            ]),
        );
    });

    it("a claim with no feature switch (the site shop) follows only its own", () => {
        const off = Object.fromEntries(
            Object.values(RELEASE_SWITCHES).map((n) => [n, "off"]),
        );
        expect(claimsOffSet({ ...allOn(), ...off }).includes("site-shop")).toBe(
            false,
        );
        expect(
            claimsOffSet({ ...allOn(), NEXT_PUBLIC_CLAIM_SITE_SHOP: "off" }),
        ).toEqual(["site-shop"]);
    });
});

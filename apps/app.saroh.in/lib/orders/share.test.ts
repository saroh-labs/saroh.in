import { describe, expect, it } from "vitest";

import { storefrontShareUrl } from "./share";

describe("storefrontShareUrl — Share your storefront (B8)", () => {
    it("is the first live site with an address", () => {
        expect(
            storefrontShareUrl(
                [
                    { subdomain: "draft", currentPublicationId: null },
                    { subdomain: null, currentPublicationId: "pub_1" },
                    { subdomain: "rye", currentPublicationId: "pub_2" },
                    { subdomain: "second", currentPublicationId: "pub_3" },
                ],
                "saroh.app",
            ),
        ).toBe("https://rye.saroh.app");
    });

    it("is nothing when no site is live — a draft has no page to open", () => {
        expect(
            storefrontShareUrl(
                [{ subdomain: "rye", currentPublicationId: null }],
                "saroh.app",
            ),
        ).toBeNull();
        expect(storefrontShareUrl([], "saroh.app")).toBeNull();
    });
});

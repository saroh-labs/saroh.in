import { describe, expect, it } from "vitest";

import { bareHostname } from "./hostname";

describe("bareHostname (UX-066)", () => {
    it("takes a pasted address down to the domain", () => {
        expect(bareHostname("https://www.UXflowers-test.in/")).toBe(
            "www.uxflowers-test.in",
        );
        expect(bareHostname("  http://shop.acme.com/about?x=1#top ")).toBe(
            "shop.acme.com",
        );
        expect(bareHostname("shop.acme.com.")).toBe("shop.acme.com");
        expect(bareHostname("//shop.acme.com:443/")).toBe("shop.acme.com");
    });

    it("leaves a bare domain as it is", () => {
        expect(bareHostname("acme.in")).toBe("acme.in");
    });
});

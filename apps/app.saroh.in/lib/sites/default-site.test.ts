import { describe, expect, it } from "vitest";

import { businessAddress, defaultSite } from "./default-site";

const read = {
    address: "gulmohar",
    origin: "https://gulmohar.in",
    platformOrigin: "https://gulmohar.saroh.app",
};

describe("one web address per business (DEC-230)", () => {
    it("shows the site at the default address, else the first", () => {
        const sites = [
            { id: "a", subdomain: "gulmohar-academy" },
            { id: "b", subdomain: "gulmohar" },
        ];
        expect(defaultSite(sites, read)?.id).toBe("b");
        expect(defaultSite(sites, null)?.id).toBe("a");
        expect(defaultSite([], read)).toBeNull();
    });

    it("is the business's address, its own domain when it has one", () => {
        expect(
            businessAddress({ subdomain: "other" }, read, "saroh.app")?.host,
        ).toBe("gulmohar.in");
        expect(
            businessAddress({ subdomain: "rye" }, null, "saroh.app")?.host,
        ).toBe("rye.saroh.app");
    });
});

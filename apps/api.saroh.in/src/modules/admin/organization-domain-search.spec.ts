import { domainSearchTerms } from "./organization-domain-search";

describe("domainSearchTerms (#907)", () => {
    const root = "saroh.app";

    it.each([
        ["acme", { host: "acme", address: "acme" }],
        ["acme.saroh.app", { host: "acme.saroh.app", address: "acme" }],
        [
            "https://acme.saroh.app/shop",
            { host: "acme.saroh.app", address: "acme" },
        ],
        [
            "test--acme.saroh.app",
            { host: "test--acme.saroh.app", address: "acme" },
        ],
        ["  Shop.Acme.COM.  ", { host: "shop.acme.com", address: null }],
        ["http://www.acme.com:8443/x?y#z", { host: "acme.com", address: null }],
    ])("reads %j", (raw, expected) => {
        expect(domainSearchTerms(raw, root)).toEqual(expected);
    });

    it("reads the instance's own renderer apex too", () => {
        expect(
            domainSearchTerms(
                "acme.saroh.app.localhost",
                "saroh.app.localhost",
            ),
        ).toEqual({ host: "acme.saroh.app.localhost", address: "acme" });
    });

    it("never takes a deeper host under the apex for an address", () => {
        expect(domainSearchTerms("a.b.saroh.app", root)).toEqual({
            host: "a.b.saroh.app",
            address: null,
        });
    });
});

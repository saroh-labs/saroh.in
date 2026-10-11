// DEC-140: which hostnames are bare domains. Pure: the Public Suffix List
// ships with `tldts`, so nothing here touches the network.
import { hostnameShape, wwwOf } from "./bare-domain";

describe("hostnameShape", () => {
    it("reads a registered name with nothing in front as bare", () => {
        expect(hostnameShape("example.com")).toEqual({
            kind: "bare",
            bare: "example.com",
        });
        expect(hostnameShape("yourshop.in")).toEqual({
            kind: "bare",
            bare: "yourshop.in",
        });
    });

    it("knows suffixes of more than one label", () => {
        expect(hostnameShape("example.co.in")).toEqual({
            kind: "bare",
            bare: "example.co.in",
        });
        expect(hostnameShape("example.co.uk").kind).toBe("bare");
        expect(hostnameShape("example.com.au").kind).toBe("bare");
        expect(hostnameShape("example.net.in").kind).toBe("bare");
        // Not bare: a name under a bare one, whatever the suffix's length.
        expect(hostnameShape("shop.example.co.in")).toEqual({
            kind: "subdomain",
            bare: null,
        });
    });

    it("reads www on a bare domain as the address it forwards to", () => {
        expect(hostnameShape("www.example.com")).toEqual({
            kind: "www",
            bare: "example.com",
        });
        expect(hostnameShape("www.example.co.in")).toEqual({
            kind: "www",
            bare: "example.co.in",
        });
    });

    it("reads any other name as a subdomain, www in front or not", () => {
        for (const host of [
            "shop.example.com",
            "www.shop.example.com",
            "www.www.example.com",
            "a.b.example.co.in",
        ]) {
            expect(hostnameShape(host)).toEqual({
                kind: "subdomain",
                bare: null,
            });
        }
    });

    it("counts a suffix a company sells names under", () => {
        expect(hostnameShape("example.uk.com")).toEqual({
            kind: "bare",
            bare: "example.uk.com",
        });
        expect(hostnameShape("www.example.uk.com").kind).toBe("www");
    });

    it("never calls a suffix on its own, or an address, bare", () => {
        expect(hostnameShape("co.in").kind).toBe("subdomain");
        expect(hostnameShape("192.0.2.10").kind).toBe("subdomain");
    });

    it("compares without case or stray spaces", () => {
        expect(hostnameShape(" Example.CO.in ")).toEqual({
            kind: "bare",
            bare: "example.co.in",
        });
    });
});

describe("wwwOf", () => {
    it("puts www in front of a bare domain", () => {
        expect(wwwOf("example.co.in")).toBe("www.example.co.in");
    });
});

import { describe, expect, it } from "vitest";

import { movedLocation, requestPathOf, safeRequestPath } from "./request-path";

/**
 * The path an old address forwards with (DEC-069, L3): only a path on this
 * host is ever put after the new origin.
 */
describe("safeRequestPath", () => {
    it("keeps a path and its query", () => {
        expect(safeRequestPath("/shop?x=1")).toBe("/shop?x=1");
        expect(safeRequestPath("/")).toBe("/");
        expect(safeRequestPath("/posts/hello-world")).toBe(
            "/posts/hello-world",
        );
    });

    it("refuses anything a browser would read as another host", () => {
        expect(safeRequestPath("//evil.com")).toBe("/");
        expect(safeRequestPath("//evil.com/shop")).toBe("/");
        expect(safeRequestPath("/\\evil.com")).toBe("/");
        expect(safeRequestPath("/a\\b")).toBe("/");
        expect(safeRequestPath("https://evil.com/shop")).toBe("/");
        expect(safeRequestPath("evil.com")).toBe("/");
        expect(safeRequestPath("/shop\r\nx: 1")).toBe("/");
    });

    it("falls back to the root with no header", () => {
        expect(safeRequestPath(null)).toBe("/");
        expect(safeRequestPath(undefined)).toBe("/");
        expect(safeRequestPath("")).toBe("/");
    });
});

describe("requestPathOf", () => {
    it("is the path, then any query", () => {
        expect(requestPathOf(new URL("https://rye.saroh.app/shop?x=1"))).toBe(
            "/shop?x=1",
        );
        expect(requestPathOf(new URL("https://rye.saroh.app"))).toBe("/");
    });
});

describe("movedLocation", () => {
    const TO = "https://rye-bakery.saroh.app";

    it("is the same path and query on the new origin", () => {
        expect(movedLocation(TO, "/shop?x=1")).toBe(
            "https://rye-bakery.saroh.app/shop?x=1",
        );
        expect(movedLocation(TO, "/checkout/abc")).toBe(
            "https://rye-bakery.saroh.app/checkout/abc",
        );
    });

    it("sends a path that names another host to the new root", () => {
        expect(movedLocation(TO, "//evil.com")).toBe(
            "https://rye-bakery.saroh.app/",
        );
        expect(movedLocation(TO, "/\\evil.com/shop")).toBe(
            "https://rye-bakery.saroh.app/",
        );
    });

    it("takes only the origin of what the API gave", () => {
        expect(movedLocation(`${TO}/somewhere?y=2`, "/book")).toBe(
            "https://rye-bakery.saroh.app/book",
        );
    });

    it("is null for an origin that isn't http(s)", () => {
        expect(movedLocation("javascript:alert(1)", "/")).toBeNull();
        expect(movedLocation("not a url", "/")).toBeNull();
    });
});

import { describe, expect, it } from "vitest";

import { allowedOrigin, createApiKeyBody } from "./api-keys";

describe("a publishable key's allowed origins (U5)", () => {
    it("keeps an https origin, or localhost on any port, as its origin", () => {
        expect(allowedOrigin.parse("https://Shop.in/")).toBe("https://shop.in");
        expect(allowedOrigin.parse("http://localhost:3000")).toBe(
            "http://localhost:3000",
        );
        expect(allowedOrigin.parse("http://127.0.0.1:5173")).toBe(
            "http://127.0.0.1:5173",
        );
    });

    it.each([
        "http://shop.in",
        "https://shop.in/shop",
        "https://shop.in?x=1",
        "https://user:pw@shop.in",
        "ftp://shop.in",
        "shop.in",
        "*",
    ])("refuses %s", (value) => {
        expect(allowedOrigin.safeParse(value).success).toBe(false);
    });
});

describe("making a key", () => {
    it("takes a kind and a name, and refuses an unknown field", () => {
        expect(
            createApiKeyBody.parse({ kind: "SECRET", name: " Server " }),
        ).toEqual({ kind: "SECRET", name: "Server" });
        expect(
            createApiKeyBody.safeParse({
                kind: "SECRET",
                name: "x",
                token: "sk_live_x",
            }).success,
        ).toBe(false);
    });
});

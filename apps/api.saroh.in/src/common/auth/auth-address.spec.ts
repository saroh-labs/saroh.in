import {
    authEditionOf,
    authHostOf,
    githubKeysOf,
    otherAuthAddress,
} from "./auth-address";

process.env.GLOBAL_DEV_DOMAIN = "global-dev.example";

describe("otherAuthAddress", () => {
    const production = "https://api.saroh.in";

    it("keeps the configured instance on its own address", () => {
        expect(otherAuthAddress("api.saroh.in", production)).toBeNull();
        expect(otherAuthAddress("API.saroh.in:443", production)).toBeNull();
    });

    it("picks the other edition's address in the same environment", () => {
        expect(otherAuthAddress("api.saroh.tech", production)).toBe(
            "https://api.saroh.tech",
        );
        expect(
            otherAuthAddress("api.global-dev.example", "https://api.saroh.io"),
        ).toBe("https://api.global-dev.example");
    });

    it("never crosses environments", () => {
        expect(
            otherAuthAddress("api.global-dev.example", production),
        ).toBeNull();
        expect(
            otherAuthAddress("api.saroh.tech", "https://api.saroh.io"),
        ).toBeNull();
    });

    it("ignores any other address, and a local stack", () => {
        expect(otherAuthAddress("evil.example.com", production)).toBeNull();
        expect(otherAuthAddress("api.saroh.app", production)).toBeNull();
        expect(otherAuthAddress(undefined, production)).toBeNull();
        expect(otherAuthAddress("api.saroh.tech", undefined)).toBeNull();
        expect(
            otherAuthAddress("api.saroh.tech", "https://api.saroh.localhost"),
        ).toBeNull();
    });
});

describe("authEditionOf", () => {
    it("is the edition of the instance the address reaches", () => {
        const production = "https://api.saroh.in";
        expect(authEditionOf("api.saroh.tech", production)).toBe("GLOBAL");
        expect(authEditionOf("api.saroh.in", production)).toBe("INDIA");
        expect(authEditionOf("evil.example.com", production)).toBe("INDIA");
        expect(authEditionOf(null, production)).toBe("INDIA");
        expect(
            authEditionOf("api.global-dev.example", "https://api.saroh.io"),
        ).toBe("GLOBAL");
        expect(
            authEditionOf("api.saroh.tech", "https://api.saroh.localhost"),
        ).toBe("INDIA");
    });
});

describe("authHostOf", () => {
    it("is the edition's API host in the configured environment", () => {
        expect(authHostOf("GLOBAL", "https://api.saroh.in")).toBe(
            "api.saroh.tech",
        );
        expect(authHostOf("INDIA", "https://api.saroh.in")).toBe(
            "api.saroh.in",
        );
        expect(
            authHostOf("GLOBAL", "https://api.saroh.localhost"),
        ).toBeUndefined();
    });
});

describe("githubKeysOf", () => {
    it("reads each edition's own pair", () => {
        const keys = {
            AUTH_GITHUB_ID: "a",
            AUTH_GITHUB_SECRET: "b",
            AUTH_GITHUB_GLOBAL_ID: "c",
            AUTH_GITHUB_GLOBAL_SECRET: "d",
        };
        expect(githubKeysOf("INDIA", keys).pair?.clientId).toBe("a");
        expect(githubKeysOf("GLOBAL", keys).pair?.clientId).toBe("c");
    });

    it("is off with none, and off naming the missing one with half", () => {
        expect(githubKeysOf("GLOBAL", {})).toEqual({ pair: null, half: null });
        expect(githubKeysOf("GLOBAL", { AUTH_GITHUB_GLOBAL_ID: "c" })).toEqual({
            pair: null,
            half: "AUTH_GITHUB_GLOBAL_SECRET",
        });
        expect(
            githubKeysOf("GLOBAL", { AUTH_GITHUB_GLOBAL_SECRET: "d" }).half,
        ).toBe("AUTH_GITHUB_GLOBAL_ID");
    });
});

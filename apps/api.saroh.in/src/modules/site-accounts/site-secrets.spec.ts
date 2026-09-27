/**
 * The site sign-in secrets' public fallbacks (review A-4): only where
 * NODE_ENV itself says development or test, never on the schema's default.
 */
const mockEnv: {
    declaredNodeEnv: string | undefined;
    env: Record<string, string | undefined>;
} = { declaredNodeEnv: undefined, env: { NODE_ENV: "development" } };

jest.mock("../../env", () => ({
    get declaredNodeEnv() {
        return mockEnv.declaredNodeEnv;
    },
    get env() {
        return mockEnv.env;
    },
}));

import {
    devFallbackAllowed,
    siteCodeSecret,
    siteRelaySecret,
} from "./site-secrets";

beforeEach(() => {
    mockEnv.declaredNodeEnv = undefined;
    // What the schema hands back when NODE_ENV is unset: its default.
    mockEnv.env = { NODE_ENV: "development" };
});

describe("devFallbackAllowed", () => {
    it("is allowed only for a declared development or test", () => {
        expect(devFallbackAllowed("development")).toBe(true);
        expect(devFallbackAllowed("test")).toBe(true);
        expect(devFallbackAllowed("production")).toBe(false);
        expect(devFallbackAllowed(undefined)).toBe(false);
        expect(devFallbackAllowed("staging")).toBe(false);
    });
});

describe("the secrets", () => {
    it("throws when NODE_ENV was never set, though the schema defaults it to development", () => {
        expect(() => siteRelaySecret()).toThrow(/SITE_RELAY_SECRET/);
        expect(() => siteCodeSecret()).toThrow(/SITE_ACCOUNTS_CODE_SECRET/);
    });

    it("falls back to the public values in a declared development", () => {
        mockEnv.declaredNodeEnv = "development";
        expect(siteRelaySecret()).toMatch(/not-for-production$/);
        expect(siteCodeSecret()).toMatch(/not-for-production$/);
    });

    it("uses a set secret everywhere", () => {
        mockEnv.declaredNodeEnv = "production";
        mockEnv.env = {
            NODE_ENV: "production",
            SITE_RELAY_SECRET: "r".repeat(40),
            SITE_ACCOUNTS_CODE_SECRET: "c".repeat(40),
        };
        expect(siteRelaySecret()).toBe("r".repeat(40));
        expect(siteCodeSecret()).toBe("c".repeat(40));
    });
});

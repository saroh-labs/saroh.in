import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    editionForCountry,
    editionOfHost,
    EDITIONS,
    hostsFor,
    merchantSitesFor,
    moneyLocaleOf,
    numberLocaleOf,
    parseEdition,
} from "./index";

beforeEach(() => {
    vi.stubEnv("GLOBAL_DEV_DOMAIN", "global-dev.example");
});

describe("the country rule", () => {
    it("sends India to India, and every other country to Global", () => {
        expect(editionForCountry("IN")).toBe("INDIA");
        expect(editionForCountry("AE")).toBe("GLOBAL");
        expect(editionForCountry("GB")).toBe("GLOBAL");
    });

    it("reads a code however it's written", () => {
        expect(editionForCountry(" in ")).toBe("INDIA");
    });

    it("refuses to guess from something that isn't a country", () => {
        for (const bad of ["", "  ", "India", "I", "91"]) {
            expect(() => editionForCountry(bad)).toThrow(/country code/);
        }
    });
});

describe("addresses", () => {
    it("knows each edition's addresses, live and in development", () => {
        expect(editionOfHost("api.saroh.in")).toBe("INDIA");
        expect(editionOfHost("app.saroh.io")).toBe("INDIA");
        expect(editionOfHost("api.saroh.tech")).toBe("GLOBAL");
        expect(editionOfHost("accounts.global-dev.example")).toBe("GLOBAL");
    });

    it("reads a host with a port or in capitals", () => {
        expect(editionOfHost("API.saroh.in:443")).toBe("INDIA");
    });

    it("gives merchant sites' API and anything unknown no edition", () => {
        expect(editionOfHost(merchantSitesFor("production").api)).toBeNull();
        expect(editionOfHost("rye.saroh.app")).toBeNull();
        expect(editionOfHost("api.saroh.in.evil.example")).toBeNull();
        expect(editionOfHost("")).toBeNull();
    });

    it("never gives two editions the same address", () => {
        const seen = new Set<string>();
        for (const edition of EDITIONS) {
            for (const environment of ["production", "development"] as const) {
                for (const host of Object.values(
                    hostsFor(edition, environment),
                ) as string[]) {
                    expect(seen.has(host), host).toBe(false);
                    seen.add(host);
                }
            }
        }
    });
});

describe("the package's entry points", () => {
    it("name what tsup emits under type: module", () => {
        // `.js` is ESM here and `.cjs` is what `require` needs. The API
        // requires this package, and its Jest doesn't go through these.
        // Run from the package's own folder, by Turbo and by pnpm --filter.
        const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
            exports: { ".": { import: string; require: string } };
        };
        expect(pkg.exports["."].import).toBe("./dist/index.js");
        expect(pkg.exports["."].require).toBe("./dist/index.cjs");
    });
});

describe("Global's development addresses", () => {
    it("come only from the deployment's setting", () => {
        vi.stubEnv("GLOBAL_DEV_DOMAIN", "other.example");
        expect(hostsFor("GLOBAL", "development").api).toBe("api.other.example");
        vi.stubEnv("GLOBAL_DEV_DOMAIN", undefined);
        expect(hostsFor("GLOBAL", "development").api).toBe(
            "api.global-dev.invalid",
        );
        vi.stubEnv("GLOBAL_DEV_DOMAIN", "global-dev.example");
    });
});

describe("parseEdition", () => {
    it("is India unset, and refuses a misspelling", () => {
        expect(parseEdition(undefined)).toBe("INDIA");
        expect(parseEdition("GLOBAL")).toBe("GLOBAL");
        expect(() => parseEdition("global")).toThrow(/Not an edition/);
    });
});

describe("how numbers are grouped", () => {
    it("is lakh and crore in India, thousands in Global", () => {
        const amount = (locale: string) =>
            new Intl.NumberFormat(locale).format(2044971);
        expect(amount(numberLocaleOf("INDIA"))).toBe("20,44,971");
        expect(amount(numberLocaleOf("GLOBAL"))).toBe("2,044,971");
    });

    it("follows the currency where one deployment serves both", () => {
        expect(moneyLocaleOf("INR")).toBe("en-IN");
        expect(moneyLocaleOf("USD")).toBe("en-US");
        expect(moneyLocaleOf(null)).toBe("en-US");
    });
});

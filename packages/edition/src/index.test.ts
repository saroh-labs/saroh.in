import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Edition, EditionProfile } from "./index";
import {
    currencyForCountry,
    EDITION_PROFILES,
    editionForCountry,
    editionOfHost,
    editionProfile,
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

    it("give the address rules their own entry, for block-contract", () => {
        // The API's tsc resolves the old way, so typesVersions names it too.
        const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
            exports: Record<string, { import: string; require: string }>;
            typesVersions: { "*": Record<string, string[]> };
        };
        expect(pkg.exports["./address-rules"].import).toBe(
            "./dist/address-rules.js",
        );
        expect(pkg.exports["./address-rules"].require).toBe(
            "./dist/address-rules.cjs",
        );
        expect(pkg.typesVersions["*"]["address-rules"]).toEqual([
            "./dist/address-rules.d.ts",
        ]);
    });

    it("keep the address rules free of imports, so site blocks can read them", () => {
        const source = readFileSync("src/address-rules.ts", "utf8");
        expect(source).not.toMatch(/^\s*(import|export .* from)\b/m);
        expect(source).not.toMatch(/process\.env/);
    });
});

describe("Global's development addresses", () => {
    it("come only from the deployment's setting", () => {
        vi.stubEnv("GLOBAL_DEV_DOMAIN", "other.example");
        expect(hostsFor("GLOBAL", "development").api).toBe("api.other.example");
        vi.stubEnv("GLOBAL_DEV_DOMAIN", "  ");
        expect(hostsFor("GLOBAL", "development").api).toBe(
            "api.global-dev.invalid",
        );
        expect(editionOfHost("")).toBeNull();
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

describe("currencyForCountry", () => {
    it("suggests the country's own, else dollars", () => {
        expect(currencyForCountry("GB")).toBe("GBP");
        expect(currencyForCountry("de")).toBe("EUR");
        expect(currencyForCountry("IN")).toBe("INR");
        expect(currencyForCountry("BR")).toBe("USD");
    });
});

describe("the edition profiles (DEC-204 item 7)", () => {
    it("has one per edition and nothing else", () => {
        expect(Object.keys(EDITION_PROFILES).sort()).toEqual(
            [...EDITIONS].sort(),
        );
    });

    it("makes a third edition a compile error until it fills a profile", () => {
        type Third = Edition | "THIRD";
        // @ts-expect-error: "THIRD" has no profile, so this mustn't compile.
        const withThird: Record<Third, EditionProfile> = {
            ...EDITION_PROFILES,
        };
        // @ts-expect-error: a profile missing a fact mustn't compile either.
        const half: EditionProfile = { taxSystem: "gst" };
        expect([withThird, half]).toHaveLength(2);
    });

    it("reads unset as India, as every business was", () => {
        expect(editionProfile(undefined)).toBe(EDITION_PROFILES.INDIA);
        expect(editionProfile(null)).toBe(EDITION_PROFILES.INDIA);
    });

    const facts: {
        [K in keyof EditionProfile]: Record<Edition, EditionProfile[K]>;
    } = {
        taxSystem: { INDIA: "gst", GLOBAL: "named-line" },
        payInstructions: { INDIA: "upi-and-ifsc", GLOBAL: "bank-code" },
        // Global takes payment through Stripe only for now (owner, 6 Nov 2026).
        payInstructionsOffered: { INDIA: true, GLOBAL: false },
        address: {
            INDIA: "indian-state-and-pin",
            GLOBAL: "country-and-region",
        },
        phoneNumbers: { INDIA: "indian", GLOBAL: "with-country-code" },
        businessCountry: { INDIA: "india-only", GLOBAL: "asked-at-setup" },
        sarohBilling: { INDIA: true, GLOBAL: false },
        phoneSignIn: { INDIA: true, GLOBAL: false },
        struckPrice: { INDIA: "mrp", GLOBAL: "original-price" },
        toolPages: { INDIA: "own", GLOBAL: "hub" },
        helpAndDocs: { INDIA: "own-addresses", GLOBAL: "shared" },
        numberLocale: { INDIA: "en-IN", GLOBAL: "en-US" },
        upi: { INDIA: true, GLOBAL: false },
        paymentProviders: {
            INDIA: ["RAZORPAY", "CASHFREE"],
            GLOBAL: ["STRIPE"],
        },
        onlinePaymentsOnEveryPlan: { INDIA: false, GLOBAL: true },
        envSuffix: { INDIA: "", GLOBAL: "_GLOBAL" },
        defaultSenders: {
            INDIA: {
                mail: "Saroh <noreply@saroh.in>",
                codes: "codes@saroh.in",
            },
            GLOBAL: {
                mail: "Saroh <noreply@saroh.tech>",
                codes: "codes@saroh.tech",
            },
        },
        defaultZone: { INDIA: "Asia/Kolkata", GLOBAL: "UTC" },
    };
    for (const [fact, byEdition] of Object.entries(facts)) {
        it(`answers ${fact} as each edition did before the profile`, () => {
            for (const edition of EDITIONS) {
                expect(
                    editionProfile(edition)[fact as keyof EditionProfile],
                ).toEqual(byEdition[edition]);
            }
        });
    }

    it("gives no two editions the same payment provider", () => {
        const all = EDITIONS.flatMap(
            (edition) => editionProfile(edition).paymentProviders,
        );
        expect(new Set(all).size).toBe(all.length);
    });
});

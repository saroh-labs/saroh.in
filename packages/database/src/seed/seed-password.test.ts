import { describe, expect, it } from "vitest";

import { FIXTURE_PASSWORD, isThrowawayDatabase, seedPassword } from "./data";

const LOCAL = "postgresql://u:p@localhost:5432/saroh_test";
const SHARED = "postgresql://u:p@db.example.net:5432/saroh-dev";

describe("seedPassword", () => {
    it("uses the documented fixture on this machine's database", () => {
        expect(seedPassword({ DATABASE_URL: LOCAL })).toBe(FIXTURE_PASSWORD);
        expect(isThrowawayDatabase("postgresql://u:p@127.0.0.1/x")).toBe(true);
    });

    it("refuses a shared database without SEED_PASSWORD", () => {
        expect(() => seedPassword({ DATABASE_URL: SHARED })).toThrow(
            /SEED_PASSWORD/,
        );
        expect(isThrowawayDatabase(SHARED)).toBe(false);
        expect(isThrowawayDatabase(undefined)).toBe(false);
    });

    it("refuses the fixture as SEED_PASSWORD on a shared database", () => {
        expect(() =>
            seedPassword({
                DATABASE_URL: SHARED,
                SEED_PASSWORD: FIXTURE_PASSWORD,
            }),
        ).toThrow(/documented/);
    });

    it("takes a long enough SEED_PASSWORD anywhere", () => {
        const own = "a-long-local-only-value";
        expect(seedPassword({ DATABASE_URL: SHARED, SEED_PASSWORD: own })).toBe(
            own,
        );
        expect(() =>
            seedPassword({ DATABASE_URL: SHARED, SEED_PASSWORD: "short" }),
        ).toThrow(/12 characters/);
    });
});

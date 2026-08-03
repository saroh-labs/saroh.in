import { describe, expect, it } from "vitest";

import { assertDatabaseTarget, resolveDatabaseTarget } from "./database-target";

/** The two URLs this repository actually configures, with fake credentials. */
const SAROH_DEV =
    "postgresql://user:pw@ep-autumn-mouse-a1dr0mtz-pooler.ap-southeast-1.aws.neon.tech/saroh-dev?sslmode=require";
const NEONDB =
    "postgresql://user:pw@ep-billowing-cloud-a1lajgqk-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("resolveDatabaseTarget", () => {
    it("extracts the database and host", () => {
        expect(resolveDatabaseTarget(SAROH_DEV)).toEqual({
            database: "saroh-dev",
            host: "ep-autumn-mouse-a1dr0mtz-pooler",
        });
    });

    it("refuses an unset URL rather than defaulting to something", () => {
        expect(() => resolveDatabaseTarget(undefined)).toThrow(/not set/i);
    });

    it("does not echo the connection string when it is unparseable", () => {
        // The value contains a password; an error message must never carry it.
        const secret = "not-a-url-but-has-hunter2-in-it";
        expect(() => resolveDatabaseTarget(secret)).toThrow();
        try {
            resolveDatabaseTarget(secret);
        } catch (error) {
            expect((error as Error).message).not.toContain("hunter2");
        }
    });
});

describe("assertDatabaseTarget", () => {
    it("allows the dev database in development", () => {
        expect(
            assertDatabaseTarget(SAROH_DEV, "development", undefined).database,
        ).toBe("saroh-dev");
    });

    it("refuses the root .env database in development", () => {
        // The actual regression: `set -a; . ./.env` leaves DATABASE_URL pointing
        // at a different Neon project, and a seed there is unrecoverable.
        expect(() =>
            assertDatabaseTarget(NEONDB, "development", undefined),
        ).toThrow(/Refusing to write to "neondb"/);
    });

    it("names both the resolved database and the allowed one", () => {
        try {
            assertDatabaseTarget(NEONDB, "development", undefined);
            throw new Error("should have refused");
        } catch (error) {
            const message = (error as Error).message;
            expect(message).toContain("neondb");
            expect(message).toContain("ep-billowing-cloud-a1lajgqk-pooler");
            expect(message).toContain("saroh-dev");
        }
    });

    it("refuses an environment with no allow-list at all", () => {
        expect(() =>
            assertDatabaseTarget(SAROH_DEV, "production", undefined),
        ).toThrow(/No databases are allow-listed for NODE_ENV=production/);
    });

    it("allows any database when confirmation names it exactly", () => {
        expect(
            assertDatabaseTarget(NEONDB, "production", "neondb").database,
        ).toBe("neondb");
    });

    it("refuses when confirmation names a different database", () => {
        // Guards the paste-the-wrong-name case: confirming "saroh-dev" while
        // the URL points at neondb must not pass.
        expect(() =>
            assertDatabaseTarget(NEONDB, "development", "saroh-dev"),
        ).toThrow(/must name the database actually being written to/);
    });

    it("treats an empty confirmation as absent", () => {
        expect(() => assertDatabaseTarget(NEONDB, "development", "")).toThrow(
            /Refusing to write/,
        );
    });
});

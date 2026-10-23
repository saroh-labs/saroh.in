import { createHash, createHmac } from "node:crypto";

import {
    dailySalt,
    forgetProcessSecretForTests,
    visitorHashOf,
    visitorHashSecret,
} from "./visitor-hash";

describe("visitor-hash — sha256(dailySalt : site : ip) (U15 privacy review)", () => {
    afterEach(() => forgetProcessSecretForTests());

    it("derives the day's salt from the secret and the UTC day", () => {
        const at = new Date("2026-10-21T18:30:00Z");
        expect(dailySalt("s3cret", at)).toBe(
            createHmac("sha256", "s3cret")
                .update("analytics-visitor:2026-10-21")
                .digest("hex"),
        );
        // The same UTC day, any hour: one salt. The next day: another.
        expect(dailySalt("s3cret", new Date("2026-10-21T00:00:00Z"))).toBe(
            dailySalt("s3cret", new Date("2026-10-21T23:59:59.999Z")),
        );
        expect(dailySalt("s3cret", new Date("2026-10-22T00:00:00Z"))).not.toBe(
            dailySalt("s3cret", at),
        );
        // Another secret: another salt.
        expect(dailySalt("other", at)).not.toBe(dailySalt("s3cret", at));
    });

    it("hashes the day's salt, the site and the address, and never returns the address", () => {
        const at = new Date("2026-10-21T10:00:00Z");
        const hash = visitorHashOf("site_1", "203.0.113.7", at, "s3cret");
        expect(hash).toBe(
            createHash("sha256")
                .update(`${dailySalt("s3cret", at)}:site_1:203.0.113.7`)
                .digest("hex"),
        );
        expect(hash).not.toContain("203.0.113.7");
        expect(visitorHashOf("site_2", "203.0.113.7", at, "s3cret")).not.toBe(
            hash,
        );
    });

    it("uses the configured secret wherever it is set", () => {
        expect(visitorHashSecret("configured", "production")).toBe(
            "configured",
        );
    });

    it("falls back to the public dev value only in development and test", () => {
        expect(visitorHashSecret(undefined, "development")).toBe(
            "saroh-dev-analytics-ip-salt",
        );
        expect(visitorHashSecret(undefined, "test")).toBe(
            "saroh-dev-analytics-ip-salt",
        );
    });

    it("never uses the public value elsewhere: a random secret for the process", () => {
        const first = visitorHashSecret(undefined, "production");
        expect(first).not.toBe("saroh-dev-analytics-ip-salt");
        expect(first).toMatch(/^[0-9a-f]{64}$/);
        // Stable within the process, so a day's unique visitors still count.
        expect(visitorHashSecret(undefined, "production")).toBe(first);
        expect(visitorHashSecret(undefined, "staging")).toBe(first);
    });
});

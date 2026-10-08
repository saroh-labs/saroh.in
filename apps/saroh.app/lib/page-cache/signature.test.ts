import { describe, expect, it } from "vitest";

import {
    MAX_SKEW_SECONDS,
    signPageRevalidation,
    verifyPageRevalidation,
} from "./signature";

/**
 * The same vector as the API's `page-cache-signature.spec.ts`: a change to
 * either side's signing fails here or there.
 */
const SECRET = "a-page-cache-secret-that-is-long-enough-00";
const BODY = '{"tags":["site:site_1","site:site_1:product:prod_1"]}';
const NOW = 1_760_000_000_000;
const SIGNED = "v1.1760000000.nIUzlXh23aAE5NBZgyGU9RlWwGdQ2L2a2XMRSZlrMlg";

describe("page cache revalidation signature (#863)", () => {
    it("signs exactly as the API does", async () => {
        expect(await signPageRevalidation(BODY, SECRET, NOW)).toBe(SIGNED);
    });

    it("accepts the API's signature on the same body", async () => {
        expect(await verifyPageRevalidation(SIGNED, BODY, SECRET, NOW)).toBe(
            true,
        );
    });

    it("refuses a missing, forged or tampered signature", async () => {
        expect(await verifyPageRevalidation(null, BODY, SECRET, NOW)).toBe(
            false,
        );
        expect(
            await verifyPageRevalidation(
                SIGNED,
                BODY.replace("prod_1", "prod_2"),
                SECRET,
                NOW,
            ),
        ).toBe(false);
        expect(
            await verifyPageRevalidation(
                SIGNED,
                BODY,
                "another-secret-that-is-long-enough-000",
                NOW,
            ),
        ).toBe(false);
        expect(
            await verifyPageRevalidation(`${SIGNED}.x`, BODY, SECRET, NOW),
        ).toBe(false);
        expect(
            await verifyPageRevalidation("v2.1.abc", BODY, SECRET, NOW),
        ).toBe(false);
    });

    it("refuses one older or newer than five minutes", async () => {
        const later = NOW + (MAX_SKEW_SECONDS + 1) * 1000;
        expect(await verifyPageRevalidation(SIGNED, BODY, SECRET, later)).toBe(
            false,
        );
        const earlier = NOW - (MAX_SKEW_SECONDS + 1) * 1000;
        expect(
            await verifyPageRevalidation(SIGNED, BODY, SECRET, earlier),
        ).toBe(false);
        expect(
            await verifyPageRevalidation(SIGNED, BODY, SECRET, NOW + 60_000),
        ).toBe(true);
    });
});

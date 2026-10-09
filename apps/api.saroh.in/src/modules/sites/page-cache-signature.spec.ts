import {
    PAGE_CACHE_SIGNATURE_HEADER,
    signPageRevalidation,
} from "./page-cache-signature";

/**
 * The same vector as the renderer's `lib/page-cache/signature.test.ts`: a
 * change to either side's signing fails here or there (#863).
 */
const SECRET = "a-page-cache-secret-that-is-long-enough-00";
const BODY = '{"tags":["site:site_1","site:site_1:product:prod_1"]}';
const NOW = 1_760_000_000_000;
const SIGNED = "v1.1760000000.nIUzlXh23aAE5NBZgyGU9RlWwGdQ2L2a2XMRSZlrMlg";

describe("page cache revalidation signature (#863)", () => {
    it("signs exactly as the renderer checks", () => {
        expect(signPageRevalidation(BODY, SECRET, NOW)).toBe(SIGNED);
    });

    it("rides in the header the Worker reads", () => {
        expect(PAGE_CACHE_SIGNATURE_HEADER).toBe("x-saroh-page-cache");
    });
});

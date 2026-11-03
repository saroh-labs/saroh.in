import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { checkSite, findClaims, visibleText } from "./check-claims.mjs";

describe("what saroh.tech may not say", () => {
    it("passes plain words", () => {
        expect(findClaims("/", "Your site, bookings and orders.")).toEqual([]);
    });

    it("names the page and the phrase", () => {
        expect(
            findClaims("/pricing", "Your client can tap Accept today."),
        ).toEqual([{ path: "/pricing", phrase: "tap Accept" }]);
    });

    it("keeps the free quote tool's own words", () => {
        expect(
            findClaims("/tools/quote-maker", "Free quote and estimate maker"),
        ).toEqual([]);
    });

    it("lets a receipt say it was paid by PayPal, not that Saroh takes it", () => {
        expect(findClaims("/tools/receipt-maker", "Paid by PayPal")).toEqual(
            [],
        );
        expect(findClaims("/", "through your own PayPal")).toHaveLength(1);
    });

    it("lets a country template name a tax invoice, and nothing else", () => {
        expect(
            findClaims("/templates/invoice/australia", "A tax invoice shows"),
        ).toEqual([]);
        expect(
            findClaims("/features/billing", "Sends a tax invoice"),
        ).toHaveLength(1);
    });

    it("reads what a visitor reads", () => {
        const html =
            '<aside hidden data-region-bar>GST and UPI</aside><script>"pay link"</script><p>A &amp; B</p>';
        expect(visibleText(html).trim()).toBe("A & B");
    });

    describe("on a built site", () => {
        const dir = mkdtempSync(join(tmpdir(), "claims-"));
        afterAll(() => rmSync(dir, { recursive: true }));

        it("walks nested pages", () => {
            mkdirSync(join(dir, "tools"));
            writeFileSync(join(dir, "index.html"), "<p>Fine.</p>");
            writeFileSync(join(dir, "tools/a.html"), "<p>Send a pay link.</p>");
            expect(checkSite(dir)).toEqual([
                { path: "/tools/a", phrase: "pay link" },
            ]);
        });

        it("fails rather than passes when nothing was built", () => {
            expect(() => checkSite(join(dir, "nope"))).toThrow(/missing/);
        });
    });
});

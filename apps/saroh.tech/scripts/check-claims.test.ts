import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
    MOMENT_INVOICE,
    MOMENT_LATE_FEE,
    MOMENT_QUOTE,
    MOMENT_RECEIPT,
    MOMENT_REMINDER,
    MOMENT_TAX,
} from "../content/tools";

import { checkSite, findClaims, visibleText } from "./check-claims.mjs";

describe("the words nobody sees on the page", () => {
    it("reads alt, aria-label and JSON-LD, and the claims in them fail", () => {
        const html = `<img alt="Flagged for the team"><a aria-label="a page for every client">x</a><script type="application/ld+json">{"name":"Pay now in one tap"}</script><script>var quiet="pay button"</script>`;
        const text = visibleText(html);
        expect(findClaims("/", text).map((f) => f.phrase)).toEqual(
            expect.arrayContaining([
                "the team",
                "a page for every client",
                "in one tap",
            ]),
        );
        expect(text).not.toContain("pay button");
    });
});

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
        expect(findClaims("/", "through your own PayPal")).not.toEqual([]);
    });

    it("lets a country template name a tax invoice, and nothing else", () => {
        expect(
            findClaims("/templates/invoice/australia", "A tax invoice shows"),
        ).toEqual([]);
        expect(
            findClaims("/features/billing", "Sends a tax invoice"),
        ).toHaveLength(1);
    });

    it.each([
        "Your client page has a Pay button.",
        "Send a quote today.",
        "See when they open it.",
        "Works in any currency.",
        "Texts by SMS.",
        "0% fees.",
        "We never touch your money.",
        "Add your Stripe account.",
        "The merchant of record charges you.",
    ])("catches what was removed: %s", (line) => {
        expect(findClaims("/features/billing", line)).not.toEqual([]);
    });

    it.each([
        "Online booking by stylist.",
        "Each person's hours and time off.",
        "Each trainer's week, by the hour.",
        "The times your trainers are free.",
        "See who does what.",
        "Bookings with your staff.",
        "Can my team use it without seeing everything?",
        "Sensitive notes only for the right roles.",
        "Booking and moving is one permission.",
    ])("catches what needs several people: %s", (line) => {
        expect(findClaims("/solutions/salons", line)).not.toEqual([]);
    });

    it("lets a template or the law talk about staff, and us about the Saroh team", () => {
        expect(
            findClaims(
                "/templates/invoice/plumber",
                "Your team and your staff",
            ),
        ).toEqual([]);
        expect(
            findClaims("/customers", "Reports go to the Saroh team."),
        ).toEqual([]);
        expect(
            findClaims("/solutions/gyms", "For personal trainers too."),
        ).toEqual([]);
    });

    it("lets the coming list name a provider, and the tools talk about documents", () => {
        expect(findClaims("/changelog", "Stripe: Not available yet")).toEqual(
            [],
        );
        expect(findClaims("/tools/quote-maker", "Send a quote")).toEqual([]);
        expect(
            findClaims("/tools/quote-maker", "in any currency"),
        ).toHaveLength(1);
    });

    it("holds the sign-up moments too, which no built page shows until a download", () => {
        for (const copy of [
            MOMENT_INVOICE,
            MOMENT_QUOTE,
            MOMENT_RECEIPT,
            MOMENT_REMINDER,
            MOMENT_LATE_FEE,
            MOMENT_TAX,
        ]) {
            expect(findClaims("/", JSON.stringify(copy))).toEqual([]);
        }
    });

    it("reads what a visitor reads", () => {
        const html =
            '<aside hidden data-region-bar>GST and UPI</aside><script>"pay link"</script><p>A &amp; B</p>';
        const described = '<meta name="description" content="0% fees"/>';
        expect(findClaims("/", visibleText(described))).toHaveLength(1);
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

        it("fails on an out/ with no HTML in it", () => {
            const empty = join(dir, "empty");
            mkdirSync(empty);
            writeFileSync(join(empty, "robots.txt"), "User-agent: *");
            expect(() => checkSite(empty)).toThrow(/no HTML/);
        });
    });
});
